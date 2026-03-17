import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
        setAll: (cookies) => {
          for (const cookie of cookies) {
            res.cookies.set(cookie.name, cookie.value);
          }
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const isAuthPage = req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/signup') || req.nextUrl.pathname.startsWith('/reset-password');
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');

  if (!session && !isAuthPage && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (session && isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
