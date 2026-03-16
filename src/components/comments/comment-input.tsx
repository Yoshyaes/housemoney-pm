'use client';

import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { SendHorizontal } from 'lucide-react';
import { BRAND_AMBER } from '@/lib/constants';

interface CommentInputProps {
  taskId: string;
  members: Array<{ id: string; name: string }>;
  onCommentAdded: () => void;
}

export function CommentInput({ taskId, members, onCommentAdded }: CommentInputProps) {
  const [body, setBody] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createComment = trpc.comments.create.useMutation({
    onSuccess: () => {
      setBody('');
      onCommentAdded();
    },
  });

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const insertMention = useCallback(
    (member: { id: string; name: string }) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const pos = textarea.selectionStart;
      const textBefore = body.slice(0, pos);
      const textAfter = body.slice(pos);

      // Find the @ symbol position
      const atIndex = textBefore.lastIndexOf('@');
      if (atIndex === -1) return;

      const newText = textBefore.slice(0, atIndex) + `@[${member.name}](${member.id}) ` + textAfter;
      setBody(newText);
      setShowMentions(false);
      setMentionFilter('');

      setTimeout(() => {
        const newPos = atIndex + `@[${member.name}](${member.id}) `.length;
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
        textarea.focus();
      }, 0);
    },
    [body]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, filteredMembers.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredMembers[mentionIndex]) {
          insertMention(filteredMembers[mentionIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
      return;
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setBody(value);

    const pos = e.target.selectionStart;
    const textBefore = value.slice(0, pos);

    // Check if we're in a mention context
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1] || '');
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const handleSubmit = () => {
    if (!body.trim()) return;
    createComment.mutate({ taskId, body: body.trim() });
  };

  return (
    <div className="relative">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment... (@ to mention)"
          className="w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-2 pr-9 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600"
          rows={2}
        />
        {body.trim() && (
          <button
            onClick={handleSubmit}
            disabled={createComment.isPending}
            className="absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-md text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: BRAND_AMBER }}
            title="Send comment (Ctrl+Enter)"
          >
            <SendHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Mention dropdown */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-48 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {filteredMembers.map((member, i) => (
            <button
              key={member.id}
              onClick={() => insertMention(member)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-[11px] ${
                i === mentionIndex ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {member.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
