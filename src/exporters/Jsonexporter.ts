import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Endpoint } from '../types';

export async function exportJson(endpoints: Endpoint[]): Promise<void> {
  const content = JSON.stringify(
    endpoints.map(({ sourceCode: _, ...r }) => r),
    null,
    2
  );

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('endpoints.json'),
    filters: { JSON: ['json'] },
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