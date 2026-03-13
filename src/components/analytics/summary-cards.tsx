'use client';

import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/stores/ui-store';
import { CheckCircle2, Circle, AlertCircle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SummaryData {
  completed: number;
  overdue: number;
  blocked: number;
  open: number;
}

interface SummaryCardsProps {
  data: SummaryData | undefined;
  loading: boolean;
}

interface StatCardProps {
  label: string;
  value: number | undefined;
  loading: boolean;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  onClick?: () => void;
  subtitle?: string;
}

function StatCard({ label, value, loading, icon, color, bgColor, onClick, subtitle }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4',
        onClick && 'cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{label}</p>
          {loading ? (
            <div className="mt-1.5 h-7 w-12 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          ) : (
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {value ?? 0}
            </p>
          )}
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{subtitle}</p>
          )}
        </div>
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: bgColor, color }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export function SummaryCards({ data, loading }: SummaryCardsProps) {
  const router = useRouter();
  const { setActiveFilters } = useUIStore();

  const handleOverdueClick = () => {
    setActiveFilters({ status: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW'] });
    router.push('/');
  };

  const handleBlockedClick = () => {
    setActiveFilters({ isBlocked: true });
    router.push('/');
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Completed"
        value={data?.completed}
        loading={loading}
        icon={<CheckCircle2 className="h-4 w-4" />}
        color="#27500A"
        bgColor="rgba(99,153,34,.12)"
        subtitle="in selected period"
      />
      <StatCard
        label="Open tasks"
        value={data?.open}
        loading={loading}
        icon={<Circle className="h-4 w-4" />}
        color="#185FA5"
        bgColor="rgba(55,138,221,.12)"
        subtitle="not done or cancelled"
      />
      <StatCard
        label="Overdue"
        value={data?.overdue}
        loading={loading}
        icon={<AlertCircle className="h-4 w-4" />}
        color="#A32D2D"
        bgColor="rgba(226,75,74,.12)"
        onClick={data?.overdue ? handleOverdueClick : undefined}
        subtitle={data?.overdue ? 'click to view' : 'all on track'}
      />
      <StatCard
        label="Blocked"
        value={data?.blocked}
        loading={loading}
        icon={<Lock className="h-4 w-4" />}
        color="#854F0B"
        bgColor="rgba(239,159,39,.12)"
        onClick={data?.blocked ? handleBlockedClick : undefined}
        subtitle={data?.blocked ? 'click to view' : 'none blocked'}
      />
    </div>
  );
}
