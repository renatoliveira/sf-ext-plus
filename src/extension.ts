import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/main';
import { activate as activateFieldCommands } from './commands/fields/main';

export function activate(context: vscode.ExtensionContext) {
    // Run activation of each command
    activateFieldCommands(context);
    activateLabelsAutoComplete(context);
}
