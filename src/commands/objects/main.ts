import * as vscode from 'vscode';
import labels from '../../labels';
import * as fs from 'fs';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';

const COMMAND_NAME = 'viewObjectInfoOnPanel';

export async function activate(_context: vscode.ExtensionContext) {
    const commands = await vscode.commands.getCommands(true);
    const commandFullName = `${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`;

    if (commands.includes(commandFullName)) {
        return;
    }

    vscode.commands.registerCommand(commandFullName, showSObjectOnInfoPanel);
}

async function getObjectFilePath(): Promise<string | undefined> {
    // if the user has not opened a file, we will list objects in the workspace and offer them
    // as options
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder is open. Please open a Salesforce project.');
        return;
    }

    // Get the first workspace folder
    const objectFiles: string[] = [];
    const workspaceFolder = workspaceFolders[0].uri.fsPath;

    vscode.window.showInformationMessage('Searching for Salesforce object metadata files in the workspace...');

    // search for all "object-meta.xml" files in the workspace
    const searchFiles = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                searchFiles(filePath); // Recursively search in subdirectories
            } else if (file.endsWith('.object-meta.xml')) {
                objectFiles.push(filePath);
            }
        }
    };

    searchFiles(workspaceFolder);

    if (objectFiles.length === 0) {
        vscode.window.showErrorMessage('No Salesforce object metadata files found in the workspace.');
        return undefined;
    }

    // Show a quick pick menu with the object files
    const selected = await vscode.window.showQuickPick(objectFiles.map(file => ({
        label: path.basename(file),
        description: file,
        detail: `View ${path.basename(file)}`
    })), {
        placeHolder: 'Select a Salesforce object metadata file to view'
    });

    return selected?.description;
}

async function showSObjectOnInfoPanel() {
    // Get the active editor
    const editor = vscode.window.activeTextEditor;
    let filePath = editor?.document.uri.fsPath;

    if (!editor || !filePath || !filePath.endsWith('.object-meta.xml')) {
        filePath = await getObjectFilePath();

        if (!filePath) {
            vscode.window.showErrorMessage('No Salesforce object metadata file is selected.');
            return;
        }
    }

    try {
        // Read and parse the object XML
        const objectXml = fs.readFileSync(filePath, 'utf8');
        // Remove BOM and any leading whitespace to avoid XML parsing errors
        const cleanedXml = objectXml.replace(/^\uFEFF|\s+/, '');
        const objectJson = await parseStringPromise(cleanedXml);

        // Look for fields in the fields directory
        const fieldsFolder = path.join(path.dirname(filePath), 'fields');
        const fields: any[] = [];

        if (fs.existsSync(fieldsFolder)) {
            const files = fs.readdirSync(fieldsFolder).filter(f => f.endsWith('.field-meta.xml'));
            for (const f of files) {
                const content = fs.readFileSync(path.join(fieldsFolder, f), 'utf8');
                const json = await parseStringPromise(content);
                fields.push({ name: f.replace('.field-meta.xml', ''), ...json.CustomField });
            }
        }

        // Create and show webview panel
        const panel = vscode.window.createWebviewPanel(
            'sfObjectViewer',
            `Object: ${path.basename(filePath.replace('.object-meta.xml', ''))}`,
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        panel.webview.html = getWebviewContent(objectJson, fields, filePath);
    } catch (error) {
        vscode.window.showErrorMessage(`Error processing object: ${(error as Error).message}`);
    }
}

function getWebviewContent(object: any, fields: any[], filePath: string): string {
    const objectName = path.basename(filePath, '.object-meta.xml');
    const objectLabel = object.CustomObject?.label?.[0] || objectName;

    // Get additional object features
    const hasFeed = object.CustomObject?.enableFeeds?.[0] === 'true';
    const hasHistory = object.CustomObject?.enableHistory?.[0] === 'true';
    const hasEnhancedLookup = object.CustomObject?.enableEnhancedLookup?.[0] === 'true';
    const sharingModel = object.CustomObject?.sharingModel?.[0] || 'N/A';
    const externalSharingModel = object.CustomObject?.externalSharingModel?.[0] || 'N/A';

    const sortedFields = [...fields].sort((a, b) => {
        // First sort by type
        const typeA = (a.type?.[0] || '').toLowerCase();
        const typeB = (b.type?.[0] || '').toLowerCase();
        if (typeA !== typeB) {
            return typeA.localeCompare(typeB);
        }

        // Then sort by label
        const labelA = (a.label?.[0] || '').toLowerCase();
        const labelB = (b.label?.[0] || '').toLowerCase();
        return labelA.localeCompare(labelB);
    });

    const fieldRows = sortedFields.map(f =>
        `<tr>
            <td>${f.name}</td>
            <td>${f.label?.[0] || ''}</td>
            <td>${f.type?.[0] || ''}</td>
            <td>${f.description?.[0] || ''}</td>
         </tr>`
    ).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                font-family: var(--vscode-editor-font-family, Arial, sans-serif);
                margin: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            th, td {
                border: 1px solid var(--vscode-panel-border, #ddd);
                padding: 8px;
            }
            th {
                background-color: var(--vscode-editor-selectionBackground);
                color: var(--vscode-editor-selectionForeground, var(--vscode-editor-foreground));
                text-align: left;
            }
            .api-name {
                font-family: var(--vscode-editor-font-family, monospace);
                cursor: pointer;
            }
            .api-name:hover { text-decoration: underline; }
            .feature-enabled { color: var(--vscode-charts-green, green); }
            .feature-disabled { color: var(--vscode-disabledForeground, #888); }
            h1, h2 { color: var(--vscode-titleBar-activeForeground); }
            .field-row:focus-within {
                background-color: var(--vscode-list-hoverBackground);
            }
            .field-cell:focus {
                outline: 1px solid var(--vscode-focusBorder);
                position: relative;
            }
        </style>
        <script>
            function copyToClipboard(text) {
                navigator.clipboard.writeText(text);
            }

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Tab') {
                    const focusableElements = document.querySelectorAll('.field-cell[tabindex="0"]');
                    const focusedElement = document.activeElement;

                    if (focusedElement && focusedElement.classList.contains('field-cell')) {
                        e.preventDefault();
                        const currentIndex = Array.from(focusableElements).indexOf(focusedElement);
                        const nextIndex = e.shiftKey ?
                            (currentIndex - 1 + focusableElements.length) % focusableElements.length :
                            (currentIndex + 1) % focusableElements.length;

                        focusableElements[nextIndex].focus();
                    }
                } else if (e.key === 'Enter') {
                    const focusedElement = document.activeElement;
                    if (focusedElement && focusedElement.classList.contains('field-cell')) {
                        e.preventDefault();
                        copyToClipboard(focusedElement.textContent);

                        // Optional: Show visual feedback
                        const originalBackground = focusedElement.style.backgroundColor;
                        focusedElement.style.backgroundColor = 'var(--vscode-editor-selectionBackground)';
                        setTimeout(() => {
                            focusedElement.style.backgroundColor = originalBackground;
                        }, 200);
                    }
                }
            });
        </script>
    </head>
    <body>
        <h1>${objectLabel} Object</h1>

        <div>
            <h2>Object Configuration</h2>
            <table>
                <tr>
                    <th>Property</th>
                    <th>Value</th>
                </tr>
                <tr>
                    <td>API Name:</td>
                    <td><span class="api-name" onclick="copyToClipboard('${objectName}')" title="Click to copy" tabindex="0">${objectName}</span></td>
                </tr>
                <tr>
                    <td>Sharing Model:</td>
                    <td>${sharingModel}</td>
                </tr>
                <tr>
                    <td>External Sharing Model:</td>
                    <td>${externalSharingModel}</td>
                </tr>
                <tr>
                    <td>Feeds Enabled:</td>
                    <td class="${hasFeed ? 'feature-enabled' : 'feature-disabled'}">${hasFeed ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                    <td>History Tracking Enabled:</td>
                    <td class="${hasHistory ? 'feature-enabled' : 'feature-disabled'}">${hasHistory ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                    <td>Enhanced Lookup Enabled:</td>
                    <td class="${hasEnhancedLookup ? 'feature-enabled' : 'feature-disabled'}">${hasEnhancedLookup ? 'Yes' : 'No'}</td>
                </tr>
            </table>
        </div>

        <h2>Fields (${fields.length})</h2>
        <table>
            <thead>
                <tr>
                    <th>API Name</th>
                    <th>Label</th>
                    <th>Type</th>
                    <th>Description</th>
                </tr>
            </thead>
            <tbody>
                ${sortedFields.map(f =>
        `<tr class="field-row">
                        <td class="field-cell" tabindex="0">${f.name}</td>
                        <td class="field-cell" tabindex="0">${f.label?.[0] || ''}</td>
                        <td class="field-cell" tabindex="0">${f.type?.[0] || ''}</td>
                        <td class="field-cell" tabindex="0">${f.description?.[0] || ''}</td>
                     </tr>`
    ).join('')}
            </tbody>
        </table>
    </body>
    </html>`;
}
