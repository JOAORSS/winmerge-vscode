import * as jschardet from 'jschardet';
import * as fs from 'fs';
import { TextDecoder } from 'util';

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

export async function detectEncoding(input: string | Buffer): Promise<string> {
    try {
        let buffer: Buffer;
        
        if (Buffer.isBuffer(input)) {
            buffer = input.subarray(0, SAMPLE_SIZE);
        } else {
            const fd = await fs.promises.open(input, 'r');
            const allocBuffer = Buffer.alloc(SAMPLE_SIZE);
            const { bytesRead } = await fd.read(allocBuffer, 0, SAMPLE_SIZE, 0);
            await fd.close();
            
            if (bytesRead === 0) {
                return 'Empty';
            }
            buffer = allocBuffer.subarray(0, bytesRead);
        }

        if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
            return 'UTF-8 (BOM)';
        }
        if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
            return 'UTF-16 LE (BOM)';
        }
        if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
            return 'UTF-16 BE (BOM)';
        }

        const result = jschardet.detect(buffer);

        if (!result || !result.encoding) {
            return 'Windows-1252';
        }

        const lower = result.encoding.toLowerCase();
        
        if (lower === 'utf-8' || lower === 'utf8' || lower === 'utf-16le' || lower === 'utf-16be') {
            return ENCODING_LABELS[lower] || result.encoding;
        }

        return 'Windows-1252';
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

        const normalize = (buf: Buffer): string => {
            const clean = stripBom(buf);
            const detected = jschardet.detect(clean);
            const lower = detected?.encoding?.toLowerCase() || '';
            
            let enc = 'windows-1252';
            if (lower === 'utf-8' || lower === 'utf8' || lower === 'utf-16le' || lower === 'utf-16be') {
                enc = lower;
            }

            let decoder: TextDecoder;
            try {
                decoder = new TextDecoder(enc);
            } catch {
                decoder = new TextDecoder('windows-1252');
            }
            
            return decoder.decode(clean).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        };

        return normalize(bufA) === normalize(bufB);
    } catch {
        return false;
    }
}
