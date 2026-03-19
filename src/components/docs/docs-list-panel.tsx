'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDocsStore } from '@/lib/stores/docs-store';
import { DocumentCard } from './document-card';
import { DocType } from '@/generated/prisma/client';
import { DOC_TYPE_CONFIG } from './doc-type-badge';

const TYPE_FILTERS: Array<{ id: DocType | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'MEETING_NOTES', label: 'Meetings' },
  { id: 'PLANNING', label: 'Planning' },
  { id: 'DECISION_LOG', label: 'Decisions' },
  { id: 'RETROSPECTIVE', label: 'Retros' },
  { id: 'EXPERIMENT', label: 'Experiments' },
  { id: 'RUNBOOK', label: 'Runbooks' },
];

interface DocsListPanelProps {
  workspaceId: string;
}

export function DocsListPanel({ workspaceId }: DocsListPanelProps) {
  const { activeDocId, setActiveDocId, docTypeFilter, setDocTypeFilter } = useDocsStore();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: listData, isLoading } = trpc.documents.list.useQuery(
    {
      workspaceId,
      docType: (docTypeFilter as DocType) ?? undefined,
      limit: 50,
    },
    { enabled: !!workspaceId && !searchQuery }
  );

  const { data: searchResults } = trpc.documents.search.useQuery(
    { workspaceId, query: searchQuery },
    { enabled: !!workspaceId && searchQuery.length > 0 }
  );

  const docs = searchQuery
    ? (searchResults ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        docType: r.docType as DocType,
        tags: r.tags,
        contentPreview: r.snippet,
        pinned: false,
        author: { name: 'Unknown', avatarUrl: null, avatarColor: null },
        updatedAt: new Date(),
      }))
    : (listData?.items ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
        docType: doc.docType as DocType,
        tags: doc.tags,
        contentPreview: doc.contentPreview ?? '',
        pinned: doc.pinned,
        author: doc.author,
        updatedAt: doc.updatedAt,
        fileUrl: doc.fileUrl,
        fileName: doc.fileName,
        fileMimeType: doc.fileMimeType,
        fileSize: doc.fileSize,
      }));

  return (
    <div className="flex h-full w-[280px] min-w-[280px] flex-col border-r border-zinc-200 dark:border-zinc-800">
      {/* Search */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search docs..."
            className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-zinc-400 hover:text-zinc-600">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 px-2 py-1.5 scrollbar-none">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setDocTypeFilter(f.id === 'ALL' ? null : f.id)}
            className={`flex-shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              (f.id === 'ALL' && !docTypeFilter) || f.id === docTypeFilter
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-xs text-zinc-400">
            Loading...
          </div>
        )}

        {!isLoading && docs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
              {searchQuery ? 'No docs found' : 'No documents yet'}
            </p>
            {!searchQuery && (
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Create your first document using the button above
              </p>
            )}
          </div>
        )}

        {docs.map((doc) => (
          <DocumentCard
            key={doc.id}
            {...doc}
            isActive={activeDocId === doc.id}
            onClick={() => setActiveDocId(doc.id)}
          />
        ))}
      </div>
    </div>
  );
}
