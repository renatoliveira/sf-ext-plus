import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/load';
import { activateLabelCreateOnPalette } from './commands/labels/create';

export function activate(context: vscode.ExtensionContext) {
    activateLabelsAutoComplete(context);
    activateLabelCreateOnPalette(context);
}
