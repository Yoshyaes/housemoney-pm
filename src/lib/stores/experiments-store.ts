'use client';

import { create } from 'zustand';

interface ExperimentsState {
  selectedExperimentId: string | null;
  setSelectedExperimentId: (id: string | null) => void;

  statusFilter: string | null;
  setStatusFilter: (status: string | null) => void;

  personaFilter: string | null;
  setPersonaFilter: (persona: string | null) => void;

  channelFilter: string | null;
  setChannelFilter: (channel: string | null) => void;

  typeFilter: string | null;
  setTypeFilter: (type: string | null) => void;

  ownerFilter: string | null;
  setOwnerFilter: (owner: string | null) => void;

  createModalOpen: boolean;
  setCreateModalOpen: (open: boolean) => void;

  editingExperimentId: string | null;
  setEditingExperimentId: (id: string | null) => void;
}

export const useExperimentsStore = create<ExperimentsState>((set) => ({
  selectedExperimentId: null,
  setSelectedExperimentId: (id) => set({ selectedExperimentId: id }),

  statusFilter: null,
  setStatusFilter: (status) => set({ statusFilter: status }),

  personaFilter: null,
  setPersonaFilter: (persona) => set({ personaFilter: persona }),

  channelFilter: null,
  setChannelFilter: (channel) => set({ channelFilter: channel }),

  typeFilter: null,
  setTypeFilter: (type) => set({ typeFilter: type }),

  ownerFilter: null,
  setOwnerFilter: (owner) => set({ ownerFilter: owner }),

  createModalOpen: false,
  setCreateModalOpen: (open) => set({ createModalOpen: open }),

  editingExperimentId: null,
  setEditingExperimentId: (id) => set({ editingExperimentId: id }),
}));
