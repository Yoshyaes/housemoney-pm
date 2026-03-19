import { Pin, FileText, FileImage, File } from 'lucide-react';
import { Avatar } from '@/components/shared/avatar';
import { DocTypeBadge } from './doc-type-badge';
import { DocType } from '@/generated/prisma/client';

interface DocumentCardProps {
  id: string;
  title: string;
  docType: DocType;
  tags: string[];
  contentPreview: string;
  pinned: boolean;
  author: { name: string; avatarUrl?: string | null; avatarColor?: string | null };
  updatedAt: Date;
  isActive: boolean;
  onClick: () => void;
  fileUrl?: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function FileTypeIcon({ mimeType }: { mimeType: string | null | undefined }) {
  if (!mimeType) return <File className="h-3 w-3 text-zinc-400" />;
  if (mimeType.startsWith('image/')) return <FileImage className="h-3 w-3 text-blue-400" />;
  if (mimeType === 'application/pdf') return <FileText className="h-3 w-3 text-red-400" />;
  return <File className="h-3 w-3 text-zinc-400" />;
}

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentCard({
  title,
  docType,
  tags,
  contentPreview,
  pinned,
  author,
  updatedAt,
  isActive,
  onClick,
  fileUrl,
  fileName,
  fileMimeType,
  fileSize,
}: DocumentCardProps) {
  const isFileDoc = !!fileUrl;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
        isActive ? 'bg-zinc-100 dark:bg-zinc-800' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {isFileDoc && <FileTypeIcon mimeType={fileMimeType} />}
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate leading-snug">
            {title || 'Untitled'}
          </span>
        </div>
        {pinned && <Pin className="h-3 w-3 flex-shrink-0 text-zinc-400 mt-0.5" />}
      </div>

      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        <DocTypeBadge docType={docType} />
        {tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="text-[10px] text-zinc-400 dark:text-zinc-500"
          >
            #{tag}
          </span>
        ))}
      </div>

      {isFileDoc ? (
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          {fileMimeType?.split('/').pop()?.toUpperCase()}
          {fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
        </p>
      ) : contentPreview ? (
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 line-clamp-2 leading-relaxed">
          {contentPreview}
        </p>
      ) : null}

      <div className="mt-1.5 flex items-center gap-1.5">
        <Avatar
          name={author.name}
          avatarUrl={author.avatarUrl}
          avatarColor={author.avatarColor ?? undefined}
          size="sm"
        />
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{timeAgo(updatedAt)}</span>
      </div>
    </button>
  );
}
