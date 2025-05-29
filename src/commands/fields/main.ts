import * as vscode from 'vscode';
import { checkIfWorkspaceIsValidSfdxProject } from '../shared/utilities';
import labels from '../../labels';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const COMMAND_NAME = 'fields';

export async function activate(context: vscode.ExtensionContext) {
    const commands = await vscode.commands.getCommands(true);

    if (!checkIfWorkspaceIsValidSfdxProject()) {
        vscode.window.showErrorMessage('This command can only be run in a Salesforce DX project. Please open a valid Salesforce DX project.');
        return;
    }

    if (commands.includes(`${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`)) {
        return;
    }

    vscode.commands.registerCommand(`${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`, () => loadCommands(context));
}

async function loadCommands(_context: vscode.ExtensionContext) {
    if (!checkIfWorkspaceIsValidSfdxProject()) {
        vscode.window.showErrorMessage('This command can only be run in a Salesforce DX project. Please open a valid Salesforce DX project.');
        return;
    }

    loadFieldsByType(_context);
}

async function loadFieldsByType(_context: vscode.ExtensionContext) {
    const { fieldTypes, fieldInfoByType, objectsWithPaths } = await loadFieldInfo();

    if (fieldTypes.length === 0) {
        vscode.window.showInformationMessage('No field types found in the project.');
        return;
    }

    const selectedFieldType = await selectFieldType(fieldTypes);
    if (!selectedFieldType) return;

    const fieldsOfType = fieldInfoByType.get(selectedFieldType) || [];
    if (fieldsOfType.length === 0) {
        vscode.window.showInformationMessage(`No fields of type ${selectedFieldType} found.`);
        return;
    }

    const fieldInfo = await selectField(fieldsOfType, selectedFieldType);
    if (!fieldInfo) return;

    await handleFieldAction(fieldInfo, objectsWithPaths);
}

async function loadFieldInfo() {
    const fieldTypes: string[] = [];
    const fieldInfoByType = new Map<string, Array<{ name: string, path: string, objectName: string }>>();
    const objectsWithPaths = new Map<string, Array<string>>();

    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder found.');
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const fieldFiles = glob.sync('**/objects/*/fields/*.field-meta.xml', {
            cwd: rootPath,
            absolute: true
        });

        const fieldTypesSet = new Set<string>();

        for (const fieldFile of fieldFiles) {
            const fieldData = parseFieldFile(fieldFile, rootPath);
            if (!fieldData) continue;

            const { fieldType, fieldName, objectName, relativeObjectPath } = fieldData;

            // Store object with its path
            if (!objectsWithPaths.has(objectName)) {
                objectsWithPaths.set(objectName, []);
            }
            if (!objectsWithPaths.get(objectName)!.includes(relativeObjectPath)) {
                objectsWithPaths.get(objectName)!.push(relativeObjectPath);
            }

            // Store field info by type
            if (!fieldInfoByType.has(fieldType)) {
                fieldInfoByType.set(fieldType, []);
            }

            fieldInfoByType.get(fieldType)!.push({
                name: fieldName,
                path: fieldFile,
                objectName: objectName
            });

            fieldTypesSet.add(fieldType);
        }

        fieldTypes.push(...Array.from(fieldTypesSet).sort());
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error loading field types: ${errorMessage}`);
    }

    return { fieldTypes, fieldInfoByType, objectsWithPaths };
}

function parseFieldFile(fieldFile: string, rootPath: string) {
    try {
        const fileContent = fs.readFileSync(fieldFile, 'utf8');
        const parser = new XMLParser({
            ignoreAttributes: false
        });
        const result = parser.parse(fileContent);

        if (!result.CustomField || !result.CustomField.type) {
            return null;
        }

        const fieldType = result.CustomField.type;
        const fieldName = path.basename(fieldFile, '.field-meta.xml');

        // Extract object name and path information
        const pathParts = fieldFile.split(path.sep);
        const objectsIndex = pathParts.findIndex((part: string) => part === 'objects');
        const objectName = objectsIndex !== -1 && objectsIndex + 1 < pathParts.length ?
            pathParts[objectsIndex + 1] : 'Unknown';

        // Get object folder path (relative to the object directory)
        const objectPath = fieldFile.substring(0, fieldFile.indexOf(`${path.sep}fields${path.sep}`));
        const relativeObjectPath = objectPath.replace(rootPath + path.sep, '');

        return { fieldType, fieldName, objectName, relativeObjectPath };
    } catch (error) {
        console.error(`Error parsing field file ${fieldFile}:`, error);
        return null;
    }
}

async function selectFieldType(fieldTypes: string[]): Promise<string | undefined> {
    return await vscode.window.showQuickPick(fieldTypes, {
        placeHolder: 'Select a field type to load',
    });
}

async function selectField(fieldsOfType: Array<{ name: string, path: string, objectName: string }>, fieldType: string) {
    const selectedField = await vscode.window.showQuickPick(
        fieldsOfType.map(field => `${field.name} (${field.objectName})`),
        {
            placeHolder: `Select a ${fieldType} field`
        }
    );

    if (!selectedField) return null;

    const fieldName = selectedField.split(' ')[0];
    const fieldInfo = fieldsOfType.find(f => f.name === fieldName);

    if (!fieldInfo) {
        vscode.window.showErrorMessage(`Field information not found for ${fieldName}`);
        return null;
    }

    return fieldInfo;
}

async function handleFieldAction(fieldInfo: { name: string, path: string, objectName: string }, objectsWithPaths: Map<string, Array<string>>) {
    const action = await vscode.window.showQuickPick(
        ['Open field', 'Copy to another object'],
        { placeHolder: `What do you want to do with ${fieldInfo.name}?` }
    );

    if (!action) return;

    if (action === 'Open field') {
        await openField(fieldInfo.path);
    } else if (action === 'Copy to another object') {
        await copyFieldToObject(fieldInfo, objectsWithPaths);
    }
}

async function openField(fieldPath: string) {
    const document = await vscode.workspace.openTextDocument(fieldPath);
    await vscode.window.showTextDocument(document);
}

async function copyFieldToObject(fieldInfo: { name: string, path: string, objectName: string }, objectsWithPaths: Map<string, Array<string>>) {
    const targetObject = await selectTargetObject();
    if (!targetObject) return;

    const selectedObjectPath = await selectObjectPath(targetObject, objectsWithPaths);
    if (!selectedObjectPath) return;

    await performFieldCopy(fieldInfo, targetObject, selectedObjectPath);
}

async function selectTargetObject(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const objectFolders = glob.sync('**/objects/*/', {
        cwd: rootPath,
        absolute: true
    });

    const objects = objectFolders.map((folder: string) => {
        const parts = folder.split(path.sep);
        return parts[parts.length - 2];
    }).sort();

    return await vscode.window.showQuickPick(objects, {
        placeHolder: 'Select target object'
    });
}

async function selectObjectPath(targetObject: string, objectsWithPaths: Map<string, Array<string>>): Promise<string | undefined> {
    const targetObjectPaths = objectsWithPaths.get(targetObject) || [];

    if (targetObjectPaths.length > 1) {
        return await vscode.window.showQuickPick(targetObjectPaths, {
            placeHolder: `Select which ${targetObject} to copy to`
        });
    } else if (targetObjectPaths.length === 1) {
        return targetObjectPaths[0];
    } else {
        vscode.window.showErrorMessage(`No path found for object ${targetObject}`);
        return;
    }
}

async function performFieldCopy(fieldInfo: { name: string, path: string, objectName: string }, targetObject: string, selectedObjectPath: string) {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder found.');
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const targetFieldsFolder = path.join(rootPath, selectedObjectPath, 'fields');

        // Create fields directory if it doesn't exist
        if (!fs.existsSync(targetFieldsFolder)) {
            fs.mkdirSync(targetFieldsFolder, { recursive: true });
        }

        // Copy the field file
        const targetFilePath = path.join(targetFieldsFolder, path.basename(fieldInfo.path));
        fs.copyFileSync(fieldInfo.path, targetFilePath);

        vscode.window.showInformationMessage(`Field ${fieldInfo.name} copied to ${targetObject} successfully.`);

        // Open the copied file
        const document = await vscode.workspace.openTextDocument(targetFilePath);
        await vscode.window.showTextDocument(document);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error copying field: ${errorMessage}`);
    }
}
