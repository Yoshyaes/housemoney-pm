'use client';

import { create } from 'zustand';

interface AgentState {
  pendingInsightCount: number;
  setPendingInsightCount: (count: number) => void;

  insightPanelOpen: boolean;
  setInsightPanelOpen: (open: boolean) => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  pendingInsightCount: 0,
  setPendingInsightCount: (count) => set({ pendingInsightCount: count }),

  insightPanelOpen: false,
  setInsightPanelOpen: (open) => set({ insightPanelOpen: open }),
}));
