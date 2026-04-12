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
  issues?: ValidationIssue[];
  isDuplicate?: boolean;
  duplicateOf?: string;
}

// ─── Detección automática del servidor ───────────────────────────────────────

interface ServerConfig {
  host: string;
  port: number;
  useSSL: boolean;
  baseUrl: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

function detectServerConfig(workspaceFolders: readonly vscode.WorkspaceFolder[]): ServerConfig {
  let host = 'localhost';
  let port = 5000;
  let useSSL = false;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let source = 'default';

  const pythonFiles: string[] = [];

  for (const folder of workspaceFolders) {
    try {
      const entries = fs.readdirSync(folder.uri.fsPath);
      for (const entry of entries) {
        if (entry.endsWith('.py')) pythonFiles.push(path.join(folder.uri.fsPath, entry));
      }
      for (const sub of ['app', 'src', 'api', 'server', 'backend']) {
        const subDir = path.join(folder.uri.fsPath, sub);
        if (fs.existsSync(subDir)) {
          try {
            for (const f of fs.readdirSync(subDir)) {
              if (f.endsWith('.py')) pythonFiles.push(path.join(subDir, f));
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  for (const filePath of pythonFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Flask: app.run(host='0.0.0.0', port=5000, ssl_context=...)
      const flaskRunMatch = content.match(/app\.run\s*\(([^)]*)\)/s);
      if (flaskRunMatch) {
        const args = flaskRunMatch[1];
        const portMatch = args.match(/port\s*=\s*(\d+)/);
        if (portMatch) { port = parseInt(portMatch[1], 10); confidence = 'high'; source = path.basename(filePath); }
        const hostMatch = args.match(/host\s*=\s*['"]([^'"]+)['"]/);
        if (hostMatch) { host = hostMatch[1] === '0.0.0.0' ? 'localhost' : hostMatch[1]; confidence = 'high'; }
        if (/ssl_context/.test(args)) useSSL = true;
      }

      // FastAPI: uvicorn.run(...)
      const uvicornMatch = content.match(/uvicorn\.run\s*\(([^)]*)\)/s);
      if (uvicornMatch) {
        const args = uvicornMatch[1];
        const portMatch = args.match(/port\s*=\s*(\d+)/);
        if (portMatch) { port = parseInt(portMatch[1], 10); confidence = 'high'; source = path.basename(filePath); }
        const hostMatch = args.match(/host\s*=\s*['"]([^'"]+)['"]/);
        if (hostMatch) { host = hostMatch[1] === '0.0.0.0' ? 'localhost' : hostMatch[1]; }
        if (/ssl_keyfile|ssl_certfile/.test(args)) useSSL = true;
      }

      // os.environ / os.getenv PORT fallback
      const envPortMatch = content.match(/os\.(?:environ|getenv)\s*(?:\[|\.get\s*\()\s*['"]PORT['"]\s*(?:\]|[,)])\s*(?:,\s*['"]?(\d+)['"]?)?/);
      if (envPortMatch && envPortMatch[1] && confidence === 'low') {
        port = parseInt(envPortMatch[1], 10); confidence = 'medium'; source = path.basename(filePath);
      }

      // Django runserver
      const djangoMatch = content.match(/runserver\s+(?:([\w.]+):)?(\d+)/);
      if (djangoMatch) {
        if (djangoMatch[1]) host = djangoMatch[1] === '0.0.0.0' ? 'localhost' : djangoMatch[1];
        if (djangoMatch[2]) port = parseInt(djangoMatch[2], 10);
        confidence = 'high'; source = path.basename(filePath);
      }

      // .env style PORT= inside .py
      if (confidence === 'low') {
        const portEnvLine = content.match(/^PORT\s*=\s*(\d+)/m);
        if (portEnvLine) { port = parseInt(portEnvLine[1], 10); confidence = 'medium'; source = path.basename(filePath); }
      }
    } catch { /* skip */ }
  }

  // Scan .env files
  for (const folder of workspaceFolders) {
    for (const envFile of ['.env', '.env.local', '.env.development']) {
      const envPath = path.join(folder.uri.fsPath, envFile);
      if (fs.existsSync(envPath)) {
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const portMatch = envContent.match(/^PORT\s*=\s*(\d+)/m);
          const hostMatch = envContent.match(/^HOST\s*=\s*(.+)/m);
          const httpsMatch = envContent.match(/^HTTPS\s*=\s*true/im);
          if (portMatch && confidence !== 'high') { port = parseInt(portMatch[1], 10); confidence = 'medium'; source = envFile; }
          if (hostMatch && confidence !== 'high') host = hostMatch[1].trim().replace(/['"]/g, '');
          if (httpsMatch) useSSL = true;
        } catch { /* skip */ }
      }
    }
  }

  // Infer SSL from port
  if (port === 443 || port === 8443) useSSL = true;
  if (port === 80 || port === 8080 || port === 5000 || port === 3000 || port === 8000) useSSL = false;

  const protocol = useSSL ? 'https' : 'http';
  const portSuffix = (useSSL && port === 443) || (!useSSL && port === 80) ? '' : `:${port}`;
  const baseUrl = `${protocol}://${host}${portSuffix}`;

  return { host, port, useSSL, baseUrl, confidence, source };
}

function buildCandidateUrls(config?: ServerConfig): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const add = (u: string) => { if (!seen.has(u)) { seen.add(u); urls.push(u); } };

  if (config) add(config.baseUrl);
  // Swap localhost <-> 127.0.0.1 for detected
  if (config?.baseUrl.includes('localhost')) {
    add(config.baseUrl.replace('localhost', '127.0.0.1'));
  } else if (config?.baseUrl.includes('127.0.0.1')) {
    add(config.baseUrl.replace('127.0.0.1', 'localhost'));
  }

  add('http://localhost:5000');
  add('http://127.0.0.1:5000');
  add('http://localhost:8000');
  add('http://127.0.0.1:8000');
  add('http://localhost:3000');
  add('http://localhost:8080');
  add('https://localhost:5001');
  add('https://localhost:8443');

  return urls;
}

// ─── Complejidad ──────────────────────────────────────────────────────────────

function calcComplexity(lineCount: number): 'simple' | 'medium' | 'complex' {
  if (lineCount <= 10) return 'simple';
  if (lineCount <= 30) return 'medium';
  return 'complex';
}

const COMPLEXITY_ICON: Record<string, string> = {
  simple: 'Ⅰ', medium: 'ⅠⅠ', complex: 'ⅠⅠⅠ',
};

// ─── Validación de endpoints ──────────────────────────────────────────────────

function validateEndpoint(ep: Endpoint, allEndpoints: Endpoint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!ep.route.startsWith('/')) issues.push({ type: 'error', message: `La ruta no comienza con "/": "${ep.route}"` });
  if (/\s/.test(ep.route)) issues.push({ type: 'error', message: `La ruta contiene espacios: "${ep.route}"` });
  if (ep.framework !== 'Django') {
    const badParam = ep.route.match(/<[^>]*\s[^>]*>|<[^>]*[^A-Za-z0-9_:>][^>]*>/);
    if (badParam) issues.push({ type: 'error', message: `Parámetro de ruta con formato inválido: ${badParam[0]}` });
  }
  if (ep.sourceCode && ep.framework !== 'Django' && !/\breturn\b/.test(ep.sourceCode)) {
    issues.push({ type: 'warning', message: `La función "${ep.functionName}" no tiene sentencia return` });
  }
  const genericNames = ['handler', 'view', 'endpoint', 'api', 'index', 'handle', 'process'];
  if (genericNames.includes(ep.functionName.toLowerCase())) {
    issues.push({ type: 'warning', message: `Nombre de función genérico: "${ep.functionName}"` });
  }
  if (ep.route.includes('//')) issues.push({ type: 'error', message: `La ruta contiene doble slash: "${ep.route}"` });
  if (ep.sourceCode && /\bprint\s*\(/.test(ep.sourceCode)) {
    issues.push({ type: 'warning', message: `La función contiene llamadas a print() — posible código de debug` });
  }
  return issues;
}

function detectDuplicates(endpoints: Endpoint[]): void {
  const seenRoutes = new Map<string, Endpoint>();
  for (const ep of endpoints) {
    const key = `${ep.method.toUpperCase()}:${ep.route}`;
    if (seenRoutes.has(key)) {
      const orig = seenRoutes.get(key)!;
      ep.isDuplicate = true;
      ep.duplicateOf = (ep.duplicateOf ? ep.duplicateOf + ', ' : '') + `ruta duplicada → ${orig.functionName} (${orig.fileName})`;
      if (!orig.isDuplicate) { orig.isDuplicate = true; orig.duplicateOf = `ruta duplicada → ${ep.functionName} (${ep.fileName})`; }
      else orig.duplicateOf += `, ${ep.functionName} (${ep.fileName})`;
    } else seenRoutes.set(key, ep);
  }
  const seenNames = new Map<string, Endpoint>();
  for (const ep of endpoints) {
    const key = ep.functionName.toLowerCase();
    if (seenNames.has(key)) {
      const orig = seenNames.get(key)!;
      if (orig.filePath !== ep.filePath || orig.lineStart !== ep.lineStart) {
        ep.isDuplicate = true;
        ep.duplicateOf = (ep.duplicateOf ? ep.duplicateOf + ', ' : '') + `nombre duplicado → ${orig.functionName} (${orig.fileName})`;
        if (!orig.isDuplicate) { orig.isDuplicate = true; orig.duplicateOf = (orig.duplicateOf ? orig.duplicateOf + ', ' : '') + `nombre duplicado → ${ep.functionName} (${ep.fileName})`; }
        else orig.duplicateOf += `, nombre dup. → ${ep.functionName} (${ep.fileName})`;
      }
    } else seenNames.set(key, ep);
  }
}

// ─── TreeView ─────────────────────────────────────────────────────────────────

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
      this.contextValue = endpoint.method === 'GET' ? 'endpoint endpoint-get' : 'endpoint';
      const complexityBadge = endpoint.complexity ? COMPLEXITY_ICON[endpoint.complexity] : '';
      const hasErrors = endpoint.issues?.some(i => i.type === 'error');
      const hasWarnings = endpoint.issues?.some(i => i.type === 'warning');
      const isDupe = endpoint.isDuplicate;
      let statusIcons = '';
      if (hasErrors) statusIcons += ' $(error)';
      if (hasWarnings && !hasErrors) statusIcons += ' $(warning)';
      if (isDupe) statusIcons += ' $(copy)';
      this.description = `${endpoint.method}  •  L${endpoint.lineStart}  ${complexityBadge}${statusIcons}`;
      const preview = buildCodePreview(endpoint.sourceCode, 8);
      let issuesSection = '';
      if (endpoint.issues && endpoint.issues.length > 0) {
        issuesSection = '\n\n---\n\n**Problemas detectados:**\n\n' + endpoint.issues.map(i => `${i.type === 'error' ? '$(error)' : '$(warning)'} ${i.message}`).join('\n\n');
      }
      if (isDupe) issuesSection += `\n\n$(copy) **Duplicado de:** \`${endpoint.duplicateOf}\``;
      this.tooltip = new vscode.MarkdownString(
        `### \`${endpoint.functionName}\`\n\n| | |\n|---|---|\n| **Ruta** | \`${endpoint.route}\` |\n| **Método** | \`${endpoint.method}\` |\n| **Framework** | ${endpoint.framework} |\n| **Líneas** | ${endpoint.lineStart} → ${endpoint.lineEnd} *(${endpoint.lineCount} líneas)* |\n| **Complejidad** | ${complexityBadge} ${endpoint.complexity ?? '—'} |\n| **Archivo** | \`${endpoint.fileName}\` |` + issuesSection + `\n\n---\n\n\`\`\`python\n${preview}\n\`\`\``
      );
      this.tooltip.isTrusted = true; this.tooltip.supportThemeIcons = true;
      if (hasErrors) this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      else if (isDupe || hasWarnings) this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      else this.iconPath = new vscode.ThemeIcon(getMethodIcon(endpoint.method), new vscode.ThemeColor(getMethodColor(endpoint.method)));
      this.command = { command: 'endpointCounter.goToLine', title: 'Ir al Endpoint', arguments: [endpoint] };
    } else if (kind === 'category') { this.iconPath = new vscode.ThemeIcon('folder'); this.contextValue = 'category'; }
    else if (kind === 'file') { this.iconPath = new vscode.ThemeIcon('file-code'); this.contextValue = 'file'; }
    else if (kind === 'summary') { this.iconPath = new vscode.ThemeIcon('graph'); }
  }
}

function buildCodePreview(source: string | undefined, maxLines: number): string {
  if (!source) return '# (código no disponible)';
  const lines = source.split('\n').slice(0, maxLines);
  if (source.split('\n').length > maxLines) lines.push('    ...');
  return lines.join('\n');
}

function getMethodIcon(method: string): string {
  return ({ GET: 'arrow-down', POST: 'arrow-up', PUT: 'pencil', PATCH: 'diff-modified', DELETE: 'trash', HEAD: 'eye', OPTIONS: 'settings-gear' } as Record<string,string>)[method.toUpperCase()] ?? 'circle-outline';
}
function getMethodColor(method: string): string {
  return ({ GET: 'charts.green', POST: 'charts.blue', PUT: 'charts.yellow', PATCH: 'charts.orange', DELETE: 'charts.red', HEAD: 'charts.purple', OPTIONS: 'foreground' } as Record<string,string>)[method.toUpperCase()] ?? 'foreground';
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
    if (line.startsWith('#')) { currentComment = line.substring(1).trim(); continue; }

    const flaskMatch = line.match(/@[\w.]+\.route\(["'](.+?)["'](,\s*methods\s*=\s*\[(.*?)\])?\)/i);
    if (flaskMatch) {
      const route = flaskMatch[1];
      const methods = flaskMatch[3] ? flaskMatch[3].replace(/["'\s]/g, '').split(',').filter(Boolean) : ['GET'];
      const { funcName, lineStart, lineEnd, sourceCode } = findNextFunction(lines, i);
      if (!funcName) continue;
      const lineCount = lineEnd - lineStart + 1;
      for (const method of methods) endpoints.push({ category: currentComment || 'Sin categoría', functionName: funcName, method: method.toUpperCase(), route, lineStart, lineEnd, lineCount, filePath, fileName, framework: 'Flask', sourceCode, complexity: calcComplexity(lineCount) });
      continue;
    }

    const fastapiMatch = line.match(/@[\w.]+\.(get|post|put|patch|delete|head|options)\(["'](.+?)["']/i);
    if (fastapiMatch) {
      const method = fastapiMatch[1].toUpperCase(); const route = fastapiMatch[2];
      const { funcName, lineStart, lineEnd, sourceCode } = findNextFunction(lines, i);
      if (!funcName) continue;
      const lineCount = lineEnd - lineStart + 1;
      endpoints.push({ category: currentComment || 'Sin categoría', functionName: funcName, method, route, lineStart, lineEnd, lineCount, filePath, fileName, framework: 'FastAPI', sourceCode, complexity: calcComplexity(lineCount) });
      continue;
    }

    const djangoMatch = line.match(/(?:re_)?path\(["'](.+?)["'],\s*([\w.]+)/i);
    if (djangoMatch && fileName.includes('url')) {
      const route = djangoMatch[1]; const viewName = djangoMatch[2].split('.').pop() || djangoMatch[2];
      endpoints.push({ category: currentComment || 'URLs', functionName: viewName, method: 'GET/POST', route, lineStart: i + 1, lineEnd: i + 1, lineCount: 1, filePath, fileName, framework: 'Django', sourceCode: lines[i], complexity: 'simple' });
    }
  }
  return endpoints;
}

function findNextFunction(lines: string[], fromIndex: number): { funcName: string | null; lineStart: number; lineEnd: number; sourceCode: string } {
  let funcLine = -1;
  for (let j = fromIndex + 1; j < Math.min(fromIndex + 5, lines.length); j++) {
    if (lines[j].trim().startsWith('def ') || lines[j].trim().startsWith('async def ')) { funcLine = j; break; }
  }
  if (funcLine === -1) return { funcName: null, lineStart: 0, lineEnd: 0, sourceCode: '' };
  const funcMatch = lines[funcLine].trim().match(/^(?:async\s+)?def\s+(\w+)/);
  if (!funcMatch) return { funcName: null, lineStart: 0, lineEnd: 0, sourceCode: '' };
  const indent = lines[funcLine].match(/^(\s*)/)?.[1].length ?? 0;
  let lastReturnLine = funcLine;
  for (let k = funcLine + 1; k < lines.length; k++) {
    const cl = lines[k];
    if (cl.trim() === '') continue;
    if ((cl.match(/^(\s*)/)?.[1].length ?? 0) <= indent && cl.trim() !== '') break;
    if (cl.trim().startsWith('return')) lastReturnLine = k;
  }
  return { funcName: funcMatch[1], lineStart: funcLine + 1, lineEnd: lastReturnLine + 1, sourceCode: lines.slice(funcLine, lastReturnLine + 1).join('\n') };
}

// ─── Editor decorations ───────────────────────────────────────────────────────

const decorError = vscode.window.createTextEditorDecorationType({ after: { color: new vscode.ThemeColor('errorForeground'), fontStyle: 'italic', margin: '0 0 0 16px' }, overviewRulerColor: new vscode.ThemeColor('errorForeground'), overviewRulerLane: vscode.OverviewRulerLane.Right });
const decorWarning = vscode.window.createTextEditorDecorationType({ after: { color: new vscode.ThemeColor('editorWarning.foreground'), fontStyle: 'italic', margin: '0 0 0 16px' }, overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'), overviewRulerLane: vscode.OverviewRulerLane.Right });

function applyEditorDecorations(editor: vscode.TextEditor, endpoints: Endpoint[]): void {
  const fileEndpoints = endpoints.filter(ep => ep.filePath === editor.document.uri.fsPath);
  const errorDecorations: vscode.DecorationOptions[] = [];
  const warnDecorations: vscode.DecorationOptions[] = [];
  for (const ep of fileEndpoints) {
    const range = editor.document.lineAt(Math.max(0, ep.lineStart - 2)).range;
    const hasErrors = ep.issues?.some(i => i.type === 'error') || ep.isDuplicate;
    const hasWarnings = ep.issues?.some(i => i.type === 'warning');
    if (hasErrors) {
      const messages: string[] = [];
      if (ep.isDuplicate) messages.push(`⊗ Duplicado de: ${ep.duplicateOf}`);
      ep.issues?.filter(i => i.type === 'error').forEach(i => messages.push(`⊗ ${i.message}`));
      errorDecorations.push({ range, renderOptions: { after: { contentText: '   ' + messages.join('   ') } } });
    } else if (hasWarnings) {
      warnDecorations.push({ range, renderOptions: { after: { contentText: '   ' + ep.issues!.filter(i => i.type === 'warning').map(i => `⚠ ${i.message}`).join('   ') } } });
    }
  }
  editor.setDecorations(decorError, errorDecorations);
  editor.setDecorations(decorWarning, warnDecorations);
}

// ─── WebView Panel ────────────────────────────────────────────────────────────

function showEndpointPreviewPanel(ep: Endpoint, context: vscode.ExtensionContext, serverConfig?: ServerConfig): void {
  const panel = vscode.window.createWebviewPanel('endpointPreview', `▶ ${ep.functionName}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });

  const escapedCode = (ep.sourceCode ?? '# No disponible').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const methodBadgeColor: Record<string, string> = { GET: '#22c55e', POST: '#3b82f6', PUT: '#eab308', PATCH: '#f97316', DELETE: '#ef4444' };
  const badgeColor = methodBadgeColor[ep.method] ?? '#888';
  const hasErrors = ep.issues?.some(i => i.type === 'error') || ep.isDuplicate;
  const hasWarnings = ep.issues?.some(i => i.type === 'warning');

  let issuesHtml = '';
  if (ep.isDuplicate) issuesHtml += `<div class="issue-banner issue-error"><span class="issue-icon">⊗</span><div><strong>Endpoint duplicado</strong><span>Colisiona con: <code>${ep.duplicateOf ?? 'desconocido'}</code></span></div></div>`;
  if (ep.issues) for (const issue of ep.issues) issuesHtml += `<div class="issue-banner issue-${issue.type}"><span class="issue-icon">${issue.type === 'error' ? '⊗' : '⚠'}</span><div><span>${issue.message}</span></div></div>`;

  const detectedUrl = serverConfig?.baseUrl ?? 'http://localhost:5000';
  const confidenceLabel = serverConfig ? ({ high: '✓ detectado', medium: '~ inferido', low: '? default' })[serverConfig.confidence] : '? default';
  const confidenceColor = serverConfig ? ({ high: '#22c55e', medium: '#eab308', low: '#888' })[serverConfig.confidence] : '#888';
  const sourceLabel = serverConfig?.source ?? 'fallback';

  const isGetCapable = ep.method === 'GET' || ep.method === 'GET/POST';
  const routeParams = [
    ...ep.route.matchAll(/<(?:\w+:)?(\w+)>/g),
    ...ep.route.matchAll(/\{(\w+)\}/g),
  ].map(m => m[1]);

  const paramsInputsHtml = routeParams.map(p => `
    <div class="param-row">
      <label class="param-label">${p}</label>
      <input class="param-input" id="param-${p}" type="text" placeholder="valor" oninput="updateUrlPreview()" />
    </div>`).join('');

  const candidateUrls = buildCandidateUrls(serverConfig);
  const candidateOptionsHtml = candidateUrls.map(u => `<option value="${u}"${u === detectedUrl ? ' selected' : ''}>${u}</option>`).join('');

  const escapedCurl = (`curl -X GET "${detectedUrl}${ep.route}"`).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  panel.webview.html = /* html */`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  :root { --radius: 8px; --gap: 14px; }
  * { box-sizing: border-box; }
  body { font-family: var(--vscode-font-family,'Segoe UI',sans-serif); font-size:13px; color:var(--vscode-foreground); background:var(--vscode-editor-background); margin:0; padding:20px; line-height:1.5; }

  .header { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
  .method-badge { background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}55; border-radius:4px; padding:2px 10px; font-weight:700; font-size:11px; letter-spacing:1px; text-transform:uppercase; font-family:monospace; }
  .fn-name { font-size:17px; font-weight:600; }
  .status-dot { width:8px; height:8px; border-radius:50%; margin-left:auto; background:${hasErrors ? '#ef4444' : hasWarnings ? '#eab308' : '#22c55e'}; box-shadow:0 0 6px ${hasErrors ? '#ef444488' : hasWarnings ? '#eab30888' : '#22c55e88'}; flex-shrink:0; }

  .issues-section { margin-bottom:12px; display:flex; flex-direction:column; gap:6px; }
  .issue-banner { display:flex; align-items:flex-start; gap:10px; padding:8px 12px; border-radius:var(--radius); border-left:3px solid; font-size:12px; animation:slideIn .2s ease; }
  @keyframes slideIn { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:none} }
  .issue-error { background:rgba(239,68,68,.08); border-color:#ef4444; color:var(--vscode-errorForeground,#ef4444); }
  .issue-warning { background:rgba(234,179,8,.08); border-color:#eab308; color:#eab308; }
  .issue-icon { font-size:13px; flex-shrink:0; margin-top:1px; }
  .issue-banner div { display:flex; flex-direction:column; gap:2px; }
  .issue-banner strong { font-weight:600; }
  .issue-banner code { font-family:monospace; font-size:11px; background:rgba(128,128,128,.15); padding:1px 4px; border-radius:3px; }

  .meta-grid { display:grid; grid-template-columns:auto 1fr; gap:5px 14px; margin-bottom:var(--gap); padding:10px 14px; background:var(--vscode-editorWidget-background,rgba(128,128,128,.08)); border-radius:var(--radius); border:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); }
  .meta-label { color:var(--vscode-descriptionForeground); font-size:10px; text-transform:uppercase; letter-spacing:.5px; align-self:center; white-space:nowrap; }
  .meta-value { font-family:monospace; font-size:12px; }
  .complexity-simple{color:#22c55e} .complexity-medium{color:#eab308} .complexity-complex{color:#ef4444}

  .tab-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); padding-bottom:6px; }
  .tabs { display:flex; gap:2px; }
  .tab-btn { background:none; border:none; border-bottom:2px solid transparent; padding:4px 12px; font-size:12px; color:var(--vscode-descriptionForeground); cursor:pointer; font-family:var(--vscode-font-family,sans-serif); transition:all .12s; margin-bottom:-7px; }
  .tab-btn.active { color:var(--vscode-foreground); border-bottom-color:${badgeColor}; }
  .tab-content { display:none; }
  .tab-content.active { display:block; }
  .copy-btn { display:flex; align-items:center; gap:5px; background:var(--vscode-button-secondaryBackground,rgba(128,128,128,.15)); color:var(--vscode-button-secondaryForeground,var(--vscode-foreground)); border:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); border-radius:4px; padding:3px 10px; font-size:11px; cursor:pointer; transition:all .15s; font-family:var(--vscode-font-family,sans-serif); }
  .copy-btn:hover { background:rgba(128,128,128,.25); }
  .copy-btn.copied { color:#22c55e; border-color:#22c55e44; background:#22c55e11; }
  pre { background:var(--vscode-textCodeBlock-background,rgba(128,128,128,.1)); border:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); border-radius:var(--radius); padding:14px; overflow-x:auto; font-family:var(--vscode-editor-font-family,monospace); font-size:12px; line-height:1.6; margin:0; tab-size:4; }

  /* Mini-Postman */
  .postman-section { display:flex; flex-direction:column; gap:10px; }

  /* Server banner */
  .server-banner { display:flex; align-items:center; gap:8px; padding:7px 12px; border-radius:6px; font-size:11px; background:rgba(128,128,128,.06); border:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); }
  .server-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; background:#888; transition:all .3s; }
  .server-dot.live { background:#22c55e; box-shadow:0 0 5px #22c55e88; }
  .server-dot.dead { background:#ef4444; box-shadow:0 0 5px #ef444488; }
  .server-dot.checking { background:#eab308; animation:pulse 1s infinite; }
  @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
  .server-label { flex:1; color:var(--vscode-descriptionForeground); }
  .server-label strong { color:var(--vscode-foreground); font-family:monospace; }
  .server-confidence { font-size:10px; padding:1px 6px; border-radius:10px; color:${confidenceColor}; border:1px solid ${confidenceColor}44; background:${confidenceColor}11; font-weight:600; }
  .ping-btn { background:none; border:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); color:var(--vscode-descriptionForeground); border-radius:4px; padding:1px 8px; font-size:10px; cursor:pointer; transition:all .12s; font-family:var(--vscode-font-family,sans-serif); }
  .ping-btn:hover { border-color:${badgeColor}55; color:${badgeColor}; }

  /* URL bar */
  .url-bar { display:flex; align-items:center; gap:6px; background:var(--vscode-input-background,rgba(128,128,128,.1)); border:1px solid var(--vscode-input-border,rgba(128,128,128,.3)); border-radius:var(--radius); padding:4px 8px; transition:border-color .15s; }
  .url-bar:focus-within { border-color:${badgeColor}66; }
  .url-method-tag { font-size:10px; font-weight:700; letter-spacing:1px; color:${badgeColor}; font-family:monospace; white-space:nowrap; }
  .url-select { background:none; border:none; color:var(--vscode-descriptionForeground); font-size:11px; font-family:monospace; outline:none; cursor:pointer; border-right:1px solid var(--vscode-widget-border,rgba(128,128,128,.25)); padding-right:6px; margin-right:2px; max-width:185px; }
  .url-select option { background:var(--vscode-dropdown-background,#1e1e2e); color:var(--vscode-foreground); }
  .url-route-editable { flex:1; background:none; border:none; outline:none; font-size:12px; font-family:monospace; color:var(--vscode-foreground); min-width:0; }
  .run-btn { flex-shrink:0; display:flex; align-items:center; gap:5px; background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}55; border-radius:4px; padding:5px 16px; font-size:12px; font-weight:700; cursor:pointer; transition:all .15s; white-space:nowrap; font-family:var(--vscode-font-family,sans-serif); }
  .run-btn:hover:not(:disabled) { background:${badgeColor}33; border-color:${badgeColor}99; transform:scale(1.02); }
  .run-btn:disabled { opacity:.4; cursor:not-allowed; transform:none; }
  .run-btn .spinner { display:none; width:10px; height:10px; border:2px solid ${badgeColor}44; border-top-color:${badgeColor}; border-radius:50%; animation:spin .6s linear infinite; }
  .run-btn.loading .btn-label { display:none; }
  .run-btn.loading .spinner { display:block; }
  @keyframes spin { to{transform:rotate(360deg)} }

  .url-preview { font-size:10px; font-family:monospace; color:var(--vscode-descriptionForeground); padding:3px 10px; background:rgba(128,128,128,.04); border-radius:4px; border:1px solid transparent; word-break:break-all; }
  .url-preview.has-params { color:var(--vscode-foreground); border-color:${badgeColor}22; }

  .params-box { background:var(--vscode-editorWidget-background,rgba(128,128,128,.05)); border:1px solid var(--vscode-widget-border,rgba(128,128,128,.18)); border-radius:var(--radius); padding:8px 12px; }
  .params-title { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--vscode-descriptionForeground); margin-bottom:6px; font-weight:600; }
  .param-row { display:flex; align-items:center; gap:8px; margin-bottom:5px; }
  .param-label { font-size:11px; font-family:monospace; color:${badgeColor}; min-width:80px; white-space:nowrap; }
  .param-input,.query-input,.header-input { flex:1; background:var(--vscode-input-background,rgba(128,128,128,.1)); color:var(--vscode-input-foreground,var(--vscode-foreground)); border:1px solid var(--vscode-input-border,rgba(128,128,128,.25)); border-radius:4px; padding:3px 8px; font-size:12px; font-family:monospace; outline:none; transition:border-color .12s; }
  .param-input:focus,.query-input:focus,.header-input:focus { border-color:${badgeColor}88; }
  .query-row,.header-row { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
  .sep { color:var(--vscode-descriptionForeground); font-size:12px; flex-shrink:0; }
  .icon-btn { background:none; border:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); color:var(--vscode-descriptionForeground); border-radius:4px; width:20px; height:20px; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all .1s; }
  .icon-btn:hover { color:${badgeColor}; border-color:${badgeColor}55; }
  .icon-btn.rm:hover { color:#ef4444; border-color:#ef444455; }
  .add-row-btn { background:none; border:1px dashed var(--vscode-widget-border,rgba(128,128,128,.3)); color:var(--vscode-descriptionForeground); border-radius:4px; padding:2px 10px; font-size:11px; cursor:pointer; margin-top:6px; display:inline-flex; align-items:center; gap:4px; transition:all .12s; font-family:var(--vscode-font-family,sans-serif); }
  .add-row-btn:hover { border-color:${badgeColor}55; color:${badgeColor}; }

  .collapse-toggle { background:none; border:none; cursor:pointer; width:100%; display:flex; align-items:center; gap:6px; padding:5px 0; color:var(--vscode-descriptionForeground); font-size:10px; text-transform:uppercase; letter-spacing:.5px; font-weight:600; font-family:var(--vscode-font-family,sans-serif); transition:color .12s; }
  .collapse-toggle:hover { color:var(--vscode-foreground); }
  .c-arrow { transition:transform .15s; font-size:8px; }
  .c-arrow.open { transform:rotate(90deg); }
  .collapsible { overflow:hidden; transition:max-height .2s ease; }
  .collapsible.closed { max-height:0 !important; }

  /* Response */
  .response-area { border-radius:var(--radius); overflow:hidden; border:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); animation:fadeIn .2s ease; }
  @keyframes fadeIn { from{opacity:0;transform:translateY(3px)}to{opacity:1} }
  .res-header { display:flex; align-items:center; gap:8px; padding:7px 12px; background:var(--vscode-editorWidget-background,rgba(128,128,128,.08)); border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,.15)); }
  .status-pill { font-size:11px; font-weight:700; font-family:monospace; padding:1px 8px; border-radius:20px; }
  .s2{background:#22c55e22;color:#22c55e;border:1px solid #22c55e44}
  .s3{background:#3b82f622;color:#3b82f6;border:1px solid #3b82f644}
  .s4{background:#f9731622;color:#f97316;border:1px solid #f9731644}
  .s5{background:#ef444422;color:#ef4444;border:1px solid #ef444444}
  .se{background:#88888822;color:#888;border:1px solid #88888844}
  .res-meta { font-size:11px; color:var(--vscode-descriptionForeground); margin-left:auto; display:flex; gap:10px; }
  .res-tabs { display:flex; border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,.15)); }
  .res-tab-btn { background:none; border:none; border-bottom:2px solid transparent; padding:4px 12px; font-size:11px; cursor:pointer; color:var(--vscode-descriptionForeground); font-family:var(--vscode-font-family,sans-serif); transition:all .12s; }
  .res-tab-btn.active { color:var(--vscode-foreground); border-bottom-color:${badgeColor}; }
  .res-body { padding:10px 12px; max-height:300px; overflow-y:auto; font-family:monospace; font-size:12px; line-height:1.6; white-space:pre-wrap; word-break:break-word; }
  .res-headers-table { width:100%; border-collapse:collapse; font-size:11px; }
  .res-headers-table tr:nth-child(even) { background:rgba(128,128,128,.04); }
  .res-headers-table td { padding:3px 8px; vertical-align:top; }
  .res-headers-table td:first-child { font-family:monospace; color:${badgeColor}; white-space:nowrap; width:1%; padding-right:16px; }
  .v-row { padding:5px 8px; border-radius:5px; font-size:12px; display:flex; align-items:flex-start; gap:8px; margin-bottom:5px; }
  .v-ok{background:#22c55e11;border:1px solid #22c55e33;color:#22c55e}
  .v-warn{background:#eab30811;border:1px solid #eab30833;color:#eab308}
  .v-fail{background:#ef444411;border:1px solid #ef444433;color:#ef4444}

  /* History */
  .hist-item { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:5px; cursor:pointer; font-size:11px; border:1px solid transparent; transition:all .1s; }
  .hist-item:hover { background:rgba(128,128,128,.08); border-color:var(--vscode-widget-border,rgba(128,128,128,.2)); }
  .hist-route { font-family:monospace; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .hist-time { color:var(--vscode-descriptionForeground); flex-shrink:0; font-size:10px; }

  /* Quick chips */
  .chips { display:flex; flex-wrap:wrap; gap:5px; }
  .chip { font-size:10px; padding:2px 8px; border-radius:20px; cursor:pointer; border:1px solid var(--vscode-widget-border,rgba(128,128,128,.25)); color:var(--vscode-descriptionForeground); background:none; transition:all .1s; font-family:var(--vscode-font-family,sans-serif); }
  .chip:hover { border-color:${badgeColor}66; color:${badgeColor}; background:${badgeColor}11; }

  .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:26px 0; color:var(--vscode-descriptionForeground); }
  .empty-icon { font-size:22px; opacity:.35; }
  .empty-label { font-size:11px; opacity:.65; text-align:center; }

  /* JSON */
  .jk{color:#7dd3fc} .js{color:#86efac} .jn{color:#fda4af} .jb{color:#d8b4fe} .jnull{color:#94a3b8}

  /* Toast */
  #toast { position:fixed; bottom:14px; right:14px; background:#22c55e22; color:#22c55e; border:1px solid #22c55e44; border-radius:6px; padding:5px 12px; font-size:11px; z-index:999; display:none; animation:fadeIn .2s ease; }
</style>
</head>
<body>

<div class="header">
  <span class="method-badge">${ep.method}</span>
  <span class="fn-name">${ep.functionName}</span>
  <span class="status-dot" title="${hasErrors ? 'Tiene errores' : hasWarnings ? 'Advertencias' : 'Sin problemas'}"></span>
</div>

${issuesHtml ? `<div class="issues-section">${issuesHtml}</div>` : ''}

<div class="meta-grid">
  <span class="meta-label">Ruta</span><span class="meta-value">${ep.route}</span>
  <span class="meta-label">Framework</span><span class="meta-value">${ep.framework}</span>
  <span class="meta-label">Archivo</span><span class="meta-value">${ep.fileName}</span>
  <span class="meta-label">Líneas</span><span class="meta-value">${ep.lineStart} → ${ep.lineEnd} <span style="color:var(--vscode-descriptionForeground)">(${ep.lineCount} líneas)</span></span>
  <span class="meta-label">Complejidad</span><span class="meta-value complexity-${ep.complexity ?? 'simple'}">${COMPLEXITY_ICON[ep.complexity ?? 'simple']} ${ep.complexity ?? '—'}</span>
</div>

<div>
  <div class="tab-row">
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('python',this)">Python</button>
      <button class="tab-btn" onclick="switchTab('curl',this)">cURL</button>
      ${isGetCapable ? `<button class="tab-btn" onclick="switchTab('test',this)">▶ Test GET</button>` : ''}
    </div>
    <button class="copy-btn" id="copyBtn" onclick="copyActive()">⎘ Copiar</button>
  </div>

  <div id="tab-python" class="tab-content active"><pre><code id="code-python">${escapedCode}</code></pre></div>
  <div id="tab-curl" class="tab-content"><pre><code id="code-curl">${escapedCurl}</code></pre></div>

  ${isGetCapable ? `
  <div id="tab-test" class="tab-content">
  <div class="postman-section">

    <!-- Server status banner -->
    <div class="server-banner">
      <div class="server-dot checking" id="serverDot"></div>
      <span class="server-label">Servidor: <strong id="serverUrlLabel">${detectedUrl}</strong>
        <span style="color:var(--vscode-descriptionForeground);font-size:10px;margin-left:4px">desde <em>${sourceLabel}</em></span>
      </span>
      <span class="server-confidence">${confidenceLabel}</span>
      <button class="ping-btn" onclick="pingServer()" title="Verificar si el servidor responde">↻ ping</button>
    </div>

    <!-- URL bar with smart dropdown -->
    <div class="url-bar">
      <span class="url-method-tag">GET</span>
      <select class="url-select" id="baseUrlSelect" onchange="onBaseChange()">
        ${candidateOptionsHtml}
        <option value="__custom__">⊕ otra URL…</option>
      </select>
      <input class="url-route-editable" id="routeEditable" type="text" value="${ep.route}" spellcheck="false" oninput="updateUrlPreview()" title="Edita la ruta directamente si necesitas" />
      <button class="run-btn" id="runBtn" onclick="runRequest()">
        <span class="spinner"></span><span class="btn-label">▶ Enviar</span>
      </button>
    </div>

    <!-- Full URL preview -->
    <div class="url-preview" id="urlPreview">${detectedUrl}${ep.route}</div>

    <!-- Route params (auto-generated) -->
    ${routeParams.length > 0 ? `
    <div class="params-box">
      <div class="params-title">Parámetros de ruta</div>
      ${paramsInputsHtml}
    </div>` : ''}

    <!-- Quick actions -->
    <div class="chips">
      <button class="chip" onclick="runRequest()">▶ Enviar ahora</button>
      <button class="chip" onclick="copyFullUrl()">⎘ Copiar URL</button>
      <button class="chip" onclick="copyCurlFull()">⎘ Copiar cURL</button>
      <button class="chip" onclick="openBrowser()">↗ Abrir en navegador</button>
      <button class="chip" onclick="clearHistory()">✕ Limpiar historial</button>
    </div>

    <!-- Query params -->
    <div>
      <button class="collapse-toggle" onclick="toggle('qSection',this)">
        <span class="c-arrow open">▶</span> Query Params
      </button>
      <div class="collapsible" id="qSection" style="max-height:300px">
        <div class="params-box">
          <div id="qBuilder">
            <div class="query-row">
              <input class="query-input" placeholder="clave" oninput="updateUrlPreview()" />
              <span class="sep">=</span>
              <input class="query-input" placeholder="valor" oninput="updateUrlPreview()" />
              <button class="icon-btn rm" onclick="rmRow(this,'.query-row')">−</button>
            </div>
          </div>
          <button class="add-row-btn" onclick="addQRow()">+ Agregar parámetro</button>
        </div>
      </div>
    </div>

    <!-- Headers -->
    <div>
      <button class="collapse-toggle" onclick="toggle('hSection',this)">
        <span class="c-arrow">▶</span> Headers
      </button>
      <div class="collapsible closed" id="hSection" style="max-height:300px">
        <div class="params-box">
          <div id="hBuilder">
            <div class="header-row">
              <input class="header-input" placeholder="Accept" value="Content-type" />
              <span class="sep">:</span>
              <input class="header-input" value="application/json" />
              <button class="icon-btn rm" onclick="rmRow(this,'.header-row')">−</button>
            </div>
          </div>
          <button class="add-row-btn" onclick="addHRow()">+ Agregar header</button>
        </div>
      </div>
    </div>

    <!-- Request history -->
    <div>
      <button class="collapse-toggle" onclick="toggle('histSection',this)">
        <span class="c-arrow">▶</span> Historial
      </button>
      <div class="collapsible closed" id="histSection" style="max-height:200px;overflow-y:auto">
        <div class="params-box" id="histList">
          <div class="empty-state" style="padding:10px 0"><span class="empty-icon">📋</span><span class="empty-label">Sin requests aún</span></div>
        </div>
      </div>
    </div>

    <!-- Response -->
    <div id="responseContainer">
      <div class="empty-state">
        <span class="empty-icon">📡</span>
        <span class="empty-label">Presiona ▶ Enviar para probar el endpoint<br><span style="font-size:10px;opacity:.6">URL detectada automáticamente desde tu código</span></span>
      </div>
    </div>

  </div>
  </div>
  ` : ''}
</div>

<div id="toast"></div>

<script>
const vscode = acquireVsCodeApi();
let activeTab = 'python';
const BASE_ROUTE = ${JSON.stringify(ep.route)};
const ROUTE_PARAMS = ${JSON.stringify(routeParams)};
const DETECTED_URL = ${JSON.stringify(detectedUrl)};
let history = [];

window.addEventListener('load', () => { pingServer(); updateUrlPreview(); });

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab, btn) {
  activeTab = tab;
  document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
  if (tab === 'test') { pingServer(); updateUrlPreview(); }
}
function copyActive() {
  const el = document.getElementById(activeTab === 'test' ? 'code-python' : 'code-' + activeTab);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => {
    const btn = document.getElementById('copyBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copiado'; btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  });
}

// ── Server ping ───────────────────────────────────────────────────────────────
async function pingServer() {
  const dot = document.getElementById('serverDot');
  const lbl = document.getElementById('serverUrlLabel');
  const base = getBase();
  dot.className = 'server-dot checking';
  lbl.textContent = base;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    await fetch(base + '/', { method:'GET', signal:ctrl.signal, mode:'no-cors' });
    clearTimeout(t);
    dot.className = 'server-dot live';
  } catch(e) {
    // AbortError = real timeout; others usually mean CORS rejection = server is alive
    dot.className = e.name === 'AbortError' ? 'server-dot dead' : 'server-dot live';
  }
}

// ── Base URL ──────────────────────────────────────────────────────────────────
function getBase() {
  const sel = document.getElementById('baseUrlSelect');
  if (!sel) return DETECTED_URL;
  if (sel.value === '__custom__') return DETECTED_URL;
  return sel.value.replace(/\\/+$/, '');
}
function onBaseChange() {
  const sel = document.getElementById('baseUrlSelect');
  if (sel.value === '__custom__') {
    const val = prompt('URL base del servidor:', DETECTED_URL);
    if (val) {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = val; opt.selected = true;
      sel.insertBefore(opt, sel.lastElementChild);
    } else { sel.value = DETECTED_URL; }
  }
  document.getElementById('serverUrlLabel').textContent = getBase();
  updateUrlPreview();
  pingServer();
}

// ── URL building ──────────────────────────────────────────────────────────────
function buildUrl() {
  const base = getBase();
  let route = document.getElementById('routeEditable')?.value || BASE_ROUTE;
  for (const p of ROUTE_PARAMS) {
    const val = encodeURIComponent(document.getElementById('param-' + p)?.value || p);
    route = route.replace(new RegExp('<(?:\\\\w+:)?' + p + '>', 'g'), val).replace(new RegExp('\\\\{' + p + '\\\\}', 'g'), val);
  }
  const qRows = document.querySelectorAll('#qBuilder .query-row');
  const params = [];
  for (const row of qRows) {
    const ins = row.querySelectorAll('.query-input');
    const k = ins[0]?.value.trim(); const v = ins[1]?.value.trim();
    if (k) params.push(encodeURIComponent(k) + '=' + encodeURIComponent(v || ''));
  }
  return base + route + (params.length ? '?' + params.join('&') : '');
}
function updateUrlPreview() {
  const url = buildUrl();
  const el = document.getElementById('urlPreview');
  if (el) { el.textContent = url; el.classList.toggle('has-params', url !== DETECTED_URL + BASE_ROUTE); }
}

// ── Row helpers ───────────────────────────────────────────────────────────────
function addQRow() {
  const d = document.createElement('div'); d.className = 'query-row';
  d.innerHTML = '<input class="query-input" placeholder="clave" oninput="updateUrlPreview()"/><span class="sep">=</span><input class="query-input" placeholder="valor" oninput="updateUrlPreview()"/><button class="icon-btn rm" onclick="rmRow(this,\\'.query-row\\')">−</button>';
  document.getElementById('qBuilder').appendChild(d);
}
function addHRow() {
  const d = document.createElement('div'); d.className = 'header-row';
  d.innerHTML = '<input class="header-input" placeholder="Header-Name"/><span class="sep">:</span><input class="header-input" placeholder="valor"/><button class="icon-btn rm" onclick="rmRow(this,\\'.header-row\\')">−</button>';
  document.getElementById('hBuilder').appendChild(d);
}
function rmRow(btn, sel) { btn.closest(sel).remove(); updateUrlPreview(); }
function toggle(id, btn) {
  const el = document.getElementById(id); const arr = btn.querySelector('.c-arrow');
  if (el.classList.contains('closed')) { el.classList.remove('closed'); arr.classList.add('open'); }
  else { el.classList.add('closed'); arr.classList.remove('open'); }
}

// ── Quick chips ───────────────────────────────────────────────────────────────
function copyFullUrl() { navigator.clipboard.writeText(buildUrl()); toast('URL copiada ✓'); }
function copyCurlFull() {
  const url = buildUrl();
  const headers = getHeaders();
  const h = Object.entries(headers).map(([k,v]) => \` \\\\\n  -H "\${k}: \${v}"\`).join('');
  navigator.clipboard.writeText(\`curl -X GET "\${url}"\${h}\`);
  toast('cURL copiado ✓');
}
function openBrowser() { vscode.postMessage({ command:'openExternal', url: buildUrl() }); }
function clearHistory() { history = []; renderHistory(); toast('Historial limpiado'); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2000);
}

// ── Headers ───────────────────────────────────────────────────────────────────
function getHeaders() {
  const h = {};
  document.querySelectorAll('#hBuilder .header-row').forEach(row => {
    const ins = row.querySelectorAll('.header-input');
    const k = ins[0]?.value.trim(); const v = ins[1]?.value.trim();
    if (k) h[k] = v;
  });
  return h;
}

// ── JSON highlight ────────────────────────────────────────────────────────────
function hlJson(json) {
  if (typeof json !== 'string') json = JSON.stringify(json, null, 2);
  return json.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, m => {
      let c = 'jn';
      if (/^"/.test(m)) c = /:$/.test(m) ? 'jk' : 'js';
      else if (/true|false/.test(m)) c = 'jb';
      else if (/null/.test(m)) c = 'jnull';
      return \`<span class="\${c}">\${m}</span>\`;
    });
}

// ── Validation ────────────────────────────────────────────────────────────────
function validate(status, body, elapsed) {
  const checks = [];
  if (status >= 200 && status < 300) checks.push({ ok:true, msg:\`HTTP \${status} — respuesta exitosa\` });
  else if (status >= 400 && status < 500) checks.push({ ok:false, msg:\`HTTP \${status} — error del cliente (ruta incorrecta o parámetros faltantes)\` });
  else if (status >= 500) checks.push({ ok:false, msg:\`HTTP \${status} — error del servidor (revisar logs del backend)\` });
  if (elapsed > 2000) checks.push({ ok:null, msg:\`Respuesta lenta: \${elapsed}ms (>2s)\` });
  else if (elapsed > 500) checks.push({ ok:null, msg:\`Tiempo aceptable pero podría optimizarse: \${elapsed}ms\` });
  else checks.push({ ok:true, msg:\`Respuesta rápida: \${elapsed}ms\` });
  try {
    const p = JSON.parse(body);
    if (Array.isArray(p)) checks.push({ ok:true, msg:\`JSON válido — array [\${p.length} elemento(s)]\` });
    else if (p && typeof p === 'object') checks.push({ ok:true, msg:\`JSON válido — objeto {\${Object.keys(p).length} clave(s)}\` });
    else checks.push({ ok:null, msg:\`JSON primitivo (\${typeof p})\` });
  } catch {
    const t = body.trim();
    if (t.startsWith('<')) checks.push({ ok:null, msg:'Respuesta HTML/XML (no JSON)' });
    else if (t === '') checks.push({ ok:null, msg:'Body vacío' });
    else checks.push({ ok:null, msg:'Texto plano / formato no reconocido' });
  }
  return checks;
}
function renderValidation(checks) {
  return checks.map(c => {
    const cls = c.ok === true ? 'v-ok' : c.ok === false ? 'v-fail' : 'v-warn';
    const icon = c.ok === true ? '✓' : c.ok === false ? '⊗' : '⚠';
    return \`<div class="v-row \${cls}"><span>\${icon}</span><span>\${c.msg}</span></div>\`;
  }).join('');
}

// ── History ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('histList');
  if (!list) return;
  if (!history.length) {
    list.innerHTML = '<div class="empty-state" style="padding:10px 0"><span class="empty-icon">📋</span><span class="empty-label">Sin requests aún</span></div>';
    return;
  }
  list.innerHTML = [...history].reverse().map((h, ri) => {
    const idx = history.length - 1 - ri;
    const cls = h.status >= 500 ? 's5' : h.status >= 400 ? 's4' : h.status >= 300 ? 's3' : h.status > 0 ? 's2' : 'se';
    return \`<div class="hist-item" onclick="loadHist(\${idx})">
      <span class="status-pill \${cls}" style="font-size:10px;padding:0 5px">\${h.status||'ERR'}</span>
      <span class="hist-route">\${h.url}</span>
      <span class="hist-time">\${h.elapsed}ms</span>
      <span class="hist-time">\${h.time}</span>
    </div>\`;
  }).join('');
}
function loadHist(idx) { const h = history[idx]; if (h) showRes(h.status, h.statusText, h.headers, h.body, h.elapsed); }

// ── Main request ──────────────────────────────────────────────────────────────
async function runRequest() {
  const url = buildUrl();
  const btn = document.getElementById('runBtn');
  btn.disabled = true; btn.classList.add('loading');
  const headers = getHeaders();
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method:'GET', headers });
    const elapsed = Math.round(performance.now() - t0);
    const resHeaders = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
    const body = await res.text();
    const now = new Date();
    history.push({ url, status:res.status, statusText:res.statusText, headers:resHeaders, body, elapsed, time:now.toLocaleTimeString() });
    if (history.length > 20) history.shift();
    renderHistory();
    showRes(res.status, res.statusText, resHeaders, body, elapsed);
  } catch(err) {
    const elapsed = Math.round(performance.now() - t0);
    history.push({ url, status:0, statusText:'Error', headers:{}, body:err.message, elapsed, time:new Date().toLocaleTimeString() });
    renderHistory();
    document.getElementById('responseContainer').innerHTML = \`
      <div class="response-area">
        <div class="res-header"><span class="status-pill se">Error de red</span><div class="res-meta"><span>⏱ \${elapsed}ms</span></div></div>
        <div class="res-body">
          <div class="v-row v-fail"><span></span><div><strong>No se pudo conectar</strong><div style="font-size:11px;opacity:.8">\${err.message}</div></div></div>
          <div class="v-row v-warn" style="margin-top:6px"><span>⚠</span><span>¿Está corriendo el servidor en <code>\${getBase()}</code>?<br>, si ya reviso y si esta corriendo ahi, puede por favor verificar que tenga los CORS activos </span></div>
        </div>
      </div>\`;
  }
  btn.disabled = false; btn.classList.remove('loading');
}

function showRes(status, statusText, resHeaders, body, elapsed) {
  const cls = status >= 500 ? 's5' : status >= 400 ? 's4' : status >= 300 ? 's3' : 's2';
  let fb = '', isJson = false;
  try { fb = hlJson(JSON.stringify(JSON.parse(body), null, 2)); isJson = true; }
  catch { fb = body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  const hHtml = Object.entries(resHeaders).map(([k,v]) => \`<tr><td>\${k}</td><td>\${String(v).replace(/</g,'&lt;')}</td></tr>\`).join('');
  const vHtml = renderValidation(validate(status, body, elapsed));
  const len = body.length > 1024 ? (body.length/1024).toFixed(1)+' KB' : body.length+' B';
  document.getElementById('responseContainer').innerHTML = \`
    <div class="response-area">
      <div class="res-header">
        <span class="status-pill \${cls}">\${status} \${statusText}</span>
        <div class="res-meta"><span>⏱ \${elapsed}ms</span><span>📦 \${len}</span></div>
      </div>
      <div class="res-tabs">
        <button class="res-tab-btn active" onclick="switchRes('rb',this)">Body\${isJson?' (JSON)':''}</button>
        <button class="res-tab-btn" onclick="switchRes('rh',this)">Headers (\${Object.keys(resHeaders).length})</button>
        <button class="res-tab-btn" onclick="switchRes('rv',this)">Validación</button>
      </div>
      <div id="rb" class="res-body">\${fb||'<span style="color:var(--vscode-descriptionForeground);font-style:italic">Sin body</span>'}</div>
      <div id="rh" class="res-body" style="display:none;padding:6px 0"><table class="res-headers-table">\${hHtml}</table></div>
      <div id="rv" class="res-body" style="display:none;padding:10px 12px">\${vHtml}</div>
    </div>\`;
}
function switchRes(tab, btn) {
  ['rb','rh','rv'].forEach(t => { const el = document.getElementById(t); if(el) el.style.display = t===tab?'block':'none'; });
  document.querySelectorAll('.res-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
</script>
</body>
</html>`;

  panel.webview.onDidReceiveMessage(msg => {
    if (msg.command === 'openExternal') vscode.env.openExternal(vscode.Uri.parse(msg.url));
  }, undefined, context.subscriptions);
}

// ─── Exportar ─────────────────────────────────────────────────────────────────

async function exportEndpoints(endpoints: Endpoint[], format: 'json' | 'markdown'): Promise<void> {
  if (!endpoints.length) { vscode.window.showWarningMessage('No hay endpoints para exportar.'); return; }
  let content: string; let ext: string;
  if (format === 'json') {
    content = JSON.stringify(endpoints.map(({ sourceCode: _, ...r }) => r), null, 2); ext = 'json';
  } else {
    const byCategory = new Map<string, Endpoint[]>();
    for (const ep of endpoints) { if (!byCategory.has(ep.category)) byCategory.set(ep.category, []); byCategory.get(ep.category)!.push(ep); }
    const lines = ['# Endpoints detectados\n'];
    for (const [cat, eps] of byCategory.entries()) {
      lines.push(`## ${cat}\n`, '| Estado | Método | Ruta | Función | Líneas | Archivo |', '|--------|--------|------|---------|--------|---------|');
      for (const ep of eps) {
        const s = ep.issues?.some(i => i.type === 'error') || ep.isDuplicate ? '🔴' : ep.issues?.some(i => i.type === 'warning') ? '🟡' : '🟢';
        lines.push(`| ${s} | \`${ep.method}\` | \`${ep.route}\` | \`${ep.functionName}\` | ${ep.lineStart}–${ep.lineEnd} | ${ep.fileName} |`);
      }
      lines.push('');
    }
    content = lines.join('\n'); ext = 'md';
  }
  const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`endpoints.${ext}`), filters: format === 'json' ? { 'JSON': ['json'] } : { 'Markdown': ['md'] } });
  if (!uri) return;
  fs.writeFileSync(uri.fsPath, content, 'utf8');
  const action = await vscode.window.showInformationMessage(`Exportado: ${path.basename(uri.fsPath)}`, 'Abrir');
  if (action === 'Abrir') vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
}

// ─── TreeView Provider ────────────────────────────────────────────────────────

export class EndpointProvider implements vscode.TreeDataProvider<EndpointItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<EndpointItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private endpoints: Endpoint[] = [];
  private groupBy: 'category' | 'file' = 'category';
  private filterMethod: string | null = null;
  private searchQuery = '';
  private showOnlyIssues = false;
  private statusBar: vscode.StatusBarItem;

  constructor(statusBar: vscode.StatusBarItem) { this.statusBar = statusBar; }
  refresh() { this.scan().then(() => this._onDidChangeTreeData.fire()); }
  setGroupBy(m: 'category' | 'file') { this.groupBy = m; this._onDidChangeTreeData.fire(); }
  setMethodFilter(m: string | null) { this.filterMethod = m; this._onDidChangeTreeData.fire(); }
  setSearch(q: string) { this.searchQuery = q.toLowerCase().trim(); this._onDidChangeTreeData.fire(); }
  setShowOnlyIssues(v: boolean) { this.showOnlyIssues = v; this._onDidChangeTreeData.fire(); }

  private get visible(): Endpoint[] {
    let eps = this.endpoints;
    if (this.filterMethod) eps = eps.filter(e => e.method === this.filterMethod);
    if (this.searchQuery) { const q = this.searchQuery; eps = eps.filter(e => e.functionName.toLowerCase().includes(q) || e.route.toLowerCase().includes(q) || e.method.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || e.fileName.toLowerCase().includes(q)); }
    if (this.showOnlyIssues) eps = eps.filter(e => (e.issues && e.issues.length > 0) || e.isDuplicate);
    return eps;
  }

  async scan() {
    this.endpoints = [];
    const wf = vscode.workspace.workspaceFolders;
    if (!wf) return;
    for (const folder of wf) {
      const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.py'), '**/node_modules/**');
      for (const f of files) { try { this.endpoints.push(...parseEndpoints(fs.readFileSync(f.fsPath, 'utf8'), f.fsPath)); } catch { /* skip */ } }
    }
    detectDuplicates(this.endpoints);
    for (const ep of this.endpoints) ep.issues = validateEndpoint(ep, this.endpoints);

    const errCnt = this.endpoints.filter(e => e.issues?.some(i => i.type === 'error')).length;
    const dupeCnt = this.endpoints.filter(e => e.isDuplicate).length;
    const warnCnt = this.endpoints.filter(e => e.issues?.some(i => i.type === 'warning')).length;
    const cnt = this.endpoints.length;
    let st = `$(symbol-method) ${cnt} endpoint${cnt !== 1 ? 's' : ''}`;
    if (errCnt > 0 || dupeCnt > 0) st += `  $(error) ${errCnt + dupeCnt}`;
    else if (warnCnt > 0) st += `  $(warning) ${warnCnt}`;
    this.statusBar.text = st;
    this.statusBar.tooltip = `${cnt} endpoints  •  ${errCnt} errores  •  ${dupeCnt} duplicados  •  ${warnCnt} advertencias`;

    if (errCnt > 0 || dupeCnt > 0) {
      const pl = [errCnt > 0 ? `${errCnt} error${errCnt !== 1 ? 'es' : ''}` : null, dupeCnt > 0 ? `${dupeCnt} duplicado${dupeCnt !== 1 ? 's' : ''}` : null].filter(Boolean).join(', ');
      const action = await vscode.window.showWarningMessage(`⚠ Endpoints con problemas: ${pl}`, 'Ver en panel');
      if (action === 'Ver en panel') vscode.commands.executeCommand('endpointCounter.showOnlyIssues');
    }
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === 'python') applyEditorDecorations(editor, this.endpoints);
    }
  }

  getTreeItem(el: EndpointItem) { return el; }
  getChildren(el?: EndpointItem): EndpointItem[] {
    if (!el) {
      const eps = this.visible;
      if (!eps.length) {
        const msg = this.searchQuery ? `Sin resultados para "${this.searchQuery}"` : this.filterMethod ? `No hay endpoints ${this.filterMethod}` : this.showOnlyIssues ? 'Sin problemas detectados ✓' : 'No se encontraron endpoints';
        return [new EndpointItem(msg, vscode.TreeItemCollapsibleState.None, 'summary')];
      }
      const errCnt = eps.filter(e => e.issues?.some(i => i.type === 'error') || e.isDuplicate).length;
      const sum = new EndpointItem(`${eps.length} endpoint${eps.length !== 1 ? 's' : ''}`, vscode.TreeItemCollapsibleState.None, 'summary');
      sum.description = this.summaryDesc();
      if (errCnt > 0) sum.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      return [sum, ...(this.groupBy === 'file' ? this.byFile() : this.byCategory())];
    }
    return el.children ?? [];
  }

  private summaryDesc() {
    const bm: Record<string,number> = {};
    for (const e of this.endpoints) bm[e.method] = (bm[e.method] ?? 0) + 1;
    const f = [this.searchQuery ? `🔍 "${this.searchQuery}"` : null, this.filterMethod ? `[${this.filterMethod}]` : null, this.showOnlyIssues ? '⚠ solo issues' : null].filter(Boolean);
    const ms = Object.entries(bm).map(([m,c]) => `${m}:${c}`).join('  ');
    return f.length ? `${ms}  •  ${f.join(' ')}` : ms;
  }
  private byCategory() {
    const m = new Map<string, Endpoint[]>();
    for (const e of this.visible) { if (!m.has(e.category)) m.set(e.category, []); m.get(e.category)!.push(e); }
    return Array.from(m.entries()).map(([cat, eps]) => {
      const ch = eps.map(e => new EndpointItem(e.functionName, vscode.TreeItemCollapsibleState.None, 'endpoint', e));
      const it = new EndpointItem(cat, vscode.TreeItemCollapsibleState.Expanded, 'category', undefined, ch);
      it.description = `${eps.length} endpoint${eps.length !== 1 ? 's' : ''}`;
      if (eps.some(e => e.issues?.some(i => i.type === 'error') || e.isDuplicate)) it.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      return it;
    });
  }
  private byFile() {
    const m = new Map<string, Endpoint[]>();
    for (const e of this.visible) { if (!m.has(e.filePath)) m.set(e.filePath, []); m.get(e.filePath)!.push(e); }
    return Array.from(m.entries()).map(([fp, eps]) => {
      const ch = eps.map(e => new EndpointItem(e.functionName, vscode.TreeItemCollapsibleState.None, 'endpoint', e));
      const it = new EndpointItem(path.basename(fp), vscode.TreeItemCollapsibleState.Expanded, 'file', undefined, ch);
      it.description = `${eps.length}`; it.tooltip = fp; return it;
    });
  }
  getAllEndpoints() { return this.endpoints; }
}

// ─── Activación ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = '$(symbol-method) Endpoints'; statusBar.command = 'endpointCounter.refresh'; statusBar.show();
  context.subscriptions.push(statusBar);

  const provider = new EndpointProvider(statusBar);
  context.subscriptions.push(vscode.window.createTreeView('endpointExplorer', { treeDataProvider: provider, showCollapseAll: true }));
  provider.refresh();

  const getServerCfg = () => vscode.workspace.workspaceFolders ? detectServerConfig(vscode.workspace.workspaceFolders) : undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand('endpointCounter.refresh', () => { provider.refresh(); vscode.window.showInformationMessage('Endpoints actualizados ✓'); }),
    vscode.commands.registerCommand('endpointCounter.scanWorkspace', async () => {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Escaneando endpoints...' }, async () => provider.refresh());
    }),
    vscode.commands.registerCommand('endpointCounter.goToLine', async (ep: Endpoint) => {
      const doc = await vscode.workspace.openTextDocument(ep.filePath);
      const editor = await vscode.window.showTextDocument(doc);
      const range = editor.document.lineAt(Math.max(0, ep.lineStart - 1)).range;
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }),
    vscode.commands.registerCommand('endpointCounter.search', async () => {
      const q = await vscode.window.showInputBox({ placeHolder: 'Buscar por nombre, ruta, método, archivo...', title: 'Buscar Endpoints', prompt: 'Deja vacío para limpiar.' });
      if (q !== undefined) provider.setSearch(q);
    }),
    vscode.commands.registerCommand('endpointCounter.filterByMethod', async () => {
      const all = provider.getAllEndpoints();
      const mc: Record<string,number> = {};
      for (const e of all) mc[e.method] = (mc[e.method] ?? 0) + 1;
      const items = [{ label: '$(close) Limpiar filtro', description: 'Mostrar todos', method: null as null }, ...Object.entries(mc).map(([m,c]) => ({ label: m, description: `${c} endpoints`, method: m }))];
      const p = await vscode.window.showQuickPick(items, { placeHolder: 'Filtrar por método HTTP' });
      if (p) provider.setMethodFilter(p.method);
    }),
    vscode.commands.registerCommand('endpointCounter.showOnlyIssues', () => { provider.setShowOnlyIssues(true); vscode.window.showInformationMessage('Mostrando solo endpoints con problemas.'); }),
    vscode.commands.registerCommand('endpointCounter.clearFilters', () => { provider.setSearch(''); provider.setMethodFilter(null); provider.setShowOnlyIssues(false); }),
    vscode.commands.registerCommand('endpointCounter.copyRoute', async (item: EndpointItem) => {
      if (!item.endpoint) return;
      const ep = item.endpoint;
      await vscode.env.clipboard.writeText(ep.route);
      const actions = ep.method === 'GET' ? ['▶ Test GET', 'Ver código', 'Ir al archivo'] : ['Ver código', 'Ir al archivo'];
      const action = await vscode.window.showInformationMessage(`✓ Ruta copiada: ${ep.route}`, ...actions);
      if (action === '▶ Test GET' || action === 'Ver código') showEndpointPreviewPanel(ep, context, getServerCfg());
      else if (action === 'Ir al archivo') vscode.commands.executeCommand('endpointCounter.goToLine', ep);
    }),
    vscode.commands.registerCommand('endpointCounter.peekCode', (item: EndpointItem) => {
      if (item.endpoint) showEndpointPreviewPanel(item.endpoint, context, getServerCfg());
    }),
    vscode.commands.registerCommand('endpointCounter.runGetTest', (item: EndpointItem) => {
      if (!item.endpoint) return;
      const ep = item.endpoint;
      if (ep.method !== 'GET' && ep.method !== 'GET/POST') {
        vscode.window.showWarningMessage(`El mini-Postman solo soporta GET por ahora. "${ep.functionName}" es ${ep.method}.`); return;
      }
      showEndpointPreviewPanel(ep, context, getServerCfg());
    }),
    vscode.commands.registerCommand('endpointCounter.copyCurl', async (item: EndpointItem) => {
      if (!item.endpoint) return;
      const ep = item.endpoint;
      let curl = `curl -X ${ep.method} "${(getServerCfg()?.baseUrl ?? 'http://localhost:5000') + ep.route}"`;
      if (['POST','PUT','PATCH'].includes(ep.method)) curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`;
      await vscode.env.clipboard.writeText(curl);
      vscode.window.showInformationMessage(`cURL copiado para ${ep.functionName}`);
    }),
    vscode.commands.registerCommand('endpointCounter.exportJson', () => exportEndpoints(provider.getAllEndpoints(), 'json')),
    vscode.commands.registerCommand('endpointCounter.exportMarkdown', () => exportEndpoints(provider.getAllEndpoints(), 'markdown')),
    vscode.commands.registerCommand('endpointCounter.groupByCategory', () => provider.setGroupBy('category')),
    vscode.commands.registerCommand('endpointCounter.groupByFile', () => provider.setGroupBy('file')),
    vscode.workspace.onDidSaveTextDocument(doc => { if (doc.languageId === 'python') provider.refresh(); }),
    vscode.window.onDidChangeActiveTextEditor(editor => { if (editor?.document.languageId === 'python') applyEditorDecorations(editor, provider.getAllEndpoints()); }),
  );
}

let _outputChannel: vscode.OutputChannel | undefined;
export function deactivate() { _outputChannel?.dispose(); }