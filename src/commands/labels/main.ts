import * as vscode from 'vscode';
import * as xml2js from 'xml2js';

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
let labelCompletionProviderDisposable: vscode.Disposable | undefined;
let labelHoverProviderDisposable: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext, forceLoad: Boolean = false) {
    // Check if labels are already loaded
    if (!forceLoad && Object.keys(salesforceLabels).length > 0) {
        vscode.window.showInformationMessage('Salesforce labels are already loaded.');
        return;
    }

    if (forceLoad) {
        // Dispose of previous providers if they exist
        if (labelCompletionProviderDisposable) {
            labelCompletionProviderDisposable.dispose();
        }
        if (labelHoverProviderDisposable) {
            labelHoverProviderDisposable.dispose();
        }
    }

    // Register a completion provider for Apex files (.cls)
    labelCompletionProviderDisposable = vscode.languages.registerCompletionItemProvider(
        [
            { scheme: 'file', language: 'apex' },
            { scheme: 'file', pattern: '**/*.cls' }
        ],
        {
            provideCompletionItems(document, position) {
                const linePrefix = document.lineAt(position).text.slice(0, position.character);

                // Trigger completion after 'Label.' prefix
                if (typeof linePrefix !== 'string' || !linePrefix.toLowerCase().endsWith('label.')) {
                    return undefined;
                }

                const completionItems: vscode.CompletionItem[] = [];

                for (const labelName in salesforceLabels) {
                    try {
                        const label = salesforceLabels[labelName];
                        const item = new vscode.CompletionItem(labelName, vscode.CompletionItemKind.Variable);

                        // Show label value in detail
                        item.detail = label.value[0];

                        // Include description if available
                        if (label.shortDescription && label.shortDescription[0]) {
                            item.documentation = new vscode.MarkdownString(label.shortDescription[0]);
                        }

                        completionItems.push(item);
                    } catch (error) {
                        break;
                    }
                }


                return completionItems;
            }
        },
        '.' // Add trigger character to automatically show completions after typing '.'
    );

    // Register a hover provider for showing label information in Apex files
    labelHoverProviderDisposable = vscode.languages.registerHoverProvider(
        [
            { scheme: 'file', language: 'apex' },
            { scheme: 'file', pattern: '**/*.cls' }
        ],
        {
            provideHover(document, position) {
                const wordRange = document.getWordRangeAtPosition(position, /(?:label|system\.label)\.(\w+)/gi);

                if (!wordRange) {
                    return undefined;
                }

                const text = document.getText(wordRange);
                const labelName = text.replaceAll(/(?:label|system\.label)\./gi, '');
                const label = salesforceLabels[labelName];

                if (!label) {
                    return undefined;
                }

                const hoverContent = new vscode.MarkdownString();

                hoverContent.appendMarkdown(`**Label Name:** ${labelName}\n\n`);
                hoverContent.appendMarkdown(`**Value:** ${label.value}\n\n`);

                if (label.categories) {
                    hoverContent.appendMarkdown(`**Category:** ${label.categories}\n\n`);
                }

                if (label.shortDescription) {
                    hoverContent.appendMarkdown(`**Short Description:** ${label.shortDescription || 'N/A'}\n\n`);
                }

                if (label.protected) {
                    hoverContent.appendMarkdown(`**Protected:** ${label.protected ? 'Yes' : 'No'}\n\n`);
                }

                if (label.language) {
                    hoverContent.appendMarkdown(`**Language:** ${label.language || 'N/A'}\n\n`);
                }

                hoverContent.isTrusted = true;

                return new vscode.Hover(hoverContent, wordRange);
            }
        }
    );

    // avoid duplicating the providers on force load
    if (!forceLoad) {
        context.subscriptions.push(labelHoverProviderDisposable);
        context.subscriptions.push(labelCompletionProviderDisposable);
    }

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
    xml2js.parseString(labelFileString, (err: any, result: { CustomLabels: { labels: any; }; }) => {
        if (err) {
            vscode.window.showErrorMessage(`Failed to parse label file ${filePath}: ${err}`);
            return;
        }

        const labels = result.CustomLabels.labels;
        const labelsCount = labels.length;

        const showLoadingLabelsProgressNotification = vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Loading ${labelsCount} labels from ${filePath}`,
            cancellable: false
        }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            const startTime = Date.now();

            // Reset labels before loading new ones
            salesforceLabels = {};

            // Process all labels
            for (let i = 0; i < labels.length; i++) {
                const label = labels[i];
                salesforceLabels[label.fullName] = label;

                // Update progress bar
                const percent = Math.round((i + 1) / labelsCount * 100);
                progress.report({
                    message: `Loaded label ${label.fullName} (${i + 1}/${labelsCount})`,
                    increment: 100 / labelsCount
                });

                // Add a small delay between each label to make progress visible
                if (i < labels.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            // Ensure the progress bar shows for at least 1 second
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < 250) {
                await new Promise(resolve => setTimeout(resolve, 250 - elapsedTime));
            }
        });

        showLoadingLabelsProgressNotification.then(() => {
            vscode.window.showInformationMessage(`Parsed ${labels.length} labels from your custom labels metadata file.`);
        });

        if (labelsCount === 0) {
            vscode.window.showInformationMessage(`No labels found in ${filePath}`);
            return;
        }
    });
}

export function deactivate() {
    // Clean up if needed
    salesforceLabels = {};
}