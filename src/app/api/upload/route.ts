import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/server/auth/supabase-server';
import { rateLimit } from '@/lib/rate-limit';

const ALLOWED_BUCKETS = ['task-attachments', 'document-attachments'];
const DEFAULT_BUCKET = 'task-attachments';

export async function POST(req: NextRequest) {
  // Verify user is authenticated
  const supabaseAuth = createServerSupabaseClient();
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: 10 uploads per minute per user
  if (!rateLimit(`upload:${session.user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Upload rate limit exceeded. Try again shortly.' }, { status: 429 });
  }

  // Use service role client for storage operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const formData = await req.formData();
  const bucketParam = (formData.get('bucket') as string | null) ?? DEFAULT_BUCKET;
  const bucket = ALLOWED_BUCKETS.includes(bucketParam) ? bucketParam : DEFAULT_BUCKET;

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === bucket);
  if (!bucketExists) {
    await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 52428800 }); // 50MB
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
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);

  return NextResponse.json({
    url: publicUrl,
    name: file.name,
    size: file.size,
    mimeType: file.type || `application/octet-stream`,
  });
}
