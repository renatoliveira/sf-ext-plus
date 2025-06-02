import * as vscode from 'vscode';
import { checkIfWorkspaceIsValidSfdxProject, clearAndHideStatusBarText, executeShellCommand, setStatusBarText } from '../shared/utilities';
import { OrgUser, QueryResult, UserLogin } from '../shared/types';
import labels from '../../labels';

const COMMAND_NAME = 'userManagement';

const enum UserAction {
    ActivateUsers = 'Activate Users',
    DeactivateUsers = 'Deactivate Users',
    UnfreezeUsers = 'Unfreeze Users',
    FreezeUsers = 'Freeze Users'
}

export async function activate(_context: vscode.ExtensionContext) {
    const commands = await vscode.commands.getCommands(true);
    const commandFullName = `${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`;

    if (commands.includes(commandFullName)) {
        return;
    }

    vscode.commands.registerCommand(commandFullName, listUsersInTargetOrg);
}

async function listUsersInTargetOrg() {
    const isWorkspace = await checkIfWorkspaceIsValidSfdxProject();

    if (!isWorkspace) {
        return;
    }

    // ask if they want to disable or enable users
    const action = await vscode.window.showQuickPick([
        UserAction.ActivateUsers,
        UserAction.UnfreezeUsers,
        UserAction.DeactivateUsers,
        UserAction.FreezeUsers
    ], {
        placeHolder: 'What do you want to do?'
    });

    if (!action) {
        return; // User cancelled the action
    }

    if (action === 'Freeze Users' || action === 'Unfreeze Users') {
        handleFreeze(action);
    } else {
        handleActivation(action);
    }
}

async function handleActivation(action: string) {
    const msgId = setStatusBarText('Querying users in target org...');
    const command = `sf data query -q "SELECT Id, Username, Name, IsActive FROM User" --json`;
    const shellResult = await executeShellCommand(command);

    clearAndHideStatusBarText(msgId);

    const cmdResult: QueryResult<OrgUser> = JSON.parse(shellResult) as QueryResult<OrgUser>;
    const allUsers: OrgUser[] = cmdResult?.result?.records;

    if (action === UserAction.ActivateUsers) {
        const disabledUsers = allUsers.filter(user => !user.IsActive);
        vscode.window.showInformationMessage(`Found ${disabledUsers.length} users in the target org.`);
    } else {
        const activeUsers = allUsers.filter(user => user.IsActive);
        vscode.window.showInformationMessage(`Found ${activeUsers.length} users in the target org.`);
    }

    // Execute the command for each user individually
    let successCount = 0;
    let failCount = 0;
    let users: OrgUser[] = allUsers.filter(user => (action === UserAction.DeactivateUsers ? user.IsActive : !user.IsActive));

    // build a quick pick of users
    const userQuickPickItems: vscode.QuickPickItem[] = users.map(user => ({
        label: user.Username,
        description: user.Name,
        detail: user.Id
    }));

    const selectedUsers = await vscode.window.showQuickPick<any>(userQuickPickItems, {
        placeHolder: 'Select a user',
        canPickMany: true
    });

    if (!selectedUsers || selectedUsers.length === 0) {
        vscode.window.showInformationMessage('No users selected.');
        return;
    }

    // For enable/disable, update all User records in parallel
    const updatePromises = selectedUsers.map(async user => {
        const userId = user.detail;
        const isActive = action === UserAction.ActivateUsers ? 'true' : 'false';
        const commandToExecute = `sf data update record --sobject User --where "Id='${userId}'" --values "IsActive=${isActive}"`;

        try {
            await executeShellCommand(commandToExecute);
            successCount++;
        } catch (error) {
            failCount++;
            console.error(`Failed to update user ${user.label}: ${error}`);
        }
    });

    vscode.window.showInformationMessage(`Updating ${selectedUsers.length} user${selectedUsers.length > 0 ? 's' : ''}...`);

    await Promise.all(updatePromises);

    if (failCount > 0) {
        vscode.window.showWarningMessage(`Some updates failed: ${failCount} errors encountered.`);
    }

    vscode.window.showInformationMessage(`${action} completed: ${successCount} succeeded, ${failCount} failed.`);
}

async function handleFreeze(action: string) {
    // freezing only happens on active users
    const msgId = setStatusBarText('Querying active users in target org...');
    const command = `sf data query -q "SELECT Id, Username, Name, IsActive FROM User WHERE IsActive = TRUE" --json`;
    const shellResult = await executeShellCommand(command);

    clearAndHideStatusBarText(msgId);

    const cmdResult: QueryResult<OrgUser> = JSON.parse(shellResult) as QueryResult<OrgUser>;
    const allActiveUsers: OrgUser[] = cmdResult?.result?.records;

    vscode.window.showInformationMessage(`Found ${allActiveUsers.length} active users in the target org.`);

    // Execute the command for each user individually
    let successCount = 0;
    let failCount = 0;
    let users: OrgUser[] = allActiveUsers.filter(user => (action === UserAction.UnfreezeUsers ? user.IsFrozen : !user.IsFrozen));

    // build a quick pick of users
    const userQuickPickItems: vscode.QuickPickItem[] = users.map(user => ({
        label: user.Username,
        description: user.Name,
        detail: user.Id
    }));

    const selectedUsers = await vscode.window.showQuickPick<any>(userQuickPickItems, {
        placeHolder: 'Select a user',
        canPickMany: true
    });

    if (!selectedUsers || selectedUsers.length === 0) {
        vscode.window.showInformationMessage('No users selected.');
        return;
    }

    // For freeze/unfreeze, we need to work with UserLogin records
    const userIdList = selectedUsers.map(user => `'${user.Id}'`).join(',');

    if (userIdList === '') {
        vscode.window.showInformationMessage('No valid users selected.');
        return;
    }

    // Query the UserLogin records for the selected users
    const queryCommand = `sf data query -q "SELECT Id, UserId FROM UserLogin WHERE UserId IN (${userIdList})" --json`;

    try {
        const shellResult = await executeShellCommand(queryCommand);
        const queryResult: QueryResult<UserLogin> = JSON.parse(shellResult) as QueryResult<UserLogin>;

        if (!queryResult.done || queryResult.status !== 0) {
            vscode.window.showErrorMessage('Failed to retrieve UserLogin records.');
            return;
        }

        const userLogins = queryResult.result.records;

        if (userLogins.length === 0) {
            vscode.window.showInformationMessage('No UserLogin records found for the selected users.');
            return;
        }

        // Set the IsFrozen value based on the action
        const isFrozen = action === UserAction.FreezeUsers ? 'true' : 'false';

        // Update all UserLogin records in parallel
        const updatePromises = userLogins.map(async (login: UserLogin) => {
            const updateCommand = `sf data update record --sobject UserLogin --where "Id='${login.Id}'" --values "IsFrozen=${isFrozen}"`;
            try {
                await executeShellCommand(updateCommand);
                successCount++;
            } catch (error) {
                failCount++;
                console.error(`Failed to update UserLogin ${login.Id}: ${error}`);
            }
        });

        vscode.window.showInformationMessage(`Updating ${selectedUsers.length} user${selectedUsers.length > 0 ? 's' : ''}...`);

        await Promise.all(updatePromises);

        if (failCount > 0) {
            vscode.window.showWarningMessage(`Some updates failed: ${failCount} errors encountered.`);
        }

        vscode.window.showInformationMessage(`${action} completed: ${successCount} succeeded, ${failCount} failed.`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to query UserLogin records: ${error}`);
        return;
    }
}