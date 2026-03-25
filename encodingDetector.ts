import * as jschardet from 'jschardet';

const SAMPLE_SIZE = 8192;

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

export async function detectEncoding(buffer?: Buffer): Promise<string> {
    if (!buffer || buffer.length === 0) {
        return 'Empty';
    }

    try {
        const bytesRead = Math.min(buffer.length, SAMPLE_SIZE);
        const sample = buffer.subarray(0, bytesRead);

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

export async function compareFileContents(bufA: Buffer, bufB: Buffer): Promise<'identical' | 'different'> {
    return bufA.equals(bufB) ? 'identical' : 'different';
}

export async function isOnlyEncodingDifference(bufA: Buffer, bufB: Buffer): Promise<boolean> {
    try {
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
