import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import { getProvider as getHoverProvider } from './hover';
import { getCompletionProvider } from './completions';
import labels from '../../labels';

export default interface CustomLabel {
    fullName: String;
    value: String;
    categories?: String;
    language?: String;
    protected?: Boolean;
    shortDescription?: String;
};

interface LabelMap {
    [fullName: string]: CustomLabel;
}

export let salesforceLabels: LabelMap = {};
export let activeLabelCategories: String[] = [];
export let labelFiles = [] as vscode.Uri[];

let labelCompletionProviderDisposable: vscode.Disposable | undefined;
let labelHoverProviderDisposable: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext, shouldLoadLabels: boolean = true) {
    const commands = await vscode.commands.getCommands(true);

    if (!commands.includes(`${labels.misc.EXTENSION_NAME}.forceLoadSalesforceLabels`)) {
        // register the command to load labels through the command palette
        const loadLabelsCommand = vscode.commands.registerCommand(`${labels.misc.EXTENSION_NAME}.forceLoadSalesforceLabels`, loadLabelsInWorkspace);
        context.subscriptions.push(loadLabelsCommand);
    }

    if (shouldLoadLabels) {
        // Load labels from the XML file automatically when extension activates
        await loadLabelsInWorkspace();
    }

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
    if (labelCompletionProviderDisposable) {
        context.subscriptions.push(labelCompletionProviderDisposable);
    }

    if (labelHoverProviderDisposable) {
        context.subscriptions.push(labelHoverProviderDisposable);
    }
}

async function loadLabelsInWorkspace() {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        vscode.window.showWarningMessage(labels.warningMessages.NO_WORKSPACE_IS_OPENED);

        return;
    }

    labelFiles = await vscode.workspace.findFiles('**/force-app/**/labels/*.labels-meta.xml');

    if (labelFiles.length === 0) {
        vscode.window.showInformationMessage(labels.informationMessages.NO_LABEL_FILES_FOUND);

        return;
    }

    for (const labelFileUri of labelFiles) {
        try {
            const labelFileContent = await vscode.workspace.fs.readFile(labelFileUri);
            const labelFileString = new TextDecoder('utf-8').decode(labelFileContent);

            parseLabelFile(labelFileString, labelFileUri.fsPath);
        } catch (err) {
            vscode.window.showWarningMessage(labels.warningMessages.FAILED_TO_LOAD_LABELS_AT_PATH(labelFileUri.fsPath, err as Error));
        }
    }
}

function parseLabelFile(labelFileString: string, filePath: string) {
    xml2js.parseString(labelFileString, (err: any, result: { CustomLabels: { labels: any; }; }) => {
        if (err) {
            vscode.window.showErrorMessage(labels.warningMessages.FAILED_TO_PARSE_FILE_AT_PATH(filePath, err));

            return;
        }

        const customLabels = result.CustomLabels.labels;
        const labelsCount = customLabels.length;

        const showLoadingLabelsProgressNotification = vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: labels.informationMessages.LOADING_LABELS_FROM_PATH(labelsCount, filePath),
            cancellable: false
        }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            const startTime = Date.now();
            const categories: string[] = [];

            // Process all labels
            for (let i = 0; i < customLabels.length; i++) {
                const label = customLabels[i];
                salesforceLabels[label.fullName] = label;

                if (label.categories) {
                    const cats = label.categories[0].split(',').map((category: string) => category.trim());

                    categories.push(...cats);
                }

                // Update progress bar
                const percent = Math.round((i + 1) / labelsCount * 100);
                progress.report({
                    message: `Loaded label ${label.fullName} (${i + 1}/${labelsCount})`,
                    increment: 100 / labelsCount
                });

                // Add a small delay between each label to make progress visible
                if (i < customLabels.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            activeLabelCategories = Array.from(new Set(categories));

            // Ensure the progress bar shows for at least 1 second
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < 250) {
                await new Promise(resolve => setTimeout(resolve, 250 - elapsedTime));
            }
        });

        showLoadingLabelsProgressNotification.then(() => {
            vscode.window.showInformationMessage(labels.informationMessages.PARSED_LABELS_FROM_FILE(labelsCount));
        });

        if (labelsCount === 0) {
            vscode.window.showInformationMessage(labels.informationMessages.NO_LABELS_IN_FILE(filePath));

            return;
        }
    });
}

export function deactivate() {
    // Clean up if needed
    salesforceLabels = {};
    activeLabelCategories = [];
}