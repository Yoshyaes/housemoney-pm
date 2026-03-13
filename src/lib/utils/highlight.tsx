import React from 'react';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightMatch(text: string, query: string): React.ReactNode[] {
  if (!query || !text) return [text];
  const escaped = escapeRegex(query.trim());
  if (!escaped) return [text];

  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="rounded-sm bg-amber-200/60 text-inherit dark:bg-amber-500/30"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}
