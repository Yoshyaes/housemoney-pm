'use client';

import { useDocsStore } from '@/lib/stores/docs-store';
import { DocEditor } from './doc-editor';
import { KnowledgeAIPanel } from './knowledge-ai-panel';
import { BookOpen } from 'lucide-react';

interface DocEditorPanelProps {
  workspaceId: string;
  projects: Array<{ id: string; name: string; color: string }>;
}

export function DocEditorPanel({ workspaceId, projects }: DocEditorPanelProps) {
  const { activeDocId, docsView, setActiveDocId } = useDocsStore();

  if (docsView === 'ai-query') {
    return <KnowledgeAIPanel workspaceId={workspaceId} />;
  }

  if (!activeDocId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
          <BookOpen className="h-7 w-7 text-zinc-400" />
        </div>
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Select a document to edit
        </p>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          or create a new one with the button above
        </p>
      </div>
    );
  }

  return (
    <DocEditor
      key={activeDocId}
      docId={activeDocId}
      workspaceId={workspaceId}
      projects={projects}
      onDelete={() => setActiveDocId(null)}
    />
  );
}
