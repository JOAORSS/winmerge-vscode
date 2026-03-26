function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export type WebviewRowStatus = 'Identical' | 'Different' | 'Encoding Only' | 'Left Only' | 'Right Only' | 'Directory';

export type WebviewRow = {
    fileName: string;
    relativePath: string;
    extension: string;
    status: WebviewRowStatus;
    basePath: string;
    targetPath: string;
    encodingLeft: string;
    encodingRight: string;
    isDirectory: boolean;
};

export type GridDefaults = {
    showIdentical: boolean;
    showDifferent: boolean;
    showEncodingOnly: boolean;
    showLeftOnly: boolean;
    showRightOnly: boolean;
};

export function getWebviewContent(
    baseFolderPath: string,
    targetFolderPath: string,
    codiconsUri: string,
    gridDefaults: GridDefaults
): string {
    const defaultsJson = JSON.stringify(gridDefaults);

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>WinMerge: Folder Comparison</title>
        <link rel="stylesheet" href="${escapeHtml(codiconsUri)}" />
        <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            line-height: 1.5;
            overflow: hidden;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            padding: 16px;
            gap: 12px;
        }

        .header {
            flex-shrink: 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 12px;
        }

        .title-bar {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }

        .title-bar h1 {
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.02em;
            text-transform: uppercase;
            color: var(--vscode-foreground);
        }

        .title-bar .codicon {
            font-size: 18px;
            color: var(--vscode-textLink-foreground);
        }

        .breadcrumb {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
        }

        .breadcrumb .crumb {
            color: var(--vscode-textLink-foreground);
        }

        .meta-grid {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 3px 14px;
            font-size: 12px;
        }

        .meta-label {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }

        .meta-value {
            color: var(--vscode-textLink-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: 11px;
        }

        .filter-bar {
            display: flex;
            gap: 6px;
            padding: 8px 12px;
            background: var(--vscode-sideBar-background, var(--vscode-editor-background));
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            flex-shrink: 0;
            font-size: 12px;
            flex-wrap: wrap;
            align-items: center;
        }

        .filter-label {
            color: var(--vscode-descriptionForeground);
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            margin-right: 6px;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .filter-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px;
            border-radius: 12px;
            border: 1px solid var(--vscode-panel-border);
            background: transparent;
            color: var(--vscode-foreground);
            font-family: inherit;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
            white-space: nowrap;
        }

        .filter-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .action-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px;
            border-radius: 12px;
            border: 1px solid var(--vscode-panel-border);
            background: transparent;
            color: var(--vscode-foreground);
            font-family: inherit;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
            white-space: nowrap;
        }

        .action-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .filter-btn .filter-count {
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            min-width: 16px;
            text-align: center;
            padding: 0 4px;
            border-radius: 8px;
            font-size: 10px;
        }

        .filter-btn.active {
            border-color: transparent;
        }

        .filter-btn.active.fb-different {
            background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground) 22%, transparent);
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
        }
        .filter-btn.active.fb-encoding-only {
            background: color-mix(in srgb, var(--vscode-charts-yellow, #e2c541) 22%, transparent);
            color: var(--vscode-charts-yellow, #e2c541);
        }
        .filter-btn.active.fb-left-only {
            background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 22%, transparent);
            color: var(--vscode-gitDecoration-addedResourceForeground);
        }
        .filter-btn.active.fb-right-only {
            background: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 22%, transparent);
            color: var(--vscode-gitDecoration-deletedResourceForeground);
        }
        .filter-btn.active.fb-identical {
            background: color-mix(in srgb, var(--vscode-gitDecoration-ignoredResourceForeground) 18%, transparent);
            color: var(--vscode-gitDecoration-ignoredResourceForeground);
        }

        .filter-btn:not(.active) {
            opacity: 0.45;
        }
        .filter-btn:not(.active) .filter-text {
            text-decoration: line-through;
        }

        .filter-total {
            margin-left: auto;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .table-wrapper {
            flex: 1;
            overflow: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            position: relative;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }

        thead {
            position: sticky;
            top: 0;
            z-index: 2;
            background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
        }

        th {
            text-align: left;
            padding: 6px 10px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--vscode-descriptionForeground);
            border-bottom: 2px solid var(--vscode-panel-border);
            user-select: none;
            white-space: nowrap;
        }

        td {
            padding: 4px 10px;
            border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 50%, transparent);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 12px;
        }

        .col-checkbox { width: 30px; text-align: center; }
        .col-status { width: 36px; text-align: center; }
        .col-file   { width: auto; }
        .col-badge  { width: 120px; }
        .col-enc    { width: 120px; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }

        th:nth-child(1) { width: 30px; }
        th:nth-child(2) { width: 36px; }
        th:nth-child(3) { width: auto; }
        th:nth-child(4) { width: 120px; }
        th:nth-child(5) { width: 120px; }
        th:nth-child(6) { width: 120px; }

        .grid-row {
            transition: background 0.1s ease;
        }

        .grid-row:hover {
            background: var(--vscode-list-hoverBackground) !important;
        }

        .grid-row[data-clickable="true"] {
            cursor: pointer;
        }

        .grid-row[data-clickable="true"]:active {
            background: var(--vscode-list-activeSelectionBackground) !important;
        }

        .grid-row.selected {
            background: var(--vscode-list-inactiveSelectionBackground);
        }

        .grid-row.hidden-by-filter {
            display: none;
        }

        .grid-row.even-row {
            background: color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-foreground));
        }

        .file-icon {
            margin-right: 8px;
            opacity: 0.7;
            font-size: 14px;
            vertical-align: middle;
        }

        .file-name {
            vertical-align: middle;
        }

        .status-badge {
            display: inline-block;
            padding: 1px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.01em;
        }

        .status-identical .codicon { color: var(--vscode-gitDecoration-ignoredResourceForeground); }
        .status-identical .status-badge {
            color: var(--vscode-gitDecoration-ignoredResourceForeground);
            background: color-mix(in srgb, var(--vscode-gitDecoration-ignoredResourceForeground) 15%, transparent);
        }

        .status-different .codicon { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
        .status-different .status-badge {
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
            background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground) 20%, transparent);
        }

        .status-encoding .codicon { color: var(--vscode-charts-yellow, #e2c541); }
        .status-encoding .status-badge {
            color: var(--vscode-charts-yellow, #e2c541);
            background: color-mix(in srgb, var(--vscode-charts-yellow, #e2c541) 20%, transparent);
        }

        .status-left-only .codicon { color: var(--vscode-gitDecoration-addedResourceForeground); }
        .status-left-only .status-badge {
            color: var(--vscode-gitDecoration-addedResourceForeground);
            background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 20%, transparent);
        }

        .status-right-only .codicon { color: var(--vscode-gitDecoration-deletedResourceForeground); }
        .status-right-only .status-badge {
            color: var(--vscode-gitDecoration-deletedResourceForeground);
            background: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 20%, transparent);
        }

        .status-directory .codicon { color: var(--vscode-textLink-foreground); }
        .status-directory .status-badge {
            color: var(--vscode-textLink-foreground);
            background: color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent);
        }

        .col-status .codicon {
            font-size: 16px;
        }

        .go-up-row {
            cursor: pointer;
            color: var(--vscode-textLink-foreground);
            font-weight: 500;
        }

        .go-up-row:hover {
            background: var(--vscode-list-hoverBackground) !important;
        }

        .go-up-row td {
            padding: 6px 10px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }

        #sentinel {
            height: 1px;
        }

        .table-wrapper::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }
        .table-wrapper::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }
        .table-wrapper::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
        .table-wrapper::-webkit-scrollbar-track {
            background: transparent;
        }
        </style>
        </head>
        <body>
        <div class="container">
            <div class="header">
                <div class="title-bar">
                    <span class="codicon codicon-diff"></span>
                    <h1>Folder Comparison</h1>
                </div>
                <div id="breadcrumb" class="breadcrumb"></div>
                <div class="meta-grid">
                    <span class="meta-label">Base (Left)</span>
                    <span class="meta-value" id="metaBase" title="${escapeHtml(baseFolderPath)}">${escapeHtml(baseFolderPath)}</span>
                    <span class="meta-label">Target (Right)</span>
                    <span class="meta-value" id="metaTarget" title="${escapeHtml(targetFolderPath)}">${escapeHtml(targetFolderPath)}</span>
                </div>
            </div>
            <div class="filter-bar">
                <span class="filter-label"><span class="codicon codicon-filter"></span> Filter</span>
                <button class="filter-btn fb-different" data-filter="different" title="Toggle Different files">
                    <span class="codicon codicon-diff-modified"></span>
                    <span class="filter-text">Different</span>
                    <span class="filter-count" id="count-different">0</span>
                </button>
                <button class="filter-btn fb-encoding-only" data-filter="encoding-only" title="Toggle Encoding Only files">
                    <span class="codicon codicon-symbol-key"></span>
                    <span class="filter-text">Encoding Only</span>
                    <span class="filter-count" id="count-encoding-only">0</span>
                </button>
                <button class="filter-btn fb-left-only" data-filter="left-only" title="Toggle Left Only files">
                    <span class="codicon codicon-diff-added"></span>
                    <span class="filter-text">Left Only</span>
                    <span class="filter-count" id="count-left-only">0</span>
                </button>
                <button class="filter-btn fb-right-only" data-filter="right-only" title="Toggle Right Only files">
                    <span class="codicon codicon-diff-removed"></span>
                    <span class="filter-text">Right Only</span>
                    <span class="filter-count" id="count-right-only">0</span>
                </button>
                <button class="filter-btn fb-identical" data-filter="identical" title="Toggle Identical files">
                    <span class="codicon codicon-pass"></span>
                    <span class="filter-text">Identical</span>
                    <span class="filter-count" id="count-identical">0</span>
                </button>
                <span class="filter-total"><span id="visibleCount">0</span> / <span id="totalCount">0</span> items</span>
                <div style="flex-grow: 1;"></div>
                <button id="btnCopyRight" class="action-btn" title="Copy from Left to Right">
                    <span class="codicon codicon-arrow-right"></span>
                    <span class="filter-text">Copy Right</span>
                </button>
                <button id="btnCopyLeft" class="action-btn" title="Copy from Right to Left">
                    <span class="codicon codicon-arrow-left"></span>
                    <span class="filter-text">Copy Left</span>
                </button>
            </div>
            <div class="table-wrapper" id="tableWrapper">
                <table>
                    <thead>
                        <tr>
                            <th style="width:30px;text-align:center;"><input type="checkbox" id="selectAllCheckbox" title="Select All"></th>
                            <th style="width:36px;text-align:center;" title="Status"><span class="codicon codicon-symbol-event"></span></th>
                            <th>File</th>
                            <th>Status</th>
                            <th>Encoding (Left)</th>
                            <th>Encoding (Right)</th>
                        </tr>
                    </thead>
                    <tbody id="resultRows">
                    </tbody>
                </table>
                <div id="sentinel"></div>
            </div>
        </div>
        <script>
        (function() {
            var vscode = acquireVsCodeApi();
            var tbody = document.getElementById('resultRows');
            var visibleCountEl = document.getElementById('visibleCount');
            var totalCountEl = document.getElementById('totalCount');
            var sentinel = document.getElementById('sentinel');
            var breadcrumbEl = document.getElementById('breadcrumb');
            var metaBaseEl = document.getElementById('metaBase');
            var metaTargetEl = document.getElementById('metaTarget');
            var tableWrapper = document.getElementById('tableWrapper');
            var selectedRow = null;

            var defaults = ${defaultsJson};
            var filterState = {
                'different': defaults.showDifferent,
                'encoding-only': defaults.showEncodingOnly,
                'left-only': defaults.showLeftOnly,
                'right-only': defaults.showRightOnly,
                'identical': defaults.showIdentical
            };

            var allRows = [];
            var filteredRows = [];
            var renderedCount = 0;
            var BATCH_SIZE = 100;
            var isRoot = true;
            var currentSubDir = '';

            var statusIcons = {
                'Identical': 'codicon-pass',
                'Different': 'codicon-diff-modified',
                'Encoding Only': 'codicon-symbol-key',
                'Left Only': 'codicon-diff-added',
                'Right Only': 'codicon-diff-removed',
                'Directory': 'codicon-folder'
            };

            var statusClasses = {
                'Identical': 'status-identical',
                'Different': 'status-different',
                'Encoding Only': 'status-encoding',
                'Left Only': 'status-left-only',
                'Right Only': 'status-right-only',
                'Directory': 'status-directory'
            };

            var fileIcons = {
                '.pas': 'codicon-symbol-class',
                '.dfm': 'codicon-symbol-interface',
                '.dpr': 'codicon-project',
                '.dpk': 'codicon-package',
                '.ts': 'codicon-symbol-method',
                '.tsx': 'codicon-symbol-method',
                '.js': 'codicon-symbol-event',
                '.jsx': 'codicon-symbol-event',
                '.json': 'codicon-json',
                '.html': 'codicon-globe',
                '.htm': 'codicon-globe',
                '.css': 'codicon-paintcan',
                '.scss': 'codicon-paintcan',
                '.less': 'codicon-paintcan',
                '.xml': 'codicon-code',
                '.yaml': 'codicon-list-flat',
                '.yml': 'codicon-list-flat',
                '.md': 'codicon-markdown',
                '.txt': 'codicon-file-text',
                '.log': 'codicon-output',
                '.sql': 'codicon-database',
                '.py': 'codicon-symbol-namespace',
                '.rb': 'codicon-ruby',
                '.java': 'codicon-symbol-class',
                '.c': 'codicon-symbol-variable',
                '.cpp': 'codicon-symbol-variable',
                '.h': 'codicon-symbol-variable',
                '.hpp': 'codicon-symbol-variable',
                '.cs': 'codicon-symbol-class',
                '.go': 'codicon-symbol-method',
                '.rs': 'codicon-symbol-method',
                '.php': 'codicon-code',
                '.sh': 'codicon-terminal',
                '.bat': 'codicon-terminal',
                '.cmd': 'codicon-terminal',
                '.ps1': 'codicon-terminal',
                '.png': 'codicon-file-media',
                '.jpg': 'codicon-file-media',
                '.jpeg': 'codicon-file-media',
                '.gif': 'codicon-file-media',
                '.svg': 'codicon-file-media',
                '.ico': 'codicon-file-media',
                '.bmp': 'codicon-file-media',
                '.zip': 'codicon-file-zip',
                '.rar': 'codicon-file-zip',
                '.7z': 'codicon-file-zip',
                '.tar': 'codicon-file-zip',
                '.gz': 'codicon-file-zip',
                '.pdf': 'codicon-file-pdf',
                '.exe': 'codicon-file-binary',
                '.dll': 'codicon-file-binary',
                '.bin': 'codicon-file-binary',
                '.dcu': 'codicon-file-binary',
                '.ini': 'codicon-settings-gear',
                '.cfg': 'codicon-settings-gear',
                '.conf': 'codicon-settings-gear',
                '.env': 'codicon-settings-gear'
            };

            function esc(str) {
                var div = document.createElement('div');
                div.appendChild(document.createTextNode(str));
                return div.innerHTML;
            }

            function statusToDataAttr(status) {
                return status.toLowerCase().replace(/ /g, '-');
            }

            function getFileIcon(ext) {
                return fileIcons[ext.toLowerCase()] || 'codicon-file';
            }

            function isClickable(row) {
                if (row.isDirectory) { return true; }
                return row.status === 'Different' || row.status === 'Encoding Only';
            }

            var filterBtns = document.querySelectorAll('.filter-btn');
            filterBtns.forEach(function(btn) {
                var key = btn.dataset.filter;
                if (filterState[key]) {
                    btn.classList.add('active');
                }
            });

            filterBtns.forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var key = btn.dataset.filter;
                    filterState[key] = !filterState[key];
                    btn.classList.toggle('active', filterState[key]);
                    rebuildFiltered();
                });
            });

            function updateCounts() {
                var counts = { 'different': 0, 'encoding-only': 0, 'left-only': 0, 'right-only': 0, 'identical': 0 };
                for (var i = 0; i < allRows.length; i++) {
                    var key = statusToDataAttr(allRows[i].status);
                    if (counts[key] !== undefined) {
                        counts[key]++;
                    }
                }
                for (var k in counts) {
                    var el = document.getElementById('count-' + k);
                    if (el) { el.textContent = String(counts[k]); }
                }
                totalCountEl.textContent = String(allRows.length);
            }

            function rebuildFiltered() {
                filteredRows = [];
                for (var i = 0; i < allRows.length; i++) {
                    var row = allRows[i];
                    if (row.isDirectory && row.status === 'Directory') {
                        filteredRows.push(row);
                        continue;
                    }
                    var dataAttr = statusToDataAttr(row.status);
                    if (filterState[dataAttr] !== false) {
                        filteredRows.push(row);
                    }
                }
                renderedCount = 0;
                tbody.innerHTML = '';

                if (!isRoot) {
                    var goUpTr = document.createElement('tr');
                    goUpTr.className = 'go-up-row';
                    goUpTr.innerHTML = '<td class="col-checkbox"></td>'
                        + '<td class="col-status"><span class="codicon codicon-arrow-up"></span></td>'
                        + '<td class="col-file" colspan="4">'
                        + '<span class="codicon codicon-folder file-icon"></span>'
                        + '<span class="file-name">⬆ ..</span>'
                        + '</td>';
                    goUpTr.addEventListener('click', function() {
                        vscode.postMessage({ command: 'goUp' });
                    });
                    tbody.appendChild(goUpTr);
                }

                renderBatch();
                visibleCountEl.textContent = String(filteredRows.length);
            }

            function createRowElement(row, index) {
                var tr = document.createElement('tr');
                var statusClass = statusClasses[row.status] || '';
                var dataAttr = statusToDataAttr(row.status);
                var clickable = isClickable(row) ? 'true' : 'false';

                tr.className = 'grid-row ' + statusClass;
                if (index % 2 === 1) { tr.classList.add('even-row'); }
                tr.setAttribute('data-clickable', clickable);
                tr.setAttribute('data-status', dataAttr);
                tr.setAttribute('data-base', row.basePath);
                tr.setAttribute('data-target', row.targetPath);
                tr.setAttribute('data-name', row.fileName);
                if (row.isDirectory) {
                    tr.setAttribute('data-type', 'directory');
                    tr.setAttribute('data-relpath', row.relativePath);
                }

                var icon = row.isDirectory ? 'codicon-folder' : getFileIcon(row.extension);
                var statusIcon = statusIcons[row.status] || 'codicon-file';

                var disableCheckbox = row.isDirectory || row.status === 'Identical' ? 'disabled' : '';
                tr.innerHTML = '<td class="col-checkbox"><input type="checkbox" class="row-checkbox" ' + disableCheckbox + ' /></td>'
                    + '<td class="col-status"><span class="codicon ' + statusIcon + '" title="' + esc(row.status) + '"></span></td>'
                    + '<td class="col-file"><span class="codicon ' + icon + ' file-icon"></span><span class="file-name" title="' + esc(row.relativePath) + '">' + esc(row.fileName) + '</span></td>'
                    + '<td class="col-badge"><span class="status-badge ' + statusClass + '">' + esc(row.status) + '</span></td>'
                    + '<td class="col-enc">' + esc(row.encodingLeft) + '</td>'
                    + '<td class="col-enc">' + esc(row.encodingRight) + '</td>';

                return tr;
            }

            function renderBatch() {
                var end = Math.min(renderedCount + BATCH_SIZE, filteredRows.length);
                var fragment = document.createDocumentFragment();
                for (var i = renderedCount; i < end; i++) {
                    fragment.appendChild(createRowElement(filteredRows[i], i));
                }
                tbody.appendChild(fragment);
                renderedCount = end;
            }

            var observer = new IntersectionObserver(function(entries) {
                if (entries[0].isIntersecting && renderedCount < filteredRows.length) {
                    renderBatch();
                }
            }, { root: tableWrapper, threshold: 0 });

            observer.observe(sentinel);

            function handleRowClick(row) {
                if (selectedRow) { selectedRow.classList.remove('selected'); }
                row.classList.add('selected');
                selectedRow = row;

                if (row.getAttribute('data-type') === 'directory') {
                    var relPath = row.getAttribute('data-relpath');
                    vscode.postMessage({ command: 'navigateDir', subDir: relPath });
                    return;
                }

                if (row.dataset.clickable !== 'true') { return; }

                var base = row.dataset.base || '';
                var target = row.dataset.target || '';
                var fileName = row.dataset.name || '';

                if (!base || !target) { return; }

                vscode.postMessage({ command: 'openDiff', base: base, target: target, fileName: fileName });
            }

            tbody.addEventListener('click', function(event) {
                if (event.target.tagName === 'INPUT' && event.target.type === 'checkbox') {
                    return;
                }
                var row = event.target.closest('tr.grid-row');
                if (!row) {
                    var goUp = event.target.closest('tr.go-up-row');
                    if (goUp) { return; }
                    return;
                }
                handleRowClick(row);
            });

            tbody.addEventListener('dblclick', function(event) {
                var row = event.target.closest('tr.grid-row');
                if (!row) { return; }
                handleRowClick(row);
            });

            function nextVisibleSibling(el) {
                var s = el.nextElementSibling;
                while (s && s.classList.contains('hidden-by-filter')) { s = s.nextElementSibling; }
                return s;
            }

            function prevVisibleSibling(el) {
                var s = el.previousElementSibling;
                while (s && s.classList.contains('hidden-by-filter')) { s = s.previousElementSibling; }
                return s;
            }

            var searchBuffer = '';
            var searchTimeout = null;

            document.addEventListener('keydown', function(e) {
                if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    searchBuffer += e.key.toLowerCase();
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(function() { searchBuffer = ''; }, 800);

                    var rows = tbody.querySelectorAll('tr.grid-row:not(.hidden-by-filter)');
                    for (var i = 0; i < rows.length; i++) {
                        var fileName = rows[i].getAttribute('data-name') || '';
                        if (fileName.toLowerCase().startsWith(searchBuffer)) {
                            if (selectedRow) { selectedRow.classList.remove('selected'); }
                            rows[i].classList.add('selected');
                            selectedRow = rows[i];
                            selectedRow.scrollIntoView({ block: 'center' });
                            e.preventDefault();
                            break;
                        }
                    }
                    return;
                }

                if (!selectedRow) { return; }
                var target = null;
                if (e.key === 'ArrowDown') {
                    target = nextVisibleSibling(selectedRow);
                    e.preventDefault();
                } else if (e.key === 'ArrowUp') {
                    target = prevVisibleSibling(selectedRow);
                    e.preventDefault();
                } else if (e.key === 'Enter') {
                    handleRowClick(selectedRow);
                    e.preventDefault();
                    return;
                } else if (e.key === ' ') {
                    var cb = selectedRow.querySelector('.row-checkbox');
                    if (cb && !cb.disabled) {
                        cb.checked = !cb.checked;
                        e.preventDefault();
                    }
                    return;
                }

                if (target && target.tagName === 'TR') {
                    selectedRow.classList.remove('selected');
                    target.classList.add('selected');
                    selectedRow = target;
                    target.scrollIntoView({ block: 'nearest' });
                }
            });

            document.getElementById('selectAllCheckbox').addEventListener('change', function(e) {
                var checked = e.target.checked;
                var checkboxes = tbody.querySelectorAll('.row-checkbox:not(:disabled)');
                for (var i = 0; i < checkboxes.length; i++) {
                    checkboxes[i].checked = checked;
                }
            });

            function getSelectedFiles() {
                var files = [];
                var checkboxes = tbody.querySelectorAll('.row-checkbox:checked');
                for (var i = 0; i < checkboxes.length; i++) {
                    var tr = checkboxes[i].closest('tr');
                    if (tr) {
                        files.push({ base: tr.getAttribute('data-base'), target: tr.getAttribute('data-target') });
                    }
                }
                return files;
            }

            document.getElementById('btnCopyLeft').addEventListener('click', function() {
                var files = getSelectedFiles();
                if (files.length > 0) vscode.postMessage({ command: 'copyFiles', direction: 'toLeft', files: files });
            });

            document.getElementById('btnCopyRight').addEventListener('click', function() {
                var files = getSelectedFiles();
                if (files.length > 0) vscode.postMessage({ command: 'copyFiles', direction: 'toRight', files: files });
            });

            window.addEventListener('message', function(event) {
                var msg = event.data;
                if (msg.command === 'setData') {
                    allRows = msg.rows || [];
                    isRoot = msg.isRoot;
                    currentSubDir = msg.currentSubDir || '';
                    selectedRow = null;

                    if (currentSubDir) {
                        breadcrumbEl.innerHTML = '<span class="crumb">/ ' + esc(currentSubDir) + '</span>';
                    } else {
                        breadcrumbEl.innerHTML = '';
                    }

                    metaBaseEl.textContent = msg.basePath || '';
                    metaBaseEl.title = msg.basePath || '';
                    metaTargetEl.textContent = msg.targetPath || '';
                    metaTargetEl.title = msg.targetPath || '';

                    updateCounts();
                    rebuildFiltered();
                    tableWrapper.scrollTop = 0;
                } else if (msg.command === 'filesCopied') {
                    var paths = msg.files || [];
                    var rows = tbody.querySelectorAll('tr.grid-row');
                    for (var i = 0; i < rows.length; i++) {
                        if (paths.indexOf(rows[i].getAttribute('data-base')) !== -1) {
                            rows[i].classList.remove('status-different', 'status-encoding', 'status-left-only', 'status-right-only');
                            rows[i].classList.add('status-identical');
                            rows[i].setAttribute('data-status', 'identical');
                            rows[i].setAttribute('data-clickable', 'false');
                            var iconSpan = rows[i].querySelector('.col-status .codicon');
                            if (iconSpan) {
                                iconSpan.className = 'codicon ' + statusIcons['Identical'];
                                iconSpan.title = 'Identical';
                            }
                            var badge = rows[i].querySelector('.status-badge');
                            if (badge) {
                                badge.className = 'status-badge status-identical';
                                badge.textContent = 'Identical';
                            }
                            var cb = rows[i].querySelector('.row-checkbox');
                            if (cb) {
                                cb.checked = false;
                                cb.disabled = true;
                            }
                        }
                    }
                    updateCounts();
                }
            });
        })();
        </script>
        </body>
    </html>`;
}
