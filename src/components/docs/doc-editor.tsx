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
import { Pin, PinOff, Trash2, ChevronDown, Check, Clock, User, Send, MessageSquare, Paperclip, FileText, X, Upload, Download, FileImage, File } from 'lucide-react';
import { Avatar } from '@/components/shared/avatar';
import { formatDistanceToNow } from 'date-fns';

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
  const [commentBody, setCommentBody] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const { data: comments = [] } = trpc.docComments.list.useQuery({ documentId: docId });
  const addComment = trpc.docComments.create.useMutation({
    onSuccess: () => {
      utils.docComments.list.invalidate({ documentId: docId });
      setCommentBody('');
    },
  });
  const deleteComment = trpc.docComments.delete.useMutation({
    onSuccess: () => utils.docComments.list.invalidate({ documentId: docId }),
  });

  const addAttachment = trpc.documents.addAttachment.useMutation({
    onSuccess: () => utils.documents.get.invalidate({ id: docId }),
  });
  const deleteAttachment = trpc.documents.deleteAttachment.useMutation({
    onSuccess: () => utils.documents.get.invalidate({ id: docId }),
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
      // Skip autosave for file-based documents
      if (doc?.fileUrl) return;
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

  const uploadFile = useCallback(async (file: File) => {
    if (!file) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'document-attachments');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        addAttachment.mutate({
          documentId: docId,
          name: data.name,
          url: data.url,
          size: data.size,
          mimeType: data.mimeType,
        });
      }
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [docId, addAttachment]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading || !doc) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
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

      {/* Editor area — centered, readable width */}
      <div
        className={`flex-1 overflow-y-auto ${isDragging ? 'ring-2 ring-inset ring-amber-400/50 bg-amber-50/5' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mx-auto w-full max-w-[780px] px-8 py-8">
          {/* Title */}
          <input
            key={doc.id}
            defaultValue={doc.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            className="mb-3 w-full bg-transparent text-3xl font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 outline-none leading-tight"
          />

          {/* Metadata */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Created by <span className="text-zinc-600 dark:text-zinc-300 font-medium ml-0.5">{doc.author.name}</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {doc.updatedAt > doc.createdAt && (
              <span className="flex items-center gap-1">
                Last edited
                {doc.lastEditedBy && doc.lastEditedBy.id !== doc.author.id && (
                  <> by <span className="text-zinc-600 dark:text-zinc-300 font-medium ml-0.5">{doc.lastEditedBy.name}</span></>
                )}
                <span className="ml-0.5">
                  {new Date(doc.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' '}at{' '}
                  {new Date(doc.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </span>
            )}
          </div>

          {/* Tags */}
          <div className="mb-5">
            <DocTagInput
              tags={doc.tags}
              onChange={(tags) => updateDoc.mutate({ id: docId, tags })}
              placeholder="Add tags (press Enter)..."
            />
          </div>

          {doc.fileUrl ? (
            /* File preview for file-based documents */
            <div className="mb-6">
              {doc.fileMimeType?.startsWith('image/') ? (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  <img
                    src={doc.fileUrl}
                    alt={doc.fileName || doc.title}
                    className="max-w-full h-auto"
                  />
                </div>
              ) : doc.fileMimeType === 'application/pdf' ? (
                <iframe
                  src={doc.fileUrl}
                  title={doc.fileName || doc.title}
                  className="w-full h-[600px] rounded-lg border border-zinc-200 dark:border-zinc-700"
                />
              ) : (
                <div className="flex flex-col items-center gap-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-8 py-12">
                  <File className="h-12 w-12 text-zinc-300 dark:text-zinc-600" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{doc.fileName || doc.title}</p>
                    {doc.fileSize && (
                      <p className="mt-1 text-xs text-zinc-400">{formatFileSize(doc.fileSize)}</p>
                    )}
                    {doc.fileMimeType && (
                      <p className="mt-0.5 text-[10px] text-zinc-400 uppercase">{doc.fileMimeType.split('/').pop()}</p>
                    )}
                  </div>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium text-white transition-colors"
                    style={{ backgroundColor: '#BA7517' }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download File
                  </a>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Attachments */}
              <div className="mb-5">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Attachments</span>
                  {doc.attachments && doc.attachments.length > 0 && (
                    <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {doc.attachments.length}
                    </span>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-40"
                  >
                    <Upload className="h-3 w-3" />
                    {uploadingFile ? 'Uploading...' : 'Upload'}
                  </button>
                </div>

                {doc.attachments && doc.attachments.length > 0 ? (
                  <div className="space-y-1">
                    {doc.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      >
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300 hover:underline"
                        >
                          {att.name}
                        </a>
                        {att.size && (
                          <span className="text-[10px] text-zinc-400 flex-shrink-0">{formatFileSize(att.size)}</span>
                        )}
                        <button
                          onClick={() => deleteAttachment.mutate({ id: att.id })}
                          className="hidden group-hover:block flex-shrink-0 rounded p-0.5 text-zinc-400 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : !uploadingFile ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-md border border-dashed border-zinc-200 dark:border-zinc-700 px-4 py-3 text-center text-[11px] text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-500 transition-colors"
                  >
                    Drop files here or click to upload
                  </button>
                ) : null}
              </div>

              {/* Tiptap content */}
              <EditorContent editor={editor} />
            </>
          )}

          {/* Comments section */}
          <div className="mt-10 border-t border-zinc-100 dark:border-zinc-800 pt-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              <MessageSquare className="h-4 w-4 text-zinc-400" />
              Comments
              {comments.length > 0 && (
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {comments.length}
                </span>
              )}
            </div>

            {/* Comment list */}
            <div className="mb-6 space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="group flex gap-3">
                  <Avatar
                    name={c.author.name}
                    avatarUrl={c.author.avatarUrl}
                    avatarColor={c.author.avatarColor ?? undefined}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{c.author.name}</span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </span>
                      <button
                        onClick={() => deleteComment.mutate({ id: c.id })}
                        className="ml-auto hidden group-hover:block text-[10px] text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* New comment input */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus-within:ring-1 focus-within:ring-zinc-300 dark:focus-within:ring-zinc-600">
                <textarea
                  ref={commentInputRef}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (commentBody.trim()) addComment.mutate({ documentId: docId, body: commentBody.trim() });
                    }
                  }}
                  placeholder="Add a comment… (Ctrl+Enter to submit)"
                  rows={2}
                  className="w-full resize-none bg-transparent px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
                />
                <div className="flex justify-end px-2 pb-2">
                  <button
                    onClick={() => {
                      if (commentBody.trim()) addComment.mutate({ documentId: docId, body: commentBody.trim() });
                    }}
                    disabled={!commentBody.trim() || addComment.isPending}
                    className="flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: '#BA7517' }}
                  >
                    <Send className="h-3 w-3" />
                    Comment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
