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

/**
 * Loads and displays fields filtered by their type, allowing the user to interactively
 * select a field type and then a specific field to perform actions on.
 *
 * This function orchestrates the following workflow:
 * 1. Loads all field information from the project
 * 2. Prompts the user to select a field type from available types
 * 3. Displays fields of the selected type for user selection
 * 4. Handles the selected field action with object path information
 *
 * Shows appropriate information messages when no field types or fields are found.
 * Returns early if the user cancels any selection step.
 *
 * @param _context - The VS Code extension context (currently unused)
 * @returns A promise that resolves when the field selection and action handling is complete
 */
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

/**
 * Loads field information from Salesforce metadata files in the workspace.
 *
 * Scans the workspace for field metadata files (*.field-meta.xml) and extracts
 * field type information, organizing it by type and tracking associated objects
 * with their paths.
 *
 * @returns A promise that resolves to an object containing:
 * - `fieldTypes`: Array of unique field types found, sorted alphabetically
 * - `fieldInfoByType`: Map where keys are field types and values are arrays of field info objects
 * - `objectsWithPaths`: Map where keys are object names and values are arrays of relative object paths
 *
 * @throws Shows error message via VS Code window if workspace folder is not found or file parsing fails
 */
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

/**
 * Parses a Salesforce field metadata file to extract field information.
 *
 * This function reads and parses a .field-meta.xml file to extract the field type,
 * field name, object name, and relative object path. It uses XML parsing to read
 * the CustomField metadata and derives additional information from the file path.
 *
 * @param fieldFile - The absolute path to the field metadata file (.field-meta.xml)
 * @param rootPath - The root path of the project to calculate relative paths
 * @returns An object containing field metadata information, or null if parsing fails
 * @returns {Object} result - The parsed field information
 * @returns {string} result.fieldType - The type of the custom field (e.g., 'Text', 'Number')
 * @returns {string} result.fieldName - The name of the field (derived from filename)
 * @returns {string} result.objectName - The name of the Salesforce object containing this field
 * @returns {string} result.relativeObjectPath - The relative path to the object directory
 *
 * @example
 * ```typescript
 * const fieldInfo = parseFieldFile(
 *   '/project/force-app/main/default/objects/Account/fields/MyField__c.field-meta.xml',
 *   '/project/force-app/main/default'
 * );
 * // Returns: { fieldType: 'Text', fieldName: 'MyField__c', objectName: 'Account', relativeObjectPath: 'objects/Account' }
 * ```
 */
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

/**
 * Displays a quick pick dialog for selecting a field type from the provided options.
 *
 * @param fieldTypes - An array of available field type strings to choose from
 * @returns A promise that resolves to the selected field type string, or undefined if no selection was made
 */
async function selectFieldType(fieldTypes: string[]): Promise<string | undefined> {
    return await vscode.window.showQuickPick(fieldTypes, {
        placeHolder: 'Select a field type to load',
    });
}

/**
 * Displays a quick pick dialog for the user to select a field from a list of fields of a specific type.
 *
 * @param fieldsOfType - Array of field objects containing name, path, and objectName properties
 * @param fieldType - The type of field being selected (used in the placeholder text)
 * @returns Promise that resolves to the selected field information object, or null if no selection was made or field not found
 */
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

/**
 * Handles field actions by presenting the user with a quick pick menu to either open a field or copy it to another object.
 *
 * @param fieldInfo - Object containing field information including name, path, and object name
 * @param fieldInfo.name - The name of the field
 * @param fieldInfo.path - The file path to the field
 * @param fieldInfo.objectName - The name of the object that contains the field
 * @param objectsWithPaths - Map containing object names as keys and arrays of their paths as values
 * @returns Promise that resolves when the selected action is completed or user cancels
 */
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

/**
 * Opens a field file in the VS Code editor.
 *
 * @param fieldPath - The file path to the field that should be opened
 * @returns A promise that resolves when the document is successfully opened and displayed
 */
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

/**
 * Presents a quick pick dialog to select a Salesforce object from the workspace.
 * Scans the workspace for object folders and extracts object names for selection.
 *
 * @returns A Promise that resolves to the selected object name, or undefined if no selection was made or no workspace is found
 * @throws Shows an error message if no workspace folder is found
 */
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
        // Remove trailing slash and split path
        const cleanPath = folder.replace(/\/$/, '');
        const parts = cleanPath.split(path.sep);
        // Get the last part which should be the object name
        return parts[parts.length - 1];
    }).filter(obj => obj && obj !== 'objects') // Filter out empty strings and 'objects' folder
        .sort();

    return await vscode.window.showQuickPick(objects, {
        placeHolder: 'Select target object'
    });
}

/**
 * Selects an object path from available options for a target object.
 *
 * If multiple paths are available, presents a quick pick menu to the user for selection.
 * If only one path is available, returns it directly.
 * If no paths are available, shows an error message.
 *
 * @param targetObject - The name of the target object to find paths for
 * @param objectsWithPaths - A map containing object names as keys and arrays of their paths as values
 * @returns A promise that resolves to the selected path string, or undefined if no path is selected or available
 */
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

/**
 * Copies a Salesforce field from one object to another within the workspace.
 *
 * @param fieldInfo - Object containing field information
 * @param fieldInfo.name - The name of the field being copied
 * @param fieldInfo.path - The file system path to the source field file
 * @param fieldInfo.objectName - The name of the source object containing the field
 * @param targetObject - The name of the target object where the field will be copied
 * @param selectedObjectPath - The relative path to the target object directory within the workspace
 *
 * @returns Promise that resolves when the field copy operation is complete
 *
 * @throws {Error} When no workspace folder is found
 * @throws {Error} When file system operations fail (directory creation, file copying, etc.)
 *
 * @remarks
 * This function performs the following operations:
 * - Validates workspace folder existence
 * - Creates the target fields directory if it doesn't exist
 * - Copies the field file to the target location
 * - Shows success/error messages to the user
 * - Opens the copied file in the editor
 */
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
