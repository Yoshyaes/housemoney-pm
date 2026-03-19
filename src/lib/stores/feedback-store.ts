'use client';

import { create } from 'zustand';

interface FeedbackState {
  selectedFeedbackId: string | null;
  setSelectedFeedbackId: (id: string | null) => void;

  statusFilter: string | null;
  setStatusFilter: (status: string | null) => void;

  typeFilter: string | null;
  setTypeFilter: (type: string | null) => void;

  priorityFilter: string | null;
  setPriorityFilter: (priority: string | null) => void;

  assigneeFilter: string | null;
  setAssigneeFilter: (assignee: string | null) => void;

  createModalOpen: boolean;
  setCreateModalOpen: (open: boolean) => void;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  selectedFeedbackId: null,
  setSelectedFeedbackId: (id) => set({ selectedFeedbackId: id }),

  statusFilter: null,
  setStatusFilter: (status) => set({ statusFilter: status }),

  typeFilter: null,
  setTypeFilter: (type) => set({ typeFilter: type }),

  priorityFilter: null,
  setPriorityFilter: (priority) => set({ priorityFilter: priority }),

  assigneeFilter: null,
  setAssigneeFilter: (assignee) => set({ assigneeFilter: assignee }),

  createModalOpen: false,
  setCreateModalOpen: (open) => set({ createModalOpen: open }),
}));
