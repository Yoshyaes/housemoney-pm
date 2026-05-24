import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rateLimit: vi.fn(),
  extractText: vi.fn(),
  listBuckets: vi.fn(),
  createBucket: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/server/auth/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      listBuckets: mocks.listBuckets,
      createBucket: mocks.createBucket,
      from: (_bucket: string) => ({
        upload: mocks.upload,
        createSignedUrl: mocks.createSignedUrl,
      }),
    },
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock('@/lib/extract-text', () => ({
  extractTextFromBuffer: mocks.extractText,
}));

import { POST } from './route';

// Minimal stand-in for FormData that preserves arbitrary stored values.
// The real DOM FormData coerces non-Blob entries to strings, which would
// lose the .arrayBuffer()/.type info on our fake File objects. We expose
// only the .get() method that the route actually uses.
interface FakeFormData {
  get(key: string): unknown;
}
function buildFormData(file: unknown, bucket?: string): FakeFormData {
  const store = new Map<string, unknown>();
  if (file) store.set('file', file);
  if (bucket !== undefined) store.set('bucket', bucket);
  return {
    get: (key: string) => store.get(key) ?? null,
  };
}

function createRequest(fd: FakeFormData): NextRequest {
  // Stub the bits of NextRequest that the route actually uses. Building a
  // real NextRequest with a binary FormData body round-trips through jsdom's
  // form parser, which mangles non-ASCII bytes (breaking magic-byte checks).
  return {
    formData: async () => fd,
  } as unknown as NextRequest;
}

// Helper to build a fake File-like object that the route can call
// .type, .size, .name, and .arrayBuffer() on.
function makeFile(name: string, type: string, content: Uint8Array | string, size?: number) {
  const bytes =
    typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return {
    name,
    type,
    size: size ?? bytes.byteLength,
    arrayBuffer: async () => ab,
  };
}

// Bytes for valid file types
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const GIF87_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x00, 0x00]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x00, 0x00, 0x00, 0x00, // size
  0x57, 0x45, 0x42, 0x50, // WEBP
]);
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv-key';

    // Defaults: authenticated user, rate ok, bucket exists, upload OK, signed URL OK
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.rateLimit.mockResolvedValue(true);
    mocks.listBuckets.mockResolvedValue({ data: [{ name: 'task-attachments' }, { name: 'document-attachments' }] });
    mocks.createBucket.mockResolvedValue({ error: null });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/path' },
      error: null,
    });
    mocks.extractText.mockResolvedValue(null);
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

      const req = createRequest(buildFormData(makeFile('a.png', 'image/png', PNG_BYTES)));
      const res = await POST(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when auth returns an error', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });

      const req = createRequest(buildFormData(makeFile('a.png', 'image/png', PNG_BYTES)));
      const res = await POST(req);

      expect(res.status).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when rate limit exceeded', async () => {
      mocks.rateLimit.mockResolvedValue(false);

      const req = createRequest(buildFormData(makeFile('a.png', 'image/png', PNG_BYTES)));
      const res = await POST(req);

      expect(res.status).toBe(429);
      expect(mocks.rateLimit).toHaveBeenCalledWith('upload:user-1', 10, 60_000);
    });
  });

  describe('configuration', () => {
    it('returns 500 when SUPABASE_URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      const req = createRequest(buildFormData(makeFile('a.png', 'image/png', PNG_BYTES)));
      const res = await POST(req);
      expect(res.status).toBe(500);
    });

    it('returns 500 when SERVICE_ROLE_KEY is missing', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const req = createRequest(buildFormData(makeFile('a.png', 'image/png', PNG_BYTES)));
      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });

  describe('bucket validation', () => {
    it('rejects unknown bucket parameter by silently falling back to default', async () => {
      const fd = buildFormData(makeFile('a.png', 'image/png', PNG_BYTES), 'evil-bucket');
      const req = createRequest(fd);
      const res = await POST(req);
      expect(res.status).toBe(200);
      // Should NOT have tried to create or use 'evil-bucket' — defaults to task-attachments
      const callArgs = mocks.createBucket.mock.calls.map((c) => c[0]);
      expect(callArgs).not.toContain('evil-bucket');
    });

    it('accepts the allowed document-attachments bucket', async () => {
      mocks.listBuckets.mockResolvedValue({ data: [{ name: 'document-attachments' }] });

      const fd = buildFormData(makeFile('a.png', 'image/png', PNG_BYTES), 'document-attachments');
      const req = createRequest(fd);
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('creates the bucket if it does not exist', async () => {
      mocks.listBuckets.mockResolvedValue({ data: [] });

      const req = createRequest(buildFormData(makeFile('a.png', 'image/png', PNG_BYTES)));
      await POST(req);

      expect(mocks.createBucket).toHaveBeenCalledWith(
        'task-attachments',
        expect.objectContaining({ public: false, fileSizeLimit: 52428800 })
      );
    });

    it('returns 500 if bucket creation fails', async () => {
      mocks.listBuckets.mockResolvedValue({ data: [] });
      mocks.createBucket.mockResolvedValue({ error: { message: 'denied' } });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createRequest(buildFormData(makeFile('a.png', 'image/png', PNG_BYTES)));
      const res = await POST(req);

      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });
  });

  describe('file validation', () => {
    it('returns 400 when no file is provided', async () => {
      const fd = buildFormData(null);
      const req = createRequest(fd);
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/No file/);
    });

    it('rejects disallowed MIME types (image/svg+xml is XSS vector)', async () => {
      const file = makeFile('evil.svg', 'image/svg+xml', '<svg onload="alert(1)"/>');
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/not allowed/i);
    });

    it('rejects xlsx (excluded due to vulnerable xlsx package CVEs)', async () => {
      const file = makeFile(
        'sheet.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ZIP_BYTES
      );
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('rejects empty MIME type', async () => {
      const file = makeFile('mystery.bin', '', new Uint8Array([0x00, 0x01, 0x02]));
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('rejects file larger than 20MB', async () => {
      const file = makeFile('big.png', 'image/png', PNG_BYTES, 21 * 1024 * 1024);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/too large/i);
    });
  });

  describe('magic byte validation', () => {
    it('rejects PNG-declared file that has JPEG magic bytes', async () => {
      // Declared as png, actually jpeg signature
      const file = makeFile('fake.png', 'image/png', JPEG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/does not match/);
    });

    it('rejects PDF-declared file without %PDF header', async () => {
      const file = makeFile('fake.pdf', 'application/pdf', new Uint8Array([0x00, 0x00, 0x00, 0x00]));
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('rejects webp-declared file that has RIFF but not WEBP at offset 8', async () => {
      // RIFF header but with AVI fourcc, not WEBP
      const bytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46,
        0x00, 0x00, 0x00, 0x00,
        0x41, 0x56, 0x49, 0x20, // 'AVI '
      ]);
      const file = makeFile('fake.webp', 'image/webp', bytes);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('accepts valid PNG magic bytes', async () => {
      const file = makeFile('real.png', 'image/png', PNG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts valid JPEG magic bytes', async () => {
      const file = makeFile('real.jpg', 'image/jpeg', JPEG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts valid PDF magic bytes', async () => {
      const file = makeFile('real.pdf', 'application/pdf', PDF_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts valid GIF87a magic bytes', async () => {
      const file = makeFile('real.gif', 'image/gif', GIF87_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts valid WEBP magic bytes', async () => {
      const file = makeFile('real.webp', 'image/webp', WEBP_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts ZIP-based docx with PK header', async () => {
      const file = makeFile(
        'doc.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ZIP_BYTES
      );
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts text/plain regardless of byte content', async () => {
      const file = makeFile('note.txt', 'text/plain', 'just some text');
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('accepts application/json regardless of byte content', async () => {
      const file = makeFile('data.json', 'application/json', '{"a":1}');
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  describe('happy path', () => {
    it('returns signed URL, path, name, size, mimeType, extractedText', async () => {
      mocks.extractText.mockResolvedValue('extracted content');

      const file = makeFile('hello.png', 'image/png', PNG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toBe('https://signed.example.com/path');
      expect(body.path).toContain('user-1/');
      expect(body.path).toContain('hello.png');
      expect(body.name).toBe('hello.png');
      expect(body.size).toBeGreaterThan(0);
      expect(body.mimeType).toBe('image/png');
      expect(body.extractedText).toBe('extracted content');
    });

    it('sanitizes special characters in the stored filename', async () => {
      const file = makeFile('../../etc/passwd .png', 'image/png', PNG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      // The full path is `${user.id}/${timestamp}_${safeName}`. The only
      // legitimate `/` in the path separates the user prefix from the file.
      // Anything in the original filename (including slashes) must be
      // collapsed to underscores so a hostile name can't escape the
      // user-scoped directory.
      const segments = body.path.split('/');
      expect(segments).toHaveLength(2); // exactly user-id / filename
      const storedName = segments[1];
      expect(storedName).not.toContain('/');
      expect(storedName).not.toContain(' ');
      // Original name is preserved in the response (only the storage path is sanitized)
      expect(body.name).toBe('../../etc/passwd .png');
    });

    it('uses the authenticated user.id in the storage path', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-xyz' } }, error: null });

      const file = makeFile('a.png', 'image/png', PNG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);
      const body = await res.json();

      expect(body.path.startsWith('user-xyz/')).toBe(true);
    });
  });

  describe('failure paths', () => {
    it('returns 500 when storage upload errors', async () => {
      mocks.upload.mockResolvedValue({ error: { message: 'storage exploded' } });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const file = makeFile('a.png', 'image/png', PNG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);

      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it('returns 500 when signed URL generation fails', async () => {
      mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'no sign' } });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const file = makeFile('a.png', 'image/png', PNG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);

      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it('handles unhandled errors and returns 500', async () => {
      mocks.getUser.mockImplementation(() => {
        throw new Error('boom');
      });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const file = makeFile('a.png', 'image/png', PNG_BYTES);
      const req = createRequest(buildFormData(file));
      const res = await POST(req);

      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });
  });
});
