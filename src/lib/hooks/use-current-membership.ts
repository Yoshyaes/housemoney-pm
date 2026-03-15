'use client';

import { useMemo } from 'react';

type MemberWithRole = {
  id: string;
  role: string;
  [key: string]: unknown;
};

export function useCurrentMembership(
  members: MemberWithRole[],
  currentUserId: string | null | undefined
) {
  return useMemo(() => {
    if (!currentUserId || members.length === 0) {
      return { role: undefined, isGuest: false, isAdmin: false, isMember: false };
    }

    const currentMember = members.find((m) => m.id === currentUserId);
    const role = currentMember?.role;

    return {
      role,
      isGuest: role === 'GUEST',
      isAdmin: role === 'ADMIN',
      isMember: role === 'MEMBER',
    };
  }, [members, currentUserId]);
}
