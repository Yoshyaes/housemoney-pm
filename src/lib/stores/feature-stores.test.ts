// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore } from './agent-store';
import { useDocsStore } from './docs-store';
import { useDecisionsStore } from './decisions-store';
import { useExperimentsStore } from './experiments-store';
import { useFeedbackStore } from './feedback-store';

describe('useAgentStore', () => {
  beforeEach(() => {
    useAgentStore.setState({ pendingInsightCount: 0, insightPanelOpen: false });
  });

  it('starts with defaults', () => {
    const state = useAgentStore.getState();
    expect(state.pendingInsightCount).toBe(0);
    expect(state.insightPanelOpen).toBe(false);
  });

  it('sets pendingInsightCount', () => {
    useAgentStore.getState().setPendingInsightCount(7);
    expect(useAgentStore.getState().pendingInsightCount).toBe(7);
  });

  it('opens/closes the insight panel', () => {
    useAgentStore.getState().setInsightPanelOpen(true);
    expect(useAgentStore.getState().insightPanelOpen).toBe(true);
    useAgentStore.getState().setInsightPanelOpen(false);
    expect(useAgentStore.getState().insightPanelOpen).toBe(false);
  });
});

describe('useDocsStore', () => {
  beforeEach(() => {
    useDocsStore.setState({
      activeDocId: null,
      docsView: 'editor',
      docTypeFilter: null,
      tagFilter: [],
    });
  });

  it('starts with defaults', () => {
    const state = useDocsStore.getState();
    expect(state.activeDocId).toBeNull();
    expect(state.docsView).toBe('editor');
    expect(state.docTypeFilter).toBeNull();
    expect(state.tagFilter).toEqual([]);
  });

  it('switches docsView between editor and ai-query', () => {
    useDocsStore.getState().setDocsView('ai-query');
    expect(useDocsStore.getState().docsView).toBe('ai-query');
    useDocsStore.getState().setDocsView('editor');
    expect(useDocsStore.getState().docsView).toBe('editor');
  });

  it('sets and clears the active doc id', () => {
    useDocsStore.getState().setActiveDocId('doc-1');
    expect(useDocsStore.getState().activeDocId).toBe('doc-1');
    useDocsStore.getState().setActiveDocId(null);
    expect(useDocsStore.getState().activeDocId).toBeNull();
  });

  it('sets tagFilter as an array', () => {
    useDocsStore.getState().setTagFilter(['a', 'b']);
    expect(useDocsStore.getState().tagFilter).toEqual(['a', 'b']);
  });
});

describe('useDecisionsStore', () => {
  beforeEach(() => {
    useDecisionsStore.setState({
      selectedDecisionId: null,
      statusFilter: null,
      categoryFilter: null,
      createModalOpen: false,
      editingDecisionId: null,
    });
  });

  it('starts with defaults', () => {
    const s = useDecisionsStore.getState();
    expect(s.selectedDecisionId).toBeNull();
    expect(s.statusFilter).toBeNull();
    expect(s.categoryFilter).toBeNull();
    expect(s.createModalOpen).toBe(false);
    expect(s.editingDecisionId).toBeNull();
  });

  it('updates each filter independently', () => {
    useDecisionsStore.getState().setStatusFilter('OPEN');
    useDecisionsStore.getState().setCategoryFilter('ARCHITECTURE');
    expect(useDecisionsStore.getState().statusFilter).toBe('OPEN');
    expect(useDecisionsStore.getState().categoryFilter).toBe('ARCHITECTURE');
  });

  it('toggles create modal', () => {
    useDecisionsStore.getState().setCreateModalOpen(true);
    expect(useDecisionsStore.getState().createModalOpen).toBe(true);
  });
});

describe('useExperimentsStore', () => {
  beforeEach(() => {
    useExperimentsStore.setState({
      selectedExperimentId: null,
      statusFilter: null,
      personaFilter: null,
      channelFilter: null,
      typeFilter: null,
      ownerFilter: null,
      createModalOpen: false,
      editingExperimentId: null,
    });
  });

  it('supports independent filters', () => {
    const s = useExperimentsStore.getState();
    s.setStatusFilter('RUNNING');
    s.setPersonaFilter('developer');
    s.setChannelFilter('web');
    s.setTypeFilter('AB');
    s.setOwnerFilter('user-1');

    const after = useExperimentsStore.getState();
    expect(after.statusFilter).toBe('RUNNING');
    expect(after.personaFilter).toBe('developer');
    expect(after.channelFilter).toBe('web');
    expect(after.typeFilter).toBe('AB');
    expect(after.ownerFilter).toBe('user-1');
  });

  it('can clear all filters by setting to null', () => {
    const s = useExperimentsStore.getState();
    s.setStatusFilter('RUNNING');
    s.setStatusFilter(null);
    expect(useExperimentsStore.getState().statusFilter).toBeNull();
  });
});

describe('useFeedbackStore', () => {
  beforeEach(() => {
    useFeedbackStore.setState({
      selectedFeedbackId: null,
      statusFilter: null,
      typeFilter: null,
      priorityFilter: null,
      assigneeFilter: null,
      createModalOpen: false,
    });
  });

  it('supports each filter and modal flag', () => {
    const s = useFeedbackStore.getState();
    s.setSelectedFeedbackId('fb-1');
    s.setStatusFilter('NEW');
    s.setPriorityFilter('HIGH');
    s.setAssigneeFilter('user-2');
    s.setTypeFilter('BUG');
    s.setCreateModalOpen(true);

    const after = useFeedbackStore.getState();
    expect(after.selectedFeedbackId).toBe('fb-1');
    expect(after.statusFilter).toBe('NEW');
    expect(after.priorityFilter).toBe('HIGH');
    expect(after.assigneeFilter).toBe('user-2');
    expect(after.typeFilter).toBe('BUG');
    expect(after.createModalOpen).toBe(true);
  });
});
