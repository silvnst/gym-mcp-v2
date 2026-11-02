import { useState } from "react";
import { Link } from "wouter";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { Clock, Play, ArrowRight } from "lucide-react";
import { useListPlans, useListSessions, useGetBests, type PlanWithExercises, type SessionSummary } from "@workspace/api-client-react";
import { useProfile } from "@/lib/profile";
import { ProfileAvatar } from "@/components/profile-gate";
import { ProfileSheet } from "@/components/layout";
import { BpButton, Card, Notice, PageTitle, SectionLabel, StatTile } from "@/components/bumper";
import { cleanName, daysBetween, formatKg, groupBySuperset } from "@/lib/training";
import { useStartWorkout } from "@/lib/start-workout";
import { cn } from "@/lib/utils";

const COMEBACK_DAYS = 14;
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const ACTIVE_DAYS = 28;

/**
 * What to train next. Plans used in the last four weeks form the current programme;
 * among those, the one trained least recently is next (so A/B splits alternate and a
 * single comeback plan repeats). With nothing recent, the newest plan is suggested.
 */
function pickNextPlan(plans: PlanWithExercises[], sessions: SessionSummary[], today: Date): PlanWithExercises | null {
  if (plans.length === 0) return null;
  const lastByPlan = new Map<string, string>();
  for (const s of sessions) {
    const plan = plans.find((p) => p.id === s.planId) ?? plans.find((p) => cleanName(p.name) === cleanName(s.name));
    if (plan && !lastByPlan.has(plan.id)) lastByPlan.set(plan.id, s.date);
  }
  const active = plans.filter((p) => {
    const last = lastByPlan.get(p.id);
    return last != null && daysBetween(parseISO(last), today) <= ACTIVE_DAYS;
  });
  if (active.length === 0) {
    return plans.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }
  return active.sort((a, b) => lastByPlan.get(a.id)!.localeCompare(lastByPlan.get(b.id)!))[0] ?? null;
}

export default function TodayPage() {
  const { user } = useProfile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: plans, isLoading: plansLoading } = useListPlans();
  const { data: sessions } = useListSessions({ limit: 30 });
  const { data: bests } = useGetBests({ limit: 3 });
  const { start, isPending } = useStartWorkout();

  const today = new Date();
  const lastSession = sessions?.[0];
  const unfinished = lastSession && lastSession.durationMin == null && isSameDay(parseISO(lastSession.date), today) ? lastSession : null;
  const daysOff = lastSession ? daysBetween(parseISO(lastSession.date), today) : null;
  const next = plans && sessions ? pickNextPlan(plans, sessions, today) : null;

  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const week = WEEKDAYS.map((label, i) => {
    const day = addDays(weekStart, i);
    return { label, day, trained: !!sessions?.some((s) => isSameDay(parseISO(s.date), day)), isToday: isSameDay(day, today) };
  });
  const trainedThisWeek = week.filter((d) => d.trained).length;

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow={format(today, "EEEE, d MMMM")}
        action={
          <button onClick={() => setSheetOpen(true)} aria-label={`Profile ${user.name}, settings`} data-testid="nav-profile">
            <ProfileAvatar name={user.name} />
          </button>
        }
      >
        Today
      </PageTitle>

      {daysOff != null && daysOff >= COMEBACK_DAYS && !unfinished && (
        <Notice icon={<Clock className="w-[18px] h-[18px]" aria-hidden="true" />}>
          <b>{daysOff} days</b> since your last workout. Loads start at about 60 % for two weeks.
        </Notice>
      )}

      {unfinished ? (
        <Card shadow className="space-y-3">
          <SectionLabel className="mb-0">In progress</SectionLabel>
          <p className="font-display font-extrabold text-[28px] leading-[30px] tracking-[-0.02em]">{cleanName(unfinished.name)}</p>
          <Link href={`/session/${unfinished.id}`} className="flex items-center justify-center gap-2 w-full min-h-14 rounded-[14px] border-2 border-bp-outline bg-bp-brand text-bp-on-brand shadow-hard-ink press font-display font-extrabold text-[17px]">
            Continue workout <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </Link>
        </Card>
      ) : plansLoading ? (
        <div className="h-64 rounded-[14px] border-2 border-bp-outline bg-bp-surface animate-pulse" />
      ) : next ? (
        <UpNext plan={next} onStart={() => start(next)} isPending={isPending} />
      ) : (
        <Card shadow className="space-y-3">
          <p className="font-display font-extrabold text-[22px]">No plans yet</p>
          <p className="text-sm text-bp-muted">Make a plan once, then start it from here in one tap.</p>
          <Link href="/plans/new" className="inline-flex items-center justify-center min-h-12 px-5 rounded-[10px] border-2 border-bp-outline bg-bp-brand text-bp-on-brand shadow-hard-sm press font-bold">
            Create a plan
          </Link>
          <BpButton variant="ghost" onClick={() => start(null)} disabled={isPending}>
            Or start an empty workout
          </BpButton>
        </Card>
      )}

      <section>
        <SectionLabel right={`${trainedThisWeek} ${trainedThisWeek === 1 ? "workout" : "workouts"}`}>This week</SectionLabel>
        <ol className="grid grid-cols-7 gap-1.5">
          {week.map((d) => (
            <li key={d.label} className="flex flex-col items-center gap-1.5">
              <span className={cn("text-xs", d.isToday ? "font-bold text-bp-ink" : "text-bp-muted")}>{d.label}</span>
              <span
                aria-label={`${format(d.day, "EEEE")}${d.trained ? ", trained" : ""}${d.isToday ? ", today" : ""}`}
                className={cn(
                  "w-[38px] h-[38px] rounded-[10px] box-border flex items-center justify-center",
                  d.trained ? "bg-bp-done border-2 border-bp-outline" : "bg-bp-surface-2",
                  d.isToday && !d.trained && "bg-transparent border-2 border-bp-brand",
                )}
              />
            </li>
          ))}
        </ol>
      </section>

      {bests && bests.length > 0 && (
        <section>
          <SectionLabel>Best sets</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {bests.map((b) => (
              <StatTile key={b.name} label={shortName(b.name)} value={formatKg(b.weightKg)} unit="kg" note={`for ${b.reps} reps`} />
            ))}
          </div>
        </section>
      )}

      {sheetOpen && <ProfileSheet onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function shortName(name: string) {
  return name.replace(/\s*\(.*\)\s*/, "").replace(/^Barbell /, "");
}

function UpNext({ plan, onStart, isPending }: { plan: PlanWithExercises; onStart: () => void; isPending: boolean }) {
  const exercises = plan.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const groups = groupBySuperset(exercises);
  const supersets = groups.filter((g) => g.group && g.items.length > 1).length;
  const rows = groups.slice(0, 4);

  return (
    <Card shadow className="space-y-3.5 p-[18px]">
      <div className="space-y-1">
        <SectionLabel className="mb-0">Up next</SectionLabel>
        <p className="font-display font-extrabold text-[28px] leading-[30px] tracking-[-0.02em]">{cleanName(plan.name)}</p>
        <p className="text-[13px] font-medium text-bp-muted">
          {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
          {supersets > 0 && ` in ${supersets} ${supersets === 1 ? "superset" : "supersets"}`}
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {rows.map((g, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="truncate">{g.items.map((e) => e.name).join(" with ")}</span>
            {g.items[0]?.targetWeightKg != null && <span className="text-bp-muted tabular shrink-0">{formatKg(g.items[0].targetWeightKg)} kg</span>}
          </li>
        ))}
        {groups.length > rows.length && <li className="text-bp-muted">{groups.length - rows.length} more</li>}
      </ul>
      <BpButton variant="cta" onClick={onStart} disabled={isPending} data-testid="button-start-next">
        <Play className="w-4 h-4 fill-current" aria-hidden="true" />
        {isPending ? "Starting" : "Start workout"}
      </BpButton>
    </Card>
  );
}
