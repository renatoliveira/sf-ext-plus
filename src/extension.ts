import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/load';
import { activate as activateLabelCreationCommand } from './commands/labels/create';

export function activate(context: vscode.ExtensionContext) {
    activateLabelsAutoComplete(context);
    activateLabelCreationCommand(context);
}
