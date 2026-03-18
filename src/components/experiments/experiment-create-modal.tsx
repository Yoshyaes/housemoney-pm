'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useExperimentsStore } from '@/lib/stores/experiments-store';
import { ExperimentScoreBadge } from './experiment-score-badge';
import {
  BRAND_AMBER,
  EXPERIMENT_PERSONA_LABELS,
  EXPERIMENT_CHANNEL_LABELS,
  EXPERIMENT_TYPE_LABELS,
  EXPERIMENT_SCORING_CRITERIA,
} from '@/lib/constants';
import type { ExperimentPersona, ExperimentChannel, ExperimentType } from '@/generated/prisma/client';

interface ExperimentCreateModalProps {
  workspaceId: string;
  members: Array<{ id: string; name: string; avatarUrl?: string | null; avatarColor?: string | null }>;
  projects: Array<{ id: string; name: string; color: string }>;
  currentUserId: string;
}

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 py-1.5 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
    >
      {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      {title}
    </button>
  );
}

export function ExperimentCreateModal({ workspaceId, members, projects }: ExperimentCreateModalProps) {
  const { createModalOpen, setCreateModalOpen } = useExperimentsStore();
  const utils = trpc.useUtils();

  // Identity
  const [title, setTitle] = useState('');
  const [sprint, setSprint] = useState('');
  const [persona, setPersona] = useState('');
  const [cohort, setCohort] = useState('');
  const [channel, setChannel] = useState('');
  const [experimentType, setExperimentType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [ownerId, setOwnerId] = useState('');

  // Hypothesis
  const [hypothesis, setHypothesis] = useState('');
  const [riskiestAssumption, setRiskiestAssumption] = useState('');
  const [learningGoal, setLearningGoal] = useState('');

  // Unit Economics
  const [cacEstimate, setCacEstimate] = useState('');
  const [monthlyArpu, setMonthlyArpu] = useState('');
  const [ltvEstimate, setLtvEstimate] = useState('');
  const [paybackPeriod, setPaybackPeriod] = useState('');
  const [depositTarget, setDepositTarget] = useState('');

  // Scoring
  const [scoringCriteria, setScoringCriteria] = useState<Record<string, boolean>>(
    Object.fromEntries(EXPERIMENT_SCORING_CRITERIA.map((c) => [c.key, false]))
  );

  // Execution
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [resourceCost, setResourceCost] = useState('');
  const [testSize, setTestSize] = useState('');

  // Success Measures
  const [primaryMetric, setPrimaryMetric] = useState('');
  const [secondaryMetrics, setSecondaryMetrics] = useState('');
  const [killCondition, setKillCondition] = useState('');

  // UI
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    identity: true,
    hypothesis: true,
    economics: false,
    scoring: true,
    execution: false,
    measures: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const score = Object.values(scoringCriteria).filter(Boolean).length;

  const createExperiment = trpc.experiments.create.useMutation({
    onSuccess: () => {
      utils.experiments.list.invalidate();
      utils.experiments.getStats.invalidate();
      resetForm();
      setCreateModalOpen(false);
    },
    onError: (err) => {
      setMutationError(err.message);
    },
  });

  const resetForm = () => {
    setTitle('');
    setSprint('');
    setPersona('');
    setCohort('');
    setChannel('');
    setExperimentType('');
    setProjectId('');
    setOwnerId('');
    setHypothesis('');
    setRiskiestAssumption('');
    setLearningGoal('');
    setCacEstimate('');
    setMonthlyArpu('');
    setLtvEstimate('');
    setPaybackPeriod('');
    setDepositTarget('');
    setScoringCriteria(Object.fromEntries(EXPERIMENT_SCORING_CRITERIA.map((c) => [c.key, false])));
    setStartDate('');
    setEndDate('');
    setResourceCost('');
    setTestSize('');
    setPrimaryMetric('');
    setSecondaryMetrics('');
    setKillCondition('');
    setMutationError(null);
  };

  const parseDate = (dateStr: string): Date | undefined => {
    if (!dateStr) return undefined;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };

  const parseFloat = (val: string): number | undefined => {
    const n = Number(val);
    return val && !isNaN(n) ? n : undefined;
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    setMutationError(null);
    createExperiment.mutate({
      workspaceId,
      title: title.trim(),
      sprint: sprint.trim() || undefined,
      persona: (persona || undefined) as ExperimentPersona | undefined,
      cohort: cohort.trim() || undefined,
      channel: (channel || undefined) as ExperimentChannel | undefined,
      experimentType: (experimentType || undefined) as ExperimentType | undefined,
      hypothesis,
      riskiestAssumption: riskiestAssumption.trim() || undefined,
      learningGoal: learningGoal.trim() || undefined,
      cacEstimate: parseFloat(cacEstimate),
      monthlyArpu: parseFloat(monthlyArpu),
      ltvEstimate: parseFloat(ltvEstimate),
      paybackPeriod: parseFloat(paybackPeriod),
      depositTarget: parseFloat(depositTarget),
      scoringCriteria,
      startDate: parseDate(startDate),
      endDate: parseDate(endDate),
      resourceCost: resourceCost.trim() || undefined,
      testSize: testSize.trim() || undefined,
      primaryMetric: primaryMetric.trim() || undefined,
      secondaryMetrics: secondaryMetrics.trim() || undefined,
      killCondition: killCondition.trim() || undefined,
      projectId: projectId || undefined,
      ownerId: ownerId || undefined,
    });
  };

  if (!createModalOpen) return null;

  const inputCls = 'w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600';
  const labelCls = 'mb-1 block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      onClick={() => { setCreateModalOpen(false); resetForm(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Create new experiment"
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-2xl rounded-t-lg md:rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Experiment</h3>
          <button
            onClick={() => { setCreateModalOpen(false); resetForm(); }}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error banner */}
        {mutationError && (
          <div className="flex items-center gap-2 border-b border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 px-4 py-2 text-[11px] text-red-700 dark:text-red-400">
            <span className="flex-1">{mutationError}</span>
            <button onClick={() => setMutationError(null)} className="text-red-400 hover:text-red-600">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Form */}
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3 space-y-2">

          {/* === IDENTITY === */}
          <SectionHeader title="Identity" open={openSections.identity} onToggle={() => toggleSection('identity')} />
          {openSections.identity && (
            <div className="space-y-3 pl-4">
              <div>
                <label className={labelCls}>Title *</label>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                  placeholder="e.g. HENRY Concierge Banker"
                  className={inputCls}
                  aria-required="true"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Sprint</label>
                  <input value={sprint} onChange={(e) => setSprint(e.target.value)} placeholder="e.g. Sprint 1 — Mar 2026" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Persona</label>
                  <select value={persona} onChange={(e) => setPersona(e.target.value)} className={inputCls}>
                    <option value="">Select persona</option>
                    {Object.entries(EXPERIMENT_PERSONA_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Channel</label>
                  <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
                    <option value="">Select channel</option>
                    {Object.entries(EXPERIMENT_CHANNEL_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Type</label>
                  <select value={experimentType} onChange={(e) => setExperimentType(e.target.value)} className={inputCls}>
                    <option value="">Select type</option>
                    {Object.entries(EXPERIMENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Project</label>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
                    <option value="">None</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Owner</label>
                  <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Cohort</label>
                <input value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="e.g. New + PM Partner / Waitlist" className={inputCls} />
              </div>
            </div>
          )}

          {/* === HYPOTHESIS === */}
          <SectionHeader title="Hypothesis" open={openSections.hypothesis} onToggle={() => toggleSection('hypothesis')} />
          {openSections.hypothesis && (
            <div className="space-y-3 pl-4">
              <div>
                <label className={labelCls}>Hypothesis</label>
                <textarea
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  placeholder="If [we do X], then [Persona] will [behavior change] because [reason]"
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div>
                <label className={labelCls}>Riskiest Assumption</label>
                <input value={riskiestAssumption} onChange={(e) => setRiskiestAssumption(e.target.value)} placeholder="What single assumption, if wrong, kills this?" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Learning Goal</label>
                <input value={learningGoal} onChange={(e) => setLearningGoal(e.target.value)} placeholder="What will we know after this that we don't know now?" className={inputCls} />
              </div>
            </div>
          )}

          {/* === UNIT ECONOMICS === */}
          <SectionHeader title="Unit Economics" open={openSections.economics} onToggle={() => toggleSection('economics')} />
          {openSections.economics && (
            <div className="space-y-3 pl-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>CAC Estimate ($)</label>
                  <input type="number" value={cacEstimate} onChange={(e) => setCacEstimate(e.target.value)} placeholder="e.g. 20" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Monthly ARPU ($)</label>
                  <input type="number" value={monthlyArpu} onChange={(e) => setMonthlyArpu(e.target.value)} placeholder="e.g. 21" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>LTV Estimate ($)</label>
                  <input type="number" value={ltvEstimate} onChange={(e) => setLtvEstimate(e.target.value)} placeholder="e.g. 231" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Payback (months)</label>
                  <input type="number" step="0.1" value={paybackPeriod} onChange={(e) => setPaybackPeriod(e.target.value)} placeholder="e.g. 1" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Deposit Target ($)</label>
                  <input type="number" value={depositTarget} onChange={(e) => setDepositTarget(e.target.value)} placeholder="e.g. 100" className={inputCls} />
                </div>
              </div>
            </div>
          )}

          {/* === PRIORITIZATION SCORE === */}
          <SectionHeader title={`Prioritization Score`} open={openSections.scoring} onToggle={() => toggleSection('scoring')} />
          {openSections.scoring && (
            <div className="space-y-2 pl-4">
              <div className="flex items-center gap-2 mb-2">
                <ExperimentScoreBadge score={score} />
                {score < 5 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">Must score ≥5/8 to proceed</span>
                )}
                {score >= 5 && (
                  <span className="text-[11px] text-green-600 dark:text-green-400">Passes threshold</span>
                )}
              </div>
              {EXPERIMENT_SCORING_CRITERIA.map((criterion) => (
                <label key={criterion.key} className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={scoringCriteria[criterion.key] ?? false}
                    onChange={(e) => setScoringCriteria((prev) => ({ ...prev, [criterion.key]: e.target.checked }))}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200">
                    {criterion.label}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* === EXECUTION === */}
          <SectionHeader title="Execution" open={openSections.execution} onToggle={() => toggleSection('execution')} />
          {openSections.execution && (
            <div className="space-y-3 pl-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Resource Cost</label>
                  <input value={resourceCost} onChange={(e) => setResourceCost(e.target.value)} placeholder="e.g. $500 + 20 hours" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Test Size</label>
                  <input value={testSize} onChange={(e) => setTestSize(e.target.value)} placeholder="e.g. 50 users / 200 outreach" className={inputCls} />
                </div>
              </div>
            </div>
          )}

          {/* === SUCCESS MEASURES === */}
          <SectionHeader title="Success Measures" open={openSections.measures} onToggle={() => toggleSection('measures')} />
          {openSections.measures && (
            <div className="space-y-3 pl-4">
              <div>
                <label className={labelCls}>Primary Metric</label>
                <input value={primaryMetric} onChange={(e) => setPrimaryMetric(e.target.value)} placeholder="e.g. Deposit Rate: >30% of users deposit" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Secondary Metrics</label>
                <textarea
                  value={secondaryMetrics}
                  onChange={(e) => setSecondaryMetrics(e.target.value)}
                  placeholder="e.g. NPS ≥8/10, D30 retention >60%, ARPU vs $21 target"
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div>
                <label className={labelCls}>Kill Condition</label>
                <input value={killCondition} onChange={(e) => setKillCondition(e.target.value)} placeholder="We stop if _____ happens by [date]" className={inputCls} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200/60 dark:border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <ExperimentScoreBadge score={score} />
            <span className="text-[11px] text-zinc-400">Prioritization</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setCreateModalOpen(false); resetForm(); }}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-400"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || createExperiment.isPending}
              className="rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: BRAND_AMBER }}
            >
              {createExperiment.isPending ? 'Creating...' : 'Create Experiment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
