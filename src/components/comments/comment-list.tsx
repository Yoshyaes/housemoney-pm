'use client';

import DOMPurify from 'isomorphic-dompurify';
import { Avatar } from '@/components/shared/avatar';
import { formatRelativeTime } from '@/lib/utils';

interface Comment {
  id: string;
  body: string;
  createdAt: string | Date;
  reactions?: Array<{ emoji: string; userIds: string[] }> | null;
  author: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    avatarColor?: string;
  };
}

interface CommentListProps {
  comments: Comment[];
  currentUserId?: string;
  onReaction?: (commentId: string, emoji: string) => void;
}

export function CommentList({ comments, currentUserId, onReaction }: CommentListProps) {
  if (comments.length === 0) {
    return <div className="py-2 text-[11px] text-zinc-400 dark:text-zinc-500">No comments yet</div>;
  }

  return (
    <div className="space-y-0">
      {comments.map((comment) => {
        // Sanitize before any HTML manipulation to prevent XSS
        const sanitized = DOMPurify.sanitize(comment.body, {
          ALLOWED_TAGS: ['span', 'strong', 'em', 'code', 'br'],
          ALLOWED_ATTR: ['class'],
        });
        // Parse @mentions for display
        const body = sanitized.replace(
          /@\[([^\]]+)\]\([^)]+\)/g,
          '<span class="font-medium text-amber-700">@$1</span>'
        );

        const reactions = (comment.reactions as Array<{ emoji: string; userIds: string[] }>) || [];

        return (
          <div key={comment.id} className="border-b border-zinc-100 py-2 dark:border-zinc-800">
            <div className="mb-1 flex items-center gap-1.5">
              <Avatar
                name={comment.author.name}
                avatarUrl={comment.author.avatarUrl}
                avatarColor={comment.author.avatarColor}
                size="xs"
              />
              <span className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100">{comment.author.name}</span>
              <span className="ml-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                {formatRelativeTime(comment.createdAt)}
              </span>
            </div>
            <div
              className="text-xs leading-[1.5] text-zinc-500 dark:text-zinc-400"
              dangerouslySetInnerHTML={{ __html: body }}
            />

            {/* Reactions */}
            {reactions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {reactions.map((r) => (
                  <button
                    key={r.emoji}
                    onClick={() => onReaction?.(comment.id, r.emoji)}
                    className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors ${
                      currentUserId && r.userIds.includes(currentUserId)
                        ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30'
                        : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {r.emoji}
                    <span className="text-zinc-500 dark:text-zinc-400">{r.userIds.length}</span>
                  </button>
                ))}
                {onReaction && (
                  <button className="rounded-full border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800">
                    +
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
