'use client';

import { create } from 'zustand';

interface DecisionsState {
  selectedDecisionId: string | null;
  setSelectedDecisionId: (id: string | null) => void;

  statusFilter: string | null;
  setStatusFilter: (status: string | null) => void;

  categoryFilter: string | null;
  setCategoryFilter: (category: string | null) => void;

  createModalOpen: boolean;
  setCreateModalOpen: (open: boolean) => void;

  editingDecisionId: string | null;
  setEditingDecisionId: (id: string | null) => void;
}

export const useDecisionsStore = create<DecisionsState>((set) => ({
  selectedDecisionId: null,
  setSelectedDecisionId: (id) => set({ selectedDecisionId: id }),

  statusFilter: null,
  setStatusFilter: (status) => set({ statusFilter: status }),

  categoryFilter: null,
  setCategoryFilter: (category) => set({ categoryFilter: category }),

  createModalOpen: false,
  setCreateModalOpen: (open) => set({ createModalOpen: open }),

  editingDecisionId: null,
  setEditingDecisionId: (id) => set({ editingDecisionId: id }),
}));
