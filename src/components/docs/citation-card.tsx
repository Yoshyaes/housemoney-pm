import { FileText, ExternalLink } from 'lucide-react';
import { useDocsStore } from '@/lib/stores/docs-store';

interface CitationCardProps {
  docId: string;
  title: string;
  snippet: string;
  score: number;
}

export function CitationCard({ docId, title, snippet }: CitationCardProps) {
  const { setActiveDocId, setDocsView } = useDocsStore();

  return (
    <button
      onClick={() => {
        setActiveDocId(docId);
        setDocsView('editor');
      }}
      className="w-full text-left rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      <div className="flex items-start gap-2">
        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{title}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0 text-zinc-400" />
          </div>
          {snippet && (
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
              {snippet}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
