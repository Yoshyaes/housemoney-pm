'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Sparkles } from 'lucide-react';

interface AgentConfigPanelProps {
  workspaceId: string;
}

export function AgentConfigPanel({ workspaceId }: AgentConfigPanelProps) {
  const { data: config, refetch } = trpc.agent.getConfig.useQuery({ workspaceId });
  const updateConfig = trpc.agent.updateConfig.useMutation({
    onSuccess: () => refetch(),
  });

  const [localConfig, setLocalConfig] = useState<{
    staleTaskDays: number;
    overdueEnabled: boolean;
    digestEnabled: boolean;
    duplicateCheck: boolean;
    autoUnblock: boolean;
    workloadAlerts: boolean;
    decomposeThreshold: number;
    maxInsightsPerDay: number;
  } | null>(null);

  useEffect(() => {
    if (config && !localConfig) {
      setLocalConfig({
        staleTaskDays: config.staleTaskDays,
        overdueEnabled: config.overdueEnabled,
        digestEnabled: config.digestEnabled,
        duplicateCheck: config.duplicateCheck,
        autoUnblock: config.autoUnblock,
        workloadAlerts: config.workloadAlerts,
        decomposeThreshold: config.decomposeThreshold,
        maxInsightsPerDay: config.maxInsightsPerDay,
      });
    }
  }, [config, localConfig]);

  if (!localConfig) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-400">
        Loading agent configuration...
      </div>
    );
  }

  const handleToggle = (key: string, value: boolean) => {
    setLocalConfig((prev) => prev ? { ...prev, [key]: value } : prev);
    updateConfig.mutate({ workspaceId, [key]: value });
  };

  const handleNumber = (key: string, value: number) => {
    setLocalConfig((prev) => prev ? { ...prev, [key]: value } : prev);
    updateConfig.mutate({ workspaceId, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        <Sparkles className="h-4 w-4 text-amber-500" />
        AI Agent Settings
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Configure how the AI agent monitors your workspace and surfaces insights.
      </p>

      <div className="space-y-3">
        {/* Stale task detection */}
        <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
          <div>
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Stale task detection</div>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Flag tasks with no activity after{' '}
              <input
                type="number"
                min={1}
                max={30}
                value={localConfig.staleTaskDays}
                onChange={(e) => handleNumber('staleTaskDays', parseInt(e.target.value) || 5)}
                className="inline-block w-10 rounded border border-zinc-200 bg-white px-1 py-0.5 text-center text-[10px] dark:border-zinc-700 dark:bg-zinc-800"
              />{' '}
              days
            </div>
          </div>
        </div>

        {/* Overdue escalation */}
        <ToggleRow
          label="Overdue task escalation"
          description="Alert when tasks pass their due date"
          checked={localConfig.overdueEnabled}
          onChange={(v) => handleToggle('overdueEnabled', v)}
        />

        {/* Daily digest */}
        <ToggleRow
          label="Daily digest"
          description="Summarize overnight changes for each team member"
          checked={localConfig.digestEnabled}
          onChange={(v) => handleToggle('digestEnabled', v)}
        />

        {/* Duplicate detection */}
        <ToggleRow
          label="Duplicate detection"
          description="Check new tasks for potential duplicates"
          checked={localConfig.duplicateCheck}
          onChange={(v) => handleToggle('duplicateCheck', v)}
        />

        {/* Auto-unblock */}
        <ToggleRow
          label="Auto-unblock tasks"
          description="Automatically move unblocked tasks from Backlog to Todo"
          checked={localConfig.autoUnblock}
          onChange={(v) => handleToggle('autoUnblock', v)}
        />

        {/* Workload alerts */}
        <ToggleRow
          label="Workload imbalance alerts"
          description="Flag when team members are significantly overloaded"
          checked={localConfig.workloadAlerts}
          onChange={(v) => handleToggle('workloadAlerts', v)}
        />

        {/* Max insights per day */}
        <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
          <div>
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Daily insight limit</div>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Max insights per day per workspace
            </div>
          </div>
          <input
            type="number"
            min={1}
            max={50}
            value={localConfig.maxInsightsPerDay}
            onChange={(e) => handleNumber('maxInsightsPerDay', parseInt(e.target.value) || 10)}
            className="w-14 rounded border border-zinc-200 bg-white px-2 py-1 text-right text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
      <div>
        <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</div>
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
          checked ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
