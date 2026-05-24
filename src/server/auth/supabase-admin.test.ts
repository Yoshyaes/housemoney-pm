import { describe, it, expect, vi, beforeEach } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn(() => ({ __mock: 'client' })));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

import { createSupabaseAdmin } from './supabase-admin';

describe('createSupabaseAdmin', () => {
  beforeEach(() => {
    createClientMock.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  });

  it('creates a supabase client with the URL and service role key', () => {
    const client = createSupabaseAdmin();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-key'
    );
    expect(client).toEqual({ __mock: 'client' });
  });

  it('does not make any network calls itself', () => {
    // sanity: only the factory is invoked
    createSupabaseAdmin();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('uses the env values at call time, not at module load time', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://other.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'other-key';

    createSupabaseAdmin();
    expect(createClientMock).toHaveBeenLastCalledWith(
      'https://other.supabase.co',
      'other-key'
    );
  });
});
