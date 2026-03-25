import * as vscode from 'vscode';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'winmerge-vscode-sidebar';

    private _view?: vscode.WebviewView;
    private _onCompare: (basePath: string, targetPath: string) => void;

    constructor(onCompare: (basePath: string, targetPath: string) => void) {
        this._onCompare = onCompare;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this._getHtml();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'browse') {
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: message.target === 'base'
                        ? 'Select Base Folder (Left)'
                        : 'Select Target Folder (Right)',
                });
                if (folderUri && folderUri.length > 0) {
                    webviewView.webview.postMessage({
                        command: 'setPath',
                        target: message.target,
                        path: folderUri[0].fsPath,
                    });
                }
            } else if (message.command === 'compare') {
                const basePath = (message.basePath || '').trim();
                const targetPath = (message.targetPath || '').trim();
                if (!basePath || !targetPath) {
                    vscode.window.showWarningMessage('WinMerge: Please fill in both folder paths.');
                    return;
                }
                this._onCompare(basePath, targetPath);
            }
        });
    }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
body {
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    padding: 14px 12px;
}
.section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
}
.field-group {
    margin-bottom: 14px;
}
.field-row {
    display: flex;
    gap: 4px;
    align-items: center;
}
.field-row input[type="text"] {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border: 1px solid var(--vscode-input-border, transparent);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
    font-size: 12px;
    border-radius: 2px;
    outline: none;
}
.field-row input[type="text"]:focus {
    border-color: var(--vscode-focusBorder);
}
.btn-browse {
    flex-shrink: 0;
    padding: 4px 8px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    white-space: nowrap;
}
.btn-browse:hover {
    background: var(--vscode-list-hoverBackground);
}
.btn-compare {
    width: 100%;
    padding: 8px 0;
    margin-top: 6px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 2px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.02em;
}
.btn-compare:hover {
    background: var(--vscode-button-hoverBackground);
}
</style>
</head>
<body>
<div class="field-group">
    <div class="section-title">Base Folder (Left)</div>
    <div class="field-row">
        <input type="text" id="basePath" placeholder="Path..." />
        <button class="btn-browse" id="browseBase">Browse</button>
    </div>
</div>
<div class="field-group">
    <div class="section-title">Target Folder (Right)</div>
    <div class="field-row">
        <input type="text" id="targetPath" placeholder="Path..." />
        <button class="btn-browse" id="browseTarget">Browse</button>
    </div>
</div>
<button class="btn-compare" id="btnCompare">Compare</button>
<script>
(function() {
    var vscode = acquireVsCodeApi();
    var baseInput = document.getElementById('basePath');
    var targetInput = document.getElementById('targetPath');

    document.getElementById('browseBase').addEventListener('click', function() {
        vscode.postMessage({ command: 'browse', target: 'base' });
    });

    document.getElementById('browseTarget').addEventListener('click', function() {
        vscode.postMessage({ command: 'browse', target: 'target' });
    });

    document.getElementById('btnCompare').addEventListener('click', function() {
        vscode.postMessage({
            command: 'compare',
            basePath: baseInput.value,
            targetPath: targetInput.value
        });
    });

    window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.command === 'setPath') {
            if (msg.target === 'base') {
                baseInput.value = msg.path;
            } else if (msg.target === 'target') {
                targetInput.value = msg.path;
            }
        }
    });
})();
</script>
</body>
</html>`;
    }
}
