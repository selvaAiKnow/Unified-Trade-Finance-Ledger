const milestones = ['LC Issued', 'Regulatory Clear', 'Shipped', 'Docs Accepted', 'Settled', 'Closed'];

export function TransactionTimelinePage() {
  return (
    <div>
      <h1 className="font-serif text-2xl mb-1">Timeline</h1>
      <p className="text-ink-soft mb-6 text-sm">
        Placeholder milestone view — not yet connected to a blockchain layer.
      </p>
      <div className="flex justify-between relative">
        <div className="absolute top-[14px] left-0 right-0 h-[2px] bg-line" />
        {milestones.map((label, index) => (
          <div key={label} className="relative z-10 flex flex-col items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-full bg-paper-2 border-2 border-line flex items-center justify-center text-xs font-mono text-ink-soft">
              {index + 1}
            </div>
            <div className="text-xs text-ink-soft text-center max-w-[90px]">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
