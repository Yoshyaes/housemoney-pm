'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Trash2, ChevronDown, ChevronRight, MessageSquare, Send } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useExperimentsStore } from '@/lib/stores/experiments-store';
import { ExperimentStatusBadge } from './experiment-status-badge';
import { ExperimentScoreBadge } from './experiment-score-badge';
import { Avatar } from '@/components/shared/avatar';
import { formatDistanceToNow } from 'date-fns';
import {
  BRAND_AMBER,
  EXPERIMENT_STATUS_LABELS,
  EXPERIMENT_STATUS_ORDER,
  EXPERIMENT_PERSONA_LABELS,
  EXPERIMENT_CHANNEL_LABELS,
  EXPERIMENT_TYPE_LABELS,
  EXPERIMENT_SCORING_CRITERIA,
} from '@/lib/constants';
import type { ExperimentStatus, ExperimentPersona, ExperimentChannel, ExperimentType } from '@/generated/prisma/client';

interface ExperimentDetailPanelProps {
  workspaceId: string;
  currentUserId: string | null;
  isAdmin?: boolean;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string | null }>;
  projects: Array<{ id: string; name: string; color: string }>;
}

function SectionToggle({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 py-2 text-[10px] uppercase tracking-wider font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 border-t border-zinc-100 dark:border-zinc-800/60"
    >
      {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      {title}
    </button>
  );
}

export function ExperimentDetailPanel({ workspaceId, currentUserId, isAdmin, members, projects }: ExperimentDetailPanelProps) {
  const { selectedExperimentId, setSelectedExperimentId } = useExperimentsStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [commentBody, setCommentBody] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    identity: true,
    hypothesis: true,
    economics: false,
    scoring: true,
    execution: false,
    measures: false,
    results: true,
    decisions: true,
  });

  const utils = trpc.useUtils();

  const { data: experiment, isLoading } = trpc.experiments.get.useQuery(
    { id: selectedExperimentId! },
    { enabled: !!selectedExperimentId }
  );

  const updateExperiment = trpc.experiments.update.useMutation({
    onSuccess: () => {
      utils.experiments.get.invalidate({ id: selectedExperimentId! });
      utils.experiments.list.invalidate();
      utils.experiments.getStats.invalidate();
      setLocalEdits({});
      setMutationError(null);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  const deleteExperiment = trpc.experiments.delete.useMutation({
    onSuccess: () => {
      setSelectedExperimentId(null);
      utils.experiments.list.invalidate();
      utils.experiments.getStats.invalidate();
      setMutationError(null);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  const { data: comments = [] } = trpc.experimentComments.list.useQuery(
    { experimentId: selectedExperimentId! },
    { enabled: !!selectedExperimentId }
  );
  const addComment = trpc.experimentComments.create.useMutation({
    onSuccess: () => {
      utils.experimentComments.list.invalidate({ experimentId: selectedExperimentId! });
      setCommentBody('');
    },
  });
  const deleteComment = trpc.experimentComments.delete.useMutation({
    onSuccess: () => utils.experimentComments.list.invalidate({ experimentId: selectedExperimentId! }),
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const debouncedUpdate = (field: string, value: unknown) => {
    // Update local state immediately so typing feels responsive
    if (typeof value === 'string' || value === null) {
      setLocalEdits((prev) => ({ ...prev, [field]: (value as string) ?? '' }));
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!selectedExperimentId) return;
      updateExperiment.mutate({ id: selectedExperimentId, [field]: value });
    }, 500);
  };

  const immediateUpdate = (field: string, value: unknown) => {
    if (!selectedExperimentId) return;
    updateExperiment.mutate({ id: selectedExperimentId, [field]: value });
  };

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (experiment) {
      setTitleValue(experiment.title);
    }
  }, [experiment]);

  useEffect(() => {
    setLocalEdits({});
  }, [selectedExperimentId]);

  if (!selectedExperimentId) return null;

  const canEdit = experiment && (experiment.createdById === currentUserId || isAdmin);
  const showResults = experiment && (experiment.status === 'IN_PROGRESS' || experiment.status === 'COMPLETED');
  const showDecisions = experiment && experiment.status === 'COMPLETED';

  const scoringCriteria = (experiment?.scoringCriteria ?? {}) as Record<string, boolean>;
  const score = Object.values(scoringCriteria).filter(Boolean).length;

  const getFieldValue = (field: string): string => {
    if (field in localEdits) return localEdits[field];
    if (!experiment) return '';
    return (experiment[field as keyof typeof experiment] as string) ?? '';
  };

  const inputCls = 'w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600';
  const labelCls = 'mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500';
  const readonlyCls = 'text-xs text-zinc-600 dark:text-zinc-400';

  return (
    <div className="flex h-full w-96 flex-shrink-0 flex-col border-l border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {experiment && (
            <>
              <span className="font-mono text-[11px] text-zinc-400">{experiment.identifier}</span>
              <ExperimentStatusBadge status={experiment.status} />
            </>
          )}
        </div>
        <button
          onClick={() => setSelectedExperimentId(null)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Loading...</div>
      ) : !experiment ? (
        <div className="flex items-center justify-center py-12 text-xs text-zinc-400">Experiment not found</div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {/* Error */}
          {mutationError && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-900/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-400 mb-2">
              <span className="flex-1">{mutationError}</span>
              <button onClick={() => setMutationError(null)} className="text-red-400 hover:text-red-600">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Title */}
          <div className="mb-3">
            {editingTitle && canEdit ? (
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={() => { setEditingTitle(false); if (titleValue.trim() && titleValue !== experiment.title) immediateUpdate('title', titleValue.trim()); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setEditingTitle(false); if (titleValue.trim() && titleValue !== experiment.title) immediateUpdate('title', titleValue.trim()); } if (e.key === 'Escape') { setEditingTitle(false); setTitleValue(experiment.title); } }}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 outline-none"
              />
            ) : (
              <h2
                onClick={() => canEdit && setEditingTitle(true)}
                className={`text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${canEdit ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded px-1 -mx-1' : ''}`}
              >
                {experiment.title}
              </h2>
            )}
          </div>

          {/* Status + Score row */}
          <div className="flex items-center gap-3 mb-3">
            <div>
              <label className={labelCls}>Status</label>
              {canEdit ? (
                <select
                  value={experiment.status}
                  onChange={(e) => immediateUpdate('status', e.target.value)}
                  className={inputCls}
                >
                  {EXPERIMENT_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{EXPERIMENT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              ) : (
                <ExperimentStatusBadge status={experiment.status} />
              )}
            </div>
            <div>
              <label className={labelCls}>Score</label>
              <ExperimentScoreBadge score={score} />
            </div>
          </div>

          {/* === IDENTITY === */}
          <SectionToggle title="Identity" open={openSections.identity} onToggle={() => toggleSection('identity')} />
          {openSections.identity && (
            <div className="space-y-2 pb-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Persona</label>
                  {canEdit ? (
                    <select value={experiment.persona ?? ''} onChange={(e) => immediateUpdate('persona', e.target.value || null)} className={inputCls}>
                      <option value="">None</option>
                      {Object.entries(EXPERIMENT_PERSONA_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <p className={readonlyCls}>{experiment.persona ? EXPERIMENT_PERSONA_LABELS[experiment.persona] : '—'}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Channel</label>
                  {canEdit ? (
                    <select value={experiment.channel ?? ''} onChange={(e) => immediateUpdate('channel', e.target.value || null)} className={inputCls}>
                      <option value="">None</option>
                      {Object.entries(EXPERIMENT_CHANNEL_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <p className={readonlyCls}>{experiment.channel ? EXPERIMENT_CHANNEL_LABELS[experiment.channel] : '—'}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Type</label>
                  {canEdit ? (
                    <select value={experiment.experimentType ?? ''} onChange={(e) => immediateUpdate('experimentType', e.target.value || null)} className={inputCls}>
                      <option value="">None</option>
                      {Object.entries(EXPERIMENT_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <p className={readonlyCls}>{experiment.experimentType ? EXPERIMENT_TYPE_LABELS[experiment.experimentType] : '—'}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Sprint</label>
                  {canEdit ? (
                    <input value={getFieldValue('sprint')} onChange={(e) => debouncedUpdate('sprint', e.target.value || null)} className={inputCls} placeholder="Sprint #" />
                  ) : (
                    <p className={readonlyCls}>{experiment.sprint || '—'}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Project</label>
                  {canEdit ? (
                    <select value={experiment.projectId ?? ''} onChange={(e) => immediateUpdate('projectId', e.target.value || null)} className={inputCls}>
                      <option value="">None</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className={readonlyCls}>{experiment.project?.name || '—'}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Owner</label>
                  {canEdit ? (
                    <select value={experiment.ownerId ?? ''} onChange={(e) => immediateUpdate('ownerId', e.target.value || null)} className={inputCls}>
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {experiment.owner ? (
                        <>
                          <Avatar name={experiment.owner.name} avatarUrl={experiment.owner.avatarUrl} avatarColor={experiment.owner.avatarColor ?? undefined} size="xs" />
                          <span className={readonlyCls}>{experiment.owner.name}</span>
                        </>
                      ) : (
                        <span className={readonlyCls}>—</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>Cohort</label>
                {canEdit ? (
                  <input value={getFieldValue('cohort')} onChange={(e) => debouncedUpdate('cohort', e.target.value || null)} className={inputCls} placeholder="e.g. New + PM Partner" />
                ) : (
                  <p className={readonlyCls}>{experiment.cohort || '—'}</p>
                )}
              </div>
            </div>
          )}

          {/* === HYPOTHESIS === */}
          <SectionToggle title="Hypothesis" open={openSections.hypothesis} onToggle={() => toggleSection('hypothesis')} />
          {openSections.hypothesis && (
            <div className="space-y-2 pb-2">
              <div>
                <label className={labelCls}>Hypothesis</label>
                {canEdit ? (
                  <textarea value={getFieldValue('hypothesis')} onChange={(e) => debouncedUpdate('hypothesis', e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="If [X], then [Persona] will [Y] because [Z]" />
                ) : (
                  <p className={`${readonlyCls} whitespace-pre-wrap`}>{experiment.hypothesis || '—'}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Riskiest Assumption</label>
                {canEdit ? (
                  <input value={getFieldValue('riskiestAssumption')} onChange={(e) => debouncedUpdate('riskiestAssumption', e.target.value || null)} className={inputCls} />
                ) : (
                  <p className={readonlyCls}>{experiment.riskiestAssumption || '—'}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Learning Goal</label>
                {canEdit ? (
                  <input value={getFieldValue('learningGoal')} onChange={(e) => debouncedUpdate('learningGoal', e.target.value || null)} className={inputCls} />
                ) : (
                  <p className={readonlyCls}>{experiment.learningGoal || '—'}</p>
                )}
              </div>
            </div>
          )}

          {/* === UNIT ECONOMICS === */}
          <SectionToggle title="Unit Economics" open={openSections.economics} onToggle={() => toggleSection('economics')} />
          {openSections.economics && (
            <div className="space-y-2 pb-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>CAC Estimate ($)</label>
                  {canEdit ? (
                    <input type="number" value={'cacEstimate' in localEdits ? localEdits.cacEstimate : experiment.cacEstimate ?? ''} onChange={(e) => { setLocalEdits((prev) => ({ ...prev, cacEstimate: e.target.value })); debouncedUpdate('cacEstimate', e.target.value ? Number(e.target.value) : null); }} className={inputCls} />
                  ) : (
                    <p className={readonlyCls}>{experiment.cacEstimate != null ? `$${experiment.cacEstimate}` : '—'}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Monthly ARPU ($)</label>
                  {canEdit ? (
                    <input type="number" value={'monthlyArpu' in localEdits ? localEdits.monthlyArpu : experiment.monthlyArpu ?? ''} onChange={(e) => { setLocalEdits((prev) => ({ ...prev, monthlyArpu: e.target.value })); debouncedUpdate('monthlyArpu', e.target.value ? Number(e.target.value) : null); }} className={inputCls} />
                  ) : (
                    <p className={readonlyCls}>{experiment.monthlyArpu != null ? `$${experiment.monthlyArpu}` : '—'}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>LTV ($)</label>
                  {canEdit ? (
                    <input type="number" value={'ltvEstimate' in localEdits ? localEdits.ltvEstimate : experiment.ltvEstimate ?? ''} onChange={(e) => { setLocalEdits((prev) => ({ ...prev, ltvEstimate: e.target.value })); debouncedUpdate('ltvEstimate', e.target.value ? Number(e.target.value) : null); }} className={inputCls} />
                  ) : (
                    <p className={readonlyCls}>{experiment.ltvEstimate != null ? `$${experiment.ltvEstimate}` : '—'}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Payback (mo)</label>
                  {canEdit ? (
                    <input type="number" step="0.1" value={'paybackPeriod' in localEdits ? localEdits.paybackPeriod : experiment.paybackPeriod ?? ''} onChange={(e) => { setLocalEdits((prev) => ({ ...prev, paybackPeriod: e.target.value })); debouncedUpdate('paybackPeriod', e.target.value ? Number(e.target.value) : null); }} className={inputCls} />
                  ) : (
                    <p className={readonlyCls}>{experiment.paybackPeriod != null ? `${experiment.paybackPeriod}mo` : '—'}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Deposit ($)</label>
                  {canEdit ? (
                    <input type="number" value={'depositTarget' in localEdits ? localEdits.depositTarget : experiment.depositTarget ?? ''} onChange={(e) => { setLocalEdits((prev) => ({ ...prev, depositTarget: e.target.value })); debouncedUpdate('depositTarget', e.target.value ? Number(e.target.value) : null); }} className={inputCls} />
                  ) : (
                    <p className={readonlyCls}>{experiment.depositTarget != null ? `$${experiment.depositTarget}` : '—'}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* === SCORING === */}
          <SectionToggle title="Prioritization Score" open={openSections.scoring} onToggle={() => toggleSection('scoring')} />
          {openSections.scoring && (
            <div className="space-y-1.5 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <ExperimentScoreBadge score={score} />
                {score < 5 ? (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">Below threshold (&lt;5/8)</span>
                ) : (
                  <span className="text-[11px] text-green-600 dark:text-green-400">Passes threshold</span>
                )}
              </div>
              {EXPERIMENT_SCORING_CRITERIA.map((criterion) => (
                <label key={criterion.key} className={`flex items-start gap-2 ${canEdit ? 'cursor-pointer' : ''} group`}>
                  <input
                    type="checkbox"
                    checked={scoringCriteria[criterion.key] ?? false}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const newCriteria = { ...scoringCriteria, [criterion.key]: e.target.checked };
                      immediateUpdate('scoringCriteria', newCriteria);
                    }}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-amber-600 focus:ring-amber-500 disabled:opacity-60"
                  />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200">
                    {criterion.label}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* === EXECUTION === */}
          <SectionToggle title="Execution" open={openSections.execution} onToggle={() => toggleSection('execution')} />
          {openSections.execution && (
            <div className="space-y-2 pb-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Start Date</label>
                  {canEdit ? (
                    <input
                      type="date"
                      value={experiment.startDate ? new Date(experiment.startDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => {
                        if (!e.target.value) { immediateUpdate('startDate', null); return; }
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        immediateUpdate('startDate', new Date(y, m - 1, d, 12));
                      }}
                      className={inputCls}
                    />
                  ) : (
                    <p className={readonlyCls}>{experiment.startDate ? new Date(experiment.startDate).toLocaleDateString() : '—'}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>End Date</label>
                  {canEdit ? (
                    <input
                      type="date"
                      value={experiment.endDate ? new Date(experiment.endDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => {
                        if (!e.target.value) { immediateUpdate('endDate', null); return; }
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        immediateUpdate('endDate', new Date(y, m - 1, d, 12));
                      }}
                      className={inputCls}
                    />
                  ) : (
                    <p className={readonlyCls}>{experiment.endDate ? new Date(experiment.endDate).toLocaleDateString() : '—'}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Resource Cost</label>
                  {canEdit ? (
                    <input value={getFieldValue('resourceCost')} onChange={(e) => debouncedUpdate('resourceCost', e.target.value || null)} className={inputCls} placeholder="$500 + 20 hours" />
                  ) : (
                    <p className={readonlyCls}>{experiment.resourceCost || '—'}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Test Size</label>
                  {canEdit ? (
                    <input value={getFieldValue('testSize')} onChange={(e) => debouncedUpdate('testSize', e.target.value || null)} className={inputCls} placeholder="50 users" />
                  ) : (
                    <p className={readonlyCls}>{experiment.testSize || '—'}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* === SUCCESS MEASURES === */}
          <SectionToggle title="Success Measures" open={openSections.measures} onToggle={() => toggleSection('measures')} />
          {openSections.measures && (
            <div className="space-y-2 pb-2">
              <div>
                <label className={labelCls}>Primary Metric</label>
                {canEdit ? (
                  <input value={getFieldValue('primaryMetric')} onChange={(e) => debouncedUpdate('primaryMetric', e.target.value || null)} className={inputCls} placeholder="e.g. Deposit Rate: >30%" />
                ) : (
                  <p className={readonlyCls}>{experiment.primaryMetric || '—'}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Secondary Metrics</label>
                {canEdit ? (
                  <textarea value={getFieldValue('secondaryMetrics')} onChange={(e) => debouncedUpdate('secondaryMetrics', e.target.value || null)} rows={2} className={`${inputCls} resize-none`} />
                ) : (
                  <p className={`${readonlyCls} whitespace-pre-wrap`}>{experiment.secondaryMetrics || '—'}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Kill Condition</label>
                {canEdit ? (
                  <input value={getFieldValue('killCondition')} onChange={(e) => debouncedUpdate('killCondition', e.target.value || null)} className={inputCls} />
                ) : (
                  <p className={readonlyCls}>{experiment.killCondition || '—'}</p>
                )}
              </div>
            </div>
          )}

          {/* === RESULTS (only when IN_PROGRESS or COMPLETED) === */}
          {showResults && (
            <>
              <SectionToggle title="Results" open={openSections.results} onToggle={() => toggleSection('results')} />
              {openSections.results && (
                <div className="space-y-2 pb-2">
                  <div>
                    <label className={labelCls}>What Happened</label>
                    {canEdit ? (
                      <textarea value={getFieldValue('whatHappened')} onChange={(e) => debouncedUpdate('whatHappened', e.target.value || null)} rows={3} className={`${inputCls} resize-none`} placeholder="Describe what happened..." />
                    ) : (
                      <p className={`${readonlyCls} whitespace-pre-wrap`}>{experiment.whatHappened || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Primary Metric Result</label>
                    {canEdit ? (
                      <input value={getFieldValue('primaryMetricResult')} onChange={(e) => debouncedUpdate('primaryMetricResult', e.target.value || null)} className={inputCls} />
                    ) : (
                      <p className={readonlyCls}>{experiment.primaryMetricResult || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Secondary Metric Results</label>
                    {canEdit ? (
                      <textarea value={getFieldValue('secondaryMetricResults')} onChange={(e) => debouncedUpdate('secondaryMetricResults', e.target.value || null)} rows={2} className={`${inputCls} resize-none`} />
                    ) : (
                      <p className={`${readonlyCls} whitespace-pre-wrap`}>{experiment.secondaryMetricResults || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Unexpected Findings</label>
                    {canEdit ? (
                      <textarea value={getFieldValue('unexpectedFindings')} onChange={(e) => debouncedUpdate('unexpectedFindings', e.target.value || null)} rows={2} className={`${inputCls} resize-none`} />
                    ) : (
                      <p className={`${readonlyCls} whitespace-pre-wrap`}>{experiment.unexpectedFindings || '—'}</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* === DECISIONS (only when COMPLETED) === */}
          {showDecisions && (
            <>
              <SectionToggle title="Decisions" open={openSections.decisions} onToggle={() => toggleSection('decisions')} />
              {openSections.decisions && (
                <div className="space-y-2 pb-2">
                  <div>
                    <label className={labelCls}>Did We Learn?</label>
                    {canEdit ? (
                      <textarea value={getFieldValue('didWeLearn')} onChange={(e) => debouncedUpdate('didWeLearn', e.target.value || null)} rows={2} className={`${inputCls} resize-none`} placeholder="Yes / No — What did we learn?" />
                    ) : (
                      <p className={`${readonlyCls} whitespace-pre-wrap`}>{experiment.didWeLearn || '—'}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Continue Experiment?</label>
                      {canEdit ? (
                        <input value={getFieldValue('continueExperiment')} onChange={(e) => debouncedUpdate('continueExperiment', e.target.value || null)} className={inputCls} placeholder="Yes / No / Pivot" />
                      ) : (
                        <p className={readonlyCls}>{experiment.continueExperiment || '—'}</p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Continue Persona?</label>
                      {canEdit ? (
                        <input value={getFieldValue('continuePersona')} onChange={(e) => debouncedUpdate('continuePersona', e.target.value || null)} className={inputCls} placeholder="Yes / No" />
                      ) : (
                        <p className={readonlyCls}>{experiment.continuePersona || '—'}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Next Action</label>
                    {canEdit ? (
                      <input value={getFieldValue('nextAction')} onChange={(e) => debouncedUpdate('nextAction', e.target.value || null)} className={inputCls} placeholder="Build / Scale / Icebox / Kill / Interview more" />
                    ) : (
                      <p className={readonlyCls}>{experiment.nextAction || '—'}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Investor-Ready Insight</label>
                    {canEdit ? (
                      <textarea value={getFieldValue('investorReadyInsight')} onChange={(e) => debouncedUpdate('investorReadyInsight', e.target.value || null)} rows={2} className={`${inputCls} resize-none`} placeholder="One sentence for a VC slide" />
                    ) : (
                      <p className={`${readonlyCls} whitespace-pre-wrap`}>{experiment.investorReadyInsight || '—'}</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* === COMMENTS === */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider font-medium text-zinc-400 dark:text-zinc-500">
              <MessageSquare className="h-3.5 w-3.5" />
              Comments
              {comments.length > 0 && (
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 normal-case tracking-normal">
                  {comments.length}
                </span>
              )}
            </div>

            {/* Comment list */}
            <div className="mb-3 space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="group flex gap-2">
                  <Avatar
                    name={c.author.name}
                    avatarUrl={c.author.avatarUrl}
                    avatarColor={c.author.avatarColor ?? undefined}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">{c.author.name}</span>
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
                    <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* New comment input */}
            <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus-within:ring-1 focus-within:ring-zinc-300 dark:focus-within:ring-zinc-600">
              <textarea
                ref={commentInputRef}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (commentBody.trim()) addComment.mutate({ experimentId: selectedExperimentId!, body: commentBody.trim() });
                  }
                }}
                placeholder="Add a comment… (Ctrl+Enter to submit)"
                rows={2}
                className="w-full resize-none bg-transparent px-2.5 py-1.5 text-[11px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
              />
              <div className="flex justify-end px-2 pb-1.5">
                <button
                  onClick={() => {
                    if (commentBody.trim()) addComment.mutate({ experimentId: selectedExperimentId!, body: commentBody.trim() });
                  }}
                  disabled={!commentBody.trim() || addComment.isPending}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: BRAND_AMBER }}
                >
                  <Send className="h-2.5 w-2.5" />
                  Comment
                </button>
              </div>
            </div>
          </div>

          {/* Delete */}
          {canEdit && (
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/60">
              {deleteConfirmOpen ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-red-600 dark:text-red-400">Delete this experiment?</span>
                  <button
                    onClick={() => deleteExperiment.mutate({ id: experiment.id })}
                    disabled={deleteExperiment.isPending}
                    className="rounded-md bg-red-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteExperiment.isPending ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirmOpen(false)}
                    className="rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete experiment
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
