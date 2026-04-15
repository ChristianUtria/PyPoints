import * as path from 'path';
import * as vscode from 'vscode';
import { Endpoint, ServerConfig } from '../types';
import { buildPreviewHtml } from './Previewhtml';

export function showEndpointPreviewPanel(
  ep: Endpoint,
  context: vscode.ExtensionContext,
  serverConfig?: ServerConfig
): void {
  const panel = vscode.window.createWebviewPanel(
    'endpointPreview',
    `▶ ${ep.functionName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const gifUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'media', 'antena.gif'))
  );
  const gifUri2 = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'media', 'forma.gif'))
  );

panel.webview.html = buildPreviewHtml(
  panel.webview,
  ep,
  serverConfig,
  gifUri,
  gifUri2
);

  panel.webview.onDidReceiveMessage(
    msg => {
      if (msg.command === 'openExternal') {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
    },
    undefined,
    context.subscriptions
  );
}