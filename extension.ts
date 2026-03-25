import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
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
    | { command: 'goUp' };

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

function applyEncodingOverride(
    detectedEncoding: string,
    fileName: string,
    overrides: Record<string, string> | undefined
): string {
    if (!overrides) {
        return detectedEncoding;
    }
    const ext = path.extname(fileName).toLowerCase();
    if (overrides[ext]) {
        return overrides[ext];
    }
    return detectedEncoding;
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
    encodingOverrides: Record<string, string> | undefined,
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

    const CHUNK_SIZE = 200;
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
                    basePath: inBase ? path.join(basePath, subDir, name) : '',
                    targetPath: inTarget ? path.join(targetPath, subDir, name) : '',
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
            if (inBase) {
                try { bufA = await fs.promises.readFile(baseFilePath); } catch {}
            }

            let bufB: Buffer | undefined;
            if (inTarget) {
                try { bufB = await fs.promises.readFile(targetFilePath); } catch {}
            }

            if (inBase && !inTarget) {
                status = 'Left Only';
                const detected = await detectEncoding(bufA);
                encodingLeft = applyEncodingOverride(detected, name, encodingOverrides);
            } else if (!inBase && inTarget) {
                status = 'Right Only';
                const detected = await detectEncoding(bufB);
                encodingRight = applyEncodingOverride(detected, name, encodingOverrides);
            } else {
                const detectedLeft = await detectEncoding(bufA);
                const detectedRight = await detectEncoding(bufB);
                encodingLeft = applyEncodingOverride(detectedLeft, name, encodingOverrides);
                encodingRight = applyEncodingOverride(detectedRight, name, encodingOverrides);

                if (!bufA || !bufB) {
                    status = 'Different';
                } else {
                    const contentResult = await compareFileContents(bufA, bufB);

                    if (contentResult === 'identical') {
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
                basePath: inBase ? baseFilePath : '',
                targetPath: inTarget ? targetFilePath : '',
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

    // Cache rows per subDir to avoid rescanning previously visited directories
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
                const rows = await compareCurrentLevel(basePath, targetPath, subDir, filter, config.encodingOverrides, progress);
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
            if (message.command === 'openDiff') {
                const baseUri = vscode.Uri.file(message.base);
                const targetUri = vscode.Uri.file(message.target);
                const title = `${message.fileName} (Base ↔ Target)`;
                await vscode.commands.executeCommand('vscode.diff', baseUri, targetUri, title);
            } else if (message.command === 'navigateDir') {
                currentSubDir = message.subDir;
                await runCompareAndSend(currentSubDir);
            } else if (message.command === 'goUp') {
                const parts = currentSubDir.split('/');
                parts.pop();
                currentSubDir = parts.join('/');
                await runCompareAndSend(currentSubDir);
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

    context.subscriptions.push(disposable);
}

export function deactivate(): void {}
