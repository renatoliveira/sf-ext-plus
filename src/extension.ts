import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/load';
import { activateLabelCreateOnPalette, activateLabelCreateOnCodeAction } from './commands/labels/create';

export function activate(context: vscode.ExtensionContext) {
    activateLabelsAutoComplete(context);
    activateLabelCreateOnPalette(context);
    activateLabelCreateOnCodeAction(context);
}
