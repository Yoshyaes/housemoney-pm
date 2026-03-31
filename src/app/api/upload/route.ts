import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/server/auth/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { extractTextFromBuffer } from '@/lib/extract-text';

const ALLOWED_BUCKETS = ['task-attachments', 'document-attachments'];
const DEFAULT_BUCKET = 'task-attachments';

export async function POST(req: NextRequest) {
  try {
    // Verify user is authenticated
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 uploads per minute per user
    if (!rateLimit(`upload:${session.user.id}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Upload rate limit exceeded. Try again shortly.' }, { status: 429 });
    }

    // Use service role client for storage operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const formData = await req.formData();
    const bucketParam = (formData.get('bucket') as string | null) ?? DEFAULT_BUCKET;
    const bucket = ALLOWED_BUCKETS.includes(bucketParam) ? bucketParam : DEFAULT_BUCKET;

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === bucket);
    if (!bucketExists) {
      const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 52428800 }); // 50MB
      if (bucketError) {
        return NextResponse.json({ error: `Failed to create storage bucket: ${bucketError.message}` }, { status: 500 });
      }
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type (whitelist)
    const ALLOWED_MIME_TYPES = new Set([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'text/plain', 'text/markdown', 'text/csv',
      'application/json',
      'application/zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);

    if (!file.type || !ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: `File type "${file.type || 'unknown'}" is not allowed` }, { status: 400 });
    }

    // Validate file size in application layer (20MB)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 });
    }

    // Sanitize filename and create unique path
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${session.user.id}/${Date.now()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (error) {
      return NextResponse.json({ error: `Storage upload failed: ${error.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);

    // Extract text content from supported file types
    const extractedText = await extractTextFromBuffer(
      Buffer.from(arrayBuffer),
      file.type
    );

    return NextResponse.json({
      url: publicUrl,
      name: file.name,
      size: file.size,
      mimeType: file.type || `application/octet-stream`,
      extractedText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    console.error('[upload] Unhandled error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
