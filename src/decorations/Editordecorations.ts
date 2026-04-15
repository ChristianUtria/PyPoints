import * as vscode from 'vscode';
import { Endpoint } from '../types';

export const decorError = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor('errorForeground'),
    fontStyle: 'italic',
    margin: '0 0 0 16px',
  },
  overviewRulerColor: new vscode.ThemeColor('errorForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

export const decorWarning = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor('editorWarning.foreground'),
    fontStyle: 'italic',
    margin: '0 0 0 16px',
  },
  overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

export function applyEditorDecorations(
  editor: vscode.TextEditor,
  endpoints: Endpoint[]
): void {
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
      errorDecorations.push({
        range,
        renderOptions: { after: { contentText: '   ' + messages.join('   ') } },
      });
    } else if (hasWarnings) {
      warnDecorations.push({
        range,
        renderOptions: {
          after: {
            contentText:
              '   ' +
              ep.issues!.filter(i => i.type === 'warning')
                .map(i => `⚠ ${i.message}`)
                .join('   '),
          },
        },
      });
    }
  }

  editor.setDecorations(decorError, errorDecorations);
  editor.setDecorations(decorWarning, warnDecorations);
}