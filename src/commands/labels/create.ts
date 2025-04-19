import * as vscode from 'vscode';
import { activeLabelCategories, CustomLabel, labelFiles, salesforceLabels } from './load';

export async function activate(context: vscode.ExtensionContext) {
    // enables the input box to create a new label
    const createLabelCommand = vscode.commands.registerCommand('sf-ext-plus.createNewLabel', async () => {
        let labelName = await vscode.window.showInputBox({
            prompt: 'Enter the label name',
            placeHolder: 'e.g. My_Custom_Label'
        });

        if (!labelName) {
            return;
        }

        // ask if user wants to use a defined namespace in package.json's "salesforce.namespace" field
        const packageJsonPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath + '/package.json';
        const packageJsonContent = await vscode.workspace.fs.readFile(vscode.Uri.file(packageJsonPath));
        const packageJsonString = new TextDecoder('utf-8').decode(packageJsonContent);
        const packageJson = JSON.parse(packageJsonString);
        const namespace = packageJson.salesforce?.namespace || '';

        if (namespace) {
            const useNamespace = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Do you want to use the namespace "${namespace}" from your package.json?`
            });

            if (useNamespace === 'Yes') {
                // Add the namespace to the label name
                labelName = `${namespace}_${labelName}`;
            }
        }

        const labelValue = await vscode.window.showInputBox({
            prompt: 'Enter the label value',
            placeHolder: 'e.g. My Custom Label Value'
        });

        if (!labelValue) {
            return;
        }

        // for the categories, load from activeLabelCategories
        let selectedCategories = await vscode.window.showQuickPick(
            activeLabelCategories.map(category => ({ label: category.toString() })),
            {
                placeHolder: 'Select a category for the label',
                canPickMany: true
            }
        );

        let categories: string = '';

        // Convert multiple selection to the expected format
        if (selectedCategories && selectedCategories.length > 0) {
            categories = selectedCategories.map(c => c.label).join(',');
        }

        // show an input so the user can enter a category
        const categoryInput = await vscode.window.showInputBox({
            prompt: 'Enter new categories for the label (comma-separated) (leave empty to skip)',
            placeHolder: 'e.g. My_Custom_Category'
        });

        if (categoryInput) {
            categories = categories + ',' + categoryInput;
        }

        // Ask if the label is protected or not
        const isProtected = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Is the label protected?'
        });

        // Ask for the language of the label, but should read from the package.json's "salesforce.labels.defaultLanguage" field
        const defaultLanguage = packageJson.salesforce?.labels?.defaultLanguage || 'en_US';
        let chosenLanguage = await vscode.window.showInputBox({
            prompt: 'Enter the label language',
            placeHolder: `e.g. ${defaultLanguage}`,
            value: defaultLanguage
        });

        if (!chosenLanguage) {
            chosenLanguage = defaultLanguage;
        }

        // Ask for a short description of the label
        const shortDescription = await vscode.window.showInputBox({
            prompt: 'Enter a short description for the label (leave empty to skip and use the value from the API name',
            placeHolder: 'e.g. My Custom Label Short Description'
        });

        // Create a new label object
        const newLabel: CustomLabel = {
            fullName: labelName,
            value: labelValue,
            categories: categories,
            language: chosenLanguage,
            protected: isProtected === 'Yes',
            shortDescription: shortDescription || labelValue
        };

        console.log(`Creating new label: ${JSON.stringify(newLabel)}...`);

        // Get the existing custom label file
        if (labelFiles.length === 0) {
            vscode.window.showErrorMessage('No custom label files found in the workspace. Please retrieve it from the org or create one.');
            return;
        }

        let selectedLabelFile;
        let labelFileUri;

        if (labelFiles.length > 1) {
            // If there are multiple label files, ask the user to select one
            selectedLabelFile = await vscode.window.showQuickPick(
                labelFiles.map(labelFile => ({
                    label: labelFile.fsPath,
                    description: 'Select a custom label file to create the new label',
                    uri: labelFile
                })),
                {
                    placeHolder: 'Select a custom label file to create the new label'
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
            vscode.window.showErrorMessage('No label file selected. Aborting label creation.');
            return;
        }

        // Read the label file content and then append the new label.
        const labelFileContent = await vscode.workspace.fs.readFile(labelFileUri);

        const labelFileString = new TextDecoder('utf-8').decode(labelFileContent);
        const labelFileStringWithNewLabel = labelFileString.replace(
            /<\/labels>/,
            `</labels>\n    <labels>\n        <fullName>${newLabel.fullName}</fullName>\n        <categories>${newLabel.categories}</categories>\n        <language>${newLabel.language}</language>\n        <protected>${newLabel.protected}</protected>\n        <shortDescription>${newLabel.fullName}</shortDescription>\n        <value>${newLabel.value}</value>\n    </labels>`
        );

        // Write the updated content back to the label file
        await vscode.workspace.fs.writeFile(labelFileUri, Buffer.from(labelFileStringWithNewLabel, 'utf-8'));
        vscode.window.showInformationMessage(`Label ${newLabel.fullName} created successfully in ${labelFileUri.fsPath}`);

        // Refresh the label files
        salesforceLabels[newLabel.fullName.toString()] = newLabel;
    });

    context.subscriptions.push(createLabelCommand);
}