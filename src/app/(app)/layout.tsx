'use client';

import { Providers } from '@/components/providers';
import { useKeyboardShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { ShortcutHelp } from '@/components/shared/shortcut-help';

function KeyboardShortcutProvider({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <KeyboardShortcutProvider>
        <div className="flex h-screen overflow-hidden font-sans text-[13px]">
          {children}
        </div>
        <ShortcutHelp />
      </KeyboardShortcutProvider>
    </Providers>
  );
}
