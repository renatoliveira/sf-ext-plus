import * as vscode from 'vscode';
import CustomLabel, { activate, labelFiles, getSalesforceLabelsStore } from './load';
import labels from '../../labels';

export async function activateLabelCreateOnPalette(context: vscode.ExtensionContext) {
    // enables the input box to create a new label
    const createLabelCommand = vscode.commands.registerCommand(`${labels.misc.EXTENSION_NAME}.createNewLabel`, async (providedLabelValue?: string) => {
        // Use the provided label name if available, otherwise prompt for one
        let labelValue;
        let labelName = await vscode.window.showInputBox({
            prompt: labels.commands.PROMPT_NAME,
            placeHolder: labels.commands.PLACEHOLDER
        });

        if (!labelName) {
            return;
        }

        // get the text selected in the editor
        if (providedLabelValue) {
            labelValue = providedLabelValue;
        }

        // ask if user wants to use a defined namespace in package.json's "salesforce.namespace" field
        const packageJsonPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath + '/package.json';
        const packageJsonContent = await vscode.workspace.fs.readFile(vscode.Uri.file(packageJsonPath));
        const packageJsonString = new TextDecoder('utf-8').decode(packageJsonContent);
        const packageJson = JSON.parse(packageJsonString);
        const namespace = packageJson.salesforce?.namespace || labels.misc.EMPTY_STRING;

        if (namespace) {
            const useNamespace = await vscode.window.showQuickPick([labels.misc.YES, labels.misc.NO], {
                placeHolder: labels.commands.PLACEHOLDER_NAMESPACE(namespace)
            });

            if (useNamespace === labels.misc.YES) {
                // Add the namespace to the label name
                labelName = `${namespace}_${labelName}`;
            }
        }

        const inputLabelValue = await vscode.window.showInputBox({
            prompt: labels.commands.ENTER_LABEL_VALUE,
            placeHolder: providedLabelValue || labels.commands.CUSTOM_LABEL_VALUE_PLACEHOLDER,
            value: providedLabelValue || labels.misc.EMPTY_STRING
        });

        if (!inputLabelValue) {
            return;
        }

        labelValue = inputLabelValue;

        let activeLabelCategories: string[] = getSalesforceLabelsStore().getAllLabels().map(label => {
            if (label.categories && label.categories.length > 0 && label.categories[0] && label.categories[0].length > 0) {
                const categories = label.categories[0].split(',');

                return categories.map(category => category.trim());
            }

            return [];
        }).flat();

        // remove duplicate labels
        activeLabelCategories = [...new Set(activeLabelCategories.flat())];

        // for the categories, load from activeLabelCategories
        let selectedCategories = await vscode.window.showQuickPick(
            activeLabelCategories.map(category => ({ label: category.toString() })),
            {
                placeHolder: labels.commands.SELECT_CATEGORY,
                canPickMany: true
            }
        );

        let categories: string = labels.misc.EMPTY_STRING;

        // Convert multiple selection to the expected format
        if (selectedCategories && selectedCategories.length > 0) {
            categories = selectedCategories.map(c => c.label).join(',');
        }

        // show an input so the user can enter a category
        const categoryInput = await vscode.window.showInputBox({
            prompt: labels.commands.SELECT_CATEGORIES,
            placeHolder: labels.commands.SELECT_CATEGORIES_PLACEHOLDER
        });

        if (categoryInput) {
            categories = categories + ',' + categoryInput;
        }

        // Ask if the label is protected or not
        const isProtected = await vscode.window.showQuickPick([labels.misc.YES, labels.misc.NO], {
            placeHolder: labels.commands.LABEL_PROTECTED_PROMPT
        });

        if (!isProtected) {
            return;
        }

        // Ask for the language of the label, but should read from the package.json's "salesforce.defaultLanguage" field
        const defaultLanguage = packageJson.salesforce?.labels?.defaultLanguage || labels.misc.LANG_EN_US;
        let chosenLanguage = await vscode.window.showInputBox({
            prompt: labels.commands.LABEL_LANGUAGE_PROMPT,
            placeHolder: labels.commands.LABEL_LANGUAGE_PLACEHOLDER(defaultLanguage),
            value: defaultLanguage
        });

        if (!chosenLanguage) {
            chosenLanguage = defaultLanguage;
        }

        // Ask for a short description of the label
        const shortDescription = await vscode.window.showInputBox({
            prompt: labels.commands.SHORT_DESCRIPTION_PROMPT,
            placeHolder: labels.commands.SHORT_DESCRIPTION_PLACEHOLDER
        });

        // Create a new label object
        const newLabel: CustomLabel = {
            fullName: labelName,
            value: labelValue,
            categories: categories,
            language: chosenLanguage,
            protected: isProtected === labels.misc.YES,
            shortDescription: shortDescription || labelName
        };

        // Get the existing custom label file
        if (labelFiles.length === 0) {
            vscode.window.showErrorMessage(labels.commands.LABELS_NOT_FOUND_IN_WORKSPACE);
            return;
        }

        let selectedLabelFile;
        let labelFileUri;

        if (labelFiles.length > 1) {
            // If there are multiple label files, ask the user to select one
            selectedLabelFile = await vscode.window.showQuickPick(
                labelFiles.map(labelFile => ({
                    label: labelFile.fsPath,
                    description: labels.commands.SELECT_A_CUSTOM_LABEL_FILE,
                    uri: labelFile
                })),
                {
                    placeHolder: labels.commands.SELECT_A_CUSTOM_LABEL_FILE
                }
            );

            if (selectedLabelFile) {
                labelFileUri = selectedLabelFile.uri;
            }
        } else {
            // If there is only one label file, use it
            labelFileUri = labelFiles[0];
        }

        if (!labelFileUri) {
            vscode.window.showInformationMessage(labels.informationMessages.NO_LABEL_FILE_SELECTED);

            return;
        }

        // Read the label file content and then append the new label.
        const labelFileContent = await vscode.workspace.fs.readFile(labelFileUri);

        const labelFileString = new TextDecoder('utf-8').decode(labelFileContent);
        const labelFileStringWithNewLabel = labelFileString.replace(
            /<\/labels>/,
            `</labels>\n    <labels>\n        <fullName>${newLabel.fullName}</fullName>\n        <categories>${newLabel.categories}</categories>\n        <language>${newLabel.language}</language>\n        <protected>${newLabel.protected}</protected>\n        <shortDescription>${newLabel.shortDescription}</shortDescription>\n        <value>${newLabel.value}</value>\n    </labels>`
        );

        // Write the updated content back to the label file
        await vscode.workspace.fs.writeFile(labelFileUri, Buffer.from(labelFileStringWithNewLabel, 'utf-8'));
        vscode.window.showInformationMessage(labels.commands.LABEL_CREATED_WITH_PATH(newLabel.fullName.toString(), labelFileUri.fsPath));

        // Refresh the label files
        getSalesforceLabelsStore().updateLabel(newLabel.fullName.toString(), newLabel);

        // if the context contains selected text, replace it with the new label
        const editor = vscode.window.activeTextEditor;

        if (editor) {
            const range = editor.selection;

            editor.edit(editBuilder => {
                editBuilder.replace(range, `System.Label.${newLabel.fullName.toString()}`);
            });
        }

        // reload the labels for all providers
        await activate(context, true);
    });

    context.subscriptions.push(createLabelCommand);
}

export async function getLabelCreateOnCodeActionProvider() {
    const labelContextMenuProvider = vscode.languages.registerCodeActionsProvider(
        [
            { scheme: 'file', pattern: '**/*.cls' },
            { scheme: 'file', language: 'apex' }
        ],
        {
            provideCodeActions(document, range, _context) {
                const result: vscode.CodeAction[] = [];

                let proposedLabelValue = document.getText(range);

                // if label is empty, return
                if (!proposedLabelValue) {
                    return;
                }

                // if label is surrounded by quotes, remove them
                if (proposedLabelValue.startsWith('\'') && proposedLabelValue.endsWith('\'')) {
                    proposedLabelValue = proposedLabelValue.slice(1, -1);
                }

                // Check if the label name exists in the list of labels
                if (getSalesforceLabelsStore().salesforceLabels[proposedLabelValue]) {
                    // if it does, do nothing
                    return;
                }

                // check if the content exists as the value of a label already
                const existingLabel = Object.values(getSalesforceLabelsStore().salesforceLabels).find(label => label.value[0] === proposedLabelValue);

                // check if its text shows on some other label in part too
                const similarLabels = Object.values(getSalesforceLabelsStore().salesforceLabels).filter(label =>
                    label.value[0].includes(proposedLabelValue) && (!!existingLabel ? label.value[0] !== existingLabel.value[0] : true)
                );

                if (existingLabel) {
                    // if it does, suggest using the existing label
                    const useExistingLabelAction = new vscode.CodeAction(
                        labels.commands.USE_EXISTING_LABEL(existingLabel.fullName.toString()),
                        vscode.CodeActionKind.QuickFix
                    );
                    useExistingLabelAction.isPreferred = true;
                    useExistingLabelAction.title = labels.commands.USE_EXISTING_LABEL(existingLabel.fullName.toString());
                    useExistingLabelAction.kind = vscode.CodeActionKind.QuickFix;
                    useExistingLabelAction.edit = new vscode.WorkspaceEdit();

                    // if the existing range starts and ends with a single quote, adjust the range
                    // so they are replaced too
                    if (existingLabel.value[0].startsWith('\'') && existingLabel.value[0].endsWith('\'')) {
                        const startLine = document.lineAt(range.start.line).text.indexOf('\'');
                        const endLine = document.lineAt(range.start.line).text.indexOf('\'', startLine + 1) + 1;
                        const rangeToReplace = new vscode.Range(
                            range.start.line,
                            startLine,
                            range.start.line,
                            endLine
                        );

                        useExistingLabelAction.edit.replace(document.uri, rangeToReplace, `System.Label.${existingLabel.fullName.toString()}`);
                    } else {
                        // just replace the range
                        useExistingLabelAction.edit.replace(document.uri, range, `System.Label.${existingLabel.fullName.toString()}`);
                    }

                    const alreadyExistsMessage = labels.commands.LABEL_ALREADY_EXISTS_AS(proposedLabelValue.toString(), existingLabel.fullName.toString());

                    // suggest the quick fix to use the existing label
                    useExistingLabelAction.diagnostics = [
                        new vscode.Diagnostic(range, alreadyExistsMessage, vscode.DiagnosticSeverity.Information)
                    ];
                    useExistingLabelAction.diagnostics[0].source = labels.misc.EXTENSION_SOURCE_NAME;
                    useExistingLabelAction.diagnostics[0].code = `${labels.misc.EXTENSION_NAME}.useExistingLabel`;
                    useExistingLabelAction.diagnostics[0].relatedInformation = [
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(document.uri, range),
                            alreadyExistsMessage
                        )
                    ];

                    // Add the action to the list of code actions
                    result.push(useExistingLabelAction);
                }

                // for each similar label found, suggest using it
                if (similarLabels && similarLabels.length > 0) {
                    const similarLabelActions = similarLabels.map(label => {
                        const useSimilarLabelMessage = labels.commands.USE_SIMILAR_LABEL(label.fullName.toString());
                        const useSimilarLabelAction = new vscode.CodeAction(
                            useSimilarLabelMessage,
                            vscode.CodeActionKind.QuickFix
                        );
                        useSimilarLabelAction.isPreferred = true;
                        useSimilarLabelAction.title = useSimilarLabelMessage;
                        useSimilarLabelAction.kind = vscode.CodeActionKind.QuickFix;
                        useSimilarLabelAction.edit = new vscode.WorkspaceEdit();

                        // the range to replace needs to be calculated based on the line, to replace
                        // the whole string between simple quotes in Apex
                        const startLine = document.lineAt(range.start.line).text.indexOf('\'');
                        const endLine = document.lineAt(range.start.line).text.indexOf('\'', startLine + 1) + 1;
                        const rangeToReplace = new vscode.Range(
                            range.start.line,
                            startLine,
                            range.start.line,
                            endLine
                        );

                        // replaces the selected text with the label
                        useSimilarLabelAction.edit.replace(document.uri, rangeToReplace, `System.Label.${label.fullName.toString()}`);

                        // Add the action to the list of code actions
                        return useSimilarLabelAction;
                    });

                    // Add the action to the list of code actions
                    result.push(...similarLabelActions);
                }

                // else, suggest creating a new label from the selected text
                const createLabelForProposedValueMessage = labels.commands.CREATE_LABEL_FOR_PROPOSED_VALUE(proposedLabelValue.toString());

                const createLabelAction = new vscode.CodeAction(
                    createLabelForProposedValueMessage,
                    vscode.CodeActionKind.QuickFix
                );
                createLabelAction.command = {
                    command: `${labels.misc.EXTENSION_NAME}.createNewLabel`,
                    title: labels.commands.CREATE_LABEL_CODE_ACTION_TITLE,
                    arguments: [proposedLabelValue]
                };
                createLabelAction.isPreferred = true;
                createLabelAction.title = createLabelForProposedValueMessage;
                createLabelAction.kind = vscode.CodeActionKind.QuickFix;

                // Add the action to the list of code actions
                result.push(createLabelAction);

                // return all available actions
                return result;
            }
        });

    return labelContextMenuProvider;
}