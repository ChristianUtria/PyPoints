import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Endpoint {
  category: string;
  functionName: string;
  method: string;
  route: string;
  lineStart: number;
  lineEnd: number;
  lineCount: number;
  filePath: string;
  fileName: string;
  framework: 'Flask' | 'FastAPI' | 'Django' | 'Unknown';
  sourceCode?: string;   // NEW: snippet of the actual function
  complexity?: 'simple' | 'medium' | 'complex';  // NEW
}

// ─── Complejidad ──────────────────────────────────────────────────────────────

function calcComplexity(lineCount: number): 'simple' | 'medium' | 'complex' {
  if (lineCount <= 10) return 'simple';
  if (lineCount <= 30) return 'medium';
  return 'complex';
}

const COMPLEXITY_ICON: Record<string, string> = {
  simple:  'Ⅰ',
  medium:  'ⅠⅠ',
  complex: 'ⅠⅠⅠ',
};

// ─── Ítem del TreeView ────────────────────────────────────────────────────────

type ItemKind = 'file' | 'category' | 'endpoint' | 'summary';

class EndpointItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly kind: ItemKind,
    public readonly endpoint?: Endpoint,
    public readonly children?: EndpointItem[]
  ) {
    super(label, collapsibleState);

    if (kind === 'endpoint' && endpoint) {
      this.contextValue = 'endpoint';

      const complexityBadge = endpoint.complexity
        ? COMPLEXITY_ICON[endpoint.complexity]
        : '';

      this.description = `${endpoint.method}  •  L${endpoint.lineStart}  ${complexityBadge}`;

      // ── Tooltip enriquecido con preview de código ────────────────────────
      const preview = buildCodePreview(endpoint.sourceCode, 8);
      this.tooltip = new vscode.MarkdownString(
        `### \`${endpoint.functionName}\`\n\n` +
        `| | |\n|---|---|\n` +
        `| **Ruta** | \`${endpoint.route}\` |\n` +
        `| **Método** | \`${endpoint.method}\` |\n` +
        `| **Framework** | ${endpoint.framework} |\n` +
        `| **Líneas** | ${endpoint.lineStart} → ${endpoint.lineEnd} *(${endpoint.lineCount} líneas)* |\n` +
        `| **Complejidad** | ${complexityBadge} ${endpoint.complexity ?? '—'} |\n` +
        `| **Archivo** | \`${endpoint.fileName}\` |\n\n` +
        `---\n\n` +
        `\`\`\`python\n${preview}\n\`\`\``
      );
      this.tooltip.isTrusted = true;

      this.iconPath = new vscode.ThemeIcon(
        getMethodIcon(endpoint.method),
        new vscode.ThemeColor(getMethodColor(endpoint.method))
      );
      this.command = {
        command: 'endpointCounter.goToLine',
        title: 'Ir al Endpoint',
        arguments: [endpoint]
      };
    } else if (kind === 'category') {
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'category';
    } else if (kind === 'file') {
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.contextValue = 'file';
    } else if (kind === 'summary') {
      this.iconPath = new vscode.ThemeIcon('graph');
    }
  }
}

function buildCodePreview(source: string | undefined, maxLines: number): string {
  if (!source) return '# (código no disponible)';
  const lines = source.split('\n').slice(0, maxLines);
  if (source.split('\n').length > maxLines) lines.push('    ...');
  return lines.join('\n');
}

function getMethodIcon(method: string): string {
  const icons: Record<string, string> = {
    'GET':     'arrow-down',
    'POST':    'arrow-up',
    'PUT':     'pencil',
    'PATCH':   'diff-modified',
    'DELETE':  'trash',
    'HEAD':    'eye',
    'OPTIONS': 'settings-gear',
  };
  return icons[method.toUpperCase()] ?? 'circle-outline';
}

function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    'GET':     'charts.green',
    'POST':    'charts.blue',
    'PUT':     'charts.yellow',
    'PATCH':   'charts.orange',
    'DELETE':  'charts.red',
    'HEAD':    'charts.purple',
    'OPTIONS': 'foreground',
  };
  return colors[method.toUpperCase()] ?? 'foreground';
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function detectFramework(content: string): 'Flask' | 'FastAPI' | 'Django' | 'Unknown' {
  if (/from flask|import flask/i.test(content)) return 'Flask';
  if (/from fastapi|import fastapi/i.test(content)) return 'FastAPI';
  if (/from django|import django/i.test(content)) return 'Django';
  return 'Unknown';
}

function parseEndpoints(content: string, filePath: string): Endpoint[] {
  const lines = content.split(/\r?\n/);
  const fileName = path.basename(filePath);
  const framework = detectFramework(content);
  const endpoints: Endpoint[] = [];
  let currentComment = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#')) {
      currentComment = line.substring(1).trim();
      continue;
    }

    // ── Flask ──────────────────────────────────────────────────────────────
    const flaskMatch = line.match(/@[\w.]+\.route\(["'](.+?)["'](,\s*methods\s*=\s*\[(.*?)\])?\)/i);
    if (flaskMatch) {
      const route = flaskMatch[1];
      const methodsRaw = flaskMatch[3];
      const methods = methodsRaw
        ? methodsRaw.replace(/["'\s]/g, '').split(',').filter(Boolean)
        : ['GET'];

      const { funcName, lineStart, lineEnd, sourceCode } = findNextFunction(lines, i);
      if (!funcName) continue;

      const lineCount = lineEnd - lineStart + 1;
      for (const method of methods) {
        endpoints.push({
          category: currentComment || 'Sin categoría',
          functionName: funcName,
          method: method.toUpperCase(),
          route,
          lineStart,
          lineEnd,
          lineCount,
          filePath,
          fileName,
          framework: 'Flask',
          sourceCode,
          complexity: calcComplexity(lineCount),
        });
      }
      continue;
    }

    // ── FastAPI ────────────────────────────────────────────────────────────
    const fastapiMatch = line.match(/@[\w.]+\.(get|post|put|patch|delete|head|options)\(["'](.+?)["']/i);
    if (fastapiMatch) {
      const method = fastapiMatch[1].toUpperCase();
      const route = fastapiMatch[2];
      const { funcName, lineStart, lineEnd, sourceCode } = findNextFunction(lines, i);
      if (!funcName) continue;

      const lineCount = lineEnd - lineStart + 1;
      endpoints.push({
        category: currentComment || 'Sin categoría',
        functionName: funcName,
        method,
        route,
        lineStart,
        lineEnd,
        lineCount,
        filePath,
        fileName,
        framework: 'FastAPI',
        sourceCode,
        complexity: calcComplexity(lineCount),
      });
      continue;
    }

    // ── Django ─────────────────────────────────────────────────────────────
    const djangoMatch = line.match(/(?:re_)?path\(["'](.+?)["'],\s*([\w.]+)/i);
    if (djangoMatch && fileName.includes('url')) {
      const route = djangoMatch[1];
      const viewName = djangoMatch[2].split('.').pop() || djangoMatch[2];
      endpoints.push({
        category: currentComment || 'URLs',
        functionName: viewName,
        method: 'GET/POST',
        route,
        lineStart: i + 1,
        lineEnd: i + 1,
        lineCount: 1,
        filePath,
        fileName,
        framework: 'Django',
        sourceCode: lines[i],
        complexity: 'simple',
      });
    }
  }

  return endpoints;
}

function findNextFunction(
  lines: string[],
  fromIndex: number
): { funcName: string | null; lineStart: number; lineEnd: number; sourceCode: string } {
  let funcLine = -1;
  for (let j = fromIndex + 1; j < Math.min(fromIndex + 5, lines.length); j++) {
    if (lines[j].trim().startsWith('def ') || lines[j].trim().startsWith('async def ')) {
      funcLine = j;
      break;
    }
  }
  if (funcLine === -1) return { funcName: null, lineStart: 0, lineEnd: 0, sourceCode: '' };

  const funcMatch = lines[funcLine].trim().match(/^(?:async\s+)?def\s+(\w+)/);
  if (!funcMatch) return { funcName: null, lineStart: 0, lineEnd: 0, sourceCode: '' };

  const indentMatch = lines[funcLine].match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1].length : 0;
  let lastReturnLine = funcLine;

  for (let k = funcLine + 1; k < lines.length; k++) {
    const currentLine = lines[k];
    if (currentLine.trim() === '') continue;
    const currentIndent = currentLine.match(/^(\s*)/)?.[1].length ?? 0;
    if (currentIndent <= indent && currentLine.trim() !== '') break;
    if (currentLine.trim().startsWith('return')) lastReturnLine = k;
  }

  const sourceCode = lines.slice(funcLine, lastReturnLine + 1).join('\n');

  return {
    funcName: funcMatch[1],
    lineStart: funcLine + 1,
    lineEnd: lastReturnLine + 1,
    sourceCode,
  };
}

// ─── Decoraciones de editor ───────────────────────────────────────────────────

const endpointDecorationType = vscode.window.createTextEditorDecorationType({
  before: {
    contentText: '⬡ endpoint',
    color: new vscode.ThemeColor('editorCodeLens.foreground'),
    margin: '0 8px 0 0',
    fontStyle: 'italic',
    fontWeight: 'normal',
  },
  isWholeLine: false,
  overviewRulerColor: new vscode.ThemeColor('charts.blue'),
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

function applyEditorDecorations(editor: vscode.TextEditor, endpoints: Endpoint[]): void {
  const fileEndpoints = endpoints.filter(ep => ep.filePath === editor.document.uri.fsPath);
  const decorations: vscode.DecorationOptions[] = fileEndpoints.map(ep => {
    const line = Math.max(0, ep.lineStart - 2); // decorator line = decorator line
    const range = editor.document.lineAt(line).range;
    return { range };
  });
  editor.setDecorations(endpointDecorationType, decorations);
}

// ─── Panel de preview (Peek-style) ───────────────────────────────────────────

function showEndpointPreviewPanel(ep: Endpoint, context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    'endpointPreview',
    `Preview: ${ep.functionName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );

  const escapedCode = (ep.sourceCode ?? '# No disponible')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const methodBadgeColor: Record<string, string> = {
    GET: '#22c55e', POST: '#3b82f6', PUT: '#eab308',
    PATCH: '#f97316', DELETE: '#ef4444',
  };
  const badgeColor = methodBadgeColor[ep.method] ?? '#888';

  panel.webview.html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0; padding: 24px;
  }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .method-badge {
    background: ${badgeColor}22;
    color: ${badgeColor};
    border: 1px solid ${badgeColor}55;
    border-radius: 4px;
    padding: 2px 10px;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.5px;
  }
  .fn-name {
    font-size: 18px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
  }
  .meta-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin-bottom: 20px;
    padding: 12px 16px;
    background: var(--vscode-editorWidget-background, rgba(128,128,128,0.08));
    border-radius: 8px;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
  }
  .meta-label { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; align-self: center; }
  .meta-value { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  .complexity-simple { color: #22c55e; }
  .complexity-medium  { color: #eab308; }
  .complexity-complex { color: #ef4444; }
  pre {
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.6;
    margin: 0;
  }
  .section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 8px;
  }
</style>
</head>
<body>
  <div class="header">
    <span class="method-badge">${ep.method}</span>
    <span class="fn-name">${ep.functionName}</span>
  </div>
  <div class="meta-grid">
    <span class="meta-label">Ruta</span>
    <span class="meta-value">${ep.route}</span>
    <span class="meta-label">Framework</span>
    <span class="meta-value">${ep.framework}</span>
    <span class="meta-label">Archivo</span>
    <span class="meta-value">${ep.fileName}</span>
    <span class="meta-label">Líneas</span>
    <span class="meta-value">${ep.lineStart} → ${ep.lineEnd} &nbsp;(${ep.lineCount} líneas)</span>
    <span class="meta-label">Complejidad</span>
    <span class="meta-value complexity-${ep.complexity ?? 'simple'}">${COMPLEXITY_ICON[ep.complexity ?? 'simple']} ${ep.complexity ?? '—'}</span>
  </div>
  <p class="section-label">Código fuente</p>
  <pre><code>${escapedCode}</code></pre>
</body>
</html>`;
}

// ─── Exportar endpoints ───────────────────────────────────────────────────────

async function exportEndpoints(endpoints: Endpoint[], format: 'json' | 'markdown'): Promise<void> {
  if (endpoints.length === 0) {
    vscode.window.showWarningMessage('No hay endpoints para exportar.');
    return;
  }

  let content: string;
  let ext: string;

  if (format === 'json') {
    const data = endpoints.map(({ sourceCode: _, ...rest }) => rest); // omit raw code from JSON
    content = JSON.stringify(data, null, 2);
    ext = 'json';
  } else {
    const byCategory = new Map<string, Endpoint[]>();
    for (const ep of endpoints) {
      if (!byCategory.has(ep.category)) byCategory.set(ep.category, []);
      byCategory.get(ep.category)!.push(ep);
    }
    const lines: string[] = ['# Endpoints detectados\n'];
    for (const [cat, eps] of byCategory.entries()) {
      lines.push(`## ${cat}\n`);
      lines.push('| Método | Ruta | Función | Líneas | Archivo |');
      lines.push('|--------|------|---------|--------|---------|');
      for (const ep of eps) {
        lines.push(`| \`${ep.method}\` | \`${ep.route}\` | \`${ep.functionName}\` | ${ep.lineStart}–${ep.lineEnd} | ${ep.fileName} |`);
      }
      lines.push('');
    }
    content = lines.join('\n');
    ext = 'md';
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`endpoints.${ext}`),
    filters: format === 'json'
      ? { 'JSON': ['json'] }
      : { 'Markdown': ['md'] },
  });

  if (!uri) return;
  fs.writeFileSync(uri.fsPath, content, 'utf8');
  const action = await vscode.window.showInformationMessage(
    `Exportado: ${path.basename(uri.fsPath)}`,
    'Abrir'
  );
  if (action === 'Abrir') {
    const doc = await vscode.workspace.openTextDocument(uri);
    vscode.window.showTextDocument(doc);
  }
}

// ─── TreeView Provider ────────────────────────────────────────────────────────

export class EndpointProvider implements vscode.TreeDataProvider<EndpointItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<EndpointItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private endpoints: Endpoint[] = [];
  private groupBy: 'category' | 'file' = 'category';
  private filterMethod: string | null = null;   // NEW: filter by HTTP method
  private statusBar: vscode.StatusBarItem;

  constructor(statusBar: vscode.StatusBarItem) {
    this.statusBar = statusBar;
  }

  refresh(): void {
    this.scan().then(() => this._onDidChangeTreeData.fire());
  }

  setGroupBy(mode: 'category' | 'file') {
    this.groupBy = mode;
    this._onDidChangeTreeData.fire();
  }

  // NEW: filter visible endpoints by HTTP method
  setMethodFilter(method: string | null) {
    this.filterMethod = method;
    this._onDidChangeTreeData.fire();
  }

  private get visibleEndpoints(): Endpoint[] {
    if (!this.filterMethod) return this.endpoints;
    return this.endpoints.filter(ep => ep.method === this.filterMethod);
  }

  async scan(): Promise<void> {
    this.endpoints = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    for (const folder of workspaceFolders) {
      const pythonFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*.py'),
        '**/node_modules/**'
      );

      for (const file of pythonFiles) {
        try {
          const content = fs.readFileSync(file.fsPath, 'utf8');
          const parsed = parseEndpoints(content, file.fsPath);
          this.endpoints.push(...parsed);
        } catch {
          // skip unreadable files
        }
      }
    }

    const count = this.endpoints.length;
    this.statusBar.text = `$(symbol-method) ${count} endpoint${count !== 1 ? 's' : ''}`;
    this.statusBar.tooltip = `Python Endpoint Counter: ${count} endpoints encontrados`;

    // Re-apply editor decorations for all visible editors
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === 'python') {
        applyEditorDecorations(editor, this.endpoints);
      }
    }
  }

  getTreeItem(element: EndpointItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EndpointItem): EndpointItem[] {
    if (!element) {
      const eps = this.visibleEndpoints;

      if (eps.length === 0) {
        return [
          new EndpointItem(
            this.filterMethod
              ? `No hay endpoints ${this.filterMethod}`
              : 'No se encontraron endpoints',
            vscode.TreeItemCollapsibleState.None,
            'summary'
          )
        ];
      }

      const summaryItem = new EndpointItem(
        `${eps.length} endpoints detectados`,
        vscode.TreeItemCollapsibleState.None,
        'summary'
      );
      summaryItem.description = this.getSummaryDescription();

      if (this.groupBy === 'file') return [summaryItem, ...this.buildByFile()];
      return [summaryItem, ...this.buildByCategory()];
    }

    return element.children ?? [];
  }

  private getSummaryDescription(): string {
    const byMethod: Record<string, number> = {};
    for (const ep of this.endpoints) {
      byMethod[ep.method] = (byMethod[ep.method] ?? 0) + 1;
    }
    return Object.entries(byMethod)
      .map(([m, c]) => `${m}:${c}`)
      .join('  ');
  }

  private buildByCategory(): EndpointItem[] {
    const map = new Map<string, Endpoint[]>();
    for (const ep of this.visibleEndpoints) {
      if (!map.has(ep.category)) map.set(ep.category, []);
      map.get(ep.category)!.push(ep);
    }
    return Array.from(map.entries()).map(([cat, eps]) => {
      const children = eps.map(ep =>
        new EndpointItem(ep.functionName, vscode.TreeItemCollapsibleState.None, 'endpoint', ep)
      );
      const item = new EndpointItem(cat, vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, children);
      item.description = `${eps.length} endpoint${eps.length !== 1 ? 's' : ''}`;
      return item;
    });
  }

  private buildByFile(): EndpointItem[] {
    const map = new Map<string, Endpoint[]>();
    for (const ep of this.visibleEndpoints) {
      if (!map.has(ep.filePath)) map.set(ep.filePath, []);
      map.get(ep.filePath)!.push(ep);
    }
    return Array.from(map.entries()).map(([filePath, eps]) => {
      const children = eps.map(ep =>
        new EndpointItem(ep.functionName, vscode.TreeItemCollapsibleState.None, 'endpoint', ep)
      );
      const item = new EndpointItem(
        path.basename(filePath),
        vscode.TreeItemCollapsibleState.Expanded,
        'file',
        undefined,
        children
      );
      item.description = `${eps.length}`;
      item.tooltip = filePath;
      return item;
    });
  }

  getAllEndpoints(): Endpoint[] {
    return this.endpoints;
  }
}

// ─── Activación ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = '$(symbol-method) Endpoints';
  statusBar.command = 'endpointCounter.refresh';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Provider
  const provider = new EndpointProvider(statusBar);
  const treeView = vscode.window.createTreeView('endpointExplorer', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Escaneo inicial
  provider.refresh();

  // ── Comandos ───────────────────────────────────────────────────────────────
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
      const line = Math.max(0, ep.lineStart - 1);
      const range = editor.document.lineAt(line).range;
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }),

    // ── MEJORADO: copyRoute ahora muestra preview expandida ─────────────────
    vscode.commands.registerCommand('endpointCounter.copyRoute', async (item: EndpointItem) => {
      if (!item.endpoint) return;
      const ep = item.endpoint;
      await vscode.env.clipboard.writeText(ep.route);

      const preview = buildCodePreview(ep.sourceCode, 12);
      const action = await vscode.window.showInformationMessage(
        `✓ Ruta copiada: ${ep.route}`,
        { modal: false },
        'Ver código',
        'Ir al archivo'
      );

      if (action === 'Ver código') {
        showEndpointPreviewPanel(ep, context);
      } else if (action === 'Ir al archivo') {
        vscode.commands.executeCommand('endpointCounter.goToLine', ep);
      }

      // También muestra el código en el canal de output
      const channel = getOutputChannel();
      channel.clear();
      channel.appendLine(`── ${ep.method} ${ep.route}  (${ep.fileName}:${ep.lineStart}) ──`);
      channel.appendLine('');
      channel.appendLine(ep.sourceCode ?? '# código no disponible');
      channel.appendLine('');
      channel.show(true);
    }),

    // ── NUEVO: peek/preview de código sin abrir el archivo ──────────────────
    vscode.commands.registerCommand('endpointCounter.peekCode', (item: EndpointItem) => {
      if (item.endpoint) showEndpointPreviewPanel(item.endpoint, context);
    }),

    // ── NUEVO: filtrar por método HTTP ───────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.filterByMethod', async () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', '— Sin filtro —'];
      const picked = await vscode.window.showQuickPick(methods, {
        placeHolder: 'Filtrar endpoints por método HTTP',
        title: 'Endpoint Filter',
      });
      if (!picked) return;
      provider.setMethodFilter(picked === '— Sin filtro —' ? null : picked);
    }),

    // ── NUEVO: exportar a JSON ────────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.exportJson', () => {
      exportEndpoints(provider.getAllEndpoints(), 'json');
    }),

    // ── NUEVO: exportar a Markdown ────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.exportMarkdown', () => {
      exportEndpoints(provider.getAllEndpoints(), 'markdown');
    }),

    // ── NUEVO: copiar cURL del endpoint ──────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.copyCurl', async (item: EndpointItem) => {
      if (!item.endpoint) return;
      const ep = item.endpoint;
      let curl = `curl -X ${ep.method} "http://localhost:5000${ep.route}"`;
      if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
        curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`;
      }
      await vscode.env.clipboard.writeText(curl);
      vscode.window.showInformationMessage(`cURL copiado para ${ep.functionName}`);
    }),

    // Agrupación
    vscode.commands.registerCommand('endpointCounter.groupByCategory', () => provider.setGroupBy('category')),
    vscode.commands.registerCommand('endpointCounter.groupByFile', () => provider.setGroupBy('file')),
  );

  // ── Auto-refresh al guardar + decoraciones ────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.languageId === 'python') provider.refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.languageId === 'python') {
        applyEditorDecorations(editor, provider.getAllEndpoints());
      }
    }),
  );
}

// ── Output channel singleton ─────────────────────────────────────────────────

let _outputChannel: vscode.OutputChannel | undefined;
function getOutputChannel(): vscode.OutputChannel {
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel('Endpoint Preview');
  }
  return _outputChannel;
}

export function deactivate() {
  _outputChannel?.dispose();
}