import type { ReactNode } from 'react';

export interface PanelProps {
  title?: string;
  description?: string;
  noPadding?: boolean;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, description, noPadding = false, className = '', children }: PanelProps) {
  return (
    <div className={`bg-paper-2 border border-line rounded mb-5 ${className}`}>
      {(title || description) && (
        <div className="px-6 pt-6 pb-1">
          {title && <div className="text-[15px] font-semibold mb-1">{title}</div>}
          {description && <p className="text-ink-soft text-[13px]">{description}</p>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-6'}>{children}</div>
    </div>
  );
}
