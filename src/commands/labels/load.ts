import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import { getProvider as getCompletionProvider } from './completions';
import { getProvider as getHoverProvider } from './hover';

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

export default salesforceLabels;

export async function activate(context: vscode.ExtensionContext) {
    // register the command to load labels through the command palette
    const loadLabelsCommand = vscode.commands.registerCommand('sf-ext-plus.forceLoadSalesforceLabels', loadLabelsInWorkspace);

    context.subscriptions.push(loadLabelsCommand);

    // Load labels automatically when extension activates
    await loadLabelsInWorkspace();

    // dispose of the previous providers if they exist
    if (labelCompletionProviderDisposable) {
        labelCompletionProviderDisposable.dispose();
    }

    if (labelHoverProviderDisposable) {
        labelHoverProviderDisposable.dispose();
    }

    labelCompletionProviderDisposable = await getCompletionProvider();
    labelHoverProviderDisposable = await getHoverProvider();

    // Register completion and hover providers
    context.subscriptions.push(labelCompletionProviderDisposable);
    context.subscriptions.push(labelHoverProviderDisposable);
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