import * as vscode from 'vscode';
import { Endpoint, ItemKind } from '../types';
import { COMPLEXITY_ICON } from '../utils/complexity';
import { getMethodIcon, getMethodColor } from '../utils/Methodicons';
import { buildCodePreview } from '../utils/Codepreview';

export class EndpointItem extends vscode.TreeItem {
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
        issuesSection =
          '\n\n---\n\n**Problemas detectados:**\n\n' +
          endpoint.issues
            .map(
              i =>
                `${i.type === 'error' ? '$(error)' : '$(warning)'} ${i.message}`
            )
            .join('\n\n');
      }
      if (isDupe) issuesSection += `\n\n$(copy) **Duplicado de:** \`${endpoint.duplicateOf}\``;

      this.tooltip = new vscode.MarkdownString(
        `### \`${endpoint.functionName}\`\n\n` +
          `| | |\n|---|---|\n` +
          `| **Ruta** | \`${endpoint.route}\` |\n` +
          `| **Método** | \`${endpoint.method}\` |\n` +
          `| **Framework** | ${endpoint.framework} |\n` +
          `| **Líneas** | ${endpoint.lineStart} → ${endpoint.lineEnd} *(${endpoint.lineCount} líneas)* |\n` +
          `| **Complejidad** | ${complexityBadge} ${endpoint.complexity ?? '—'} |\n` +
          `| **Archivo** | \`${endpoint.fileName}\` |` +
          issuesSection +
          `\n\n---\n\n\`\`\`python\n${preview}\n\`\`\``
      );
      this.tooltip.isTrusted = true;
      this.tooltip.supportThemeIcons = true;

      if (hasErrors) {
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      } else if (isDupe || hasWarnings) {
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
        arguments: [endpoint],
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