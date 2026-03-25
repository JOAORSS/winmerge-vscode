import * as fs from 'fs';

export interface FilterConfig {
    name: string;
    description: string;
    /** 'include' = inclusive (blocks matching), 'exclude' = exclusive (only matching pass) */
    mode: 'include' | 'exclude';
    fileRules: RegExp[];
    dirRules: RegExp[];
}

/**
 * Parse a WinMerge .flt filter file.
 *
 * Format:
 *   - Lines starting with `##` are comments
 *   - Inline comments start with ` ##`
 *   - `name: <name>`
 *   - `desc: <description>`
 *   - `def: include | exclude`
 *   - `f: <regex>` — file filter rule
 *   - `d: <regex>` — directory filter rule
 */
export function parseFilterFile(filePath: string): FilterConfig {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseFilterContent(content);
}

export function parseFilterContent(content: string): FilterConfig {
    const config: FilterConfig = {
        name: '',
        description: '',
        mode: 'include',
        fileRules: [],
        dirRules: [],
    };

    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
        // Strip inline comments (` ##` followed by anything)
        const line = rawLine.replace(/\s+##.*$/, '').trim();

        // Skip empty lines and full-line comments
        if (!line || line.startsWith('##')) {
            continue;
        }

        // Parse key-value directives
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) {
            continue;
        }

        const key = line.substring(0, colonIdx).trim().toLowerCase();
        const value = line.substring(colonIdx + 1).trim();

        if (!value) {
            continue;
        }

        switch (key) {
            case 'name':
                config.name = value;
                break;
            case 'desc':
                config.description = value;
                break;
            case 'def':
                config.mode = value.toLowerCase() === 'exclude' ? 'exclude' : 'include';
                break;
            case 'f':
                try {
                    config.fileRules.push(new RegExp(value, 'i'));
                } catch {
                    // Skip invalid regex
                }
                break;
            case 'd':
                try {
                    config.dirRules.push(new RegExp(value, 'i'));
                } catch {
                    // Skip invalid regex
                }
                break;
        }
    }

    return config;
}

/**
 * Check whether a file should be included in comparison results.
 * @param relativePath The relative file path (using forward slashes)
 * @param filter The parsed filter config, or undefined if no filter applied
 * @returns true if the file should be shown
 */
export function shouldIncludeFile(relativePath: string, filter: FilterConfig | undefined): boolean {
    if (!filter) {
        return true;
    }

    if (filter.fileRules.length === 0) {
        return true;
    }

    const matchesAnyRule = filter.fileRules.some((rx) => rx.test(relativePath));

    if (filter.mode === 'include') {
        // Inclusive filter: rules define what to EXCLUDE
        return !matchesAnyRule;
    } else {
        // Exclusive filter: rules define what to INCLUDE
        return matchesAnyRule;
    }
}

/**
 * Check whether a directory should be traversed.
 * @param dirName The directory name (basename) or relative path
 * @param filter The parsed filter config, or undefined if no filter applied
 * @returns true if the directory should be traversed
 */
export function shouldIncludeDir(dirName: string, filter: FilterConfig | undefined): boolean {
    if (!filter) {
        return true;
    }

    if (filter.dirRules.length === 0) {
        return true;
    }

    const matchesAnyRule = filter.dirRules.some((rx) => rx.test(dirName));

    if (filter.mode === 'include') {
        // Inclusive filter: rules define what to EXCLUDE
        return !matchesAnyRule;
    } else {
        // Exclusive filter: rules define what to INCLUDE
        return matchesAnyRule;
    }
}
