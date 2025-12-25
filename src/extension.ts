import * as vscode from 'vscode';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('La extensión "contador-endpoints-python" está activa');

    const disposable = vscode.commands.registerCommand('contador-endpoints-python.contarEndpoints', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Abre un archivo Python para contar los endpoints.');
            return;
        }

        const text = editor.document.getText();

        // Buscar endpoints en Flask
        const flaskMatches = text.match(/@app\.route\([^\)]*\)/g) || [];
        // Buscar endpoints en FastAPI
        const fastApiMatches = text.match(/@(get|post|put|delete|patch)\([^\)]*\)/gi) || [];

        const total = flaskMatches.length + fastApiMatches.length;

        vscode.window.showInformationMessage(`Se encontraron ${total} endpoints: Flask(${flaskMatches.length}), FastAPI(${fastApiMatches.length})`);
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
