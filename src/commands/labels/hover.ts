import * as vscode from 'vscode';
import { getSalesforceLabelsStore } from './load';

export async function getProvider() {
    // Register a hover provider for showing label information in Apex files
    const labelHoverProvider = vscode.languages.registerHoverProvider(
        [
            { scheme: 'file', pattern: '**/*.cls' },
            { scheme: 'file', language: 'apex' }
        ],
        {
            provideHover(document, position) {
                const wordRange = document.getWordRangeAtPosition(position, /(?:label|system\.label)\.(\w+)/gi);

                if (!wordRange) {
                    return undefined;
                }

                const text = document.getText(wordRange);
                const labelName = text.replaceAll(/(?:label|system\.label)\./gi, '');
                const label = getSalesforceLabelsStore().salesforceLabels[labelName];

                if (!label) {
                    return undefined;
                }

                const hoverContent = new vscode.MarkdownString();

                hoverContent.appendMarkdown(`**Label Name:** ${labelName}\n\n`);
                hoverContent.appendMarkdown(`**Value:** ${label.value}\n\n`);

                if (label.categories) {
                    hoverContent.appendMarkdown(`**Category:** ${label.categories}\n\n`);
                }

                if (label.shortDescription) {
                    hoverContent.appendMarkdown(`**Short Description:** ${label.shortDescription || 'N/A'}\n\n`);
                }

                if (label.protected) {
                    hoverContent.appendMarkdown(`**Protected:** ${label.protected ? 'Yes' : 'No'}\n\n`);
                }

                if (label.language) {
                    hoverContent.appendMarkdown(`**Language:** ${label.language || 'N/A'}\n\n`);
                }

                hoverContent.isTrusted = true;

                return new vscode.Hover(hoverContent, wordRange);
            }
        }
    );

    return labelHoverProvider;
}
