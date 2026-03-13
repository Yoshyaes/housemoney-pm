'use client';

import { useState, useRef } from 'react';
import { Sparkles, Send, BookOpen } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CitationCard } from './citation-card';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface KnowledgeAIPanelProps {
  workspaceId: string;
}

interface QAEntry {
  question: string;
  answer: string;
  citations: Array<{ docId: string; title: string; snippet: string; score: number }>;
  hasResults: boolean;
}

export function KnowledgeAIPanel({ workspaceId }: KnowledgeAIPanelProps) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<QAEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const queryKnowledge = trpc.ai.queryKnowledge.useMutation({
    onSuccess: (data) => {
      setHistory((prev) => [
        ...prev,
        {
          question: pendingQuestion.current,
          answer: data.answer,
          citations: data.citations,
          hasResults: data.hasResults,
        },
      ]);
      setQuestion('');
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    },
  });

  const pendingQuestion = useRef('');

  const handleSubmit = () => {
    const q = question.trim();
    if (!q || queryKnowledge.isPending) return;
    pendingQuestion.current = q;
    queryKnowledge.mutate({ workspaceId, question: q });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Ask the Knowledge Base</span>
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {history.length === 0 && !queryKnowledge.isPending && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20 mb-3">
              <BookOpen className="h-6 w-6 text-amber-500" />
            </div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Ask anything about your docs</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 max-w-xs">
              Ask about past decisions, meeting outcomes, experiment results, or anything stored in your knowledge base.
            </p>
            <div className="mt-4 flex flex-col gap-2 text-left w-full max-w-xs">
              {[
                'What did we decide about the auth architecture?',
                'What were the key outcomes from last quarter retro?',
                'How do we run the deploy process?',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setQuestion(example)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((entry, i) => (
          <div key={i} className="space-y-3">
            {/* Question */}
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-zinc-900 dark:bg-zinc-100 px-3.5 py-2.5 text-sm text-white dark:text-zinc-900">
                {entry.question}
              </div>
            </div>

            {/* Answer */}
            <div className="space-y-3">
              <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {entry.answer}
                </ReactMarkdown>
              </div>

              {/* Citations */}
              {entry.citations.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Sources
                  </p>
                  {entry.citations.map((c) => (
                    <CitationCard key={c.docId} {...c} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading state */}
        {queryKnowledge.isPending && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-zinc-900 dark:bg-zinc-100 px-3.5 py-2.5 text-sm text-white dark:text-zinc-900">
                {pendingQuestion.current}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs">Searching knowledge base...</span>
            </div>
          </div>
        )}

        {queryKnowledge.isError && (
          <p className="text-xs text-red-500">
            {queryKnowledge.error.message ?? 'Something went wrong. Try again.'}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask about your knowledge base..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
            style={{ minHeight: '24px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!question.trim() || queryKnowledge.isPending}
            className="flex-shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 disabled:opacity-40 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 text-center">
          Answers are based on your stored documents only
        </p>
      </div>
    </div>
  );
}
