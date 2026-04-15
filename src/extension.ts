import * as vscode from 'vscode';
import { EndpointProvider } from './providers/Endpointprovider';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = '$(symbol-method) Endpoints';
  statusBar.command = 'endpointCounter.refresh';
  statusBar.show();
  context.subscriptions.push(statusBar);

  const provider = new EndpointProvider(statusBar);
  context.subscriptions.push(
    vscode.window.createTreeView('endpointExplorer', {
      treeDataProvider: provider,
      showCollapseAll: true,
    })
  );

  registerCommands(context, provider);
  provider.refresh();
}

let _outputChannel: vscode.OutputChannel | undefined;
export function deactivate() {
  _outputChannel?.dispose();
}