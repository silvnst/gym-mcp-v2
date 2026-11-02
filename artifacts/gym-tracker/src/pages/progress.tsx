import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useGetTopExercises, useGetExerciseProgress, useGetMuscleSets } from "@workspace/api-client-react";
import { Card, Chip, PageTitle, SectionLabel } from "@/components/bumper";
import { formatKg } from "@/lib/training";
import { cn } from "@/lib/utils";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 28, label: "4 weeks" },
];

export default function ProgressPage() {
  return (
    <div className="space-y-6">
      <PageTitle>Progress</PageTitle>
      <StrengthChart />
      <MuscleBalance />
    </div>
  );
}

function StrengthChart() {
  const { data: top, isLoading } = useGetTopExercises({ limit: 6 });
  const [picked, setPicked] = useState<string | null>(null);
  // Weighted lifts only: bodyweight and conditioning have no 1RM
  const lifts = (top ?? []).filter((t) => !/pull.?up|burpee|box jump|pogo|sprint|runner|ab wheel/i.test(t.name)).slice(0, 4);
  const active = picked ?? lifts[0]?.name ?? null;

  const { data: points } = useGetExerciseProgress(
    active ?? "",
    { metric: "e1rm" },
    { query: { enabled: !!active, queryKey: ["/api/progress", active, "e1rm"] } },
  );

  if (isLoading) return <div className="h-72 rounded-[14px] border-2 border-bp-outline bg-bp-surface animate-pulse" />;
  if (!active) {
    return (
      <Card>
        <p className="font-bold">Nothing to chart yet</p>
        <p className="text-sm text-bp-muted mt-1">Log a few weighted sets and your strength trend appears here.</p>
      </Card>
    );
  }

  const data = (points ?? []).map((p) => ({ label: format(parseISO(p.date), "d MMM"), value: p.value }));
  const latest = data.at(-1)?.value;
  const lo = data.length ? Math.floor(Math.min(...data.map((d) => d.value)) / 5) * 5 - 5 : 0;
  const hi = data.length ? Math.ceil(Math.max(...data.map((d) => d.value)) / 5) * 5 + 5 : 100;
  const best = data.reduce<number | null>((m, p) => (m == null || p.value > m ? p.value : m), null);

  return (
    <section className="space-y-3">
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Exercise">
        {lifts.map((l) => (
          <Chip key={l.name} pressed={l.name === active} onClick={() => setPicked(l.name)}>
            {l.name.replace(/\s*\(.*\)/, "").replace(/^Barbell /, "")}
          </Chip>
        ))}
      </div>

      <Card shadow className="space-y-2.5">
        <div className="flex justify-between items-baseline gap-3">
          <h2 className="font-sans text-sm font-bold">Estimated 1RM</h2>
          {latest != null && (
            <span className="font-bold text-[22px] tabular">
              {formatKg(latest)}
              <span className="text-xs font-medium text-bp-muted"> kg</span>
            </span>
          )}
        </div>
        {data.length === 0 ? (
          <p className="text-sm text-bp-muted py-8 text-center">No weighted sets for this exercise yet.</p>
        ) : (
          <div className="h-44 -ml-3" role="img" aria-label={`Estimated 1RM for ${active}: ${data.map((d) => `${d.label} ${formatKg(d.value)} kg`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--bp-surface-2)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--bp-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--bp-muted)" }} tickLine={false} />
                <YAxis width={36} domain={[lo, hi]} tickCount={4} tick={{ fill: "var(--bp-muted)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: "var(--bp-muted)", strokeDasharray: "4 4" }}
                  contentStyle={{ background: "var(--bp-surface)", border: "2px solid var(--bp-outline)", borderRadius: 10, color: "var(--bp-ink)", fontWeight: 700 }}
                  formatter={(v: number) => [`${formatKg(v)} kg`, "e1RM"]}
                />
                <Line type="monotone" dataKey="value" stroke="var(--bp-brand)" strokeWidth={3} dot={{ r: 5, fill: "var(--bp-brand)", stroke: "var(--bp-outline)", strokeWidth: 2 }} activeDot={{ r: 7 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[13px] text-bp-muted">
          Epley estimate from the best set of each workout{best != null ? `. Best so far ${formatKg(best)} kg.` : "."}
        </p>
      </Card>
    </section>
  );
}

function MuscleBalance() {
  const [days, setDays] = useState(7);
  const { data } = useGetMuscleSets({ days }, { query: { queryKey: ["/api/insights/muscle-sets", days] } });
  const max = 20;
  const total = (data?.push ?? 0) + (data?.pull ?? 0);
  const perWeek = (n: number) => (days === 7 ? n : Math.round((n / days) * 7 * 10) / 10);

  return (
    <section className="space-y-3">
      <div className="flex justify-between items-center gap-3">
        <SectionLabel className="mb-0">Sets per muscle</SectionLabel>
        <div className="flex gap-2" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Chip key={r.days} pressed={days === r.days} onClick={() => setDays(r.days)} className="min-h-9 px-2.5 text-[13px]">
              {r.label}
            </Chip>
          ))}
        </div>
      </div>

      <Card className="space-y-2.5">
        {!data || data.muscles.every((m) => m.sets === 0) ? (
          <p className="text-sm text-bp-muted">No logged sets in this range.</p>
        ) : (
          <ul className="space-y-2 text-[13px]">
            {data.muscles
              .filter((m) => m.sets > 0)
              .map((m) => {
                const weekly = perWeek(m.sets);
                const low = weekly < 10;
                return (
                  <li key={m.key} className="grid grid-cols-[104px_1fr_32px] gap-2 items-center">
                    <span className="truncate">{m.label}</span>
                    <span className="h-3.5 border-2 border-bp-outline rounded box-border overflow-hidden" aria-hidden="true">
                      <span className={cn("block h-full", low ? "bg-bp-data-2" : "bg-bp-brand")} style={{ width: `${Math.min(100, (weekly / max) * 100)}%` }} />
                    </span>
                    <span className="text-right font-bold tabular">{formatKg(weekly)}</span>
                  </li>
                );
              })}
          </ul>
        )}
        <p className="text-[13px] text-bp-muted">
          {days === 7 ? "Logged sets in the last 7 days." : "Average sets per week over the last 4 weeks."} The bar ends at 20; a common target is 10 to 20 hard sets per muscle and week. Blue is below 10.
        </p>
      </Card>

      {total > 0 && (
        <div className="space-y-1.5">
          <h3 className="font-sans text-sm font-bold">Push and pull</h3>
          <div className="flex h-[34px] border-2 border-bp-outline rounded-[10px] overflow-hidden text-[13px] font-bold">
            {data!.push > 0 && (
              <div className="bg-bp-data-2 text-white flex items-center px-2.5 border-r-2 border-bp-outline" style={{ width: `${(data!.push / total) * 100}%` }}>
                Push {data!.push}
              </div>
            )}
            {data!.pull > 0 && (
              <div className="bg-bp-brand text-bp-on-brand flex items-center justify-end px-2.5 flex-1">Pull {data!.pull}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
