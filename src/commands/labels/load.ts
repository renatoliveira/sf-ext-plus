import * as vscode from 'vscode';
import * as xml2js from 'xml2js';
import { getProvider as getHoverProvider } from './hover';
import { getCompletionProvider } from './completions';
import labels from '../../labels';
import { getLabelCreateOnCodeActionProvider } from './create';

export default interface CustomLabel {
    fullName: String;
    value: String;
    categories?: String;
    language?: String;
    protected?: Boolean;
    shortDescription?: String;
    // eslint-disable-next-line semi
};

interface LabelMap {
    [fullName: string]: CustomLabel;
}

class SalesforceLabelsStore {
    private static instance: SalesforceLabelsStore;
    public salesforceLabels: LabelMap = {};

    private constructor() { }

    public static getInstance(): SalesforceLabelsStore {
        if (!SalesforceLabelsStore.instance) {
            SalesforceLabelsStore.instance = new SalesforceLabelsStore();
        }

        return SalesforceLabelsStore.instance;
    }

    public updateLabel(fullName: string, label: CustomLabel) {
        this.salesforceLabels[fullName] = label;
    }

    public clear() {
        this.salesforceLabels = {};
    }
}

export let activeLabelCategories: String[] = [];
export let labelFiles = [] as vscode.Uri[];
let salesforceLabelsStore = SalesforceLabelsStore.getInstance();

export function getSalesforceLabelsStore(): SalesforceLabelsStore {
    return SalesforceLabelsStore.getInstance();
}

let labelCompletionProviderDisposable: vscode.Disposable | undefined;
let labelHoverProviderDisposable: vscode.Disposable | undefined;
let labelContextMenuProvider: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext, silent: boolean = false) {
    const commands = await vscode.commands.getCommands(true);

    if (!commands.includes(`${labels.misc.EXTENSION_NAME}.forceLoadSalesforceLabels`)) {
        // register the command to load labels through the command palette
        const loadLabelsCommand = vscode.commands.registerCommand(`${labels.misc.EXTENSION_NAME}.forceLoadSalesforceLabels`, loadLabelsInWorkspace);

        context.subscriptions.push(loadLabelsCommand);
    }

    // Load labels from the XML file
    await loadLabelsInWorkspace(silent);

    // load providers that depend on the context
    loadCompletionProvider(context);
    loadHoverProvider(context);
    loadQuickFixProvider(context);
}

export async function loadCompletionProvider(context: vscode.ExtensionContext) {
    if (labelCompletionProviderDisposable) {
        labelCompletionProviderDisposable.dispose();
    }

    labelCompletionProviderDisposable = await getCompletionProvider();

    if (labelCompletionProviderDisposable) {
        context.subscriptions.push(labelCompletionProviderDisposable);
    }
}

export async function loadHoverProvider(context: vscode.ExtensionContext) {
    if (labelHoverProviderDisposable) {
        labelHoverProviderDisposable.dispose();
    }

    labelHoverProviderDisposable = await getHoverProvider();

    if (labelHoverProviderDisposable) {
        context.subscriptions.push(labelHoverProviderDisposable);
    }
}

export async function loadQuickFixProvider(context: vscode.ExtensionContext) {
    if (labelContextMenuProvider) {
        labelContextMenuProvider.dispose();
    }

    labelContextMenuProvider = await getLabelCreateOnCodeActionProvider();

    if (labelContextMenuProvider) {
        context.subscriptions.push(labelContextMenuProvider);
    }
}

async function loadLabelsInWorkspace(silent: boolean = false) {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        if (!silent) {
            vscode.window.showWarningMessage(labels.warningMessages.NO_WORKSPACE_IS_OPENED);
        }

        return;
    }

    labelFiles = await vscode.workspace.findFiles('**/force-app/**/labels/*.labels-meta.xml');

    if (labelFiles.length === 0) {
        if (!silent) {
            vscode.window.showInformationMessage(labels.informationMessages.NO_LABEL_FILES_FOUND);
        }

        return;
    }

    for (const labelFileUri of labelFiles) {
        try {
            const labelFileContent = await vscode.workspace.fs.readFile(labelFileUri);
            const labelFileString = new TextDecoder('utf-8').decode(labelFileContent);

            salesforceLabelsStore.clear();

            parseLabelFile(labelFileString, labelFileUri.fsPath, silent);
        } catch (err) {
            vscode.window.showWarningMessage(labels.warningMessages.FAILED_TO_LOAD_LABELS_AT_PATH(labelFileUri.fsPath, err as Error));
        }
    }
}

function parseLabelFile(labelFileString: string, filePath: string, silent: boolean = false) {
    xml2js.parseString(labelFileString, async (err: any, result: { CustomLabels: { labels: any; }; }) => {
        if (err) {
            vscode.window.showErrorMessage(labels.warningMessages.FAILED_TO_PARSE_FILE_AT_PATH(filePath, err));

            return;
        }

        const customLabels = result.CustomLabels.labels;
        const labelsCount = customLabels.length;

        if (!silent) {
            const showLoadingLabelsProgressNotification = vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: labels.informationMessages.LOADING_LABELS_FROM_PATH(labelsCount, filePath),
                cancellable: false
            }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
                const startTime = Date.now();
                const categories: string[] = [];

                // Process all labels
                await processLabelsIntoStorage(customLabels, silent, progress);

                activeLabelCategories = Array.from(new Set(categories));
                const elapsedTime = Date.now() - startTime;

                if (elapsedTime < 50) {
                    await new Promise(resolve => setTimeout(resolve, 50 - elapsedTime));
                }
            });

            showLoadingLabelsProgressNotification.then(() => {
                if (!silent) {
                    vscode.window.showInformationMessage(labels.informationMessages.PARSED_LABELS_FROM_FILE(labelsCount));
                }
            });

            return;
        }

        await processLabelsIntoStorage(customLabels, silent, undefined);

        if (labelsCount === 0) {
            if (!silent) {
                vscode.window.showInformationMessage(labels.informationMessages.NO_LABELS_IN_FILE(filePath));
            }
        }
    });

    async function processLabelsIntoStorage(customLabels: any, silent: boolean = false, progress?: vscode.Progress<{ message?: string; increment?: number }>) {
        const categories: string[] = [];
        const labelsCount = customLabels.length;

        for (let i = 0; i < customLabels.length; i++) {
            const label = customLabels[i];

            salesforceLabelsStore.updateLabel(label.fullName, label);

            if (label.categories) {
                const cats = label.categories[0].split(',').map((category: string) => category.trim());

                categories.push(...cats);
            }

            // Update progress bar
            progress?.report({
                message: `Loaded label ${label.fullName} (${i + 1}/${labelsCount})`,
                increment: 100 / labelsCount
            });

            // Add a small delay between each label to make progress visible
            if (i < customLabels.length - 1 && !silent) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
    }
}

export function deactivate() {
    // Clean up if needed
    salesforceLabelsStore.salesforceLabels = {};
    activeLabelCategories = [];
}
