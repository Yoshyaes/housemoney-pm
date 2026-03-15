'use client';

export function GuestBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider"
      style={{ backgroundColor: 'rgba(186,117,23,0.12)', color: '#BA7517' }}
    >
      Guest
    </span>
  );
}
