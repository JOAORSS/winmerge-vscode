import * as fs from 'fs';
import * as jschardet from 'jschardet';

/** Maximum bytes to read for encoding detection */
const SAMPLE_SIZE = 8192;

/** Map of common encoding names to more readable labels */
const ENCODING_LABELS: Record<string, string> = {
    'ascii': 'ASCII',
    'utf-8': 'UTF-8',
    'utf8': 'UTF-8',
    'utf-16le': 'UTF-16 LE',
    'utf-16be': 'UTF-16 BE',
    'windows-1252': 'Windows-1252',
    'iso-8859-1': 'ISO-8859-1',
    'iso-8859-2': 'ISO-8859-2',
    'iso-8859-5': 'ISO-8859-5',
    'iso-8859-7': 'ISO-8859-7',
    'iso-8859-8': 'ISO-8859-8',
    'iso-8859-9': 'ISO-8859-9',
    'shift_jis': 'Shift-JIS',
    'euc-jp': 'EUC-JP',
    'euc-kr': 'EUC-KR',
    'big5': 'Big5',
    'gb2312': 'GB2312',
    'gb18030': 'GB18030',
    'tis-620': 'TIS-620',
    'ibm866': 'IBM866',
    'koi8-r': 'KOI8-R',
    'macintosh': 'MacRoman',
};

/**
 * Detect the text encoding of a file.
 * @param filePath Absolute path to the file
 * @returns A human-readable encoding label, or 'Binary' if detection fails
 */
export async function detectEncoding(filePath: string): Promise<string> {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(SAMPLE_SIZE);
        const bytesRead = fs.readSync(fd, buffer, 0, SAMPLE_SIZE, 0);
        fs.closeSync(fd);

        if (bytesRead === 0) {
            return 'Empty';
        }

        const sample = buffer.subarray(0, bytesRead);

        // Check for BOM markers
        if (bytesRead >= 3 && sample[0] === 0xEF && sample[1] === 0xBB && sample[2] === 0xBF) {
            return 'UTF-8 (BOM)';
        }
        if (bytesRead >= 2 && sample[0] === 0xFF && sample[1] === 0xFE) {
            return 'UTF-16 LE (BOM)';
        }
        if (bytesRead >= 2 && sample[0] === 0xFE && sample[1] === 0xFF) {
            return 'UTF-16 BE (BOM)';
        }

        const result = jschardet.detect(sample);

        if (!result || !result.encoding) {
            return 'Binary';
        }

        const lower = result.encoding.toLowerCase();
        return ENCODING_LABELS[lower] || result.encoding;
    } catch {
        return 'Unknown';
    }
}

/**
 * Compare file contents byte-by-byte.
 * @returns 'identical' | 'different'
 */
export async function compareFileContents(pathA: string, pathB: string): Promise<'identical' | 'different'> {
    try {
        const bufA = fs.readFileSync(pathA);
        const bufB = fs.readFileSync(pathB);
        return bufA.equals(bufB) ? 'identical' : 'different';
    } catch {
        return 'different';
    }
}

/**
 * Normalize line endings and compare text content only (stripping encoding differences).
 * This reads both files as UTF-8 and compares text after normalizing newlines.
 * @returns true if text content is the same (only encoding/BOM differs)
 */
export async function isOnlyEncodingDifference(pathA: string, pathB: string): Promise<boolean> {
    try {
        const bufA = fs.readFileSync(pathA);
        const bufB = fs.readFileSync(pathB);

        // Strip BOM if present
        const stripBom = (buf: Buffer): Buffer => {
            if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
                return buf.subarray(3);
            }
            if (buf.length >= 2 && ((buf[0] === 0xFF && buf[1] === 0xFE) || (buf[0] === 0xFE && buf[1] === 0xFF))) {
                return buf.subarray(2);
            }
            return buf;
        };

        const cleanA = stripBom(bufA).toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const cleanB = stripBom(bufB).toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        return cleanA === cleanB;
    } catch {
        return false;
    }
}
