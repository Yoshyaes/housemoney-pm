const MAX_TEXT_LENGTH = 500 * 1024; // 500KB
const MIN_MEANINGFUL_CHARS = 50;

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

/**
 * Extract text content from a file buffer based on its MIME type.
 * Returns null if the file type is unsupported or extraction fails.
 * Uses dynamic imports to avoid crashing the upload route if a package is unavailable.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  try {
    let text: string | null = null;

    if (mimeType === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse');
      const pdf = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await pdf.getText();
      text = result.text;
      await pdf.destroy();
    } else if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const mammoth = await import('mammoth');
      const TurndownService = (await import('turndown')).default;
      const result = await mammoth.convertToHtml({ buffer });
      const turndown = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
      });
      turndown.addRule('strikethrough', {
        filter: ['del', 's'],
        replacement: (content) => `~~${content}~~`,
      });
      text = turndown.turndown(result.value);
    } else if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        parts.push(`## ${sheetName}\n`);
        // Convert sheet to markdown-style table via CSV, then format
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const rows = csv.split('\n').filter((r) => r.trim());
        if (rows.length > 0) {
          const headerCells = rows[0].split(',');
          parts.push('| ' + headerCells.join(' | ') + ' |');
          parts.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
          for (let i = 1; i < rows.length; i++) {
            parts.push('| ' + rows[i].split(',').join(' | ') + ' |');
          }
        }
        parts.push('');
      }
      text = parts.join('\n');
    } else if (TEXT_MIME_TYPES.has(mimeType)) {
      text = buffer.toString('utf-8');
    } else {
      return null;
    }

    if (!text) return null;

    // Check if extracted text is meaningful (not a scanned/image-only PDF)
    const nonWhitespace = text.replace(/\s/g, '');
    if (nonWhitespace.length < MIN_MEANINGFUL_CHARS) return null;

    // Truncate if too large
    if (text.length > MAX_TEXT_LENGTH) {
      text =
        text.slice(0, MAX_TEXT_LENGTH) +
        '\n\n[Content truncated — original file available for download]';
    }

    return text;
  } catch {
    return null;
  }
}
