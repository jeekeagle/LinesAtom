import type { ReactNode } from 'react';

export function Section({
  title,
  meta,
  action,
  children
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section-block">
      <header className="section-block-head">
        <h2>{title}</h2>
        <div className="head-side">
          {meta ? <span>{meta}</span> : null}
          {action}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Badge({
  tone = 'neutral',
  children
}: {
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'accent';
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="switch-track" />
    </label>
  );
}

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Stat({
  value,
  label,
  tone
}: {
  value: ReactNode;
  label: string;
  tone?: 'accent' | 'ok' | 'warn';
}) {
  return (
    <div className={`stat-item ${tone ? `tone-${tone}` : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}