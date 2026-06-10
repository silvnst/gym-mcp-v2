import { useState } from "react";
import {
  useListSessions,
  useDeleteSession,
  useGetTopExercises,
  useGetExerciseProgress,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Calendar, Trash2, TrendingUp, Clock, Dumbbell, Weight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatDuration, formatVolume } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Dot,
} from "recharts";

const PAGE_SIZE = 10;
type View = "history" | "progress";
type Metric = "maxWeight" | "totalVolume";

export default function HistoryPage() {
  const [view, setView] = useState<View>("history");

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-1">Logbook</p>
        <h1 className="text-3xl font-display font-bold text-foreground">History</h1>
      </div>

      {/* Segmented toggle */}
      <div className="flex mb-6 bg-muted rounded-full p-1 w-fit">
        <button
          onClick={() => setView("history")}
          data-testid="toggle-view-history"
          className={`px-5 py-1.5 text-xs font-semibold rounded-full transition-colors ${
            view === "history"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Workouts
        </button>
        <button
          onClick={() => setView("progress")}
          data-testid="toggle-view-progress"
          className={`px-5 py-1.5 text-xs font-semibold rounded-full transition-colors ${
            view === "progress"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Progress
        </button>
      </div>

      {view === "history" ? <HistoryView /> : <ProgressView />}
    </div>
  );
}

function HistoryView() {
  const [offset, setOffset] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sessions, isLoading } = useListSessions(
    { limit: PAGE_SIZE, offset },
    { query: { queryKey: ["/api/sessions", { limit: PAGE_SIZE, offset }] } }
  );

  const deleteSession = useDeleteSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
        toast({ title: "Workout deleted" });
        setConfirmId(null);
      },
      onError: () => {
        toast({ title: "Failed to delete workout", variant: "destructive" });
        setConfirmId(null);
      },
    },
  });

  const hasPrev = offset > 0;
  const hasNext = (sessions?.length ?? 0) === PAGE_SIZE;
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse bg-card h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (sessions?.length === 0 && offset === 0) {
    return (
      <div className="text-center py-14 px-6 text-muted-foreground bg-card rounded-2xl border border-border/60">
        <Calendar className="h-10 w-10 mx-auto mb-4 opacity-30" />
        <p className="text-sm">No workouts recorded yet. Start training to see them here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {sessions?.map((session) => {
          const d = parseISO(session.date);
          const isConfirming = confirmId === session.id;

          if (isConfirming) {
            return (
              <div
                key={session.id}
                className="bg-card border border-destructive/40 p-4 rounded-2xl flex items-center justify-between gap-3"
              >
                <p className="text-sm font-medium">Delete this workout?</p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setConfirmId(null)}
                    className="text-xs font-semibold text-muted-foreground px-3 py-2 rounded-full bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteSession.mutate({ id: session.id })}
                    disabled={deleteSession.isPending}
                    className="text-xs font-semibold text-destructive-foreground bg-destructive px-3 py-2 rounded-full disabled:opacity-60"
                  >
                    {deleteSession.isPending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={session.id} className="relative">
              <Link
                href={`/history/${session.id}`}
                data-testid={`card-session-${session.id}`}
                className="flex gap-4 items-center bg-card rounded-2xl p-4 border border-border/60 active:scale-[0.98] transition-transform"
              >
                {/* Date block */}
                <div className="shrink-0 w-12 h-12 rounded-xl bg-muted flex flex-col items-center justify-center">
                  <div className="text-[9px] font-bold text-primary uppercase tracking-wider leading-none mb-0.5">
                    {format(d, "MMM")}
                  </div>
                  <div className="text-lg font-display font-bold leading-none">{format(d, "d")}</div>
                </div>

                <div className="min-w-0 flex-1">
                  <h3
                    className="text-base font-display font-semibold text-foreground truncate pr-8"
                    data-testid={`text-session-name-${session.id}`}
                  >
                    {session.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    {session.durationMin != null && (
                      <span className="flex items-center gap-1" data-testid={`text-session-duration-${session.id}`}>
                        <Clock className="w-3 h-3" />
                        {formatDuration(session.durationMin)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Dumbbell className="w-3 h-3" />
                      {session.exerciseCount} ex · {session.setCount} sets
                    </span>
                    {session.totalVolumeKg > 0 && (
                      <span className="flex items-center gap-1">
                        <Weight className="w-3 h-3" />
                        {formatVolume(session.totalVolumeKg)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => setConfirmId(session.id)}
                data-testid={`button-delete-session-${session.id}`}
                aria-label="Delete workout"
                className="absolute top-3 right-3 p-1.5 text-muted-foreground/40 hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {sessions?.length === 0 && offset > 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">No more workouts.</div>
        )}
      </div>

      {(hasPrev || hasNext) && (
        <div className="mt-8 flex justify-between items-center text-sm font-medium">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={!hasPrev}
            data-testid="button-history-prev"
            className="py-2 px-4 rounded-full bg-muted text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={!hasNext}
            data-testid="button-history-next"
            className="py-2 px-4 rounded-full bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}

function ProgressView() {
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("maxWeight");

  const { data: topExercises, isLoading: loadingTop } = useGetTopExercises({ limit: 5 });

  const activeExercise = selectedExercise ?? topExercises?.[0]?.name ?? null;

  const { data: progressData, isLoading: loadingProgress } = useGetExerciseProgress(
    activeExercise ?? "",
    { metric },
    {
      query: {
        enabled: !!activeExercise,
        queryKey: ["/api/progress", activeExercise, metric],
      },
    }
  );

  if (loadingTop) {
    return (
      <div className="space-y-3">
        <div className="animate-pulse h-8 bg-card rounded-2xl w-2/3" />
        <div className="animate-pulse h-48 bg-card rounded-2xl" />
      </div>
    );
  }

  if (!topExercises || topExercises.length === 0) {
    return (
      <div className="text-center py-14 px-6 text-muted-foreground bg-card rounded-2xl border border-border/60">
        <TrendingUp className="h-10 w-10 mx-auto mb-4 opacity-30" />
        <p className="text-sm">Log a few workouts to see your progress here.</p>
      </div>
    );
  }

  const chartData = (progressData ?? []).map((p) => ({
    date: format(parseISO(p.date), "MMM d"),
    value: p.value,
    rawDate: p.date,
  }));

  const hasData = chartData.length > 0;
  const yLabel = metric === "maxWeight" ? "kg" : "kg·vol";

  return (
    <div className="space-y-4">
      {/* Exercise chips */}
      <div className="flex flex-wrap gap-2">
        {topExercises.map((ex) => {
          const isActive = (selectedExercise ?? topExercises[0]?.name) === ex.name;
          return (
            <button
              key={ex.name}
              onClick={() => setSelectedExercise(ex.name)}
              data-testid={`chip-exercise-${ex.name}`}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {ex.name}
            </button>
          );
        })}
      </div>

      {/* Chart card */}
      <div className="bg-card rounded-2xl border border-border/60 p-4">
        <div className="mb-3">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            {metric === "maxWeight" ? "Max weight (kg)" : "Total volume (kg·rep)"}
          </p>
          <p className="text-lg font-display font-semibold text-foreground">{activeExercise}</p>
        </div>

        {loadingProgress ? (
          <div className="animate-pulse h-40 bg-muted rounded-xl" />
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">Not enough data yet for this exercise.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--popover-border))",
                  borderRadius: "12px",
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: 2 }}
                formatter={(value: number) => [`${value} ${yLabel}`, activeExercise ?? ""]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={<Dot r={4} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />}
                activeDot={{ r: 5, fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Metric toggle */}
      <div className="flex bg-muted rounded-full p-1 w-fit">
        <button
          onClick={() => setMetric("maxWeight")}
          data-testid="toggle-metric-maxWeight"
          className={`px-4 py-1 text-[11px] font-semibold rounded-full transition-colors ${
            metric === "maxWeight"
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Max weight
        </button>
        <button
          onClick={() => setMetric("totalVolume")}
          data-testid="toggle-metric-totalVolume"
          className={`px-4 py-1 text-[11px] font-semibold rounded-full transition-colors ${
            metric === "totalVolume"
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Volume
        </button>
      </div>
    </div>
  );
}
