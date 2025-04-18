import * as vscode from 'vscode';
import { salesforceLabels } from './load';

export async function getProvider() {
    // Register a completion provider for Apex files (.cls)
    const labelCompletionProvider = vscode.languages.registerCompletionItemProvider(
        [
            { scheme: 'file', pattern: '**/*.cls' },
            { scheme: 'file', language: 'apex' }
        ],
        {
            provideCompletionItems(document, position) {
                const linePrefix = document.lineAt(position).text.slice(0, position.character);

                // Trigger completion after 'Label.' prefix
                if (typeof linePrefix !== 'string' || !linePrefix.toLowerCase().endsWith('label.')) {
                    return undefined;
                }

                const completionItems: vscode.CompletionItem[] = [];

                for (const labelName in salesforceLabels) {
                    try {
                        const label = salesforceLabels[labelName];
                        const item = new vscode.CompletionItem(labelName, vscode.CompletionItemKind.Variable);

                        // Show label value in detail
                        item.detail = label.value[0];

                        // Include description if available
                        if (label.shortDescription && label.shortDescription[0]) {
                            item.documentation = new vscode.MarkdownString(label.shortDescription[0]);
                        }

                        completionItems.push(item);
                    } catch (error) {
                        console.error(`Error processing label ${labelName}:`, error);
                        break;
                    }
                }

                return completionItems;
            }
        },
        '.' // Add the trigger character to automatically show completions after typing '.'
    );

    return labelCompletionProvider;
}