import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('La extensión "contador-endpoints-python" está activa');

    const disposable = vscode.commands.registerCommand('contador-endpoints-python.contarEndpoints', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Abre un archivo Python para contar los endpoints.');
            return;
        }

        const lines = editor.document.getText().split(/\r?\n/);

        type Endpoint = {
            category: string;
            functionName: string;
            method: string;
            lineStart: number;
            lineEnd: number;
            lineCount: number;
        };

        const endpoints: Endpoint[] = [];
        let currentComment = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#')) {
                currentComment = line.substring(1).trim();
            }

            // Detectar @app.route
            const routeMatch = line.match(/@app\.route\(["'](.+?)["'](, *methods *= *\[(.*?)\])?\)/i);
            if (routeMatch) {
                const methodsRaw = routeMatch[3];
                const methods = methodsRaw ? methodsRaw.replace(/["'\s]/g, '').split(',') : ['GET'];

                let funcLine = -1;
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim().startsWith('def ')) {
                        funcLine = j;
                        break;
                    }
                }

                if (funcLine === -1) continue;

                const funcMatch = lines[funcLine].trim().match(/^def (\w+)/);
                if (!funcMatch) continue;

                // Contar líneas hasta el último return dentro de la función
				// aunque creo que no funcionaria correctamente, por ahora se dejara asi
                let indentMatch = lines[funcLine].match(/^(\s*)/);
                let indent = indentMatch ? indentMatch[1].length : 0;

                let lastReturnLine = funcLine;
                for (let k = funcLine + 1; k < lines.length; k++) {
                    const currentIndent = lines[k].match(/^(\s*)/)?.[1].length || 0;
                    if (currentIndent <= indent) break; 
                    if (lines[k].trim().startsWith('return')) lastReturnLine = k;
                }

                const lineStart = funcLine + 1;
                const lineEnd = lastReturnLine + 1;
                const lineCount = lineEnd - lineStart + 1;

                endpoints.push({
                    category: currentComment || 'Sin nombre',
                    functionName: funcMatch[1],
                    method: methods.join('/').toUpperCase(),
                    lineStart,
                    lineEnd,
                    lineCount
                });
            }
        }

        const categories = Array.from(new Set(endpoints.map(ep => ep.category)));

        const panel = vscode.window.createWebviewPanel(
            'contadorEndpoints',
            'Contador de Endpoints',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
		// por ahora un html, quiero ponerlo en la barra lateral derecha, para mejora accesibilidad
        let html = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; padding: 10px; }
                    h2 { color: #007acc; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #007acc; color: white; }
                </style>
            </head>
            <body>
                <h1>Resumen de Endpoints</h1>
        `;

        categories.forEach(cat => {
            html += `<h2>${cat}</h2>`;
            html += `<table>
                        <tr>
                            <th>Función</th>
                            <th>Método</th>
                            <th>Línea Inicio</th>
                            <th>Línea Fin</th>
                            <th>Total Líneas</th>
                        </tr>`;
            endpoints.filter(ep => ep.category === cat).forEach(ep => {
                html += `<tr>
                            <td>${ep.functionName}</td>
                            <td>${ep.method}</td>
                            <td>${ep.lineStart}</td>
                            <td>${ep.lineEnd}</td>
                            <td>${ep.lineCount}</td>
                        </tr>`;
            });
            html += `</table>`;
        });

        html += `</body></html>`;
        panel.webview.html = html;
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
