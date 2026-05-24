// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCurrentMembership } from './use-current-membership';

const members = [
  { id: 'user-1', role: 'ADMIN', name: 'Alice' },
  { id: 'user-2', role: 'MEMBER', name: 'Bob' },
  { id: 'user-3', role: 'GUEST', name: 'Carol' },
];

describe('useCurrentMembership', () => {
  it('returns undefined role when currentUserId is null', () => {
    const { result } = renderHook(() => useCurrentMembership(members, null));

    expect(result.current).toEqual({
      role: undefined,
      isGuest: false,
      isAdmin: false,
      isMember: false,
    });
  });

  it('returns undefined role when currentUserId is undefined', () => {
    const { result } = renderHook(() => useCurrentMembership(members, undefined));
    expect(result.current.role).toBeUndefined();
  });

  it('returns undefined role when members list is empty', () => {
    const { result } = renderHook(() => useCurrentMembership([], 'user-1'));

    expect(result.current).toEqual({
      role: undefined,
      isGuest: false,
      isAdmin: false,
      isMember: false,
    });
  });

  it('identifies an admin', () => {
    const { result } = renderHook(() => useCurrentMembership(members, 'user-1'));

    expect(result.current).toEqual({
      role: 'ADMIN',
      isGuest: false,
      isAdmin: true,
      isMember: false,
    });
  });

  it('identifies a member', () => {
    const { result } = renderHook(() => useCurrentMembership(members, 'user-2'));

    expect(result.current).toEqual({
      role: 'MEMBER',
      isGuest: false,
      isAdmin: false,
      isMember: true,
    });
  });

  it('identifies a guest', () => {
    const { result } = renderHook(() => useCurrentMembership(members, 'user-3'));

    expect(result.current).toEqual({
      role: 'GUEST',
      isGuest: true,
      isAdmin: false,
      isMember: false,
    });
  });

  it('returns undefined role when user is not in member list', () => {
    const { result } = renderHook(() => useCurrentMembership(members, 'user-nonexistent'));

    expect(result.current).toEqual({
      role: undefined,
      isGuest: false,
      isAdmin: false,
      isMember: false,
    });
  });

  it('handles unknown role gracefully (not flagged as any specific role)', () => {
    const withWeirdRole = [{ id: 'user-x', role: 'OBSERVER' }];
    const { result } = renderHook(() => useCurrentMembership(withWeirdRole, 'user-x'));

    expect(result.current).toEqual({
      role: 'OBSERVER',
      isGuest: false,
      isAdmin: false,
      isMember: false,
    });
  });

  it('memoizes — same inputs return the same object reference', () => {
    const { result, rerender } = renderHook(
      ({ m, u }) => useCurrentMembership(m, u),
      { initialProps: { m: members, u: 'user-1' as string | null } }
    );

    const first = result.current;
    rerender({ m: members, u: 'user-1' });
    expect(result.current).toBe(first);
  });
});
