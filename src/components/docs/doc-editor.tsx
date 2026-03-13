'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import { trpc } from '@/lib/trpc';
import { DocTypeBadge } from './doc-type-badge';
import { DocTagInput } from './doc-tag-input';
import { DocType } from '@/generated/prisma/client';
import { DOC_TYPE_CONFIG } from './doc-type-badge';
import { Pin, PinOff, Trash2, ChevronDown, Check } from 'lucide-react';

interface DocEditorProps {
  docId: string;
  workspaceId: string;
  projects: Array<{ id: string; name: string; color: string }>;
  onDelete?: () => void;
}

const DOC_TYPES = Object.entries(DOC_TYPE_CONFIG) as Array<[DocType, { label: string; className: string }]>;

export function DocEditor({ docId, workspaceId, projects, onDelete }: DocEditorProps) {
  const utils = trpc.useUtils();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const { data: doc, isLoading } = trpc.documents.get.useQuery({ id: docId });

  const updateDoc = trpc.documents.update.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate({ workspaceId });
      utils.documents.get.invalidate({ id: docId });
    },
  });

  const deleteDoc = trpc.documents.delete.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate({ workspaceId });
      onDelete?.();
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing...' }),
      Typography,
      Link.configure({ openOnClick: false }),
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[400px]',
      },
    },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        // tiptap-markdown stores getMarkdown in storage.markdown
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storage = editor.storage as Record<string, any>;
        const md: string = storage.markdown?.getMarkdown?.() ?? editor.getText();
        updateDoc.mutate({ id: docId, content: md });
      }, 1500);
    },
  });

  // Load content into editor when doc loads
  useEffect(() => {
    if (doc && editor && !editor.isDestroyed) {
      editor.commands.setContent(doc.content || '');
    }
  }, [doc?.id, editor]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handleTitleChange = useCallback(
    (title: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateDoc.mutate({ id: docId, title });
      }, 800);
    },
    [docId]
  );

  if (isLoading || !doc) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-6 py-2">
        {/* Doc type selector */}
        <div className="relative">
          <button
            onClick={() => setTypeMenuOpen(!typeMenuOpen)}
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <DocTypeBadge docType={doc.docType} />
            <ChevronDown className="h-3 w-3 text-zinc-400" />
          </button>
          {typeMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 w-44 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-md py-1">
              {DOC_TYPES.map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => {
                    updateDoc.mutate({ id: docId, docType: type });
                    setTypeMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  {doc.docType === type && <Check className="h-3 w-3 text-zinc-500" />}
                  <span className={doc.docType !== type ? 'ml-5' : ''}>{config.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Project link */}
        <div className="relative">
          <button
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {doc.project ? (
              <>
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: doc.project.color }}
                />
                {doc.project.name}
              </>
            ) : (
              'No project'
            )}
            <ChevronDown className="h-3 w-3" />
          </button>
          {projectMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-md py-1">
              <button
                onClick={() => {
                  updateDoc.mutate({ id: docId, projectId: null });
                  setProjectMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                {!doc.projectId && <Check className="h-3 w-3" />}
                <span className={doc.projectId ? 'ml-5' : ''}>No project</span>
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    updateDoc.mutate({ id: docId, projectId: p.id });
                    setProjectMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  {doc.projectId === p.id && <Check className="h-3 w-3 text-zinc-500" />}
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${doc.projectId !== p.id ? 'ml-5' : ''}`}
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="text-zinc-700 dark:text-zinc-300">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Pin toggle */}
          <button
            onClick={() => updateDoc.mutate({ id: docId, pinned: !doc.pinned })}
            title={doc.pinned ? 'Unpin' : 'Pin'}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600"
          >
            {doc.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          {/* Delete */}
          <button
            onClick={() => {
              if (confirm('Delete this document?')) {
                deleteDoc.mutate({ id: docId });
              }
            }}
            title="Delete document"
            className="rounded p-1 text-zinc-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Title */}
        <input
          key={doc.id}
          defaultValue={doc.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          className="mb-2 w-full bg-transparent text-2xl font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 outline-none"
        />

        {/* Tags */}
        <div className="mb-4">
          <DocTagInput
            tags={doc.tags}
            onChange={(tags) => updateDoc.mutate({ id: docId, tags })}
            placeholder="Add tags (press Enter)..."
          />
        </div>

        {/* Tiptap content */}
        <EditorContent editor={editor} />
      </div>

      {/* Saving indicator */}
      {updateDoc.isPending && (
        <div className="absolute bottom-3 right-4 text-[10px] text-zinc-400 dark:text-zinc-500">
          Saving...
        </div>
      )}
    </div>
  );
}
