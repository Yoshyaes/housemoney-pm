import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/server/auth/supabase-server';

const BUCKET = 'task-attachments';

export async function POST(req: NextRequest) {
  // Verify user is authenticated
  const supabaseAuth = createServerSupabaseClient();
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service role client for storage operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === BUCKET);
  if (!bucketExists) {
    await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 52428800 }); // 50MB
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Sanitize filename and create unique path
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${session.user.id}/${Date.now()}_${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url: publicUrl,
    name: file.name,
    size: file.size,
    mimeType: file.type || `application/octet-stream`,
  });
}
