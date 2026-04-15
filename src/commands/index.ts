import * as vscode from 'vscode';
import * as fs from 'fs';
import { EndpointProvider } from '../providers/Endpointprovider';
import { showEndpointPreviewPanel } from '../webview/Previewpanel';
import { detectServerConfig } from '../server/Serverdetector';
import { exportJson } from '../exporters/Jsonexporter';
import { exportMarkdown } from '../exporters/Markdownexporter';
import { applyEditorDecorations } from '../decorations/Editordecorations';
import { EndpointItem } from '../providers/Endpointitem';
import { Endpoint } from '../types';

export function registerCommands(
  context: vscode.ExtensionContext,
  provider: EndpointProvider
): void {
  const getServerCfg = () =>
    vscode.workspace.workspaceFolders
      ? detectServerConfig(vscode.workspace.workspaceFolders)
      : undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand('endpointCounter.refresh', () => {
      provider.refresh();
      vscode.window.showInformationMessage('Endpoints actualizados ✓');
    }),

    vscode.commands.registerCommand('endpointCounter.scanWorkspace', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Escaneando endpoints...' },
        async () => provider.refresh()
      );
    }),

    vscode.commands.registerCommand('endpointCounter.goToLine', async (ep: Endpoint) => {
      const doc = await vscode.workspace.openTextDocument(ep.filePath);
      const editor = await vscode.window.showTextDocument(doc);
      const range = editor.document.lineAt(Math.max(0, ep.lineStart - 1)).range;
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }),

    vscode.commands.registerCommand('endpointCounter.search', async () => {
      const q = await vscode.window.showInputBox({
        placeHolder: 'Buscar por nombre, ruta, método, archivo...',
        title: 'Buscar Endpoints',
        prompt: 'Deja vacío para limpiar.',
      });
      if (q !== undefined) provider.setSearch(q);
    }),

    vscode.commands.registerCommand('endpointCounter.filterByMethod', async () => {
      const all = provider.getAllEndpoints();
      const mc: Record<string, number> = {};
      for (const e of all) mc[e.method] = (mc[e.method] ?? 0) + 1;
      const items = [
        { label: '$(close) Limpiar filtro', description: 'Mostrar todos', method: null as null },
        ...Object.entries(mc).map(([m, c]) => ({ label: m, description: `${c} endpoints`, method: m })),
      ];
      const p = await vscode.window.showQuickPick(items, { placeHolder: 'Filtrar por método HTTP' });
      if (p) provider.setMethodFilter(p.method);
    }),

    vscode.commands.registerCommand('endpointCounter.showOnlyIssues', () => {
      provider.setShowOnlyIssues(true);
      vscode.window.showInformationMessage('Mostrando solo endpoints con problemas.');
    }),

    vscode.commands.registerCommand('endpointCounter.clearFilters', () => {
      provider.setSearch('');
      provider.setMethodFilter(null);
      provider.setShowOnlyIssues(false);
    }),

    vscode.commands.registerCommand('endpointCounter.copyRoute', async (item: EndpointItem) => {
      if (!item.endpoint) return;
      const ep = item.endpoint;
      await vscode.env.clipboard.writeText(ep.route);
      const actions = ['▶ Test', 'Ver código', 'Ir al archivo'];
      const action = await vscode.window.showInformationMessage(
        `✓ Ruta copiada: ${ep.route}`,
        ...actions
      );
      if (action === '▶ Test' || action === 'Ver código') {
        showEndpointPreviewPanel(ep, context, getServerCfg());
      } else if (action === 'Ir al archivo') {
        vscode.commands.executeCommand('endpointCounter.goToLine', ep);
      }
    }),

    vscode.commands.registerCommand('endpointCounter.peekCode', (item: EndpointItem) => {
      if (item.endpoint) showEndpointPreviewPanel(item.endpoint, context, getServerCfg());
    }),

    vscode.commands.registerCommand('endpointCounter.runGetTest', (item: EndpointItem) => {
      if (item.endpoint) showEndpointPreviewPanel(item.endpoint, context, getServerCfg());
    }),

    vscode.commands.registerCommand('endpointCounter.copyCurl', async (item: EndpointItem) => {
      if (!item.endpoint) return;
      const ep = item.endpoint;
      let curl = `curl -X ${ep.method} "${(getServerCfg()?.baseUrl ?? 'http://localhost:5000') + ep.route}"`;
      if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
        curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`;
      }
      await vscode.env.clipboard.writeText(curl);
      vscode.window.showInformationMessage(`cURL copiado para ${ep.functionName}`);
    }),

    vscode.commands.registerCommand('endpointCounter.exportJson', () =>
      exportJson(provider.getAllEndpoints())
    ),

    vscode.commands.registerCommand('endpointCounter.exportMarkdown', () =>
      exportMarkdown(provider.getAllEndpoints())
    ),

    vscode.commands.registerCommand('endpointCounter.groupByCategory', () =>
      provider.setGroupBy('category')
    ),

    vscode.commands.registerCommand('endpointCounter.groupByFile', () =>
      provider.setGroupBy('file')
    ),

    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.languageId === 'python') provider.refresh();
    }),

    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.languageId === 'python') {
        applyEditorDecorations(editor, provider.getAllEndpoints());
      }
    })
  );
}