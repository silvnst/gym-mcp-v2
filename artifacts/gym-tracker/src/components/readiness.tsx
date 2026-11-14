import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict, parseISO, isToday, isYesterday, format, differenceInCalendarDays } from "date-fns";
import { RefreshCw, Moon, Activity, HeartPulse, ChevronDown } from "lucide-react";
import {
  useGetReadiness,
  useGetGarminStatus,
  useSyncGarmin,
  getGetReadinessQueryKey,
  getGetGarminStatusQueryKey,
  type Readiness,
} from "@workspace/api-client-react";
import { Card } from "@/components/bumper";
import { cn } from "@/lib/utils";

const LEVEL_DOT: Record<NonNullable<Readiness["level"]>, string> = {
  ready: "bg-plate-10",
  caution: "bg-bp-brand",
  easy: "bg-plate-25",
};

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

export function activityLabel(type: string | null | undefined, name: string | null | undefined): string {
  if (name) return name;
  if (!type) return "Activity";
  return type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function dayLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return "Last night";
  if (isYesterday(d)) return "Night before yesterday";
  return `Night to ${format(d, "d MMM")}`;
}

/** Recovery check from Garmin. Renders nothing when Garmin isn't linked to this profile. */
export function ReadinessCard() {
  const queryClient = useQueryClient();
  // Closed on a good day, open when the numbers ask for a lighter session
  const [open, setOpen] = useState<boolean | null>(null);
  const { data: status } = useGetGarminStatus({
    query: { queryKey: getGetGarminStatusQueryKey(), refetchInterval: (q) => (q.state.data?.running ? 3000 : false) },
  });
  const { data: r, isLoading } = useGetReadiness({ query: { enabled: !!status?.linked, queryKey: getGetReadinessQueryKey() } });
  const sync = useSyncGarmin({
    mutation: {
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetReadinessQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGarminStatusQueryKey() });
      },
    },
  });

  if (!status?.linked) return null;
  if (isLoading) return <div className="h-[68px] rounded-[14px] bg-bp-surface animate-pulse" />;

  const syncing = sync.isPending || status.running;
  const syncedText = syncing
    ? "Syncing with Garmin"
    : status.lastError && !status.lastSyncAt
      ? "Sync didn't work. If it keeps failing, the Garmin key may need renewing."
      : status.lastSyncAt
      ? `Synced ${formatDistanceToNowStrict(new Date(status.lastSyncAt))} ago`
      : "Not synced yet";
  const refresh = (
    <button
      type="button"
      onClick={() => sync.mutate({ data: {} })}
      disabled={syncing}
      aria-label="Sync Garmin now"
      title="Sync Garmin now"
      className="h-11 w-11 shrink-0 rounded-[10px] bg-bp-surface-2 flex items-center justify-center disabled:opacity-50"
    >
      <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
    </button>
  );

  if (!r?.available || !r.level) {
    return (
      <Card className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold">Garmin connected</p>
          <p className="text-[13px] text-bp-muted">{status.lastError && !syncing ? "The last sync didn't work. Try again in a moment." : syncing ? "Fetching your data" : "No sleep or heart data yet."}</p>
        </div>
        {refresh}
      </Card>
    );
  }

  // Older than yesterday's night: don't turn stale numbers into advice for today
  if (r.date && differenceInCalendarDays(new Date(), parseISO(r.date)) > 1) {
    return (
      <Card className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold">No recovery check today</p>
          <p className="text-[13px] text-bp-muted">
            The latest watch data is from {format(parseISO(r.date), "d MMMM")}. Open the Garmin Connect app to sync your watch, then refresh here.
          </p>
        </div>
        {refresh}
      </Card>
    );
  }

  const m = r.metrics ?? {};
  const hrvRange = m.hrvBaselineLow != null && m.hrvBaselineHigh != null ? `usual ${m.hrvBaselineLow} to ${m.hrvBaselineHigh}` : m.hrvStatus ?? "";
  const rhrDiff = m.restingHr != null && m.restingHrAvg != null ? m.restingHr - m.restingHrAvg : null;

  const expanded = open ?? r.level !== "ready";
  const summary = [
    m.sleepSeconds != null ? `sleep ${formatDuration(m.sleepSeconds)}` : null,
    m.hrvLastNight != null ? `HRV ${m.hrvLastNight} ms` : null,
    m.restingHr != null ? `resting ${m.restingHr} bpm` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section aria-labelledby="readiness-title" className="bg-bp-surface rounded-[14px]">
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        aria-controls="readiness-details"
        className="w-full min-h-[68px] flex items-center gap-3 px-4 py-3 text-left rounded-[14px]"
        data-testid="button-readiness"
      >
        <span className={cn("w-3 h-3 shrink-0 rounded-full", LEVEL_DOT[r.level])} aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span id="readiness-title" className="block font-sans font-bold text-[15px] leading-5">{r.headline}</span>
          {summary && <span className="block text-[13px] text-bp-muted tabular truncate">{summary.replace(/^\w/, (c) => c.toUpperCase())}</span>}
        </span>
        <ChevronDown className={cn("w-[18px] h-[18px] shrink-0 text-bp-muted", expanded && "rotate-180")} aria-hidden="true" />
      </button>

      {expanded && (
        <div id="readiness-details" className="px-4 pb-4 space-y-3.5">
          {r.reasons && r.reasons.length > 0 && (
            <ul className="text-sm leading-5 space-y-1">
              {r.reasons.map((reason) => (
                <li key={reason}>{reason}.</li>
              ))}
            </ul>
          )}

          <dl className="grid grid-cols-3 gap-2">
            <Metric icon={<Moon className="w-4 h-4" aria-hidden="true" />} label="Sleep" value={formatDuration(m.sleepSeconds)} note={m.sleepScore != null ? `score ${m.sleepScore}` : undefined} />
            <Metric icon={<Activity className="w-4 h-4" aria-hidden="true" />} label="HRV" value={m.hrvLastNight != null ? `${m.hrvLastNight} ms` : "–"} note={hrvRange || undefined} />
            <Metric
              icon={<HeartPulse className="w-4 h-4" aria-hidden="true" />}
              label="Resting"
              value={m.restingHr != null ? `${m.restingHr} bpm` : "–"}
              note={rhrDiff != null ? (rhrDiff === 0 ? "as usual" : `${rhrDiff > 0 ? "+" : ""}${rhrDiff} vs usual`) : undefined}
            />
          </dl>

          {r.yesterdayActivities && r.yesterdayActivities.length > 0 && (
            <p className="text-[13px] text-bp-muted">
              Yesterday on the watch:{" "}
              {r.yesterdayActivities
                .map((a) => `${activityLabel(a.type, a.name)}, ${formatDuration(a.durationSeconds)}${a.distanceMeters ? `, ${(a.distanceMeters / 1000).toFixed(1)} km` : ""}`)
                .join("; ")}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-bp-muted">
              {r.date ? `${dayLabel(r.date)}. ` : ""}
              {syncedText}
            </p>
            {refresh}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="bg-bp-surface-2 rounded-[10px] px-2.5 py-2 min-w-0">
      <dt className="flex items-center gap-1 text-xs text-bp-muted">
        {icon}
        {label}
      </dt>
      <dd className="font-bold text-[17px] tabular leading-tight mt-0.5">{value}</dd>
      {note && <dd className="text-[11px] text-bp-muted truncate">{note}</dd>}
    </div>
  );
}
