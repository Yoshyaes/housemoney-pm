import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieStoreMock = vi.hoisted(() => ({
  getAll: vi.fn(() => [
    { name: 'sb-access-token', value: 'tok' },
    { name: 'sb-refresh-token', value: 'refresh' },
  ]),
  set: vi.fn(),
}));

const cookiesMock = vi.hoisted(() => vi.fn(async () => cookieStoreMock));
const createServerClientMock = vi.hoisted(() => vi.fn(() => ({ __mock: 'server-client' })));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: createServerClientMock,
}));

import { createServerSupabaseClient } from './supabase-server';

describe('createServerSupabaseClient', () => {
  beforeEach(() => {
    createServerClientMock.mockClear();
    cookiesMock.mockClear();
    cookieStoreMock.getAll.mockClear();
    cookieStoreMock.set.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('reads cookies via next/headers and creates a server client', async () => {
    const client = await createServerSupabaseClient();

    expect(cookiesMock).toHaveBeenCalled();
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      })
    );
    expect(client).toEqual({ __mock: 'server-client' });
  });

  it('getAll() proxies to the cookie store', async () => {
    await createServerSupabaseClient();

    const args = createServerClientMock.mock.calls[0][2] as {
      cookies: { getAll: () => unknown };
    };
    const result = args.cookies.getAll();
    expect(cookieStoreMock.getAll).toHaveBeenCalled();
    expect(result).toEqual([
      { name: 'sb-access-token', value: 'tok' },
      { name: 'sb-refresh-token', value: 'refresh' },
    ]);
  });

  it('setAll() forwards each cookie to the cookie store', async () => {
    await createServerSupabaseClient();

    const args = createServerClientMock.mock.calls[0][2] as {
      cookies: {
        setAll: (c: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void;
      };
    };
    args.cookies.setAll([
      { name: 'sb-1', value: 'v1', options: { httpOnly: true } },
      { name: 'sb-2', value: 'v2' },
    ]);

    expect(cookieStoreMock.set).toHaveBeenCalledTimes(2);
    expect(cookieStoreMock.set).toHaveBeenNthCalledWith(1, 'sb-1', 'v1', { httpOnly: true });
    expect(cookieStoreMock.set).toHaveBeenNthCalledWith(2, 'sb-2', 'v2', undefined);
  });

  it('setAll() swallows errors thrown by read-only cookie stores', async () => {
    cookieStoreMock.set.mockImplementationOnce(() => {
      throw new Error('Cookies can only be modified in a Server Action');
    });

    await createServerSupabaseClient();

    const args = createServerClientMock.mock.calls[0][2] as {
      cookies: {
        setAll: (c: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void;
      };
    };

    expect(() =>
      args.cookies.setAll([{ name: 'sb-1', value: 'v1' }])
    ).not.toThrow();
  });
});
