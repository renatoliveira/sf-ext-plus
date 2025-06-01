import * as vscode from 'vscode';
import { checkIfWorkspaceIsValidSfdxProject } from '../../shared/utilities';

interface SoqlQueryDetail {
    queryText: string;
    range: vscode.Range;
}

function extractSoqlQueries(text: string, languageId: string): SoqlQueryDetail[] {
    console.log(`[extractSoqlQueries] Called for languageId: ${languageId}`);
    const queries: SoqlQueryDetail[] = [];
    let match;

    if (languageId === 'soql') {
        // Regex for .soql files.
        // Tries to match SELECT ... FROM ... [optional clauses]
        // This regex is a best-effort for common SOQL structures.
        const soqlFileRegex = new RegExp(
            '\\bSELECT\\b[\\s\\S]+?\\bFROM\\b[\\s\\S]+?' + // Base SELECT ... FROM ...
            '(?:\\s+\\bWHERE\\b[\\s\\S]+?)?' +            // Optional WHERE clause
            '(?:\\s+\\b(WITH|USING\\sSCOPE)\\b[\\s\\S]+?)?' + // Optional WITH or USING SCOPE
            '(?:\\s+\\bGROUP\\sBY\\b(?:[\\s\\S]+?(\\bHAVING\\b[\\s\\S]+?)?)?)?' + // Optional GROUP BY (which can include HAVING)
            '(?:\\s+\\bORDER\\sBY\\b[\\s\\S]+?)?' +       // Optional ORDER BY clause
            '(?:\\s+\\bLIMIT\\b\\s+\\d+)?' +              // Optional LIMIT clause
            '(?:\\s+\\bOFFSET\\b\\s+\\d+)?' +            // Optional OFFSET clause
            '(?:\\s+\\bFOR\\s+(VIEW|UPDATE|REFERENCE|TRACKING)\\b)?', // Optional FOR clause
            'gi' // Global and case-insensitive
        );
        console.log(`[extractSoqlQueries] Attempting to match SOQL file regex.`);
        while ((match = soqlFileRegex.exec(text)) !== null) {
            const matchedQuery = match[0].trim();
            const startPos = match.index;
            const endPos = match.index + match[0].length;

            // Calculate line and character for start and end
            const textBeforeMatch = text.substring(0, startPos);
            const startLine = (textBeforeMatch.match(/\n/g) || []).length;
            const lastNewlineBeforeMatch = textBeforeMatch.lastIndexOf('\n');
            const startChar = lastNewlineBeforeMatch === -1 ? startPos : startPos - lastNewlineBeforeMatch - 1;

            const textBeforeEnd = text.substring(0, endPos);
            const endLine = (textBeforeEnd.match(/\n/g) || []).length;
            const lastNewlineBeforeEnd = textBeforeEnd.lastIndexOf('\n');
            const endChar = lastNewlineBeforeEnd === -1 ? endPos : endPos - lastNewlineBeforeEnd - 1;

            const range = new vscode.Range(startLine, startChar, endLine, endChar);

            console.log(`[extractSoqlQueries] Matched SOQL query: ${matchedQuery}`);
            queries.push({ queryText: matchedQuery, range });
            console.log(`[extractSoqlQueries] Query range: ${range.start.line}:${range.start.character} to ${range.end.line}:${range.end.character}`);
        }
    } else if (languageId === 'apex') {
        // Regex for Apex: finds SOQL queries enclosed in square brackets [SELECT ...].
        const apexSoqlRegex = /\[\s*(SELECT\s[\s\S]+?FROM\s[\s\S]+?)\s*\]/gi;
        console.log(`[extractSoqlQueries] Attempting to match Apex SOQL regex.`);
        while ((match = apexSoqlRegex.exec(text)) !== null) {
            if (!match[1] && match[1].trim().toUpperCase().startsWith('SELECT')) {
                console.log(`[extractSoqlQueries] Match does not start with 'SELECT', skipping.`);
                continue; // Skip matches that do not start with 'SELECT'
            }

            const matchedQuery = match[0].trim();
            const startPos = match.index;
            const endPos = match.index + match[0].length;

            // Calculate line and character for start and end
            const textBeforeMatch = text.substring(0, startPos);
            const startLine = (textBeforeMatch.match(/\n/g) || []).length;
            const lastNewlineBeforeMatch = textBeforeMatch.lastIndexOf('\n');
            const startChar = lastNewlineBeforeMatch === -1 ? startPos : startPos - lastNewlineBeforeMatch - 1;

            const textBeforeEnd = text.substring(0, endPos);
            const endLine = (textBeforeEnd.match(/\n/g) || []).length;
            const lastNewlineBeforeEnd = textBeforeEnd.lastIndexOf('\n');
            const endChar = lastNewlineBeforeEnd === -1 ? endPos : endPos - lastNewlineBeforeEnd - 1;

            const range = new vscode.Range(startLine, startChar, endLine, endChar);

            console.log(`[extractSoqlQueries] Matched SOQL query: ${matchedQuery}`);
            queries.push({ queryText: matchedQuery, range });
            console.log(`[extractSoqlQueries] Query range: ${range.start.line}:${range.start.character} to ${range.end.line}:${range.end.character}`);
        }
    }

    console.log(`[extractSoqlQueries] Extracted ${queries.length} SOQL queries from ${languageId} content.`);

    if (queries.length > 0) {
        console.log(`[extractSoqlQueries] Queries:`, queries);
    }

    if (vscode.window.activeTextEditor?.document) {
        // Add diagnostic logging to check document details
        console.log(`[extractSoqlQueries] Document path: ${vscode.window.activeTextEditor.document.uri.fsPath}, language ID: ${vscode.window.activeTextEditor.document.languageId}`);
    }

    return queries;
}

/**
 * Prompts the user to select a SOQL query from the current document and
 * optionally runs it in a new window.
 */
async function navigateAndRunSoqlQuery() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const languageId = document.languageId;

    if (languageId !== 'apex' && languageId !== 'soql' && languageId !== 'tex') {
        vscode.window.showInformationMessage('This document does not contain SOQL queries.');
        return;
    }

    const text = document.getText();
    const queries = extractSoqlQueries(text, languageId);

    if (queries.length === 0) {
        vscode.window.showInformationMessage('No SOQL queries found in this document.');
        return;
    }

    // Create QuickPick items for each query
    const quickPickItems = queries.map((query, index) => {
        // Limit preview to first 50 chars to keep the QuickPick menu readable
        const previewText = query.queryText.replace(/\s+/g, ' ').substring(0, 50) +
            (query.queryText.length > 50 ? '...' : '');
        return {
            label: `Query ${index + 1}`,
            description: previewText,
            detail: `Line ${query.range.start.line + 1}, Column ${query.range.start.character + 1}`,
            query: query
        };
    });

    // Show QuickPick to user
    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a SOQL query to navigate to or run',
        canPickMany: false
    });

    if (!selectedItem) {
        return; // User cancelled
    }

    // Navigate to the query
    const range = selectedItem.query.range;
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

    // Ask if they want to run the query
    const runQuery = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Run this query?'
    });

    if (runQuery !== 'Yes') {
        return;
    }

    // Extract dynamic variables from the query
    const dynamicVars = extractDynamicVariables(selectedItem.query.queryText);
    let queryText = selectedItem.query.queryText;

    // If there are dynamic variables, prompt for values
    if (dynamicVars.length > 0) {
        const variableValues: Record<string, string> = {};

        for (const varName of dynamicVars) {
            const value = await vscode.window.showInputBox({
                prompt: `Enter value for variable ${varName}`,
                placeHolder: 'String value or NULL'
            });

            if (value === undefined) {
                return; // User cancelled
            }

            // Handle NULL specially, otherwise treat as string
            if (value.toUpperCase() === 'NULL') {
                variableValues[varName] = 'NULL'; // Use NULL as keyword
            } else if (value.startsWith("'") && value.endsWith("'")) {
                // User already provided quotes, use as-is
                variableValues[varName] = value;
            } else {
                // Wrap in quotes for string values
                variableValues[varName] = `'${value}'`;
            }

            queryText = queryText.replace(new RegExp(`:${varName}\\b`, 'g'), variableValues[varName]);
        }
    }

    // Open a new document with the query
    // Remove brackets if the query is from Apex
    let processedQueryText = queryText.replace(/^\s*\[\s*([\s\S]*?)\s*\]\s*$/, '$1');

    // Handle multi-line queries to ensure consistent formatting but preserve line breaks
    if (processedQueryText.includes('\n')) {
        const lines = processedQueryText.split('\n');

        // Remove leading whitespace from each line
        processedQueryText = lines
            .map(line => line.trimLeft()) // Remove leading whitespace
            .join('\n');             // Keep all line breaks

        // Clean up spacing around punctuation
        processedQueryText = processedQueryText
            .replace(/ ([,)])/g, '$1') // Remove spaces before commas and closing parentheses
            .replace(/\( /g, '(');     // Remove spaces after opening parentheses
    }

    const newDocument = await vscode.workspace.openTextDocument({
        content: processedQueryText,
        language: 'soql'
    });

    await vscode.window.showTextDocument(newDocument, { preview: false });

    vscode.window.showInformationMessage('Query ready to execute.');
}

/**
 * Extracts dynamic variables (prefixed with ':') from the query text.
 */
function extractDynamicVariables(queryText: string): string[] {
    const varRegex = /:([a-zA-Z]\w*)\b/g;
    const vars = new Set<string>();
    let match;

    while ((match = varRegex.exec(queryText)) !== null) {
        vars.add(match[1]);
    }

    return Array.from(vars);
}

// Register command
function registerSoqlNavigationCommand(context: vscode.ExtensionContext) {
    const command = vscode.commands.registerCommand('sf-ext-plus.navigateAndRunSoqlQuery', navigateAndRunSoqlQuery);
    context.subscriptions.push(command);
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('[activate] Extension "soql-preview" is now active.');

    // Check if the workspace is a valid SFDX project.
    // This might be relevant for context or advanced features, but basic query capture can work without it.
    const isSfdxProject = await checkIfWorkspaceIsValidSfdxProject();
    console.log(`[activate] Is valid SFDX project: ${isSfdxProject}`);
    if (!isSfdxProject) {
        vscode.window.showWarningMessage(
            'SFDX project context not found. SOQL query capture will operate on file content only.'
        );
        // Depending on how critical SFDX context is, you might choose to return or limit functionality.
    }

    const processTextDocument = (document: vscode.TextDocument | undefined) => {
        if (!document) {
            console.log('[processTextDocument] Document is undefined, skipping processing.');
            return;
        }
        console.log(`[processTextDocument] Processing document: ${document.fileName}`);

        const languageId = document.languageId;
        console.log(`[processTextDocument] Document languageId: ${languageId}`);
        // Only process 'apex' or 'soql' files.
        if (languageId === 'apex' || languageId === 'soql') {
            const text = document.getText();
            const queries = extractSoqlQueries(text, languageId);

            if (queries.length > 0) {
                // Log found queries. Replace this with your desired logic to "use" the queries.
                console.log(`[processTextDocument] SOQL Queries found in ${document.fileName}:`, queries);

                // Example: You could store them, send them to a Language Server,
                // display them in a custom view, or provide them to other commands.
                // vscode.window.showInformationMessage(`Captured ${queries.length} SOQL query/queries from ${document.fileName}.`);
            } else {
                console.log(`[processTextDocument] No SOQL queries found in ${document.fileName}.`);
            }
        } else {
            console.log(`[processTextDocument] Document languageId '${languageId}' is not 'apex' or 'soql', skipping query extraction.`);
        }
    };

    // Process the initially active editor, if any, when the extension activates.
    if (vscode.window.activeTextEditor) {
        console.log('[activate] Processing initially active editor.');
        processTextDocument(vscode.window.activeTextEditor.document);
    } else {
        console.log('[activate] No active text editor on activation.');
    }

    // Listen for changes in the active text editor (e.g., user switches tabs).
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            console.log('[onDidChangeActiveTextEditor] Event triggered.');
            if (editor) {
                console.log(`[onDidChangeActiveTextEditor] New active editor: ${editor.document.fileName}`);
                processTextDocument(editor.document);
            } else {
                console.log('[onDidChangeActiveTextEditor] No active editor.');
            }
        })
    );

    // Listen for changes in the text content of a document.
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            console.log(`[onDidChangeTextDocument] Event triggered for document: ${event.document.fileName}`);
            // Check if the changed document is currently active and relevant.
            if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === event.document) {
                console.log(`[onDidChangeTextDocument] Changed document is the active editor.`);
                if (event.document.languageId === 'apex' || event.document.languageId === 'soql') {
                    console.log(`[onDidChangeTextDocument] Processing document due to content change.`);
                    processTextDocument(event.document);
                } else {
                    console.log(`[onDidChangeTextDocument] Active document languageId '${event.document.languageId}' is not 'apex' or 'soql', skipping.`);
                }
            } else {
                console.log(`[onDidChangeTextDocument] Changed document is not the active editor or no active editor, skipping processing for this event.`);
            }
        })
    );

    registerSoqlNavigationCommand(context);
}
