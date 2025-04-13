import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/main';

export function activate(context: vscode.ExtensionContext) {
	// Register the command for manual invocation if needed
	const disposable = vscode.commands.registerCommand('sf-ext-plus.loadLabels', () => {
		activateLabelsAutoComplete(context);
	});

	context.subscriptions.push(disposable);

	// Run automatically on activation
	activateLabelsAutoComplete(context);
}
