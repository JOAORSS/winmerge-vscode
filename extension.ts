import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as diff from 'diff';
import { parseFilterFile, shouldIncludeFile, shouldIncludeDir, FilterConfig } from './filterParser';
import { detectEncoding, compareFileContents, isOnlyEncodingDifference } from './encodingDetector';
import { getWebviewContent, WebviewRow, WebviewRowStatus, GridDefaults } from './webviewContent';
import { SidebarProvider } from './sidebarProvider';

interface WinMergeConfig {
    defaultFilters?: string[];
    encodingOverrides?: Record<string, string>;
    gridDefaults?: GridDefaults;
}

type IncomingMessage =
    | { command: 'openDiff'; base: string; target: string; fileName: string }
    | { command: 'navigateDir'; subDir: string }
    | { command: 'goUp' }
    | { command: 'copyFiles'; direction: 'toLeft' | 'toRight'; files: { base: string, target: string }[] };

function loadConfig(extensionPath: string): WinMergeConfig {
    const configPath = path.join(extensionPath, 'winmerge.config.json');
    try {
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(raw) as WinMergeConfig;
        }
    } catch {
    }
    return {};
}

function loadDefaultFilters(config: WinMergeConfig): FilterConfig | undefined {
    if (!config.defaultFilters || config.defaultFilters.length === 0) {
        return undefined;
    }

    let mergedFilter: FilterConfig | undefined;

    for (const filterPath of config.defaultFilters) {
        try {
            if (!fs.existsSync(filterPath)) {
                continue;
            }
            const filter = parseFilterFile(filterPath);
            if (!mergedFilter) {
                mergedFilter = filter;
            } else {
                mergedFilter.fileRules.push(...filter.fileRules);
                mergedFilter.dirRules.push(...filter.dirRules);
                mergedFilter.mode = filter.mode;
            }
        } catch {
        }
    }

    return mergedFilter;
}


interface LevelEntry {
    name: string;
    isDirectory: boolean;
}

async function collectCurrentLevel(
    rootDir: string,
    subDir: string,
    filter: FilterConfig | undefined
): Promise<LevelEntry[]> {
    const currentDir = path.join(rootDir, subDir);
    const results: LevelEntry[] = [];

    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const dirTestPath = '\\' + (subDir ? subDir.replace(/\//g, '\\') + '\\' : '') + entry.name;
            if (!shouldIncludeDir(dirTestPath, filter)) {
                continue;
            }
            results.push({ name: entry.name, isDirectory: true });
        } else if (entry.isFile()) {
            if (!shouldIncludeFile(entry.name, filter)) {
                continue;
            }
            results.push({ name: entry.name, isDirectory: false });
        }
    }

    return results;
}

async function compareCurrentLevel(
    basePath: string,
    targetPath: string,
    subDir: string,
    filter: FilterConfig | undefined,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<WebviewRow[]> {
    progress.report({ message: 'Scanning current level...' });

    const [baseEntries, targetEntries] = await Promise.all([
        collectCurrentLevel(basePath, subDir, filter),
        collectCurrentLevel(targetPath, subDir, filter)
    ]);

    const baseMap = new Map<string, LevelEntry>();
    for (const e of baseEntries) {
        baseMap.set(e.name, e);
    }

    const targetMap = new Map<string, LevelEntry>();
    for (const e of targetEntries) {
        targetMap.set(e.name, e);
    }

    const allNames = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()]));
    const rows: WebviewRow[] = [];
    const totalItems = allNames.length;
    let processed = 0;

    const CHUNK_SIZE = 10000;
    for (let i = 0; i < totalItems; i += CHUNK_SIZE) {
        const chunk = allNames.slice(i, i + CHUNK_SIZE);

        const chunkRows = await Promise.all(chunk.map(async (name) => {
            const inBase = baseMap.get(name);
            const inTarget = targetMap.get(name);

            const isDir = (inBase?.isDirectory ?? false) || (inTarget?.isDirectory ?? false);

            if (isDir) {
                let dirStatus: WebviewRowStatus;
                if (inBase && !inTarget) {
                    dirStatus = 'Left Only';
                } else if (!inBase && inTarget) {
                    dirStatus = 'Right Only';
                } else {
                    dirStatus = 'Directory';
                }
                return {
                    fileName: name,
                    relativePath: subDir ? `${subDir}/${name}` : name,
                    extension: '',
                    status: dirStatus,
                    basePath: path.join(basePath, subDir, name),
                    targetPath: path.join(targetPath, subDir, name),
                    encodingLeft: '',
                    encodingRight: '',
                    isDirectory: true,
                } as WebviewRow;
            }

            const extension = path.extname(name);
            const baseFilePath = path.join(basePath, subDir, name);
            const targetFilePath = path.join(targetPath, subDir, name);

            let status: WebviewRowStatus;
            let encodingLeft = '';
            let encodingRight = '';
            let bufA: Buffer | undefined;
            let bufB: Buffer | undefined;

            let statA: any;
            try { statA = inBase ? await fs.promises.stat(baseFilePath) : undefined; } catch { }
            let statB: any;
            try { statB = inTarget ? await fs.promises.stat(targetFilePath) : undefined; } catch { }

            if (name === 'csControlaVersao2.pas') {
                const debugA = await fs.promises.readFile(baseFilePath);
                const debugB = await fs.promises.readFile(targetFilePath);
                console.log(`Tamanho A: ${debugA.length}, Tamanho B: ${debugB.length}`);

                // Procura o primeiro byte que não bate
                for (let i = 0; i < Math.min(debugA.length, debugB.length); i++) {
                    if (debugA[i] !== debugB[i]) {
                        console.log(`Diferença no byte ${i}. Valor A: ${debugA[i]} (Char: ${String.fromCharCode(debugA[i])}), Valor B: ${debugB[i]} (Char: ${String.fromCharCode(debugB[i])})`);
                        break;
                    }
                }
            }

            if (inBase && inTarget && statA && statB && statA.size !== statB.size) {
                status = 'Different';
                const detectedLeft = await detectEncoding(baseFilePath);
                const detectedRight = await detectEncoding(targetFilePath);
                encodingLeft = detectedLeft;
                encodingRight = detectedRight;
            } else {
                if (inBase) {
                try { bufA = await fs.promises.readFile(baseFilePath); } catch { }
                }
                if (inTarget) {
                    try { bufB = await fs.promises.readFile(targetFilePath); } catch { }
                }

                if (inBase && !inTarget) {
                    status = 'Left Only';
                    encodingLeft = bufA ? await detectEncoding(bufA) : 'Unknown';
                } else if (!inBase && inTarget) {
                    status = 'Right Only';
                    encodingRight = bufB ? await detectEncoding(bufB) : 'Unknown';
                } else {
                    encodingLeft = bufA ? await detectEncoding(bufA) : 'Unknown';
                    encodingRight = bufB ? await detectEncoding(bufB) : 'Unknown';

                    if (!bufA || !bufB) {
                        status = 'Different';
                    } else if (bufA.equals(bufB)) {
                        status = 'Identical';
                    } else {
                        const onlyEncoding = await isOnlyEncodingDifference(bufA, bufB);
                        status = onlyEncoding ? 'Encoding Only' : 'Different';
                    }
                }
            }

            return {
                fileName: name,
                relativePath: subDir ? `${subDir}/${name}` : name,
                extension,
                status,
                basePath: baseFilePath,
                targetPath: targetFilePath,
                encodingLeft,
                encodingRight,
                isDirectory: false,
            } as WebviewRow;
        }));

        rows.push(...chunkRows);
        processed += chunk.length;

        progress.report({
            message: `Comparing... (${processed}/${totalItems})`,
            increment: (chunk.length / totalItems) * 100
        });
    }

    const sortOrder: Record<string, number> = {
        'Directory': 0,
        'Different': 1,
        'Encoding Only': 2,
        'Left Only': 3,
        'Right Only': 4,
        'Identical': 5,
    };

    rows.sort((a, b) => {
        const orderDiff = (sortOrder[a.status] ?? 99) - (sortOrder[b.status] ?? 99);
        if (orderDiff !== 0) { return orderDiff; }
        return a.fileName.localeCompare(b.fileName);
    });

    return rows;
}

export async function runComparison(
    basePath: string,
    targetPath: string,
    context: vscode.ExtensionContext
): Promise<void> {
    const config = loadConfig(context.extensionPath);
    let filter: FilterConfig | undefined = loadDefaultFilters(config);

    if (filter) {
        vscode.window.showInformationMessage(`Default filter loaded: ${filter.name || 'config filters'}`);
    } else {
        const filterAnswer = await vscode.window.showQuickPick(['No filter', 'Select .flt filter file'], {
            placeHolder: 'Do you want to apply a WinMerge filter file?'
        });

        if (filterAnswer === 'Select .flt filter file') {
            const filterFileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                openLabel: 'Select Filter File (.flt)',
                filters: {
                    'WinMerge Filter': ['flt'],
                    'All Files': ['*']
                }
            });

            if (filterFileUri && filterFileUri.length > 0) {
                try {
                    filter = parseFilterFile(filterFileUri[0].fsPath);
                    vscode.window.showInformationMessage(`Filter loaded: ${filter.name || 'Unnamed'}`);
                } catch (err) {
                    vscode.window.showWarningMessage(`Failed to parse filter file: ${err}`);
                }
            }
        }
    }

    let currentSubDir = '';

    const codiconsUri = vscode.Uri.joinPath(
        context.extensionUri,
        'node_modules',
        '@vscode',
        'codicons',
        'dist',
        'codicon.css'
    );

    const panel = vscode.window.createWebviewPanel(
        'winmergeCompare',
        'WinMerge: Folder Comparison',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    const gridDefaults: GridDefaults = {
        showIdentical: config.gridDefaults?.showIdentical ?? true,
        showDifferent: config.gridDefaults?.showDifferent ?? true,
        showEncodingOnly: config.gridDefaults?.showEncodingOnly ?? true,
        showLeftOnly: config.gridDefaults?.showLeftOnly ?? true,
        showRightOnly: config.gridDefaults?.showRightOnly ?? true,
    };

    const codiconsWebviewUri = panel.webview.asWebviewUri(codiconsUri);
    panel.webview.html = getWebviewContent(basePath, targetPath, codiconsWebviewUri.toString(), gridDefaults);

    const dirCache = new Map<string, WebviewRow[]>();

    async function runCompareAndSend(subDir: string): Promise<void> {
        const isRoot = subDir === '';
        const currentBase = subDir ? path.join(basePath, subDir) : basePath;
        const currentTarget = subDir ? path.join(targetPath, subDir) : targetPath;

        if (dirCache.has(subDir)) {
            const cachedRows = dirCache.get(subDir)!;
            panel.webview.postMessage({
                command: 'setData',
                rows: cachedRows,
                isRoot,
                currentSubDir: subDir,
                basePath: currentBase,
                targetPath: currentTarget,
            });
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'WinMerge: Comparing...',
                cancellable: false
            },
            async (progress) => {
                const rows = await compareCurrentLevel(basePath, targetPath, subDir, filter, progress);
                dirCache.set(subDir, rows);

                panel.webview.postMessage({
                    command: 'setData',
                    rows,
                    isRoot,
                    currentSubDir: subDir,
                    basePath: currentBase,
                    targetPath: currentTarget,
                });
            }
        );
    }

    await runCompareAndSend('');

    panel.webview.onDidReceiveMessage(
        async (message: IncomingMessage) => {

            switch (message.command) {
                case 'openDiff':

                    const baseUri = vscode.Uri.file(message.base);
                    const targetUri = vscode.Uri.file(message.target);
                    const title = `${message.fileName} (Base ↔ Alvo)`;
                    await vscode.commands.executeCommand('vscode.diff', baseUri, targetUri, title);
                    break;

                case 'navigateDir':

                    currentSubDir = message.subDir;
                    await runCompareAndSend(currentSubDir);
                    break;

                case 'goUp':

                    const parts = currentSubDir.split('/');
                    parts.pop();
                    currentSubDir = parts.join('/');
                    await runCompareAndSend(currentSubDir);
                    break;

                case 'copyFiles':

                    const filesToUpdate: string[] = [];
                    for (const filePair of message.files) {
                        try {
                            const src = message.direction === 'toLeft' ? filePair.target : filePair.base;
                            const dest = message.direction === 'toLeft' ? filePair.base : filePair.target;
                            if (await fs.pathExists(src)) {
                                await fs.copy(src, dest, { overwrite: true });
                            } else {
                                if (await fs.pathExists(dest)) {
                                    await fs.remove(dest);
                                }
                            }
                            filesToUpdate.push(filePair.base);
                        } catch (err) {
                            vscode.window.showErrorMessage(`Failed to copy: ${err}`);
                        }
                    }
                    dirCache.delete(currentSubDir);
                    panel.webview.postMessage({ command: 'filesCopied', files: filesToUpdate });
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

export function activate(context: vscode.ExtensionContext): void {
    const sidebarProvider = new SidebarProvider((basePath, targetPath) => {
        runComparison(basePath, targetPath, context);
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
    );

    const disposable = vscode.commands.registerCommand('winmerge-vscode.compareFolders', async () => {
        const baseFolderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Base Folder (Left)'
        });

        if (!baseFolderUri || baseFolderUri.length === 0) {
            return;
        }

        const targetFolderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Target Folder (Right)'
        });

        if (!targetFolderUri || targetFolderUri.length === 0) {
            return;
        }

        await runComparison(baseFolderUri[0].fsPath, targetFolderUri[0].fsPath, context);
    });

    const copyDiffToLeft = vscode.commands.registerCommand('winmerge-vscode.copyDiffToLeft', async () => {
        const editor = vscode.window.activeTextEditor;
        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (editor && tab && tab.input instanceof vscode.TabInputTextDiff) {
            try {
                const originalUri = tab.input.original;
                const modifiedUri = tab.input.modified;
                const originalDoc = await vscode.workspace.openTextDocument(originalUri);
                const modifiedDoc = await vscode.workspace.openTextDocument(modifiedUri);
                const originalContent = originalDoc.getText();
                const modifiedContent = modifiedDoc.getText();
                const diffs = diff.diffLines(originalContent, modifiedContent);
                const currentLine = editor.selection.active.line;
                let leftLine = 0;
                let rightLine = 0;
                let hunkFound = false;
                for (let i = 0; i < diffs.length; i++) {
                    const change = diffs[i];
                    if (!change.added && !change.removed) {
                        leftLine += change.count || 0;
                        rightLine += change.count || 0;
                        continue;
                    }
                    let hunkLeftStart = leftLine;
                    let hunkRightStart = rightLine;
                    let hunkRightLines: string[] = [];
                    while (i < diffs.length && (diffs[i].added || diffs[i].removed)) {
                        const c = diffs[i];
                        if (c.added) {
                            const lines = c.value.split(/\r?\n/);
                            if (lines[lines.length - 1] === '' && c.value.endsWith('\n')) lines.pop();
                            hunkRightLines.push(...lines);
                            rightLine += c.count || 0;
                        } else {
                            leftLine += c.count || 0;
                        }
                        i++;
                    }
                    i--;
                    let hunkLeftEnd = leftLine;
                    let hunkRightEnd = rightLine;
                    if ((currentLine >= hunkLeftStart && currentLine < hunkLeftEnd) || (currentLine >= hunkRightStart && currentLine < hunkRightEnd)) {
                        const edit = new vscode.WorkspaceEdit();
                        const range = originalDoc.validateRange(new vscode.Range(hunkLeftStart, 0, hunkLeftEnd, 0));
                        const newText = hunkRightLines.length > 0 ? hunkRightLines.join('\n') + '\n' : '';
                        edit.replace(originalUri, range, newText);
                        await vscode.workspace.applyEdit(edit);
                        hunkFound = true;
                        break;
                    }
                }
                if (!hunkFound) vscode.window.showInformationMessage('Cursor não está sobre um bloco diferente.');
            } catch (err) {
                vscode.window.showErrorMessage(`Error copying to left: ${err}`);
            }
        }
    });

    const copyDiffToRight = vscode.commands.registerCommand('winmerge-vscode.copyDiffToRight', async () => {
        const editor = vscode.window.activeTextEditor;
        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (editor && tab && tab.input instanceof vscode.TabInputTextDiff) {
            try {
                const originalUri = tab.input.original;
                const modifiedUri = tab.input.modified;
                const originalDoc = await vscode.workspace.openTextDocument(originalUri);
                const modifiedDoc = await vscode.workspace.openTextDocument(modifiedUri);
                const originalContent = originalDoc.getText();
                const modifiedContent = modifiedDoc.getText();
                const diffs = diff.diffLines(originalContent, modifiedContent);
                const currentLine = editor.selection.active.line;
                let leftLine = 0;
                let rightLine = 0;
                let hunkFound = false;
                for (let i = 0; i < diffs.length; i++) {
                    const change = diffs[i];
                    if (!change.added && !change.removed) {
                        leftLine += change.count || 0;
                        rightLine += change.count || 0;
                        continue;
                    }
                    let hunkLeftStart = leftLine;
                    let hunkRightStart = rightLine;
                    let hunkLeftLines: string[] = [];
                    while (i < diffs.length && (diffs[i].added || diffs[i].removed)) {
                        const c = diffs[i];
                        if (c.removed) {
                            const lines = c.value.split(/\r?\n/);
                            if (lines[lines.length - 1] === '' && c.value.endsWith('\n')) lines.pop();
                            hunkLeftLines.push(...lines);
                            leftLine += c.count || 0;
                        } else {
                            rightLine += c.count || 0;
                        }
                        i++;
                    }
                    i--;
                    let hunkLeftEnd = leftLine;
                    let hunkRightEnd = rightLine;
                    if ((currentLine >= hunkLeftStart && currentLine < hunkLeftEnd) || (currentLine >= hunkRightStart && currentLine < hunkRightEnd)) {
                        const edit = new vscode.WorkspaceEdit();
                        const range = modifiedDoc.validateRange(new vscode.Range(hunkRightStart, 0, hunkRightEnd, 0));
                        const newText = hunkLeftLines.length > 0 ? hunkLeftLines.join('\n') + '\n' : '';
                        edit.replace(modifiedUri, range, newText);
                        await vscode.workspace.applyEdit(edit);
                        hunkFound = true;
                        break;
                    }
                }
                if (!hunkFound) vscode.window.showInformationMessage('Cursor não está sobre um bloco diferente.');
            } catch (err) {
                vscode.window.showErrorMessage(`Error copying to right: ${err}`);
            }
        }
    });

    context.subscriptions.push(disposable, copyDiffToLeft, copyDiffToRight);
}

export function deactivate(): void { }
