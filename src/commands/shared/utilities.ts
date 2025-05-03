import * as vscode from 'vscode';

export async function checkIfWorkspaceIsValidSfdxProject() {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        return false;
    }

    // check if sfdx-project.json exists at the root
    const sfdxProjectFile = vscode.Uri.file(`${workspaceFolders[0].uri.fsPath}/sfdx-project.json`);
    const sfdxProjectFileExists = await Promise.resolve(vscode.workspace.fs.stat(sfdxProjectFile)).then(() => true).catch(() => false);

    return sfdxProjectFileExists;
}