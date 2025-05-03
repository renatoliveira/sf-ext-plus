import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/load';
import { activateLabelCreateOnPalette } from './commands/labels/create';
import { activate as activatePermissionSetCommands } from './commands/permsets/load';

export function activate(context: vscode.ExtensionContext) {
    // #region labels

    activateLabelsAutoComplete(context);
    activateLabelCreateOnPalette(context);

    // #endregion

    // #region permission sets

    activatePermissionSetCommands(context);

    // #endregion
}
