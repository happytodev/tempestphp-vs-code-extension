import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Register the command associated with the context menu
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "tempest.scheduleFunction",
      async (editor: vscode.TextEditor) => {
        // Get the document and cursor position
        const document = editor.document;
        const position = editor.selection.active;

        // Get the document symbols (functions, classes, etc.)
        const symbols = await vscode.commands.executeCommand<
          vscode.DocumentSymbol[]
        >("vscode.executeDocumentSymbolProvider", document.uri);

        // Find the enclosing function
        const functionSymbol = findEnclosingFunction(symbols, position);
        if (!functionSymbol) {
          vscode.window.showErrorMessage(
            "No function found at the current position."
          );
          return;
        }

        // List of possible frequencies
        const frequencies = [
          "DAY",
          "HALF_DAY",
          "HALF_HOUR",
          "HOUR",
          "MINUTE",
          "MONTH",
          "QUARTER",
          "WEEK",
          "YEAR",
        ];

        // Show a quick pick menu to choose the frequency
        const frequency = await vscode.window.showQuickPick(frequencies, {
          placeHolder: "Select the scheduling frequency",
        });
        if (!frequency) return; // User cancelled

        // Determine the line where the function declaration starts
        const startLine = functionSymbol.range.start.line;

        // Find the position to insert the attribute (after comments, before attributes or function declaration)
        const { insertLine, replaceLine } = findInsertionPoint(
          document,
          startLine
        );

        // Get the indentation of the function declaration line
        const declarationLine = document.lineAt(startLine);
        const whitespace = declarationLine.text.substring(
          0,
          declarationLine.firstNonWhitespaceCharacterIndex
        );

        // Build the attribute line with the chosen frequency
        const attributeLine = `${whitespace}#[Schedule(Every::${frequency})]`;

        // Insert or replace the attribute
        editor.edit((editBuilder) => {
          if (replaceLine !== -1) {
            const existingAttributeRange = document.lineAt(replaceLine).range;
            // Replacement without additional blank line
            editBuilder.replace(existingAttributeRange, attributeLine);
          } else {
            // Insert with line break
            editBuilder.insert(
              new vscode.Position(insertLine, 0),
              attributeLine + "\n"
            );
          }
        });
      }
    )
  );
}

function findEnclosingFunction(
  symbols: vscode.DocumentSymbol[],
  position: vscode.Position
): vscode.DocumentSymbol | undefined {
  let deepestFunction: vscode.DocumentSymbol | undefined;

  for (const symbol of symbols) {
    if (symbol.range.contains(position)) {
      if (
        symbol.kind === vscode.SymbolKind.Function ||
        symbol.kind === vscode.SymbolKind.Method
      ) {
        deepestFunction = symbol;
      }
      if (symbol.children) {
        const childResult = findEnclosingFunction(symbol.children, position);
        if (childResult) {
          deepestFunction = childResult;
        }
      }
    }
  }

  return deepestFunction;
}

function findInsertionPoint(
  document: vscode.TextDocument,
  startLine: number
): { insertLine: number; replaceLine: number } {
  let insertLine = startLine;
  let replaceLine = -1;
  let inCommentBlock = false;
  let commentEndLine = -1;


  // Run lines backwards from startLine - 1
  for (let line = startLine - 1; line >= 0; line++) {
    const currentLine = document.lineAt(line).text.trim();

    // If you are in a comment block
    if (inCommentBlock) {
      // Stay in the block until the end is detected
      if (currentLine.endsWith("*/")) {
        inCommentBlock = false;
        commentEndLine = line;
        // Exit the block and continue to manage the above
      }
      // Ignore all other lines in the comment block
      continue;
    }

    // Detection of the start of a comment block
    if (currentLine.startsWith("/**") || currentLine.startsWith("/*")) {
      inCommentBlock = true;
      continue;
    }

    // Detection of an attribute outside a comment block
    if (currentLine.startsWith("#[")) {
      if (currentLine.includes("Schedule(")) {
        replaceLine = line;
      }
      // Continue to find the first attribute or declaration
      continue;
    }

    // Empty line outside a comment block
    if (currentLine === "") {
      continue;
    }

    // Line which is neither an attribute nor a comment nor empty
    insertLine = line - 1; 
    break;
  }

  // If a comment block has been found, insert it after the end of the block
  if (commentEndLine !== -1) {
    insertLine = commentEndLine + 1;
  }

  return { insertLine, replaceLine };
}

export function deactivate() {}
