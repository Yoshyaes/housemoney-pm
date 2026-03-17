'use client';

import { getInitials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  avatarColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  xs: { container: 'w-4 h-4 text-[7px]', text: 'text-[7px]' },
  sm: { container: 'w-5 h-5 text-[8px]', text: 'text-[8px]' },
  md: { container: 'w-6 h-6 text-[10px]', text: 'text-[10px]' },
  lg: { container: 'w-8 h-8 text-xs', text: 'text-xs' },
  xl: { container: 'w-16 h-16 text-xl', text: 'text-xl' },
};

const colorMap: Record<string, { bg: string; color: string }> = {
  '#BA7517': { bg: 'rgba(186,117,23,.15)', color: '#BA7517' },
  '#185FA5': { bg: 'rgba(53,138,221,.15)', color: '#185FA5' },
  '#0F6E56': { bg: 'rgba(29,158,117,.15)', color: '#0F6E56' },
  '#99355A': { bg: 'rgba(212,83,126,.12)', color: '#99355A' },
  '#534AB7': { bg: 'rgba(127,119,221,.15)', color: '#534AB7' },
  '#D97706': { bg: 'rgba(217,119,6,.15)', color: '#D97706' },
  '#059669': { bg: 'rgba(5,150,105,.15)', color: '#059669' },
  '#DC2626': { bg: 'rgba(220,38,38,.12)', color: '#DC2626' },
};

export function Avatar({ name, avatarUrl, avatarColor, size = 'md', className = '' }: AvatarProps) {
  const s = sizeMap[size];
  const colors = avatarColor && colorMap[avatarColor]
    ? colorMap[avatarColor]
    : { bg: 'rgba(186,117,23,.15)', color: '#BA7517' };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${s.container} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${s.container} flex items-center justify-center rounded-full font-medium ${className}`}
      style={{ backgroundColor: colors.bg, color: colors.color }}
    >
      {getInitials(name)}
    </div>
  );
}
