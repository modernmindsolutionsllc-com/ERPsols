import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-[#CBD5E1] dark:text-slate-600 mb-4">{icon}</div>
      <h3 className="text-base font-medium text-[#0F172A] dark:text-slate-100">{title}</h3>
      {description && (
        <p className="text-sm text-[#64748B] dark:text-slate-400 mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
