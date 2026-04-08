import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

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
  sourceCode?: string;
  complexity?: 'simple' | 'medium' | 'complex';
  issues?: ValidationIssue[];       // NEW: validation issues
  isDuplicate?: boolean;            // NEW: duplicate flag
  duplicateOf?: string;             // NEW: which endpoint it duplicates
}

// ─── Complejidad ──────────────────────────────────────────────────────────────

function calcComplexity(lineCount: number): 'simple' | 'medium' | 'complex' {
  if (lineCount <= 10) return 'simple';
  if (lineCount <= 30) return 'medium';
  return 'complex';
}

const COMPLEXITY_ICON: Record<string, string> = {
  simple: 'Ⅰ',
  medium: 'ⅠⅠ',
  complex: 'ⅠⅠⅠ',
};

// ─── Validación de endpoints ──────────────────────────────────────────────────

function validateEndpoint(ep: Endpoint, allEndpoints: Endpoint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Ruta no empieza con /
  if (!ep.route.startsWith('/')) {
    issues.push({ type: 'error', message: `La ruta no comienza con "/": "${ep.route}"` });
  }

  // 2. Ruta con espacios
  if (/\s/.test(ep.route)) {
    issues.push({ type: 'error', message: `La ruta contiene espacios: "${ep.route}"` });
  }

  // 3. Parámetros de ruta mal formados (Flask/FastAPI)
  if (ep.framework !== 'Django') {
    const badParam = ep.route.match(/<[^>]*\s[^>]*>|<[^>]*[^A-Za-z0-9_:>][^>]*>/);
    if (badParam) {
      issues.push({ type: 'error', message: `Parámetro de ruta con formato inválido: ${badParam[0]}` });
    }
  }

  // 4. Función sin return (solo Flask/FastAPI, si hay sourceCode)
  if (ep.sourceCode && ep.framework !== 'Django') {
    const hasReturn = /\breturn\b/.test(ep.sourceCode);
    if (!hasReturn) {
      issues.push({ type: 'warning', message: `La función "${ep.functionName}" no tiene sentencia return` });
    }
  }

  // 5. Nombre de función genérico o poco descriptivo
  const genericNames = ['handler', 'view', 'endpoint', 'api', 'index', 'handle', 'process'];
  if (genericNames.includes(ep.functionName.toLowerCase())) {
    issues.push({ type: 'warning', message: `Nombre de función genérico: "${ep.functionName}"` });
  }

  // 6. Ruta con doble slash
  if (ep.route.includes('//')) {
    issues.push({ type: 'error', message: `La ruta contiene doble slash: "${ep.route}"` });
  }

  // 7. Detectar uso de print() (debug code)
  if (ep.sourceCode && /\bprint\s*\(/.test(ep.sourceCode)) {
    issues.push({ type: 'warning', message: `La función contiene llamadas a print() — posible código de debug` });
  }

  return issues;
}

function detectDuplicates(endpoints: Endpoint[]): void {
  // Pase 1: duplicados por METHOD:route (colisión de rutas)
  const seenRoutes = new Map<string, Endpoint>();
  for (const ep of endpoints) {
    const key = `${ep.method.toUpperCase()}:${ep.route}`;
    if (seenRoutes.has(key)) {
      const orig = seenRoutes.get(key)!;
      const label = `${orig.functionName} (${orig.fileName})`;
      ep.isDuplicate   = true;
      ep.duplicateOf   = (ep.duplicateOf ? ep.duplicateOf + ', ' : '') + `ruta duplicada → ${label}`;
      if (!orig.isDuplicate) {
        orig.isDuplicate = true;
        orig.duplicateOf = `ruta duplicada → ${ep.functionName} (${ep.fileName})`;
      } else {
        orig.duplicateOf += `, ${ep.functionName} (${ep.fileName})`;
      }
    } else {
      seenRoutes.set(key, ep);
    }
  }

  // Pase 2: duplicados por nombre de función (mismo nombre en cualquier archivo)
  const seenNames = new Map<string, Endpoint>();
  for (const ep of endpoints) {
    const key = ep.functionName.toLowerCase();
    if (seenNames.has(key)) {
      const orig = seenNames.get(key)!;
      // Solo marcar si son archivos distintos o líneas distintas
      if (orig.filePath !== ep.filePath || orig.lineStart !== ep.lineStart) {
        const label = `${orig.functionName} (${orig.fileName})`;
        ep.isDuplicate = true;
        ep.duplicateOf = (ep.duplicateOf ? ep.duplicateOf + ', ' : '') + `nombre duplicado → ${label}`;
        if (!orig.isDuplicate) {
          orig.isDuplicate = true;
          orig.duplicateOf = (orig.duplicateOf ? orig.duplicateOf + ', ' : '') +
            `nombre duplicado → ${ep.functionName} (${ep.fileName})`;
        } else {
          orig.duplicateOf += `, nombre dup. → ${ep.functionName} (${ep.fileName})`;
        }
      }
    } else {
      seenNames.set(key, ep);
    }
  }
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

      const complexityBadge = endpoint.complexity ? COMPLEXITY_ICON[endpoint.complexity] : '';
      const hasErrors = endpoint.issues?.some(i => i.type === 'error');
      const hasWarnings = endpoint.issues?.some(i => i.type === 'warning');
      const isDupe = endpoint.isDuplicate;

      // Status indicators in description
      let statusIcons = '';
      if (hasErrors) statusIcons += ' $(error)';
      if (hasWarnings && !hasErrors) statusIcons += ' $(warning)';
      if (isDupe) statusIcons += ' $(copy)';

      this.description = `${endpoint.method}  •  L${endpoint.lineStart}  ${complexityBadge}${statusIcons}`;

      // Build tooltip
      const preview = buildCodePreview(endpoint.sourceCode, 8);
      let issuesSection = '';
      if (endpoint.issues && endpoint.issues.length > 0) {
        issuesSection = '\n\n---\n\n**Problemas detectados:**\n\n' +
          endpoint.issues.map(i =>
            `${i.type === 'error' ? '$(error)' : '$(warning)'} ${i.message}`
          ).join('\n\n');
      }
      if (isDupe) {
        issuesSection += `\n\n$(copy) **Duplicado de:** \`${endpoint.duplicateOf}\``;
      }

      this.tooltip = new vscode.MarkdownString(
        `### \`${endpoint.functionName}\`\n\n` +
        `| | |\n|---|---|\n` +
        `| **Ruta** | \`${endpoint.route}\` |\n` +
        `| **Método** | \`${endpoint.method}\` |\n` +
        `| **Framework** | ${endpoint.framework} |\n` +
        `| **Líneas** | ${endpoint.lineStart} → ${endpoint.lineEnd} *(${endpoint.lineCount} líneas)* |\n` +
        `| **Complejidad** | ${complexityBadge} ${endpoint.complexity ?? '—'} |\n` +
        `| **Archivo** | \`${endpoint.fileName}\` |\n` +
        issuesSection +
        `\n\n---\n\n\`\`\`python\n${preview}\n\`\`\``
      );
      this.tooltip.isTrusted = true;
      this.tooltip.supportThemeIcons = true;

      // Icon: error takes priority, then warning, then duplicate, then method
      if (hasErrors) {
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      } else if (isDupe) {
        this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      } else if (hasWarnings) {
        this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      } else {
        this.iconPath = new vscode.ThemeIcon(
          getMethodIcon(endpoint.method),
          new vscode.ThemeColor(getMethodColor(endpoint.method))
        );
      }

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
    'GET': 'arrow-down',
    'POST': 'arrow-up',
    'PUT': 'pencil',
    'PATCH': 'diff-modified',
    'DELETE': 'trash',
    'HEAD': 'eye',
    'OPTIONS': 'settings-gear',
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
    'HEAD': 'charts.purple',
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

const decorError = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor('errorForeground'),
    fontStyle: 'italic',
    fontWeight: 'normal',
    margin: '0 0 0 16px',
  },
  overviewRulerColor: new vscode.ThemeColor('errorForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

const decorWarning = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor('editorWarning.foreground'),
    fontStyle: 'italic',
    fontWeight: 'normal',
    margin: '0 0 0 16px',
  },
  overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

function applyEditorDecorations(editor: vscode.TextEditor, endpoints: Endpoint[]): void {
  const fileEndpoints = endpoints.filter(ep => ep.filePath === editor.document.uri.fsPath);

  const errorDecorations: vscode.DecorationOptions[] = [];
  const warnDecorations:  vscode.DecorationOptions[] = [];

  for (const ep of fileEndpoints) {
    // Línea del @route/@app.get (lineStart es 1-indexed, lineStart-2 = 0-indexed del decorator)
    const decoratorLine = Math.max(0, ep.lineStart - 2);
    const range = editor.document.lineAt(decoratorLine).range;

    const hasErrors   = ep.issues?.some(i => i.type === 'error') || ep.isDuplicate;
    const hasWarnings = ep.issues?.some(i => i.type === 'warning');

    if (hasErrors) {
      const messages: string[] = [];
      if (ep.isDuplicate) {
        messages.push(`⊗ Duplicado de: ${ep.duplicateOf}`);
      }
      ep.issues
        ?.filter(i => i.type === 'error')
        .forEach(i => messages.push(`⊗ ${i.message}`));

      errorDecorations.push({
        range,
        renderOptions: {
          after: { contentText: '   ' + messages.join('   ') },
        },
      });

    } else if (hasWarnings) {
      const messages = ep.issues!
        .filter(i => i.type === 'warning')
        .map(i => `⚠ ${i.message}`);

      warnDecorations.push({
        range,
        renderOptions: {
          after: { contentText: '   ' + messages.join('   ') },
        },
      });
    }
    // Sin problemas → sin decoración
  }

  editor.setDecorations(decorError,   errorDecorations);
  editor.setDecorations(decorWarning, warnDecorations);
}
// ─── Panel de preview ─────────────────────────────────────────────────────────

function showEndpointPreviewPanel(ep: Endpoint, context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    'endpointPreview',
    `Preview: ${ep.functionName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
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

  const hasErrors = ep.issues?.some(i => i.type === 'error') || ep.isDuplicate;
  const hasWarnings = ep.issues?.some(i => i.type === 'warning');

  let issuesHtml = '';
  if (ep.isDuplicate) {
    issuesHtml += `
      <div class="issue-banner issue-error">
        <span class="issue-icon">⊗</span>
        <div>
          <strong>Endpoint duplicado</strong>
          <span>Colisiona con: <code>${ep.duplicateOf ?? 'desconocido'}</code></span>
        </div>
      </div>`;
  }
  if (ep.issues && ep.issues.length > 0) {
    for (const issue of ep.issues) {
      issuesHtml += `
        <div class="issue-banner issue-${issue.type}">
          <span class="issue-icon">${issue.type === 'error' ? '⊗' : '⚠'}</span>
          <div><span>${issue.message}</span></div>
        </div>`;
    }
  }

  // Build cURL snippet
  let curlSnippet = `curl -X ${ep.method} "http://localhost:5000${ep.route}"`;
  if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
    curlSnippet += ` \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`;
  }
  const escapedCurl = curlSnippet.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  panel.webview.html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  :root {
    --radius: 8px;
    --gap: 16px;
  }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 24px;
    line-height: 1.5;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .method-badge {
    background: ${badgeColor}22;
    color: ${badgeColor};
    border: 1px solid ${badgeColor}55;
    border-radius: 4px;
    padding: 2px 10px;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 1px;
    text-transform: uppercase;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .fn-name {
    font-size: 18px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${hasErrors ? '#ef4444' : hasWarnings ? '#eab308' : '#22c55e'};
    margin-left: auto;
    box-shadow: 0 0 6px ${hasErrors ? '#ef444488' : hasWarnings ? '#eab30888' : '#22c55e88'};
    flex-shrink: 0;
  }

  /* Issues */
  .issues-section { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
  .issue-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    border-radius: var(--radius);
    border-left: 3px solid;
    font-size: 12px;
    animation: slideIn 0.2s ease;
  }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
  .issue-error {
    background: rgba(239,68,68,0.08);
    border-color: #ef4444;
    color: var(--vscode-errorForeground, #ef4444);
  }
  .issue-warning {
    background: rgba(234,179,8,0.08);
    border-color: #eab308;
    color: var(--vscode-editorWarning-foreground, #eab308);
  }
  .issue-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
  .issue-banner div { display: flex; flex-direction: column; gap: 2px; }
  .issue-banner strong { font-weight: 600; }
  .issue-banner code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    background: rgba(128,128,128,0.15);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* Meta */
  .meta-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin-bottom: var(--gap);
    padding: 12px 16px;
    background: var(--vscode-editorWidget-background, rgba(128,128,128,0.08));
    border-radius: var(--radius);
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
  }
  .meta-label {
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    align-self: center;
    white-space: nowrap;
  }
  .meta-value { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  .complexity-simple { color: #22c55e; }
  .complexity-medium  { color: #eab308; }
  .complexity-complex { color: #ef4444; }

  /* Code blocks */
  .code-section { margin-bottom: var(--gap); }
  .code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin: 0;
  }
  .copy-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.15));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
  }
  .copy-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.25));
  }
  .copy-btn.copied {
    color: #22c55e;
    border-color: #22c55e44;
    background: #22c55e11;
  }
  .copy-icon { font-size: 12px; }
  pre {
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    border-radius: var(--radius);
    padding: 16px;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.6;
    margin: 0;
    tab-size: 4;
  }
  code { font-family: inherit; }

  /* Tabs for Python / cURL */
  .tabs { display: flex; gap: 2px; margin-bottom: 8px; }
  .tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    transition: all 0.15s;
  }
  .tab-btn.active {
    color: var(--vscode-foreground);
    border-bottom-color: ${badgeColor};
  }
  .tab-content { display: none; }
  .tab-content.active { display: block; }
</style>
</head>
<body>
  <div class="header">
    <span class="method-badge">${ep.method}</span>
    <span class="fn-name">${ep.functionName}</span>
    <span class="status-dot" title="${hasErrors ? 'Tiene errores' : hasWarnings ? 'Tiene advertencias' : 'Sin problemas'}"></span>
  </div>

  ${issuesHtml ? `<div class="issues-section">${issuesHtml}</div>` : ''}

  <div class="meta-grid">
    <span class="meta-label">Ruta</span>
    <span class="meta-value">${ep.route}</span>
    <span class="meta-label">Framework</span>
    <span class="meta-value">${ep.framework}</span>
    <span class="meta-label">Archivo</span>
    <span class="meta-value">${ep.fileName}</span>
    <span class="meta-label">Líneas</span>
    <span class="meta-value">${ep.lineStart} → ${ep.lineEnd} &nbsp;<span style="color:var(--vscode-descriptionForeground)">(${ep.lineCount} líneas)</span></span>
    <span class="meta-label">Complejidad</span>
    <span class="meta-value complexity-${ep.complexity ?? 'simple'}">${COMPLEXITY_ICON[ep.complexity ?? 'simple']} ${ep.complexity ?? '—'}</span>
  </div>

  <div class="code-section">
    <div class="code-header">
      <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('python', this)">Python</button>
        <button class="tab-btn" onclick="switchTab('curl', this)">cURL</button>
      </div>
      <button class="copy-btn" id="copyBtn" onclick="copyActive()">
        <span class="copy-icon">⎘</span> Copiar
      </button>
    </div>

    <div id="tab-python" class="tab-content active">
      <pre><code id="code-python">${escapedCode}</code></pre>
    </div>
    <div id="tab-curl" class="tab-content">
      <pre><code id="code-curl">${escapedCurl}</code></pre>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  let activeTab = 'python';

  function switchTab(tab, btn) {
    activeTab = tab;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    btn.classList.add('active');
  }

  function copyActive() {
    const el = document.getElementById('code-' + activeTab);
    const text = el.innerText;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyBtn');
      const orig = btn.innerHTML;
      btn.innerHTML = '<span class="copy-icon">✓</span> Copiado';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.classList.remove('copied');
      }, 2000);
    });
  }
</script>
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
    const data = endpoints.map(({ sourceCode: _, ...rest }) => rest);
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
      lines.push('| Estado | Método | Ruta | Función | Líneas | Archivo |');
      lines.push('|--------|--------|------|---------|--------|---------|');
      for (const ep of eps) {
        const status = ep.issues?.some(i => i.type === 'error') || ep.isDuplicate
          ? '🔴' : ep.issues?.some(i => i.type === 'warning') ? '🟡' : '🟢';
        lines.push(`| ${status} | \`${ep.method}\` | \`${ep.route}\` | \`${ep.functionName}\` | ${ep.lineStart}–${ep.lineEnd} | ${ep.fileName} |`);
      }
      lines.push('');
    }
    content = lines.join('\n');
    ext = 'md';
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`endpoints.${ext}`),
    filters: format === 'json' ? { 'JSON': ['json'] } : { 'Markdown': ['md'] },
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
  private filterMethod: string | null = null;
  private searchQuery: string = '';               // NEW: search/filter text
  private showOnlyIssues: boolean = false;        // NEW: show only problematic
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

  setMethodFilter(method: string | null) {
    this.filterMethod = method;
    this._onDidChangeTreeData.fire();
  }

  setSearch(query: string) {
    this.searchQuery = query.toLowerCase().trim();
    this._onDidChangeTreeData.fire();
  }

  setShowOnlyIssues(value: boolean) {
    this.showOnlyIssues = value;
    this._onDidChangeTreeData.fire();
  }

  private get visibleEndpoints(): Endpoint[] {
    let eps = this.endpoints;

    if (this.filterMethod) {
      eps = eps.filter(ep => ep.method === this.filterMethod);
    }

    if (this.searchQuery) {
      const q = this.searchQuery;
      eps = eps.filter(ep =>
        ep.functionName.toLowerCase().includes(q) ||
        ep.route.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q) ||
        ep.category.toLowerCase().includes(q) ||
        ep.fileName.toLowerCase().includes(q)
      );
    }

    if (this.showOnlyIssues) {
      eps = eps.filter(ep =>
        (ep.issues && ep.issues.length > 0) || ep.isDuplicate
      );
    }

    return eps;
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

    // Run validation & duplicate detection
    detectDuplicates(this.endpoints);
    for (const ep of this.endpoints) {
      ep.issues = validateEndpoint(ep, this.endpoints);
    }

    // Notify about critical issues
    const errorCount = this.endpoints.filter(ep => ep.issues?.some(i => i.type === 'error')).length;
    const dupeCount = this.endpoints.filter(ep => ep.isDuplicate).length;
    const warnCount = this.endpoints.filter(ep => ep.issues?.some(i => i.type === 'warning')).length;

    const count = this.endpoints.length;
    let statusText = `$(symbol-method) ${count} endpoint${count !== 1 ? 's' : ''}`;
    if (errorCount > 0 || dupeCount > 0) {
      statusText += `  $(error) ${errorCount + dupeCount}`;
    } else if (warnCount > 0) {
      statusText += `  $(warning) ${warnCount}`;
    }

    this.statusBar.text = statusText;
    this.statusBar.tooltip = `${count} endpoints  •  ${errorCount} errores  •  ${dupeCount} duplicados  •  ${warnCount} advertencias`;

    // Alert if there are errors or duplicates
    if (errorCount > 0 || dupeCount > 0) {
      const problemList = [
        errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? 'es' : ''}` : null,
        dupeCount > 0 ? `${dupeCount} duplicado${dupeCount !== 1 ? 's' : ''}` : null,
      ].filter(Boolean).join(', ');

      const action = await vscode.window.showWarningMessage(
        `⚠ Endpoints con problemas: ${problemList}`,
        'Ver en panel'
      );
      if (action === 'Ver en panel') {
        vscode.commands.executeCommand('endpointCounter.showOnlyIssues');
      }
    }

    // Re-apply decorations
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
        const msg = this.searchQuery
          ? `Sin resultados para "${this.searchQuery}"`
          : this.filterMethod
            ? `No hay endpoints ${this.filterMethod}`
            : this.showOnlyIssues
              ? 'Sin problemas detectados ✓'
              : 'No se encontraron endpoints';
        return [new EndpointItem(msg, vscode.TreeItemCollapsibleState.None, 'summary')];
      }

      const errorCount = eps.filter(ep => ep.issues?.some(i => i.type === 'error') || ep.isDuplicate).length;
      const summaryItem = new EndpointItem(
        `${eps.length} endpoint${eps.length !== 1 ? 's' : ''}`,
        vscode.TreeItemCollapsibleState.None,
        'summary'
      );
      summaryItem.description = this.getSummaryDescription();
      if (errorCount > 0) {
        summaryItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      }

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
    const filters = [
      this.searchQuery ? `🔍︎​ "${this.searchQuery}"` : null,
      this.filterMethod ? `[${this.filterMethod}]` : null,
      this.showOnlyIssues ? '⚠ solo issues' : null,
    ].filter(Boolean);

    const methodStr = Object.entries(byMethod).map(([m, c]) => `${m}:${c}`).join('  ');
    return filters.length > 0 ? `${methodStr}  •  ${filters.join(' ')}` : methodStr;
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
      const catHasErrors = eps.some(ep => ep.issues?.some(i => i.type === 'error') || ep.isDuplicate);
      const item = new EndpointItem(cat, vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, children);
      item.description = `${eps.length} endpoint${eps.length !== 1 ? 's' : ''}`;
      if (catHasErrors) {
        item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      }
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

    // ── Buscar endpoint ──────────────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.search', async () => {
      const query = await vscode.window.showInputBox({
        placeHolder: 'Buscar por nombre, ruta, método, archivo...',
        title: 'Buscar Endpoints',
        prompt: 'Escribe para filtrar. Deja vacío para limpiar el filtro.',
      });
      if (query === undefined) return; // cancelled
      provider.setSearch(query);
    }),

    // ── Filtrar por método ───────────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.filterByMethod', async () => {
      const all = provider.getAllEndpoints();
      const methodCounts: Record<string, number> = {};
      for (const ep of all) {
        methodCounts[ep.method] = (methodCounts[ep.method] ?? 0) + 1;
      }
      const methods = Object.entries(methodCounts)
        .map(([m, c]) => ({ label: m, description: `${c} endpoints`, method: m }));

      const clearOption = { label: '$(close) Limpiar filtro', description: 'Mostrar todos', method: null as null };

      const items: ({ label: string; description: string; method: string | null })[] = [clearOption, ...methods];

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Filtrar por método HTTP',
        title: 'Endpoint Method Filter',
      });
      if (!picked) return;
      provider.setMethodFilter(picked.method);
    }),

    // ── Ver solo con problemas ───────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.showOnlyIssues', () => {
      provider.setShowOnlyIssues(true);
      vscode.window.showInformationMessage('Mostrando solo endpoints con problemas. Usa "Limpiar filtros" para resetear.');
    }),

    // ── Limpiar todos los filtros ────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.clearFilters', () => {
      provider.setSearch('');
      provider.setMethodFilter(null);
      provider.setShowOnlyIssues(false);
    }),

    // ── Copy route + preview ─────────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.copyRoute', async (item: EndpointItem) => {
      if (!item.endpoint) return;
      const ep = item.endpoint;
      await vscode.env.clipboard.writeText(ep.route);

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

      const channel = getOutputChannel();
      channel.clear();
      channel.appendLine(`── ${ep.method} ${ep.route}  (${ep.fileName}:${ep.lineStart}) ──`);
      channel.appendLine('');
      channel.appendLine(ep.sourceCode ?? '# código no disponible');
      channel.appendLine('');
      channel.show(true);
    }),

    // ── Peek code panel ──────────────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.peekCode', (item: EndpointItem) => {
      if (item.endpoint) showEndpointPreviewPanel(item.endpoint, context);
    }),

    // ── Copiar cURL ──────────────────────────────────────────────────────────
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

    // ── Exportar ─────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.exportJson', () =>
      exportEndpoints(provider.getAllEndpoints(), 'json')
    ),
    vscode.commands.registerCommand('endpointCounter.exportMarkdown', () =>
      exportEndpoints(provider.getAllEndpoints(), 'markdown')
    ),

    // ── Agrupación ───────────────────────────────────────────────────────────
    vscode.commands.registerCommand('endpointCounter.groupByCategory', () => provider.setGroupBy('category')),
    vscode.commands.registerCommand('endpointCounter.groupByFile', () => provider.setGroupBy('file')),
  );

  // ── Auto-refresh + decoraciones ───────────────────────────────────────────
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