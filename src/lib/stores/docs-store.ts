'use client';

import { create } from 'zustand';

type DocsView = 'editor' | 'ai-query';

interface DocsState {
  activeDocId: string | null;
  setActiveDocId: (id: string | null) => void;

  docsView: DocsView;
  setDocsView: (view: DocsView) => void;

  docTypeFilter: string | null;
  setDocTypeFilter: (type: string | null) => void;

  tagFilter: string[];
  setTagFilter: (tags: string[]) => void;
}

export const useDocsStore = create<DocsState>((set) => ({
  activeDocId: null,
  setActiveDocId: (id) => set({ activeDocId: id }),

  docsView: 'editor',
  setDocsView: (view) => set({ docsView: view }),

  docTypeFilter: null,
  setDocTypeFilter: (type) => set({ docTypeFilter: type }),

  tagFilter: [],
  setTagFilter: (tags) => set({ tagFilter: tags }),
}));
