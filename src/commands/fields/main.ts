import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext) {
    const createFieldCommand = vscode.commands.registerCommand('sf-ext-plus.createField', async () => {
        const fieldName = await vscode.window.showInputBox({
            prompt: 'Enter the field\'s API name',
            placeHolder: 'Field Name',
            validateInput: (value) => {
                if (!value) {
                    return 'Field name cannot be empty';
                }
                return null;
            }
        });

        const fieldLabel = await vscode.window.showInputBox({
            prompt: 'Enter the field\'s label',
            placeHolder: 'Field Label',
            validateInput: (value) => {
                if (!value) {
                    return 'Field label cannot be empty';
                }
                return null;
            }
        });

        const fieldType = await vscode.window.showQuickPick(
            [
                'Address',
                'Auto Number',
                'Checkbox',
                'Currency',
                'Date',
                'DateTime',
                'Email',
                'Encrypted Text',
                'Formula',
                'Geolocation',
                'Long Text Area',
                'Lookup',
                'Master-Detail',
                'Multi-Select Picklist',
                'Number',
                'Percent',
                'Phone',
                'Picklist',
                'Rich Text Area',
                'Roll-Up Summary',
                'Text Area',
                'Text',
                'Time',
                'URL',
            ].map((type) => ({ label: type })),
            {
                placeHolder: 'Select the field type',
            }
        );

        const targetObject = await vscode.window.showQuickPick([
            'Account', // TODO: this should by dynamic based on the workspace
        ], {
            placeHolder: 'Select the target SObject'
        });

        if (!targetObject) {
            vscode.window.showErrorMessage('Target object is required');
            return;
        }

        console.log(`Will create the field ${fieldName} of type ${fieldType} with label ${fieldLabel} on the object ${targetObject}`);
    }
    );

    console.log(`Registering command sf-ext-plus.createField...`);
    context.subscriptions.push(createFieldCommand);
}