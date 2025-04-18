import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/load';

export function activate(context: vscode.ExtensionContext) {
    // Run activation of each command
    activateLabelsAutoComplete(context);
}
