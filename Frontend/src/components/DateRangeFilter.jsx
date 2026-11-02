const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

const PRESETS = [
  { id: 'today', label: 'Today', range: () => [iso(new Date()), iso(new Date())] },
  { id: 'yesterday', label: 'Yesterday', range: () => [daysAgo(1), daysAgo(1)] },
  { id: '7d', label: 'Last 7 days', range: () => [daysAgo(6), iso(new Date())] },
  {
    id: 'month',
    label: 'This month',
    range: () => {
      const now = new Date();
      return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)];
    },
  },
];

const fmt = (s) =>
  s
    ? new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '…';

export default function DateRangeFilter({ from, to, onChange, label = 'Updated date' }) {
  const invalid = Boolean(from && to && from > to);
  const active = Boolean(from || to);

  const activePreset = PRESETS.find((p) => {
    const [f, t] = p.range();
    return f === from && t === to;
  })?.id;

  return (
    <div className="dgp-df">
      <div className="dgp-df-main">
        <span className="dgp-df-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {label}
        </span>

        <div className={`dgp-df-fields ${invalid ? 'is-invalid' : ''}`}>
          <input
            type="date"
            aria-label="From date"
            value={from}
            max={to || undefined}
            onChange={(e) => onChange({ from: e.target.value, to })}
          />
          <span className="dgp-df-sep">→</span>
          <input
            type="date"
            aria-label="To date"
            value={to}
            min={from || undefined}
            onChange={(e) => onChange({ from, to: e.target.value })}
          />
        </div>

        <div className="dgp-df-presets" role="group" aria-label="Quick ranges">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`dgp-df-chip ${activePreset === p.id ? 'on' : ''}`}
              onClick={() => {
                const [f, t] = p.range();
                onChange({ from: f, to: t });
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {active && (
          <button
            type="button"
            className="dgp-df-clear"
            onClick={() => onChange({ from: '', to: '' })}
          >
            Clear
          </button>
        )}
      </div>

      {invalid ? (
        <div className="dgp-df-msg dgp-df-error" role="alert">
          “From” date must be on or before “To” date.
        </div>
      ) : active ? (
        <div className="dgp-df-msg">
          Showing records updated {fmt(from)} – {fmt(to)}
        </div>
      ) : null}
    </div>
  );
}