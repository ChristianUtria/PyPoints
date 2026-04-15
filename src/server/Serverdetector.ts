import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ServerConfig } from '../types';

export function detectServerConfig(
  workspaceFolders: readonly vscode.WorkspaceFolder[]
): ServerConfig {
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

      const flaskRunMatch = content.match(/app\.run\s*\(([^)]*)\)/s);
      if (flaskRunMatch) {
        const args = flaskRunMatch[1];
        const portMatch = args.match(/port\s*=\s*(\d+)/);
        if (portMatch) { port = parseInt(portMatch[1], 10); confidence = 'high'; source = path.basename(filePath); }
        const hostMatch = args.match(/host\s*=\s*['"]([^'"]+)['"]/);
        if (hostMatch) { host = hostMatch[1] === '0.0.0.0' ? 'localhost' : hostMatch[1]; confidence = 'high'; }
        if (/ssl_context/.test(args)) useSSL = true;
      }

      const uvicornMatch = content.match(/uvicorn\.run\s*\(([^)]*)\)/s);
      if (uvicornMatch) {
        const args = uvicornMatch[1];
        const portMatch = args.match(/port\s*=\s*(\d+)/);
        if (portMatch) { port = parseInt(portMatch[1], 10); confidence = 'high'; source = path.basename(filePath); }
        const hostMatch = args.match(/host\s*=\s*['"]([^'"]+)['"]/);
        if (hostMatch) { host = hostMatch[1] === '0.0.0.0' ? 'localhost' : hostMatch[1]; }
        if (/ssl_keyfile|ssl_certfile/.test(args)) useSSL = true;
      }

      const envPortMatch = content.match(
        /os\.(?:environ|getenv)\s*(?:\[|\.get\s*\()\s*['"]PORT['"]\s*(?:\]|[,)])\s*(?:,\s*['"]?(\d+)['"]?)?/
      );
      if (envPortMatch && envPortMatch[1] && confidence === 'low') {
        port = parseInt(envPortMatch[1], 10); confidence = 'medium'; source = path.basename(filePath);
      }

      const djangoMatch = content.match(/runserver\s+(?:([\w.]+):)?(\d+)/);
      if (djangoMatch) {
        if (djangoMatch[1]) host = djangoMatch[1] === '0.0.0.0' ? 'localhost' : djangoMatch[1];
        if (djangoMatch[2]) port = parseInt(djangoMatch[2], 10);
        confidence = 'high'; source = path.basename(filePath);
      }

      if (confidence === 'low') {
        const portEnvLine = content.match(/^PORT\s*=\s*(\d+)/m);
        if (portEnvLine) { port = parseInt(portEnvLine[1], 10); confidence = 'medium'; source = path.basename(filePath); }
      }
    } catch { /* skip */ }
  }

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

  if (port === 443 || port === 8443) useSSL = true;
  if (port === 80 || port === 8080 || port === 5000 || port === 3000 || port === 8000) useSSL = false;

  const protocol = useSSL ? 'https' : 'http';
  const portSuffix = (useSSL && port === 443) || (!useSSL && port === 80) ? '' : `:${port}`;
  const baseUrl = `${protocol}://${host}${portSuffix}`;

  return { host, port, useSSL, baseUrl, confidence, source };
}