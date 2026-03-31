import React from 'react';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  /** Renders at full available width above the constrained feed column */
  topSlot?: React.ReactNode;
}

export function AppLayout({ children, rightPanel, topSlot }: AppLayoutProps) {
  return (
    <div className="h-screen flex bg-[var(--color-bg-base)] overflow-hidden">
      {/* Left sidebar — fixed 240px */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Center feed */}
        <main className="flex-1 overflow-y-auto">
          {topSlot && (
            <div className="px-6 pt-6 pb-0">
              {topSlot}
            </div>
          )}
          <div className="max-w-2xl mx-auto px-4 py-6">
            {children}
          </div>
        </main>

        {/* Right panel — fixed 320px, hidden on mobile */}
        {rightPanel && (
          <aside className="w-[320px] flex-shrink-0 border-l border-[var(--color-border)] overflow-y-auto hidden lg:block">
            <div className="p-4">
              {rightPanel}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
