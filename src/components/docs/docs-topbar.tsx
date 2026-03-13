'use client';

import { Plus, Sparkles, BookOpen } from 'lucide-react';
import { useDocsStore } from '@/lib/stores/docs-store';
import { trpc } from '@/lib/trpc';

interface DocsTopbarProps {
  workspaceId: string;
}

export function DocsTopbar({ workspaceId }: DocsTopbarProps) {
  const { docsView, setDocsView, setActiveDocId } = useDocsStore();
  const utils = trpc.useUtils();

  const createDoc = trpc.documents.create.useMutation({
    onSuccess: (doc) => {
      utils.documents.list.invalidate({ workspaceId });
      setActiveDocId(doc.id);
      setDocsView('editor');
    },
  });

  const handleNewDoc = () => {
    createDoc.mutate({
      workspaceId,
      title: 'Untitled',
      content: '',
      docType: 'GENERAL',
      tags: [],
    });
  };

  return (
    <div className="flex items-center gap-3 border-b border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Docs</span>
      </div>

      {/* View toggle */}
      <div className="flex items-center rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden ml-2">
        <button
          onClick={() => setDocsView('editor')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors ${
            docsView === 'editor'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
              : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          <BookOpen className="h-3 w-3" />
          Documents
        </button>
        <button
          onClick={() => setDocsView('ai-query')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors border-l border-zinc-200 dark:border-zinc-700 ${
            docsView === 'ai-query'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
              : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          <Sparkles className="h-3 w-3" />
          Ask AI
        </button>
      </div>

      <div className="ml-auto">
        <button
          onClick={handleNewDoc}
          disabled={createDoc.isPending}
          className="flex items-center gap-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-60 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New Doc
        </button>
      </div>
    </div>
  );
}
