import * as vscode from 'vscode';
import { activeLabelCategories } from './load';

export async function activate(context: vscode.ExtensionContext) {
    // enables the input box to create a new label
    const createLabelCommand = vscode.commands.registerCommand('sf-ext-plus.createLabel', async () => {
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

        // Create a new label object
        const newLabel = {
            fullName: labelName,
            value: labelValue,
            categories: categories
        };

        console.log(`Creating new label: ${JSON.stringify(newLabel)}...`);

        // aaa
    });

    context.subscriptions.push(createLabelCommand);
}