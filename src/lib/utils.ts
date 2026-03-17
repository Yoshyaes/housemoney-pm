import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatDueDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d');
}

export function formatDueDateFull(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ─── URL Linkification ──────────────────────────────────

const URL_REGEX = /(?:https?:\/\/)[^\s<>"')\]]+/g;

/**
 * Convert plain-text URLs in an HTML string to clickable `<a>` tags.
 * Safe to call on already-sanitized HTML (does not touch URLs already inside href attributes).
 */
export function linkifyHtml(html: string): string {
  // Split on existing tags to avoid linkifying URLs inside attributes
  return html.replace(
    /(<[^>]*>)|(?:https?:\/\/)[^\s<>"')\]]+/g,
    (match, tag) => {
      if (tag) return tag; // Keep existing HTML tags untouched
      return `<a href="${match}" target="_blank" rel="noopener noreferrer" class="text-amber-600 dark:text-amber-400 hover:underline break-all">${match}</a>`;
    }
  );
}

/**
 * Split text into an array of strings and { url } objects for React rendering.
 */
export function linkifyParts(text: string): Array<string | { url: string }> {
  const parts: Array<string | { url: string }> = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(URL_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ url: match[0] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function getAvatarColor(name: string): { bg: string; color: string } {
  const colors = [
    { bg: 'rgba(186,117,23,.15)', color: '#BA7517' },
    { bg: 'rgba(53,138,221,.15)', color: '#185FA5' },
    { bg: 'rgba(29,158,117,.15)', color: '#0F6E56' },
    { bg: 'rgba(212,83,126,.12)', color: '#99355A' },
    { bg: 'rgba(127,119,221,.15)', color: '#534AB7' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
