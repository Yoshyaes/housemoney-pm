import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock state so vi.mock factory can reach it
const mocks = vi.hoisted(() => ({
  pdfGetText: vi.fn(),
  pdfDestroy: vi.fn(),
  mammothConvert: vi.fn(),
}));

vi.mock('pdf-parse', () => {
  class PDFParse {
    constructor(_opts: unknown) {}
    getText = mocks.pdfGetText;
    destroy = mocks.pdfDestroy;
  }
  return { PDFParse };
});

vi.mock('mammoth', () => ({
  convertToHtml: mocks.mammothConvert,
  default: { convertToHtml: mocks.mammothConvert },
}));

import { extractTextFromBuffer } from './extract-text';

describe('extractTextFromBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('plain text MIME types', () => {
    it('extracts text/plain by decoding utf-8 buffer', async () => {
      const text = 'Hello world. '.repeat(20); // > 50 non-whitespace chars
      const result = await extractTextFromBuffer(Buffer.from(text, 'utf-8'), 'text/plain');
      expect(result).toContain('Hello world.');
    });

    it('extracts text/markdown', async () => {
      const text = '# Heading\n\n' + 'some body text. '.repeat(10);
      const result = await extractTextFromBuffer(Buffer.from(text), 'text/markdown');
      expect(result).toContain('# Heading');
    });

    it('extracts text/csv', async () => {
      const csv = 'a,b,c\n' + '1,2,3\n'.repeat(20);
      const result = await extractTextFromBuffer(Buffer.from(csv), 'text/csv');
      expect(result).toContain('a,b,c');
    });

    it('extracts application/json', async () => {
      const json = JSON.stringify({ field: 'a'.repeat(100) });
      const result = await extractTextFromBuffer(Buffer.from(json), 'application/json');
      expect(result).toContain('field');
    });

    it('returns null when extracted text has too few meaningful chars', async () => {
      // Whitespace-only and under min meaningful chars
      const result = await extractTextFromBuffer(Buffer.from('hi'), 'text/plain');
      expect(result).toBeNull();
    });

    it('returns null for whitespace-only input', async () => {
      const result = await extractTextFromBuffer(Buffer.from('   \n\n\n   '), 'text/plain');
      expect(result).toBeNull();
    });
  });

  describe('PDF extraction', () => {
    it('extracts PDF text via pdf-parse', async () => {
      const text = 'PDF body text content. '.repeat(20);
      mocks.pdfGetText.mockResolvedValue({ text });
      mocks.pdfDestroy.mockResolvedValue(undefined);

      const result = await extractTextFromBuffer(Buffer.from('%PDF-1.4 ...'), 'application/pdf');

      expect(result).toContain('PDF body text content');
      expect(mocks.pdfGetText).toHaveBeenCalled();
      expect(mocks.pdfDestroy).toHaveBeenCalled();
    });

    it('returns null for scanned-image PDFs with too little text', async () => {
      mocks.pdfGetText.mockResolvedValue({ text: 'a few words' });
      mocks.pdfDestroy.mockResolvedValue(undefined);

      const result = await extractTextFromBuffer(Buffer.from('%PDF-1.4'), 'application/pdf');
      expect(result).toBeNull();
    });

    it('returns null when PDF parsing throws', async () => {
      mocks.pdfGetText.mockRejectedValue(new Error('corrupted'));

      const result = await extractTextFromBuffer(Buffer.from('not a pdf'), 'application/pdf');
      expect(result).toBeNull();
    });
  });

  describe('DOCX extraction', () => {
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    it('converts docx HTML to markdown', async () => {
      mocks.mammothConvert.mockResolvedValue({
        value:
          '<h1>Title</h1>' +
          '<p>This is some body text that is reasonably long for testing purposes today.</p>',
      });

      const result = await extractTextFromBuffer(Buffer.from('PK...'), DOCX_MIME);

      expect(result).toBeTruthy();
      expect(result).toContain('# Title');
      expect(result).toContain('body text');
    });

    it('returns null when mammoth throws', async () => {
      mocks.mammothConvert.mockRejectedValue(new Error('invalid docx'));

      const result = await extractTextFromBuffer(Buffer.from('PK...'), DOCX_MIME);
      expect(result).toBeNull();
    });
  });

  describe('unsupported MIME types', () => {
    it('returns null for image/png', async () => {
      const result = await extractTextFromBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
      expect(result).toBeNull();
    });

    it('returns null for application/zip', async () => {
      const result = await extractTextFromBuffer(Buffer.from('PK'), 'application/zip');
      expect(result).toBeNull();
    });

    it('returns null for unknown MIME', async () => {
      const result = await extractTextFromBuffer(Buffer.from('whatever'), 'application/octet-stream');
      expect(result).toBeNull();
    });
  });

  describe('truncation', () => {
    it('truncates text larger than 500KB and appends a notice', async () => {
      // 600KB of text
      const huge = 'a'.repeat(600 * 1024);
      const result = await extractTextFromBuffer(Buffer.from(huge), 'text/plain');

      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThan(huge.length);
      expect(result).toContain('[Content truncated');
    });

    it('does NOT truncate text below the 500KB limit', async () => {
      // 400KB of text
      const text = 'a'.repeat(400 * 1024);
      const result = await extractTextFromBuffer(Buffer.from(text), 'text/plain');

      expect(result).toBe(text);
      expect(result).not.toContain('[Content truncated');
    });
  });
});
