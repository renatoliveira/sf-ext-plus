import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { glob } from 'glob';

interface CustomLabel {
    fullName: string;
    value: string;
    categories?: string;
    language?: string;
    protected?: boolean;
    shortDescription?: string;
}

interface LabelMap {
    [fullName: string]: CustomLabel;
}

let salesforceLabels: LabelMap = {};

export async function activate(context: vscode.ExtensionContext) {
    const loadLabelsCommand = vscode.commands.registerCommand('sf-ext-plus.loadSalesforceLabels', loadLabelsInWorkspace);

    context.subscriptions.push(loadLabelsCommand);

    console.log(`Current language: ${vscode.window.activeTextEditor?.document.languageId}`);
    console.log(`Current file: ${vscode.window.activeTextEditor?.document.fileName}`);

    // Register a completion provider for Apex files (.cls)
    const labelCompletionProvider = vscode.languages.registerCompletionItemProvider(
        [
            { scheme: 'file', language: 'apex' },
            { scheme: 'file', pattern: '**/*.cls' } // Also match by file extension
        ],
        {
            provideCompletionItems(document, position) {
                const linePrefix = document.lineAt(position).text.slice(0, position.character);

                console.log(`Line prefix: ${linePrefix}`);

                // Trigger completion after 'Label.' prefix
                if (!linePrefix.toLowerCase().endsWith('label.')) {
                    console.log(`Not a valid prefix for completion: ${linePrefix}`);
                    return undefined;
                }

                const completionItems: vscode.CompletionItem[] = [];

                console.log(salesforceLabels);

                for (const labelName in salesforceLabels) {
                    try {
                        console.log(labelName);
                        const label = salesforceLabels[labelName];
                        // https://vscode-api.js.org/enums/vscode.CompletionItemKind.html
                        const item = new vscode.CompletionItem(labelName, vscode.CompletionItemKind.Text);

                        console.log(label);
                        console.log(item);

                        // Show label value in detail
                        item.detail = label.value[0];

                        // Include description if available
                        if (label.shortDescription && label.shortDescription[0]) {
                            item.documentation = new vscode.MarkdownString(label.shortDescription[0]);
                        }

                        console.log(item);

                        completionItems.push(item);
                    } catch (error) {
                        console.error(`Error processing label ${labelName}: ${error}`);
                        break;
                    }
                }

                console.log('Completion items:');
                console.log(completionItems);

                return completionItems;
            }
        }
    );

    context.subscriptions.push(labelCompletionProvider);

    // Load labels automatically when extension activates
    await loadLabelsInWorkspace();
}

async function loadLabelsInWorkspace() {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        vscode.window.showWarningMessage('No workspace folder is opened');
        return;
    }

    const labelFiles = await vscode.workspace.findFiles('**/force-app/**/labels/*.labels-meta.xml');

    if (labelFiles.length === 0) {
        vscode.window.showInformationMessage('No label files found');
        return;
    }

    for (const labelFileUri of labelFiles) {
        try {
            const labelFileContent = await vscode.workspace.fs.readFile(labelFileUri);
            const labelFileString = new TextDecoder('utf-8').decode(labelFileContent);
            parseLabelFile(labelFileString, labelFileUri.fsPath);
        } catch (err) {
            vscode.window.showWarningMessage(`Failed to load labels from ${labelFileUri.fsPath}: ${err}`);
        }
    }
}

function parseLabelFile(labelFileString: string, filePath: string) {
    xml2js.parseString(labelFileString, (err, result) => {
        if (err) {
            vscode.window.showErrorMessage(`Failed to parse label file ${filePath}: ${err}`);
            return;
        }

        const labels = result.CustomLabels.labels;

        labels.forEach((label: CustomLabel) => {
            salesforceLabels[label.fullName] = label;
        });

        vscode.window.showInformationMessage(`Parsed ${labels.length} labels from your custom labels metadata file.`);
    });
}

export function deactivate() {
    // Clean up if needed
    salesforceLabels = {};
}