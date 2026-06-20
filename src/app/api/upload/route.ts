import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/server/auth/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { extractTextFromBuffer } from '@/lib/extract-text';

const ALLOWED_BUCKETS = ['task-attachments', 'document-attachments'];
const DEFAULT_BUCKET = 'task-attachments';

// Signed URL expiry: 1 year in seconds.
// Files are stored in private buckets — this signed URL is the only access path.
const SIGNED_URL_EXPIRY = 365 * 24 * 60 * 60;

// SVG excluded: stored XSS vector when served from any origin.
// .xlsx excluded: unfixed prototype-pollution + ReDoS CVEs in the xlsx package (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9).
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Magic byte signatures for non-text MIME types.
// Each entry is checked at the given byte offset.
interface MagicSig {
  offset: number;
  bytes: number[];
}

const MAGIC: Record<string, MagicSig[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/gif': [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  'image/webp': [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }], // RIFF
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  'application/zip': [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP-based (DOCX)
  ],
};

function validateMagicBytes(buf: Uint8Array, mimeType: string): boolean {
  const sigs = MAGIC[mimeType];
  if (!sigs) {
    // text/*, application/json — no reliable magic bytes, allow through
    return true;
  }
  for (const sig of sigs) {
    const match = sig.bytes.every((byte, i) => buf[sig.offset + i] === byte);
    if (!match) continue;
    // WebP additionally requires 'WEBP' at offset 8
    if (mimeType === 'image/webp') {
      const webp = [0x57, 0x45, 0x42, 0x50];
      if (!webp.every((b, i) => buf[8 + i] === b)) continue;
    }
    return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate using getUser() — verifies the JWT with Supabase server-side.
    // getSession() must NOT be used here: it reads the cookie without server verification
    // and would accept revoked or crafted JWTs.
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 uploads per minute per user
    if (!await rateLimit(`upload:${user.id}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Upload rate limit exceeded. Try again shortly.' }, { status: 429 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const formData = await req.formData();
    const bucketParam = (formData.get('bucket') as string | null) ?? DEFAULT_BUCKET;
    const bucket = ALLOWED_BUCKETS.includes(bucketParam) ? bucketParam : DEFAULT_BUCKET;

    // Ensure private bucket exists — public: false means files require signed URLs
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === bucket);
    if (!bucketExists) {
      const { error: bucketError } = await supabase.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 52428800, // 50 MB hard limit at storage layer
      });
      if (bucketError) {
        console.error('[upload] Failed to create bucket:', bucketError.message);
        return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
      }
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.type || !ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `File type "${file.type || 'unknown'}" is not allowed` },
        { status: 400 }
      );
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Validate magic bytes — don't trust client-supplied MIME type alone
    if (!validateMagicBytes(bytes, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match the declared file type' },
        { status: 400 }
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[upload] Storage upload failed:', uploadError.message);
      return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
    }

    // Generate a long-lived signed URL so the private file can be displayed in the app.
    // The URL is valid for 1 year. For a production system, consider storing just the
    // storage path and generating short-lived signed URLs on demand.
    const { data: signedData, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

    if (signError || !signedData?.signedUrl) {
      console.error('[upload] Failed to generate signed URL:', signError?.message);
      return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
    }

    const extractedText = await extractTextFromBuffer(
      Buffer.from(arrayBuffer),
      file.type
    );

    return NextResponse.json({
      url: signedData.signedUrl,
      path: storagePath,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      extractedText,
    });
  } catch (err) {
    console.error('[upload] Unhandled error:', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
