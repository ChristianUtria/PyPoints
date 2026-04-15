import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Endpoint } from '../types';
import { EndpointItem } from './Endpointitem';
import { parseEndpoints } from '../parser/Endpointparser';
import { detectDuplicates } from '../validators/Duplicatedetector';
import { validateEndpoint } from '../validators/Endpointvalidator';
import { applyEditorDecorations } from '../decorations/Editordecorations';

export class EndpointProvider implements vscode.TreeDataProvider<EndpointItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<EndpointItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private endpoints: Endpoint[] = [];
  private groupBy: 'category' | 'file' = 'category';
  private filterMethod: string | null = null;
  private searchQuery = '';
  private showOnlyIssues = false;
  private statusBar: vscode.StatusBarItem;

  constructor(statusBar: vscode.StatusBarItem) {
    this.statusBar = statusBar;
  }

  refresh() { this.scan().then(() => this._onDidChangeTreeData.fire()); }
  setGroupBy(m: 'category' | 'file') { this.groupBy = m; this._onDidChangeTreeData.fire(); }
  setMethodFilter(m: string | null) { this.filterMethod = m; this._onDidChangeTreeData.fire(); }
  setSearch(q: string) { this.searchQuery = q.toLowerCase().trim(); this._onDidChangeTreeData.fire(); }
  setShowOnlyIssues(v: boolean) { this.showOnlyIssues = v; this._onDidChangeTreeData.fire(); }
  getAllEndpoints() { return this.endpoints; }

  private get visible(): Endpoint[] {
    let eps = this.endpoints;
    if (this.filterMethod) eps = eps.filter(e => e.method === this.filterMethod);
    if (this.searchQuery) {
      const q = this.searchQuery;
      eps = eps.filter(
        e =>
          e.functionName.toLowerCase().includes(q) ||
          e.route.toLowerCase().includes(q) ||
          e.method.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.fileName.toLowerCase().includes(q)
      );
    }
    if (this.showOnlyIssues) eps = eps.filter(e => (e.issues && e.issues.length > 0) || e.isDuplicate);
    return eps;
  }

  async scan() {
    this.endpoints = [];
    const wf = vscode.workspace.workspaceFolders;
    if (!wf) return;

    for (const folder of wf) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*.py'),
        '**/node_modules/**'
      );
      for (const f of files) {
        try {
          this.endpoints.push(...parseEndpoints(fs.readFileSync(f.fsPath, 'utf8'), f.fsPath));
        } catch { /* skip */ }
      }
    }

    detectDuplicates(this.endpoints);
    for (const ep of this.endpoints) ep.issues = validateEndpoint(ep, this.endpoints);

    this.updateStatusBar();
    await this.notifyIssues();

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === 'python') {
        applyEditorDecorations(editor, this.endpoints);
      }
    }
  }

  private updateStatusBar() {
    const cnt = this.endpoints.length;
    const errCnt = this.endpoints.filter(e => e.issues?.some(i => i.type === 'error')).length;
    const dupeCnt = this.endpoints.filter(e => e.isDuplicate).length;
    const warnCnt = this.endpoints.filter(e => e.issues?.some(i => i.type === 'warning')).length;

    let st = `$(symbol-method) ${cnt} endpoint${cnt !== 1 ? 's' : ''}`;
    if (errCnt > 0 || dupeCnt > 0) st += `  $(error) ${errCnt + dupeCnt}`;
    else if (warnCnt > 0) st += `  $(warning) ${warnCnt}`;

    this.statusBar.text = st;
    this.statusBar.tooltip = `${cnt} endpoints  •  ${errCnt} errores  •  ${dupeCnt} duplicados  •  ${warnCnt} advertencias`;
  }

  private async notifyIssues() {
    const errCnt = this.endpoints.filter(e => e.issues?.some(i => i.type === 'error')).length;
    const dupeCnt = this.endpoints.filter(e => e.isDuplicate).length;
    if (errCnt > 0 || dupeCnt > 0) {
      const pl = [
        errCnt > 0 ? `${errCnt} error${errCnt !== 1 ? 'es' : ''}` : null,
        dupeCnt > 0 ? `${dupeCnt} duplicado${dupeCnt !== 1 ? 's' : ''}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      const action = await vscode.window.showWarningMessage(
        `⚠ Endpoints con problemas: ${pl}`,
        'Ver en panel'
      );
      if (action === 'Ver en panel') {
        vscode.commands.executeCommand('endpointCounter.showOnlyIssues');
      }
    }
  }

  getTreeItem(el: EndpointItem) { return el; }

  getChildren(el?: EndpointItem): EndpointItem[] {
    if (!el) {
      const eps = this.visible;
      if (!eps.length) {
        const msg = this.searchQuery
          ? `Sin resultados para "${this.searchQuery}"`
          : this.filterMethod
          ? `No hay endpoints ${this.filterMethod}`
          : this.showOnlyIssues
          ? 'Sin problemas detectados ✓'
          : 'No se encontraron endpoints';
        return [new EndpointItem(msg, vscode.TreeItemCollapsibleState.None, 'summary')];
      }

      const errCnt = eps.filter(e => e.issues?.some(i => i.type === 'error') || e.isDuplicate).length;
      const sum = new EndpointItem(
        `${eps.length} endpoint${eps.length !== 1 ? 's' : ''}`,
        vscode.TreeItemCollapsibleState.None,
        'summary'
      );
      sum.description = this.summaryDesc();
      if (errCnt > 0) sum.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));

      return [sum, ...(this.groupBy === 'file' ? this.byFile() : this.byCategory())];
    }
    return el.children ?? [];
  }

  private summaryDesc() {
    const bm: Record<string, number> = {};
    for (const e of this.endpoints) bm[e.method] = (bm[e.method] ?? 0) + 1;
    const f = [
      this.searchQuery ? `🔍 "${this.searchQuery}"` : null,
      this.filterMethod ? `[${this.filterMethod}]` : null,
      this.showOnlyIssues ? '⚠ solo issues' : null,
    ].filter(Boolean);
    const ms = Object.entries(bm).map(([m, c]) => `${m}:${c}`).join('  ');
    return f.length ? `${ms}  •  ${f.join(' ')}` : ms;
  }

  private byCategory() {
    const m = new Map<string, Endpoint[]>();
    for (const e of this.visible) {
      if (!m.has(e.category)) m.set(e.category, []);
      m.get(e.category)!.push(e);
    }
    return Array.from(m.entries()).map(([cat, eps]) => {
      const ch = eps.map(e => new EndpointItem(e.functionName, vscode.TreeItemCollapsibleState.None, 'endpoint', e));
      const it = new EndpointItem(cat, vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, ch);
      it.description = `${eps.length} endpoint${eps.length !== 1 ? 's' : ''}`;
      if (eps.some(e => e.issues?.some(i => i.type === 'error') || e.isDuplicate)) {
        it.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      }
      return it;
    });
  }

  private byFile() {
    const m = new Map<string, Endpoint[]>();
    for (const e of this.visible) {
      if (!m.has(e.filePath)) m.set(e.filePath, []);
      m.get(e.filePath)!.push(e);
    }
    return Array.from(m.entries()).map(([fp, eps]) => {
      const ch = eps.map(e => new EndpointItem(e.functionName, vscode.TreeItemCollapsibleState.None, 'endpoint', e));
      const it = new EndpointItem(path.basename(fp), vscode.TreeItemCollapsibleState.Expanded, 'file', undefined, ch);
      it.description = `${eps.length}`;
      it.tooltip = fp;
      return it;
    });
  }
}