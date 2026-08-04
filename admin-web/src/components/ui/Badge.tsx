import type { ReactNode } from 'react';

export type BadgeTone = 'positive' | 'warning' | 'negative' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive: 'bg-verified-soft text-verified',
  warning: 'bg-review-soft text-review',
  negative: 'bg-block-soft text-block',
  neutral: 'bg-line-soft text-ink-soft',
};

export interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
