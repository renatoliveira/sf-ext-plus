import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/load';
import { activateLabelCreateOnPalette } from './commands/labels/create';
import { activate as activatePermissionSetCommands } from './commands/permsets/main';
import { activate as activeProjectFileWatcher } from './commands/appversion/main';
import { activate as activatePackageCommands } from './commands/packaging/main';
import { activate as activateFieldsCommands } from './commands/fields/main';
import { activate as activateSoqlPreviewCommands } from './commands/soql/preview/main';

export function activate(context: vscode.ExtensionContext) {
    // #region labels

    activateLabelsAutoComplete(context);
    activateLabelCreateOnPalette(context);

    // #endregion

    // #region permission sets

    activatePermissionSetCommands(context);

    // #endregion

    // #region watchers

    activeProjectFileWatcher();

    // #endregion

    // #region package commands

    activatePackageCommands(context);

    // #endregion

    // #region fields commands

    activateFieldsCommands(context);

    // #endregion

    // #region fields commands

    activateSoqlPreviewCommands(context);

    // #endregion
}
