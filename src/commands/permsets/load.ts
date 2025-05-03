// loads the command and loads the permission sets at the target org
import * as vscode from 'vscode';
import labels from '../../labels';
import * as cp from 'child_process';

export async function activate(_context: vscode.ExtensionContext) {
    loadPermissionSets();
}

let salesforceUserId: string | undefined = undefined;

async function loadPermissionSets() {
    // load permission sets from the org using the force cli
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a workspace folder.');
        return;
    }

    await getSalesforceUserId();

    // load the permission sets after getting the user ID
    getAvailablePermissionSets();
}

class PermissionSetQuickPickImpl implements vscode.QuickPickItem {
    label: string;
    description: string;
    value: string;

    constructor(label: string, description: string, value: string) {
        this.label = label;
        this.description = description;
        this.value = value;
    }
}

/**
 * Get the list of available permission sets in the org
 */
async function getAvailablePermissionSets() {
    if (!salesforceUserId) {
        vscode.window.showErrorMessage('User ID not found. Please load the permission sets again.');
        return;
    }

    const command = `sf data query --query "SELECT Id, Label, Name, NamespacePrefix FROM PermissionSet WHERE Id NOT IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '${salesforceUserId}') AND IsOwnedByProfile = FALSE" --json`;
    const queryResult = JSON.parse(await executeShellCommand(command));

    if (queryResult.status !== 0) {
        vscode.window.showErrorMessage(`Failed to get permission sets: ${queryResult.message}`);
        return;
    }

    vscode.window.showInformationMessage(`Read ${queryResult.result.records.length} permission sets from the org that are NOT assigned to you.`);

    // show options on the command palette so the user can select one or more permissions to assign to themselves
    const permissionSetOptions = queryResult.result.records.map((record: { Label: string, NamespacePrefix: string, Name: string }) => {
        const label = record.Label;
        const description = record.NamespacePrefix ? `${record.NamespacePrefix}.${record.Name}` : record.Name;
        const value = record.Name;

        return new PermissionSetQuickPickImpl(label, description, value);
    });

    const selectedItems = await vscode.window.showQuickPick<PermissionSetQuickPickImpl>(permissionSetOptions, {
        placeHolder: 'Select permission sets to assign to your user',
        canPickMany: true
    });

    if (!selectedItems) {
        vscode.window.showInformationMessage('No permission sets selected.');
        return;
    }

    const assignCommand = `sf org assign permset ${selectedItems.map(psItem => { return `--name ${psItem.value}` }).join(',')} --json`;
    const assignCommandResult = JSON.parse(await executeShellCommand(assignCommand));
}

async function getSalesforceUserId() {
    const command = `sf org display user --json`;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Getting user info',
            cancellable: false
        },
        async (progress) => {
            progress.report({ increment: 0, message: 'Getting user ID with the Salesforce CLI...' });
            const result = JSON.parse(await executeShellCommand(command));

            if (result.status !== 0) {
                vscode.window.showErrorMessage(`Failed to get user info: ${result.message}`);
                return;
            }

            salesforceUserId = result.result.id;

            progress.report({ increment: 100, message: `User ID retrieved: ${salesforceUserId}` });
        }
    )

    return salesforceUserId;
}

const executeShellCommand = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
        cp.exec(cmd, (err, out) => {
            if (err) {
                return reject(err);
            }
            return resolve(out);
        });
    });