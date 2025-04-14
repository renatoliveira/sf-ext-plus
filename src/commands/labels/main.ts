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

export async function activate(context: vscode.ExtensionContext, forceLoad: Boolean = false) {

    console.log('Activating Salesforce Labels AutoComplete Extension');
    console.log(`salesforceLabels: ${JSON.stringify(salesforceLabels)}`);

    // Check if labels are already loaded
    if (!forceLoad && Object.keys(salesforceLabels).length > 0) {
        vscode.window.showInformationMessage('Salesforce labels are already loaded');
        return;
    }

    const loadLabelsCommand = vscode.commands.registerCommand('sf-ext-plus.loadSalesforceLabels', loadLabelsInWorkspace);

    context.subscriptions.push(loadLabelsCommand);


    // Register a completion provider for Apex files (.cls)
    const labelCompletionProvider = vscode.languages.registerCompletionItemProvider(
        [
            { scheme: 'file', language: 'apex' },
            { scheme: 'file', pattern: '**/*.cls' } // Also match by file extension
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
                        const item = new vscode.CompletionItem(labelName, vscode.CompletionItemKind.Text);


                        // Show label value in detail
                        item.detail = label.value[0];

                        // Include description if available
                        if (label.shortDescription && label.shortDescription[0]) {
                            item.documentation = new vscode.MarkdownString(label.shortDescription[0]);
                        }


                        completionItems.push(item);
                    } catch (error) {
                        console.error(`Error processing label ${labelName}: ${error}`);
                        break;
                    }
                }


                return completionItems;
            }
        },
        '.' // Add trigger character to automatically show completions after typing '.'
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