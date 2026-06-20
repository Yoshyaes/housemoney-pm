import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminClientMock = vi.hoisted(() => ({
  auth: {
    admin: {
      inviteUserByEmail: vi.fn(),
    },
    signInWithOtp: vi.fn(),
  },
}));

const createSupabaseAdminMock = vi.hoisted(() => vi.fn(() => adminClientMock));

vi.mock('@/server/auth/supabase-admin', () => ({
  createSupabaseAdmin: createSupabaseAdminMock,
}));

import {
  escapeHtml,
  buildInviteHtml,
  sendInviteEmail,
  getSupabaseInviteTemplate,
} from './send-invite-email';

describe('escapeHtml', () => {
  it('escapes ampersands first to avoid double-escaping', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes < and >', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes double and single quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('escapes a complete XSS payload', () => {
    const payload = `<script>alert('xss')</script>`;
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('</script>');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&lt;/script&gt;');
    expect(escaped).toContain('&#x27;');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('does not modify safe text', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});

describe('buildInviteHtml', () => {
  it('escapes inviter name in HTML output (anti-XSS)', () => {
    const html = buildInviteHtml({
      role: 'MEMBER',
      workspaceName: 'Acme',
      inviterName: '<script>alert(1)</script>',
      acceptUrl: 'https://example.com/accept',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes workspace name in HTML output (anti-XSS)', () => {
    const html = buildInviteHtml({
      role: 'MEMBER',
      workspaceName: '<img src=x onerror=alert(1)>',
      inviterName: 'Alice',
      acceptUrl: 'https://example.com/accept',
    });

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes the accept URL (avoids breaking out of the href attribute)', () => {
    const html = buildInviteHtml({
      role: 'MEMBER',
      workspaceName: 'Acme',
      inviterName: 'Alice',
      acceptUrl: 'https://example.com/"><script>alert(1)</script>',
    });

    // The literal raw payload must not appear unescaped
    expect(html).not.toContain('"><script>alert(1)</script>');
    // Escaped quote and angle brackets
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes single quotes in inviter name (anti attribute-context XSS)', () => {
    const html = buildInviteHtml({
      role: 'MEMBER',
      workspaceName: 'Acme',
      inviterName: "Alice' onclick='alert(1)",
      acceptUrl: 'https://example.com',
    });

    expect(html).not.toContain("'onclick='alert(1)");
    expect(html).toContain('&#x27;');
  });

  it('uses GUEST-specific headline and copy for GUEST role', () => {
    const html = buildInviteHtml({
      role: 'GUEST',
      workspaceName: 'Acme',
      inviterName: 'Alice',
      acceptUrl: 'https://example.com',
    });

    expect(html).toContain('invited you to collaborate');
    expect(html).toContain('guest');
    expect(html).toContain('View shared projects');
  });

  it('uses MEMBER-specific headline and copy for MEMBER role', () => {
    const html = buildInviteHtml({
      role: 'MEMBER',
      workspaceName: 'Acme',
      inviterName: 'Alice',
      acceptUrl: 'https://example.com',
    });

    expect(html).toContain('invited you to join the team');
    expect(html).toContain('team member');
    expect(html).toContain('Join the workspace');
  });

  it('embeds the accept URL in the CTA href', () => {
    const html = buildInviteHtml({
      role: 'MEMBER',
      workspaceName: 'Acme',
      inviterName: 'Alice',
      acceptUrl: 'https://example.com/accept?token=abc',
    });
    expect(html).toContain('href="https://example.com/accept?token=abc"');
  });
});

describe('getSupabaseInviteTemplate', () => {
  it('returns HTML with Supabase template placeholders embedded', () => {
    const html = getSupabaseInviteTemplate();
    expect(html).toContain('{{ .ConfirmationURL }}');
    expect(html).toContain('{{ .Data.workspace_name }}');
    expect(html).toContain('{{ .Data.inviter_name }}');
  });
});

describe('sendInviteEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it('calls inviteUserByEmail with the right redirect and data', async () => {
    adminClientMock.auth.admin.inviteUserByEmail.mockResolvedValue({ error: null });

    const result = await sendInviteEmail({
      email: 'new@example.com',
      role: 'MEMBER',
      workspaceName: 'Acme',
      inviterName: 'Alice',
      inviteToken: 'token-123',
    });

    expect(result).toEqual({ emailSent: true });
    expect(adminClientMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'new@example.com',
      expect.objectContaining({
        redirectTo: 'http://localhost:3000/api/auth/callback?invitation=token-123',
        data: expect.objectContaining({
          invitation_role: 'MEMBER',
          workspace_name: 'Acme',
          inviter_name: 'Alice',
          email_subject: 'Alice invited you to join Acme',
        }),
      })
    );
  });

  it('uses NEXT_PUBLIC_APP_URL when set', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    adminClientMock.auth.admin.inviteUserByEmail.mockResolvedValue({ error: null });

    await sendInviteEmail({
      email: 'x@y.com',
      role: 'MEMBER',
      workspaceName: 'W',
      inviterName: 'I',
      inviteToken: 'tk',
    });

    expect(adminClientMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'x@y.com',
      expect.objectContaining({
        redirectTo: 'https://app.example.com/api/auth/callback?invitation=tk',
      })
    );
  });

  it('uses VERCEL_PROJECT_PRODUCTION_URL when NEXT_PUBLIC_APP_URL is unset', async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.vercel.app';
    adminClientMock.auth.admin.inviteUserByEmail.mockResolvedValue({ error: null });

    await sendInviteEmail({
      email: 'x@y.com',
      role: 'MEMBER',
      workspaceName: 'W',
      inviterName: 'I',
      inviteToken: 'tk',
    });

    expect(adminClientMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'x@y.com',
      expect.objectContaining({
        redirectTo: 'https://prod.vercel.app/api/auth/callback?invitation=tk',
      })
    );
  });

  it('uses GUEST subject for GUEST role', async () => {
    adminClientMock.auth.admin.inviteUserByEmail.mockResolvedValue({ error: null });

    await sendInviteEmail({
      email: 'g@x.com',
      role: 'GUEST',
      workspaceName: 'Acme',
      inviterName: 'Alice',
      inviteToken: 'tk',
    });

    expect(adminClientMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'g@x.com',
      expect.objectContaining({
        data: expect.objectContaining({
          email_subject: 'Alice invited you to collaborate on Acme',
        }),
      })
    );
  });

  it('falls back to signInWithOtp when the user already exists (422)', async () => {
    adminClientMock.auth.admin.inviteUserByEmail.mockResolvedValue({
      error: { message: 'email already been registered', status: 422 },
    });
    adminClientMock.auth.signInWithOtp.mockResolvedValue({ error: null });

    const result = await sendInviteEmail({
      email: 'existing@x.com',
      role: 'MEMBER',
      workspaceName: 'W',
      inviterName: 'I',
      inviteToken: 'tk',
    });

    expect(result).toEqual({ emailSent: true });
    expect(adminClientMock.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'existing@x.com',
      options: {
        emailRedirectTo: 'http://localhost:3000/api/auth/callback?invitation=tk',
        shouldCreateUser: false,
      },
    });
  });

  it('returns failure with reason when OTP fallback also fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminClientMock.auth.admin.inviteUserByEmail.mockResolvedValue({
      error: { message: 'already been registered', status: 422 },
    });
    adminClientMock.auth.signInWithOtp.mockResolvedValue({
      error: { message: 'OTP rate limit hit' },
    });

    const result = await sendInviteEmail({
      email: 'x@y.com',
      role: 'MEMBER',
      workspaceName: 'W',
      inviterName: 'I',
      inviteToken: 'tk',
    });

    expect(result).toEqual({ emailSent: false, reason: 'OTP rate limit hit' });
    errSpy.mockRestore();
  });

  it('returns failure with reason for other inviteUserByEmail errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminClientMock.auth.admin.inviteUserByEmail.mockResolvedValue({
      error: { message: 'Unexpected failure', status: 500 },
    });

    const result = await sendInviteEmail({
      email: 'x@y.com',
      role: 'MEMBER',
      workspaceName: 'W',
      inviterName: 'I',
      inviteToken: 'tk',
    });

    expect(result).toEqual({ emailSent: false, reason: 'Unexpected failure' });
    expect(adminClientMock.auth.signInWithOtp).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
