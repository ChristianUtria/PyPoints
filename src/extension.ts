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
}

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
      this.description = `${endpoint.method}  •  línea ${endpoint.lineStart}`;
      this.tooltip = new vscode.MarkdownString(
        `**${endpoint.functionName}**\n\n` +
        `- Ruta: \`${endpoint.route}\`\n` +
        `- Método: \`${endpoint.method}\`\n` +
        `- Framework: ${endpoint.framework}\n` +
        `- Líneas: ${endpoint.lineStart} → ${endpoint.lineEnd} (${endpoint.lineCount} líneas)\n` +
        `- Archivo: \`${endpoint.fileName}\``
      );
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

function getMethodIcon(method: string): string {
  const icons: Record<string, string> = {
    'GET': 'arrow-down',
    'POST': 'arrow-up',
    'PUT': 'pencil',
    'PATCH': 'diff-modified',
    'DELETE': 'trash',
  };
  return icons[method.toUpperCase()] ?? 'circle-outline';
}

function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    'GET': 'charts.green',
    'POST': 'charts.blue',
    'PUT': 'charts.yellow',
    'PATCH': 'charts.orange',
    'DELETE': 'charts.red',
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

    // Captura comentarios como categorías
    if (line.startsWith('#')) {
      currentComment = line.substring(1).trim();
      continue;
    }

    // ── Flask: @app.route / @blueprint.route ──────────────────────────────
    const flaskMatch = line.match(/@[\w.]+\.route\(["'](.+?)["'](,\s*methods\s*=\s*\[(.*?)\])?\)/i);
    if (flaskMatch) {
      const route = flaskMatch[1];
      const methodsRaw = flaskMatch[3];
      const methods = methodsRaw
        ? methodsRaw.replace(/["'\s]/g, '').split(',').filter(Boolean)
        : ['GET'];

      const { funcName, lineStart, lineEnd } = findNextFunction(lines, i);
      if (!funcName) continue;

      for (const method of methods) {
        endpoints.push({
          category: currentComment || 'Sin categoría',
          functionName: funcName,
          method: method.toUpperCase(),
          route,
          lineStart,
          lineEnd,
          lineCount: lineEnd - lineStart + 1,
          filePath,
          fileName,
          framework: 'Flask',
        });
      }
      continue;
    }

    // ── FastAPI: @router.get / @app.post / etc. ───────────────────────────
    const fastapiMatch = line.match(/@[\w.]+\.(get|post|put|patch|delete|head|options)\(["'](.+?)["']/i);
    if (fastapiMatch) {
      const method = fastapiMatch[1].toUpperCase();
      const route = fastapiMatch[2];
      const { funcName, lineStart, lineEnd } = findNextFunction(lines, i);
      if (!funcName) continue;

      endpoints.push({
        category: currentComment || 'Sin categoría',
        functionName: funcName,
        method,
        route,
        lineStart,
        lineEnd,
        lineCount: lineEnd - lineStart + 1,
        filePath,
        fileName,
        framework: 'FastAPI',
      });
      continue;
    }

    // ── Django: path() / re_path() en urls.py ────────────────────────────
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
      });
    }
  }

  return endpoints;
}

function findNextFunction(
  lines: string[],
  fromIndex: number
): { funcName: string | null; lineStart: number; lineEnd: number } {
  let funcLine = -1;
  for (let j = fromIndex + 1; j < Math.min(fromIndex + 5, lines.length); j++) {
    if (lines[j].trim().startsWith('def ') || lines[j].trim().startsWith('async def ')) {
      funcLine = j;
      break;
    }
  }
  if (funcLine === -1) return { funcName: null, lineStart: 0, lineEnd: 0 };

  const funcMatch = lines[funcLine].trim().match(/^(?:async\s+)?def\s+(\w+)/);
  if (!funcMatch) return { funcName: null, lineStart: 0, lineEnd: 0 };

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

  return {
    funcName: funcMatch[1],
    lineStart: funcLine + 1,
    lineEnd: lastReturnLine + 1,
  };
}

// ─── TreeView Provider ────────────────────────────────────────────────────────

export class EndpointProvider implements vscode.TreeDataProvider<EndpointItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<EndpointItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private endpoints: Endpoint[] = [];
  private groupBy: 'category' | 'file' = 'category';
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
  }

  getTreeItem(element: EndpointItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EndpointItem): EndpointItem[] {
    if (!element) {
      // Raíz
      if (this.endpoints.length === 0) {
        return [
          new EndpointItem(
            'No se encontraron endpoints',
            vscode.TreeItemCollapsibleState.None,
            'summary'
          )
        ];
      }

      // Nodo resumen
      const summaryItem = new EndpointItem(
        `${this.endpoints.length} endpoints detectados`,
        vscode.TreeItemCollapsibleState.None,
        'summary'
      );
      summaryItem.description = this.getSummaryDescription();

      if (this.groupBy === 'file') {
        return [summaryItem, ...this.buildByFile()];
      }
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
    for (const ep of this.endpoints) {
      const key = ep.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ep);
    }

    return Array.from(map.entries()).map(([cat, eps]) => {
      const children = eps.map(ep =>
        new EndpointItem(
          ep.functionName,
          vscode.TreeItemCollapsibleState.None,
          'endpoint',
          ep
        )
      );
      const item = new EndpointItem(
        cat,
        vscode.TreeItemCollapsibleState.Expanded,
        'category',
        undefined,
        children
      );
      item.description = `${eps.length} endpoint${eps.length !== 1 ? 's' : ''}`;
      return item;
    });
  }

  private buildByFile(): EndpointItem[] {
    const map = new Map<string, Endpoint[]>();
    for (const ep of this.endpoints) {
      if (!map.has(ep.filePath)) map.set(ep.filePath, []);
      map.get(ep.filePath)!.push(ep);
    }

    return Array.from(map.entries()).map(([filePath, eps]) => {
      const children = eps.map(ep =>
        new EndpointItem(
          ep.functionName,
          vscode.TreeItemCollapsibleState.None,
          'endpoint',
          ep
        )
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

  // Comandos
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

    vscode.commands.registerCommand('endpointCounter.copyRoute', (item: EndpointItem) => {
      if (item.endpoint) {
        vscode.env.clipboard.writeText(item.endpoint.route);
        vscode.window.showInformationMessage(`Ruta copiada: ${item.endpoint.route}`);
      }
    }),

    // Agrupación
    vscode.commands.registerCommand('endpointCounter.groupByCategory', () => {
      provider.setGroupBy('category');
    }),
    vscode.commands.registerCommand('endpointCounter.groupByFile', () => {
      provider.setGroupBy('file');
    })
  );

  // Auto-refresh al guardar archivos Python
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.languageId === 'python') {
        provider.refresh();
      }
    })
  );
}

export function deactivate() {}