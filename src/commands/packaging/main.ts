// loads the command and loads the permission sets at the target org
import * as vscode from 'vscode';
import labels from '../../labels';
import { checkIfWorkspaceIsValidSfdxProject, executeShellCommand } from '../shared/utilities';

const COMMAND_NAME = 'packaging';

export async function activate(context: vscode.ExtensionContext) {
    const commands = await vscode.commands.getCommands(true);

    if (!checkIfWorkspaceIsValidSfdxProject()) {
        vscode.window.showErrorMessage('This command can only be run in a Salesforce DX project. Please open a valid Salesforce DX project.');
        return;
    }

    if (commands.includes(`${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`)) {
        return;
    }

    vscode.commands.registerCommand(`${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`, () => loadPackageCommand(context));
}

async function loadPackageCommand(_context: vscode.ExtensionContext) {
    // load package commands from the org using the force cli
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a workspace folder.');
        return;
    }

    // show options for package commands
    const packageCommandOptions = [
        { label: 'Create Package', value: 'create' },
        { label: 'Delete Package', value: 'delete' },
        { label: 'Install Package', value: 'install' },
        { label: 'List Packages', value: 'list' },
        { label: 'Uninstall Package', value: 'uninstall' },
        { label: 'Update Package', value: 'update' }
    ];

    const selectedPackageCommand = await vscode.window.showQuickPick(packageCommandOptions, {
        placeHolder: 'Select a package command to execute',
        ignoreFocusOut: true
    });

    if (!selectedPackageCommand) {
        return;
    }

    if (selectedPackageCommand.value === 'install') {
        installPackage();
    }
}

async function installPackage() {
    // prompt for the package id
    const packageId = await vscode.window.showInputBox({
        prompt: 'Enter the package ID to install',
        placeHolder: 'Package ID (04t...)',
        ignoreFocusOut: true
    });

    if (!packageId) {
        return;
    }

    let compileAllOption = await vscode.window.showQuickPick([
        { label: 'Package only', value: 'package' },
        { label: 'Everything', value: 'all' }
    ], {
        placeHolder: 'Compile everything in the org, or just the package content?',
        ignoreFocusOut: true
    });

    if (!compileAllOption) {
        return;
    }

    let securityTypeOption = await vscode.window.showQuickPick([
        { label: 'Admin Only', value: 'AdminsOnly' },
        { label: 'All Users', value: 'AllUsers' }
    ], {
        placeHolder: 'Select the security type for the package',
        ignoreFocusOut: true
    });

    if (!securityTypeOption) {
        return;
    }

    // DeprecateOnly|Mixed|Delete
    let upgradeType = await vscode.window.showQuickPick([
        { label: 'Mixed', value: 'Mixed' },
        { label: 'Deprecate Only', value: 'DeprecateOnly' },
        { label: 'Delete', value: 'Delete' }
    ], {
        placeHolder: 'Select the upgrade type for the package',
        ignoreFocusOut: true
    });

    if (!upgradeType) {
        return;
    }

    // execute the install command
    const installCommand = `sf package install --package ${packageId} --apex-compile="${compileAllOption.value}" --security-type="${securityTypeOption.value}" --upgrade-type="${upgradeType.value}" --wait 5 --no-prompt --json`;

    const showInstallingPackageProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing package ${packageId}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });
        let intervalId;

        try {
            const startTime = Date.now();
            let previousIncrement = 0;

            // Calculate total wait time in milliseconds (5 minutes)
            const totalWaitTimeMs = 5 * 60 * 1000;

            intervalId = setInterval(() => {
                // Calculate the current progress percentage (0-95) based on the 5-minute wait time
                const elapsedTime = Date.now() - startTime;
                const currentProgress = Math.min(Math.floor((elapsedTime / totalWaitTimeMs) * 95), 95);

                // Calculate the increment since last update
                const incrementDelta = currentProgress - previousIncrement;

                if (incrementDelta > 0) {
                    previousIncrement = currentProgress;
                    progress.report({ increment: incrementDelta });
                }
            }, 1000);

            const installResult = await executeShellCommand(installCommand);
            const installResultJson = JSON.parse(installResult);

            let message = `Package ${packageId} installed successfully.`;

            if (installResultJson.status === 0) {
                vscode.window.showInformationMessage(`Package ${packageId} installed successfully.`);
            } else {
                message = `Failed to install package ${packageId}: ${installResultJson.message}`;
                vscode.window.showErrorMessage(`Failed to install package ${packageId}: ${installResultJson.message}`);
            }

            setTimeout(() => {
                progress.report({ increment: 100 });
            }, 250);
        } catch (error) {
            console.error(error);
            progress.report({ increment: 100, message: 'Done' });
        } finally {
            intervalId && clearInterval(intervalId);
        }
    });
}

/* this is what the command looks like
Commands to develop and install unlocked packages and managed 2GP packages.

USAGE
  $ sf package COMMAND

TOPICS
  package install    Command to report on installed packages.
  package installed  Command to list installed packages.
  package uninstall  Command to report on uninstalled packages.
  package version    Commands to manage package versions.

COMMANDS
  package create     Create a package.
  package delete     Delete a package.
  package install    Install a version of a package in the target org.
  package list       List all packages in the Dev Hub org.
  package uninstall  Uninstall a second-generation package from the target org.
  package update     Update package details.


*/