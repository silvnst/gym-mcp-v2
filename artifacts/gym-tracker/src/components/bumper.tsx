/**
 * Bumper building blocks. Buttons, chips and inputs carry the 2px outline and
 * the main action adds the hard offset shadow; cards and tiles are plain
 * surfaces. See docs/design-system.md.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { platesPerSide, BAR_KG, formatKg, type Plate } from "@/lib/training";

/* ── Layout ─────────────────────────────────────────────────────────────── */

export function PageTitle({ eyebrow, children, action }: { eyebrow?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-3 mb-5">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-bp-muted">{eyebrow}</p>}
        <h1 className="font-display font-extrabold text-[36px] leading-[38px] tracking-[-0.03em] text-bp-ink">{children}</h1>
      </div>
      {action}
    </div>
  );
}

export function SectionLabel({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-between items-baseline gap-3 mb-2.5", className)}>
      <h2 className="font-sans text-[13px] font-bold text-bp-muted">{children}</h2>
      {right && <span className="text-[13px] font-medium text-bp-muted">{right}</span>}
    </div>
  );
}

export function Card({ children, className, as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "li" }) {
  return (
    <As className={cn("bg-bp-surface rounded-[14px] p-4", className)}>
      {children}
    </As>
  );
}

/* ── Buttons ────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "cta";

const buttonBase =
  "inline-flex items-center justify-center gap-2 font-sans font-bold text-[15px] min-h-12 px-5 rounded-[10px] border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-bp-brand text-bp-on-brand border-bp-outline shadow-hard-sm press",
  secondary: "bg-transparent text-bp-ink border-bp-outline",
  ghost: "bg-transparent text-bp-brand-ink border-transparent px-2",
  danger: "bg-transparent text-bp-warn border-transparent px-2",
  cta: "w-full min-h-14 rounded-[14px] bg-bp-brand text-bp-on-brand border-bp-outline shadow-hard-ink press font-display font-extrabold text-[17px]",
};

export const BpButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(
  function BpButton({ variant = "secondary", className, type = "button", ...props }, ref) {
    return <button ref={ref} type={type} className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  function IconButton({ label, className, type = "button", children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn("h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-[10px] bg-bp-surface-2 text-bp-ink", className)}
        {...props}
      >
        {children}
      </button>
    );
  },
);

/** Single-choice option; the chosen one is the yellow fill. */
export function Chip({ pressed, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "min-h-11 px-3.5 max-w-full truncate rounded-[10px] border-2 border-bp-outline font-sans font-bold text-sm",
        pressed ? "bg-bp-brand text-bp-on-brand" : "bg-transparent text-bp-ink",
        className,
      )}
      {...props}
    />
  );
}

/* ── Feedback ───────────────────────────────────────────────────────────── */

export function Notice({ tone = "warn", icon, children }: { tone?: "warn" | "tip"; icon: ReactNode; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 items-start px-3.5 py-3 rounded-[14px] text-sm leading-5 text-bp-ink",
        tone === "warn" ? "bg-bp-warn-soft" : "bg-bp-done",
      )}
    >
      <span className={cn("shrink-0 mt-px", tone === "warn" ? "text-bp-warn" : "text-bp-ink")}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

export function StatTile({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: ReactNode }) {
  return (
    <div className="bg-bp-surface rounded-[14px] px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-bp-muted truncate">{label}</span>
      <span className="font-bold text-[22px] leading-none tabular text-bp-ink">
        {value}
        {unit && <span className="text-xs font-medium text-bp-muted"> {unit}</span>}
      </span>
      {note && <span className="text-xs text-bp-muted truncate">{note}</span>}
    </div>
  );
}

/* ── Inputs ─────────────────────────────────────────────────────────────── */

export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  format = (v) => String(v),
  unitLabel,
  compact = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  format?: (v: number) => string;
  unitLabel: string;
  /** Sits inside a card that already names the exercise: no own surface, smaller figure with the unit. */
  compact?: boolean;
}) {
  const current = value ?? 0;
  const stepText = formatKg(step);
  return (
    <div className={cn("flex flex-col items-center min-w-0", compact ? "gap-2" : "bg-bp-surface rounded-[14px] p-3 gap-2.5")}>
      <span className={compact ? "sr-only" : "text-[13px] text-bp-muted"}>{label}</span>
      <output aria-live="polite" className={cn("font-bold leading-none tabular text-bp-ink", compact ? "text-[28px]" : "text-[44px]")}>
        {value == null ? "–" : format(current)}
        {compact && <span className="text-sm font-normal text-bp-muted"> {unitLabel}</span>}
      </output>
      <div className="grid grid-cols-2 gap-1.5 w-full">
        <button
          type="button"
          aria-label={`Minus ${stepText} ${unitLabel}`}
          onClick={() => onChange(Math.max(min, Math.round((current - step) * 100) / 100))}
          className="min-h-12 rounded-[10px] border-2 border-bp-outline bg-bp-surface text-bp-ink font-bold text-[15px] tabular"
        >
          −{stepText}
        </button>
        <button
          type="button"
          aria-label={`Plus ${stepText} ${unitLabel}`}
          onClick={() => onChange(Math.round((current + step) * 100) / 100)}
          className="min-h-12 rounded-[10px] border-2 border-bp-outline bg-bp-surface text-bp-ink font-bold text-[15px] tabular"
        >
          +{stepText}
        </button>
      </div>
    </div>
  );
}

/* ── Plates ─────────────────────────────────────────────────────────────── */

const PLATE_STYLE: Record<Plate, string> = {
  25: "bg-plate-25 text-white",
  20: "bg-plate-20 text-white",
  15: "bg-plate-15 text-[#111111]",
  10: "bg-plate-10 text-[#111111]",
  5: "bg-plate-5 text-[#111111]",
  2.5: "bg-plate-change text-[#111111]",
  1.25: "bg-plate-change text-[#111111]",
};

/** What to load on each side of the bar, as chips in plate colours. */
export function PlateLoader({ totalKg }: { totalKg: number | null }) {
  if (totalKg == null || totalKg <= 0) return null;
  const plates = platesPerSide(totalKg);
  if (plates == null) {
    return <p className="text-sm text-bp-muted">{formatKg(totalKg)} kg can't be built with standard plates.</p>;
  }
  if (plates.length === 0) return <p className="text-sm text-bp-muted">Empty {BAR_KG} kg bar.</p>;
  return (
    <div className="flex items-center flex-wrap gap-2 text-sm text-bp-muted">
      <span>Per side</span>
      <ul aria-label={`Per side: ${plates.map((p) => formatKg(p)).join(" + ")} kg, on a ${BAR_KG} kg bar`} className="contents">
        {plates.map((p, i) => (
          <li key={i} className={cn("px-2.5 py-0.5 rounded-md border border-bp-line font-bold tabular", PLATE_STYLE[p])}>
            {formatKg(p)}
          </li>
        ))}
      </ul>
    </div>
  );
}
