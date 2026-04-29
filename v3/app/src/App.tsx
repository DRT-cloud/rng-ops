// Throwaway Step E smoke screen — proves every §12.2 token reaches the DOM.
// Each section is labeled to map 1:1 against the Step E spec checklist.
// SOURCE: docs/RNG_Ops_v3_Project_Memory.md §12 (branding) and §12.5 (status badges).

type BadgeProps = {
  label: string;
  className: string;
};

function Badge({ label, className }: BadgeProps) {
  return (
    <span
      className={`font-body font-bold uppercase tracking-display text-xs px-3 py-1 rounded-action ${className}`}
    >
      {label}
    </span>
  );
}

export default function App() {
  return (
    <main className="min-h-screen p-8 space-y-8">
      <section className="bg-rng-bg-surface border border-rng-border rounded-card shadow-card p-6 space-y-4">
        <h1 className="font-display font-extrabold uppercase tracking-display text-rng-text-primary text-4xl">
          RNG OPS &mdash; THEME SMOKE
        </h1>
        <span className="rng-accent-bar" />
        <p className="text-rng-text-body">
          Body copy in Inter at Vapor. Confirms paragraph rendering against the
          Charcoal Steel surface with a Steel Gray hairline border.
        </p>
        <p className="font-mono text-rng-text-body">
          Stage time: <span className="font-semibold">148.27</span>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display font-bold uppercase tracking-display text-rng-text-primary text-2xl">
          STATUS BADGES
        </h2>
        <span className="rng-accent-bar" />
        <div className="flex flex-wrap gap-3 pt-1">
          <Badge
            label="PENDING"
            className="border border-rng-text-body text-rng-text-body bg-transparent"
          />
          <Badge
            label="RECORDED"
            className="bg-rng-status-ok text-rng-bg-base"
          />
          <Badge
            label="EDITED"
            className="bg-rng-status-edited text-rng-bg-base"
          />
          <Badge
            label="SYNC CONFLICT"
            className="bg-rng-status-error text-rng-text-primary"
          />
          <Badge
            label="SYNCED"
            className="border border-rng-status-ok text-rng-status-ok bg-transparent"
          />
        </div>
      </section>
    </main>
  );
}
