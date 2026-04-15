import * as vscode from 'vscode';
import { Endpoint, ServerConfig } from '../types';
import { COMPLEXITY_ICON } from '../utils/complexity';
import { buildCandidateUrls } from '../server/Urlbuilder';

export function buildPreviewHtml(
  webview: vscode.Webview,
  ep: Endpoint,
  serverConfig: ServerConfig | undefined,
  gifUri: vscode.Uri,
  gifUri2: vscode.Uri
): string {
  const escapedCode = (ep.sourceCode ?? '# No disponible')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const methodBadgeColor: Record<string, string> = {
    GET: '#22c55e', POST: '#3b82f6', PUT: '#eab308', PATCH: '#f97316',
    DELETE: '#ef4444', HEAD: '#a855f7', OPTIONS: '#6b7280',
  };
  const badgeColor = methodBadgeColor[ep.method] ?? '#888';

  const hasErrors = ep.issues?.some(i => i.type === 'error') || ep.isDuplicate;
  const hasWarnings = ep.issues?.some(i => i.type === 'warning');

  let issuesHtml = '';
  if (ep.isDuplicate) {
    issuesHtml += `<div class="issue-banner issue-error"><span class="issue-icon">⊗</span><div><strong>Endpoint duplicado</strong><span>Colisiona con: <code>${ep.duplicateOf ?? 'desconocido'}</code></span></div></div>`;
  }
  if (ep.issues) {
    for (const issue of ep.issues) {
      issuesHtml += `<div class="issue-banner issue-${issue.type}"><span class="issue-icon">${issue.type === 'error' ? '⊗' : '⚠'}</span><div><span>${issue.message}</span></div></div>`;
    }
  }

  const detectedUrl = serverConfig?.baseUrl ?? 'http://localhost:5000';
  const confidenceLabel = serverConfig
    ? ({ high: '✓ detectado', medium: '~ inferido', low: '? default' })[serverConfig.confidence]
    : '? default';
  const confidenceColor = serverConfig
    ? ({ high: '#22c55e', medium: '#eab308', low: '#888' })[serverConfig.confidence]
    : '#888';
  const sourceLabel = serverConfig?.source ?? 'fallback';

  const routeParams = [
    ...ep.route.matchAll(/<(?:\w+:)?(\w+)>/g),
    ...ep.route.matchAll(/\{(\w+)\}/g),
  ].map(m => m[1]);

  const paramsInputsHtml = routeParams
    .map(
      p => `
    <div class="param-row">
      <label class="param-label">${p}</label>
      <input class="param-input" id="param-${p}" type="text" placeholder="valor" oninput="updateUrlPreview()" />
    </div>`
    )
    .join('');

  const candidateUrls = buildCandidateUrls(serverConfig);
  const candidateOptionsHtml = candidateUrls
    .map(u => `<option value="${u}"${u === detectedUrl ? ' selected' : ''}>${u}</option>`)
    .join('');

  const methodsWithBody = ['POST', 'PUT', 'PATCH'];
  const hasBodyByDefault = methodsWithBody.includes(ep.method.toUpperCase());

  const curlBody = hasBodyByDefault
    ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`
    : '';
  const escapedCurl = `curl -X ${ep.method} "${detectedUrl}${ep.route}"${curlBody}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const complexityBadge = COMPLEXITY_ICON[ep.complexity ?? 'simple'] ?? '';

  return /* html */ `<!DOCTYPE html>
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

  /* Method selector in URL bar */
  .method-select { background:var(--vscode-dropdown-background,rgba(0,0,0,.2)); color:var(--vscode-foreground); border:1px solid var(--vscode-widget-border,rgba(128,128,128,.35)); border-radius:4px; font-size:11px; font-weight:700; font-family:monospace; padding:2px 6px; cursor:pointer; outline:none; letter-spacing:.5px; transition:border-color .12s; flex-shrink:0; }
  .method-select:focus { border-color:${badgeColor}88; }
  .method-select option { background:var(--vscode-dropdown-background,#1e1e2e); color:var(--vscode-foreground); font-weight:700; }

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

  /* Body editor */
  .body-editor-wrap { display:flex; flex-direction:column; gap:6px; }
  .body-format-row { display:flex; align-items:center; gap:8px; }
  .body-format-label { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--vscode-descriptionForeground); font-weight:600; }
  .body-format-select { background:var(--vscode-dropdown-background,rgba(0,0,0,.2)); color:var(--vscode-foreground); border:1px solid var(--vscode-widget-border,rgba(128,128,128,.25)); border-radius:4px; font-size:11px; padding:2px 6px; outline:none; cursor:pointer; font-family:var(--vscode-font-family,sans-serif); }
  .body-format-select:focus { border-color:${badgeColor}88; }
  .body-textarea { width:100%; min-height:120px; max-height:280px; resize:vertical; background:var(--vscode-input-background,rgba(128,128,128,.1)); color:var(--vscode-input-foreground,var(--vscode-foreground)); border:1px solid var(--vscode-input-border,rgba(128,128,128,.25)); border-radius:var(--radius); padding:8px 10px; font-size:12px; font-family:var(--vscode-editor-font-family,monospace); line-height:1.6; outline:none; transition:border-color .12s; tab-size:2; }
  .body-textarea:focus { border-color:${badgeColor}88; }
  .body-actions { display:flex; gap:6px; align-items:center; }
  .body-action-btn { background:none; border:1px solid var(--vscode-widget-border,rgba(128,128,128,.2)); color:var(--vscode-descriptionForeground); border-radius:4px; padding:2px 8px; font-size:10px; cursor:pointer; transition:all .12s; font-family:var(--vscode-font-family,sans-serif); }
  .body-action-btn:hover { border-color:${badgeColor}55; color:${badgeColor}; }
  .body-validation { font-size:10px; padding:2px 8px; border-radius:3px; display:none; }
  .body-valid { background:#22c55e11; color:#22c55e; border:1px solid #22c55e33; display:inline-block; }
  .body-invalid { background:#ef444411; color:#ef4444; border:1px solid #ef444433; display:inline-block; }

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
  .hist-method { font-size:9px; font-weight:700; font-family:monospace; padding:1px 5px; border-radius:3px; flex-shrink:0; }
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
      <button class="tab-btn" onclick="switchTab('test',this)">▶ Test</button>
    </div>
    <button class="copy-btn" id="copyBtn" onclick="copyActive()">⎘ Copiar</button>
  </div>

  <div id="tab-python" class="tab-content active"><pre><code id="code-python">${escapedCode}</code></pre></div>
  <div id="tab-curl" class="tab-content"><pre><code id="code-curl">${escapedCurl}</code></pre></div>

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

    <!-- URL bar with method selector + smart dropdown -->
    <div class="url-bar">
      <select class="method-select" id="methodSelect" onchange="onMethodChange()" title="Método HTTP">
        <option value="GET"${ep.method === 'GET' ? ' selected' : ''}>GET</option>
        <option value="POST"${ep.method === 'POST' ? ' selected' : ''}>POST</option>
        <option value="PUT"${ep.method === 'PUT' ? ' selected' : ''}>PUT</option>
        <option value="PATCH"${ep.method === 'PATCH' ? ' selected' : ''}>PATCH</option>
        <option value="DELETE"${ep.method === 'DELETE' ? ' selected' : ''}>DELETE</option>
        <option value="HEAD"${ep.method === 'HEAD' ? ' selected' : ''}>HEAD</option>
        <option value="OPTIONS"${ep.method === 'OPTIONS' ? ' selected' : ''}>OPTIONS</option>
      </select>
      <select class="url-select" id="baseUrlSelect" onchange="onBaseChange()">
        ${candidateOptionsHtml}
        <option value="__custom__"> + otra URL…</option>
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

    <!-- Request Body (POST/PUT/PATCH) -->
    <div id="bodySection">
      <button class="collapse-toggle" onclick="toggle('bodyContent',this)" id="bodyToggle">
        <span class="c-arrow ${hasBodyByDefault ? 'open' : ''}">▶</span> Body
        <span id="bodyMethodHint" style="margin-left:4px;font-size:9px;opacity:.6"></span>
      </button>
      <div class="collapsible ${hasBodyByDefault ? '' : 'closed'}" id="bodyContent" style="max-height:500px">
        <div class="params-box">
          <div class="body-format-row">
            <span class="params-title" style="margin:0">Formato</span>
            <select class="body-format-select" id="bodyFormat" onchange="onBodyFormatChange()">
              <option value="json" selected>JSON</option>
              <option value="form">Form URL-encoded</option>
              <option value="text">Texto plano</option>
              <option value="none">Sin body</option>
            </select>
            <span id="bodyValidation" class="body-validation"></span>
          </div>
          <div id="bodyEditorWrap" class="body-editor-wrap" style="margin-top:8px">
            <textarea
              class="body-textarea"
              id="bodyTextarea"
              spellcheck="false"
              placeholder='{\n  "key": "value"\n}'
              oninput="validateBody()"
            ></textarea>
            <div class="body-actions">
              <button class="body-action-btn" onclick="formatBody()">⎄ Formatear JSON</button>
              <button class="body-action-btn" onclick="clearBody()">✕ Limpiar</button>
              <button class="body-action-btn" onclick="copyBody()">⎘ Copiar body</button>
            </div>
          </div>
        </div>
      </div>
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
          <div class="empty-state" style="padding:10px 0"><span class="empty-icon"><img src="${gifUri2}" alt="tower icon" width="40"></span><span class="empty-label">Sin requests aún</span></div>
        </div>
      </div>
    </div>

    <!-- Response -->
    <div id="responseContainer">
      <div class="empty-state">
        <span class="empty-icon"><img src="${gifUri}" alt="tower icon" width="90"></span>
        <span class="empty-label">Presiona ▶ Enviar para probar el endpoint<br><span style="font-size:10px;opacity:.6">URL detectada automáticamente desde tu código</span></span>
      </div>
    </div>

  </div>
  </div>
</div>

<div id="toast"></div>

<script>
const vscode = acquireVsCodeApi();
let activeTab = 'python';
const BASE_ROUTE = ${JSON.stringify(ep.route)};
const ROUTE_PARAMS = ${JSON.stringify(routeParams)};
const DETECTED_URL = ${JSON.stringify(detectedUrl)};
const EP_METHOD = ${JSON.stringify(ep.method)};
const METHOD_COLORS = {
  GET:'#22c55e', POST:'#3b82f6', PUT:'#eab308', PATCH:'#f97316',
  DELETE:'#ef4444', HEAD:'#a855f7', OPTIONS:'#6b7280'
};
let history = [];

window.addEventListener('load', () => {
  pingServer();
  updateUrlPreview();
  updateMethodColor();
  updateBodyVisibility();
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(tab, btn) {
  activeTab = tab;
  document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
  if (tab === 'test') { pingServer(); updateUrlPreview(); }
  if (tab === 'curl') { updateCurlPreview(); }
}
function copyActive() {
  let text = '';
  if (activeTab === 'curl') {
    text = buildCurlCommand();
  } else {
    const el = document.getElementById('code-' + activeTab);
    text = el ? el.innerText : '';
  }
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copiado'; btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  });
}

// ── Method change ─────────────────────────────────────────────────────────────
function getCurrentMethod() {
  return (document.getElementById('methodSelect')?.value || EP_METHOD).toUpperCase();
}
function onMethodChange() {
  updateMethodColor();
  updateBodyVisibility();
  updateCurlPreview();
}
function updateMethodColor() {
  const sel = document.getElementById('methodSelect');
  if (!sel) return;
  const m = sel.value.toUpperCase();
  const color = METHOD_COLORS[m] || '#888';
  sel.style.color = color;
  sel.style.borderColor = color + '88';
}
function updateBodyVisibility() {
  const m = getCurrentMethod();
  const withBody = ['POST','PUT','PATCH'].includes(m);
  const hint = document.getElementById('bodyMethodHint');
  if (hint) hint.textContent = withBody ? '' : '(no aplica para ' + m + ')';
  // Auto-open body section for methods that typically have body
  const bodyContent = document.getElementById('bodyContent');
  const arrow = document.querySelector('#bodySection .c-arrow');
  if (bodyContent && arrow) {
    if (withBody) { bodyContent.classList.remove('closed'); arrow.classList.add('open'); }
    else { bodyContent.classList.add('closed'); arrow.classList.remove('open'); }
  }
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

// ── cURL preview ──────────────────────────────────────────────────────────────
function buildCurlCommand() {
  const url = buildUrl();
  const method = getCurrentMethod();
  const headers = getHeaders();
  const withBody = ['POST','PUT','PATCH'].includes(method);
  const format = document.getElementById('bodyFormat')?.value || 'json';
  const bodyText = document.getElementById('bodyTextarea')?.value?.trim() || '';

  let h = Object.entries(headers).map(([k,v]) => \` \\\\\n  -H "\${k}: \${v}"\`).join('');

  let bodyPart = '';
  if (withBody && format !== 'none') {
    if (format === 'json') {
      if (!h.includes('Content-Type')) h += \` \\\\\n  -H "Content-Type: application/json"\`;
      const body = bodyText || '{}';
      bodyPart = \` \\\\\n  -d '\${body.replace(/'/g, "'\\\\''")}'\`;
    } else if (format === 'form') {
      if (!h.includes('Content-Type')) h += \` \\\\\n  -H "Content-Type: application/x-www-form-urlencoded"\`;
      bodyPart = bodyText ? \` \\\\\n  --data-urlencode '\${bodyText}'\` : '';
    } else if (format === 'text') {
      if (!h.includes('Content-Type')) h += \` \\\\\n  -H "Content-Type: text/plain"\`;
      bodyPart = bodyText ? \` \\\\\n  -d '\${bodyText.replace(/'/g, "'\\\\''")}'\` : '';
    }
  }

  return \`curl -X \${method} "\${url}"\${h}\${bodyPart}\`;
}
function updateCurlPreview() {
  const el = document.getElementById('code-curl');
  if (el) el.textContent = buildCurlCommand();
}

// ── Body editor ───────────────────────────────────────────────────────────────
function onBodyFormatChange() {
  const fmt = document.getElementById('bodyFormat')?.value;
  const wrap = document.getElementById('bodyEditorWrap');
  const ta = document.getElementById('bodyTextarea');
  if (!ta) return;
  if (fmt === 'none') { if (wrap) wrap.style.display = 'none'; return; }
  if (wrap) wrap.style.display = 'flex';
  if (fmt === 'json') ta.placeholder = '{\\n  "key": "value"\\n}';
  else if (fmt === 'form') ta.placeholder = 'key=value&other=123';
  else ta.placeholder = 'Texto libre...';
  validateBody();
}
function validateBody() {
  const fmt = document.getElementById('bodyFormat')?.value;
  const ta = document.getElementById('bodyTextarea');
  const badge = document.getElementById('bodyValidation');
  if (!ta || !badge || fmt !== 'json') { if (badge) { badge.className = 'body-validation'; badge.textContent = ''; } return; }
  const val = ta.value.trim();
  if (!val) { badge.className = 'body-validation'; badge.textContent = ''; return; }
  try {
    JSON.parse(val);
    badge.className = 'body-validation body-valid'; badge.textContent = '✓ JSON válido';
  } catch(e) {
    badge.className = 'body-validation body-invalid'; badge.textContent = '⊗ ' + e.message.split('\\n')[0];
  }
}
function formatBody() {
  const ta = document.getElementById('bodyTextarea');
  if (!ta) return;
  try {
    ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
    validateBody();
    toast('JSON formateado ✓');
  } catch { toast('No es JSON válido'); }
}
function clearBody() {
  const ta = document.getElementById('bodyTextarea');
  if (ta) { ta.value = ''; validateBody(); }
}
function copyBody() {
  const ta = document.getElementById('bodyTextarea');
  if (ta) { navigator.clipboard.writeText(ta.value); toast('Body copiado ✓'); }
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
function copyCurlFull() { navigator.clipboard.writeText(buildCurlCommand()); toast('cURL copiado ✓'); }
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

// ── Build fetch options ───────────────────────────────────────────────────────
function buildFetchOptions() {
  const method = getCurrentMethod();
  const headers = getHeaders();
  const withBody = ['POST','PUT','PATCH'].includes(method);
  const format = document.getElementById('bodyFormat')?.value || 'json';
  const bodyText = document.getElementById('bodyTextarea')?.value?.trim() || '';
  const opts = { method, headers: { ...headers } };

  if (withBody && format !== 'none') {
    if (format === 'json') {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      opts.body = bodyText || '{}';
    } else if (format === 'form') {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/x-www-form-urlencoded';
      opts.body = bodyText;
    } else if (format === 'text') {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'text/plain';
      opts.body = bodyText;
    }
  }
  return opts;
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
function validate(status, body, elapsed, method) {
  const checks = [];
  if (status >= 200 && status < 300) checks.push({ ok:true, msg:\`HTTP \${status} — respuesta exitosa\` });
  else if (status === 405) checks.push({ ok:false, msg:\`HTTP 405 — Método \${method} no permitido en esta ruta\` });
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
    const mColor = METHOD_COLORS[h.method] || '#888';
    return \`<div class="hist-item" onclick="loadHist(\${idx})">
      <span class="hist-method" style="background:\${mColor}22;color:\${mColor};border:1px solid \${mColor}44">\${h.method}</span>
      <span class="status-pill \${cls}" style="font-size:10px;padding:0 5px">\${h.status||'ERR'}</span>
      <span class="hist-route">\${h.url}</span>
      <span class="hist-time">\${h.elapsed}ms</span>
      <span class="hist-time">\${h.time}</span>
    </div>\`;
  }).join('');
}
function loadHist(idx) { const h = history[idx]; if (h) showRes(h.status, h.statusText, h.headers, h.body, h.elapsed, h.method); }

// ── Main request ──────────────────────────────────────────────────────────────
async function runRequest() {
  const url = buildUrl();
  const btn = document.getElementById('runBtn');
  btn.disabled = true; btn.classList.add('loading');
  const opts = buildFetchOptions();
  const t0 = performance.now();
  try {
    const res = await fetch(url, opts);
    const elapsed = Math.round(performance.now() - t0);
    const resHeaders = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
    const body = await res.text();
    const now = new Date();
    history.push({ url, method:opts.method, status:res.status, statusText:res.statusText, headers:resHeaders, body, elapsed, time:now.toLocaleTimeString() });
    if (history.length > 20) history.shift();
    renderHistory();
    showRes(res.status, res.statusText, resHeaders, body, elapsed, opts.method);
  } catch(err) {
    const elapsed = Math.round(performance.now() - t0);
    history.push({ url, method:opts.method, status:0, statusText:'Error', headers:{}, body:err.message, elapsed, time:new Date().toLocaleTimeString() });
    renderHistory();
    document.getElementById('responseContainer').innerHTML = \`
      <div class="response-area">
        <div class="res-header"><span class="status-pill se">Error de red</span><div class="res-meta"><span>⏱ \${elapsed}ms</span></div></div>
        <div class="res-body">
          <div class="v-row v-fail"><span>⊗</span><div><strong>No se pudo conectar</strong><div style="font-size:11px;opacity:.8">\${err.message}</div></div></div>
          <div class="v-row v-warn" style="margin-top:6px"><span>⚠</span><span>¿Está corriendo el servidor en <code>\${getBase()}</code>? Si ya lo verificaste, revisa que tenga CORS activos.</span></div>
        </div>
      </div>\`;
  }
  btn.disabled = false; btn.classList.remove('loading');
}

function showRes(status, statusText, resHeaders, body, elapsed, method) {
  const cls = status >= 500 ? 's5' : status >= 400 ? 's4' : status >= 300 ? 's3' : 's2';
  let fb = '', isJson = false;
  try { fb = hlJson(JSON.stringify(JSON.parse(body), null, 2)); isJson = true; }
  catch { fb = body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  const hHtml = Object.entries(resHeaders).map(([k,v]) => \`<tr><td>\${k}</td><td>\${String(v).replace(/</g,'&lt;')}</td></tr>\`).join('');
  const vHtml = renderValidation(validate(status, body, elapsed, method || getCurrentMethod()));
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
}