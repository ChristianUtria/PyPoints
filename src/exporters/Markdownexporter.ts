import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Endpoint } from '../types';

export async function exportMarkdown(endpoints: Endpoint[]): Promise<void> {
  const byCategory = new Map<string, Endpoint[]>();
  for (const ep of endpoints) {
    if (!byCategory.has(ep.category)) byCategory.set(ep.category, []);
    byCategory.get(ep.category)!.push(ep);
  }

  const lines = ['# Endpoints detectados\n'];
  for (const [cat, eps] of byCategory.entries()) {
    lines.push(
      `## ${cat}\n`,
      '| Estado | Método | Ruta | Función | Líneas | Archivo |',
      '|--------|--------|------|---------|--------|---------|'
    );
    for (const ep of eps) {
      const s =
        ep.issues?.some(i => i.type === 'error') || ep.isDuplicate
          ? '🔴'
          : ep.issues?.some(i => i.type === 'warning')
          ? '🟡'
          : '🟢';
      lines.push(
        `| ${s} | \`${ep.method}\` | \`${ep.route}\` | \`${ep.functionName}\` | ${ep.lineStart}–${ep.lineEnd} | ${ep.fileName} |`
      );
    }
    lines.push('');
  }

  const content = lines.join('\n');
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('endpoints.md'),
    filters: { Markdown: ['md'] },
  });
  if (!uri) return;

  fs.writeFileSync(uri.fsPath, content, 'utf8');
  const action = await vscode.window.showInformationMessage(
    `Exportado: ${path.basename(uri.fsPath)}`,
    'Abrir'
  );
  if (action === 'Abrir') {
    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  }
}