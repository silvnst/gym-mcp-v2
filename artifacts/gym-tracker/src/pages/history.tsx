import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useListSessions, type SessionSummary } from "@workspace/api-client-react";
import { BpButton, Card, Chip, PageTitle, SectionLabel } from "@/components/bumper";
import { cleanName, daysBetween } from "@/lib/training";
import { formatDuration } from "@/lib/utils";

const PAGE_SIZE = 50;
const GAP_DAYS = 14;

export default function HistoryPage() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState<string | null>(null);
  const { data: sessions, isLoading, isFetching } = useListSessions({ limit });

  const planNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions ?? []) counts.set(cleanName(s.name), (counts.get(cleanName(s.name)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [sessions]);

  const visible = (sessions ?? []).filter((s) => !filter || cleanName(s.name) === filter);

  // Month headings plus a marker wherever two workouts are more than two weeks apart
  type Row = { kind: "month"; label: string } | { kind: "gap"; days: number } | { kind: "session"; s: SessionSummary };
  const rows: Row[] = [];
  let lastMonth = "";
  visible.forEach((s, i) => {
    const prev = visible[i - 1];
    if (prev && !filter) {
      const gap = daysBetween(parseISO(s.date), parseISO(prev.date));
      if (gap > GAP_DAYS) rows.push({ kind: "gap", days: gap });
    }
    const month = format(parseISO(s.date), "MMMM yyyy");
    if (month !== lastMonth) {
      rows.push({ kind: "month", label: month });
      lastMonth = month;
    }
    rows.push({ kind: "session", s });
  });

  return (
    <div>
      <PageTitle>History</PageTitle>

      {planNames.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-5" role="group" aria-label="Filter by plan">
          <Chip pressed={filter == null} onClick={() => setFilter(null)}>All</Chip>
          {planNames.slice(0, 4).map((n) => (
            <Chip key={n} pressed={filter === n} onClick={() => setFilter(filter === n ? null : n)}>
              {n}
            </Chip>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-[14px] bg-bp-surface animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <p className="font-bold">No workouts yet</p>
          <p className="text-sm text-bp-muted mt-1">Finished workouts show up here with their sets and times.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            if (row.kind === "month") return <SectionLabel key={`m${i}`} className={i > 0 ? "pt-2" : ""}>{row.label}</SectionLabel>;
            if (row.kind === "gap")
              return (
                <div key={`g${i}`} className="flex items-center gap-2.5 text-[13px] text-bp-muted py-1" aria-label={`${row.days} days without training`}>
                  <span className="flex-1 border-t border-bp-line" />
                  <span>{row.days} days off</span>
                  <span className="flex-1 border-t border-bp-line" />
                </div>
              );
            const s = row.s;
            const d = parseISO(s.date);
            const details = [
              s.durationMin != null ? formatDuration(s.durationMin) : null,
              `${s.exerciseCount} ${s.exerciseCount === 1 ? "exercise" : "exercises"}`,
              s.setCount > 0 ? `${s.setCount} sets` : null,
            ].filter(Boolean);
            return (
              <Link
                key={s.id}
                href={`/history/${s.id}`}
                data-testid={`card-session-${s.id}`}
                className="flex gap-3.5 items-center bg-bp-surface rounded-[14px] p-3"
              >
                <span className="w-[52px] h-[52px] shrink-0 rounded-[10px] bg-bp-surface-2 text-bp-ink flex flex-col items-center justify-center leading-none">
                  <span className="text-[11px] font-bold">{format(d, "MMM")}</span>
                  <span className="font-display font-extrabold text-[22px]">{format(d, "d")}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-base truncate">{cleanName(s.name)}</span>
                  <span className="block text-[13px] text-bp-muted">{details.join(", ")}</span>
                </span>
                <ChevronRight className="w-[18px] h-[18px] text-bp-muted shrink-0" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}

      {sessions && sessions.length >= limit && (
        <BpButton className="w-full mt-5" onClick={() => setLimit(limit + PAGE_SIZE)} disabled={isFetching}>
          {isFetching ? "Loading" : "Show older workouts"}
        </BpButton>
      )}
    </div>
  );
}
