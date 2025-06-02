import * as cp from 'child_process';
import * as vscode from 'vscode';

let statusBarIdentifier: vscode.StatusBarItem | undefined = undefined;
let lastMessageId: number = 0;

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

export function setUpStatusBarWidget() {
    if (!statusBarIdentifier) {
        statusBarIdentifier = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    }
}

export function setStatusBarText(text: string) {
    if (statusBarIdentifier) {
        lastMessageId += 1;
        statusBarIdentifier.text = text;
        statusBarIdentifier.show();
    }

    return lastMessageId;
}

export function clearAndHideStatusBarText(messageId?: number | undefined) {
    if ((messageId && lastMessageId) && messageId < lastMessageId) {
        return;
    }

    if (statusBarIdentifier) {
        statusBarIdentifier.text = '';
        statusBarIdentifier.hide();
    }
}

/**
 * Executes a shell command and returns the output.
 * @param cmd Shell command to execute
 * @returns Promise that resolves with the command output
 */
export const executeShellCommand = <T = string>(cmd: string, transform?: (output: string) => T): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        cp.exec(cmd, (err, out) => {
            if (err) {
                return reject(err);
            }
            return resolve(transform ? transform(out) : out as unknown as T);
        });
    });
