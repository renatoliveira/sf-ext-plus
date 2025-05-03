// monitors the app version at sfdx-project.json file and updates the package.json version
import * as vscode from 'vscode';

import { checkIfWorkspaceIsValidSfdxProject, clearAndHideStatusBarText, setStatusBarText } from '../shared/utilities';

const THREE_SECONDS = 3000;

export async function activate() {
    if (!checkIfWorkspaceIsValidSfdxProject()) {
        return;
    }

    activateFileWatcher();
}

function activateFileWatcher() {
    vscode.workspace.createFileSystemWatcher('**/sfdx-project.json', false, false, false).onDidChange(async (uri) => {
        const packageJsonUri = vscode.Uri.joinPath(uri, '..', 'package.json');
        const packageJson = await vscode.workspace.fs.readFile(packageJsonUri);
        const packageJsonObj = JSON.parse(packageJson.toString());

        // read the settings from the package.json file
        const settings = packageJsonObj.salesforce;

        // if no settings are defined, do nothing
        if (!settings) {
            return;
        }

        setStatusBarText('Updating package.json version...');

        const sfdxProject = await vscode.workspace.fs.readFile(uri);
        const sfdxProjectJson = JSON.parse(sfdxProject.toString());

        // get the package directory that has the "default" property set to true
        const defaultPackageDirectory = sfdxProjectJson.packageDirectories.find((dir: any) => dir.default);

        if (!defaultPackageDirectory) {
            vscode.window.showErrorMessage('No default package directory found in sfdx-project.json');

            return;
        }

        // if the "salesforce.copyProjectNameToPackageJson" setting is set to true
        // it copies the "package" attribute from the package directory to the package.json
        // file's name
        if (settings && settings.copyProjectNameToPackageJson) {
            if (packageJsonObj.name !== sfdxProjectJson.name) {
                // set the name to the package directory's name
                packageJsonObj.name = sfdxProjectJson.name;
            }
        }

        // if the "salesforce.copyProjectDescriptionToPackageJson" setting is set to true
        // it copies the "description" attribute from the default package directory to the
        // package.json file's description
        if (settings && settings.copyProjectDescriptionToPackageJson) {
            if (packageJsonObj.description !== defaultPackageDirectory.versionDescription) {
                // set the description to the package directory's description
                packageJsonObj.description = defaultPackageDirectory.versionDescription;
            }
        }

        if (settings && settings.copyVersionToPackageJson) {
            // check if the version is already set to the same value
            if (packageJsonObj.version !== defaultPackageDirectory.versionNumber) {
                // SFDX version number format is typically major.minor.patch.build
                // Parse the version number to extract only major.minor.patch
                const versionFromSfdx = defaultPackageDirectory.versionNumber;
                const versionParts = versionFromSfdx.split('.');

                // Take only the first three parts (major.minor.patch)
                if (versionParts.length >= 3) {
                    packageJsonObj.version = versionParts.slice(0, 3).join('.');
                } else {
                    vscode.window.showErrorMessage(`Invalid version number format in sfdx-project.json: ${defaultPackageDirectory.versionNumber}`);

                    return;
                }
            }
        }

        // Update the package.json file with the new version
        await vscode.workspace.fs.writeFile(
            packageJsonUri,
            Buffer.from(JSON.stringify(packageJsonObj, null, 2))
        );

        const msgId = setStatusBarText('Updated package.json version');

        setTimeout(() => {
            clearAndHideStatusBarText(msgId);
        }, THREE_SECONDS);
    });
}