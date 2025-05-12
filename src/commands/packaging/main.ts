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
        // { label: 'Create Package', value: 'create' },
        // { label: 'Delete Package', value: 'delete' },
        // { label: 'Update Package', value: 'update' }
        { label: 'Install Package', value: 'install' },
        { label: 'List Packages', value: 'list' },
        { label: 'Uninstall Package', value: 'uninstall' },
    ];

    const selectedPackageCommand = await vscode.window.showQuickPick(packageCommandOptions, {
        placeHolder: 'Select a package command to execute',
        ignoreFocusOut: true
    });

    if (!selectedPackageCommand) {
        return;
    }

    switch (selectedPackageCommand.value) {
        case 'install':
            installPackage();
            break;
        case 'list':
            listPackages();
            break;
        case 'uninstall':
            uninstallPackage();
            break;
        default:
            vscode.window.showErrorMessage('Invalid package command selected.');
            break;
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

interface PackageQuickPickItem extends vscode.QuickPickItem {
    label: string;
    description: string;
    detail: string;
}

async function listPackages() {
    // execute the list command
    const listCommand = `sf package installed list --json`;
    const MINUTES = 1;
    let intervalId: NodeJS.Timeout | undefined;
    let packageList: PackageQuickPickItem[] = [];

    const showListingPackagesProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Listing packages in org...',
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });

        try {
            const startTime = Date.now();
            let previousIncrement = 0;

            // Calculate total wait time in milliseconds (1 minute)
            const totalWaitTimeMs = MINUTES * 60 * 1000;

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

            const listResult = await executeShellCommand(listCommand);
            const listResultJson = JSON.parse(listResult);

            if (listResultJson.status === 0) {
                progress.report({ increment: 100, message: 'Done' });
                intervalId && clearInterval(intervalId);

                vscode.window.showInformationMessage('Packages listed successfully.');

                // show listed packages as quick pick
                packageList = listResultJson.result.map((pkg: any) => ({
                    label: pkg.SubscriberPackageName,
                    description: pkg.SubscriberPackageVersionId,
                    detail: `Version: ${pkg.SubscriberPackageVersionNumber} ${pkg.SubscriberPackageNamespace !== null ? `(${pkg.SubscriberPackageNamespace})` : ''}`
                }));

                const selectedPackage = await vscode.window.showQuickPick(packageList, {
                    placeHolder: 'Select a package to copy its ID',
                    ignoreFocusOut: true
                });

                if (selectedPackage) {
                    // Copy the package ID to the clipboard
                    await vscode.env.clipboard.writeText(selectedPackage.description);

                    // Show a message indicating the package ID has been copied
                    vscode.window.showInformationMessage(`Copied to clipboard the package's Id: ${selectedPackage.label} (${selectedPackage.description})`);
                }
            } else {
                vscode.window.showErrorMessage(`Failed to list packages: ${listResultJson.message}`);
            }
        } catch (error) {
            console.error(error);
            progress.report({ increment: 100, message: 'Done' });
        }
    });

    showListingPackagesProgressNotification.then(() => {
        intervalId && clearInterval(intervalId);
    });
}

async function uninstallPackage() {
    // prompt for the package id
    const packageId = await vscode.window.showInputBox({
        prompt: 'Enter the package ID to uninstall',
        placeHolder: 'Package ID (04t...)',
        ignoreFocusOut: true
    });

    if (!packageId) {
        return;
    }
    let intervalId: NodeJS.Timeout;

    // execute the uninstall command
    const uninstallCommand = `sf package uninstall --package ${packageId} --wait 5 --json`;

    const showUninstallingPackageProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Uninstalling package ${packageId}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });

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

            const uninstallResult = await executeShellCommand(uninstallCommand);
            const uninstallResultJson = JSON.parse(uninstallResult);

            let message = `Package ${packageId} uninstalled successfully.`;

            if (uninstallResultJson.status === 0) {
                vscode.window.showInformationMessage(`Package ${packageId} uninstalled successfully.`);
            } else {
                message = `Failed to uninstall package ${packageId}: ${uninstallResultJson.message}`;
                vscode.window.showErrorMessage(`Failed to uninstall package ${packageId}: ${uninstallResultJson.message}`);
            }

            setTimeout(() => {
                progress.report({ increment: 100 });
            }, 250);
        } catch (error) {
            console.error(error);
            progress.report({ increment: 100, message: 'Done' });
        }
    });

    showUninstallingPackageProgressNotification.then(() => {
        intervalId && clearInterval(intervalId);
    });
}
