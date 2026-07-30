export interface StatCardProps {
  label: string;
  value: number | string;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-paper-2 border border-line rounded px-5 py-4">
      <div className="font-mono text-2xl font-semibold text-seal">{value}</div>
      <div className="text-xs text-ink-soft uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}
