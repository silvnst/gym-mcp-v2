import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetSession,
  useAddSet,
  useUpdateSet,
  useAddSessionExercise,
  useUpdateSession,
  getGetSessionQueryKey,
  getListSessionsQueryKey,
  type SessionExerciseWithSets,
  type SessionWithDetail,
  type SetRecord,
  type Effort,
} from "@workspace/api-client-react";
import { useQueryClient, useIsMutating } from "@tanstack/react-query";
import { ArrowUp, Check, List, Plus, Crosshair } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BpButton, Card, IconButton, PlateLoader, SectionLabel, Stepper } from "@/components/bumper";
import {
  cleanName,
  EFFORT_LABELS,
  equipmentOf,
  formatKg,
  formatSet,
  groupBySuperset,
  suggestWeight,
  weightStep,
} from "@/lib/training";
import { cn } from "@/lib/utils";

/* ── Order of work ──────────────────────────────────────────────────────── */

type Round = { key: number; label: string; index: number; total: number };
type Step = { exercise: SessionExerciseWithSets; set: SetRecord; round: Round | null };
type SavedSet = { step: Step; weightKg: number | null; reps: number };

/** Supersets alternate round by round (A1 set 1, A2 set 1, A1 set 2 …); single exercises run straight through. */
function buildSequence(exercises: SessionExerciseWithSets[]): Step[] {
  const steps: Step[] = [];
  groupBySuperset(exercises).forEach((g, key) => {
    const items = g.items.map((e) => ({ e, sets: e.sets.slice().sort((a, b) => a.setNumber - b.setNumber) }));
    if (g.group && items.length > 1) {
      const total = Math.max(...items.map((i) => i.sets.length));
      for (let index = 0; index < total; index++) {
        for (const i of items) if (i.sets[index]) steps.push({ exercise: i.e, set: i.sets[index]!, round: { key, label: g.group, index, total } });
      }
    } else {
      for (const i of items) for (const set of i.sets) steps.push({ exercise: i.e, set, round: null });
    }
  });
  return steps;
}

const sameRound = (a: Step, b: Step) => a.round != null && b.round != null && a.round.key === b.round.key && a.round.index === b.round.index;

const isDone = (s: SetRecord) => s.reps != null;

function useElapsed(startIso: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!startIso) return "0:00";
  const total = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/* ── Unsaved input ──────────────────────────────────────────────────────── */

type Draft = { weight: number | null; reps: number };
const DRAFT_PREFIX = "gym.draft.";

function readDraft(setId: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_PREFIX + setId) ?? "null") as Draft | null;
    return d && typeof d.reps === "number" && (d.weight === null || typeof d.weight === "number") ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(setId: string, draft: Draft) {
  try {
    localStorage.setItem(DRAFT_PREFIX + setId, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the draft just doesn't survive a reload
  }
}

/** Removes the drafts of the given sets, or every draft when the workout ends. */
function clearDrafts(setIds?: string[]) {
  try {
    const keys = setIds ? setIds.map((id) => DRAFT_PREFIX + id) : Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_PREFIX));
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // nothing to clean up
  }
}

/** What a set starts from: equipment, the set before it and the values to show first. */
function setContext(step: Step) {
  const { exercise, set } = step;
  const equipment = equipmentOf(exercise);
  const usesWeight = equipment !== "bodyweight";
  const exerciseSets = exercise.sets.slice().sort((a, b) => a.setNumber - b.setNumber);
  const prev = exerciseSets.filter((s) => s.setNumber < set.setNumber && isDone(s)).at(-1);
  const suggestion = suggestWeight(prev?.weightKg ?? null, prev?.effort, equipment);
  const start: Draft = {
    weight: usesWeight ? (set.weightKg ?? suggestion ?? prev?.weightKg ?? exercise.targetWeightKg ?? set.lastWeightKg ?? 0) : null,
    reps: set.reps ?? exercise.targetReps ?? prev?.reps ?? set.lastReps ?? 8,
  };
  return { equipment, usesWeight, exerciseSets, prev, suggestion, start };
}

const initialDraft = (step: Step): Draft => (isDone(step.set) ? null : readDraft(step.set.id)) ?? setContext(step).start;

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const { data: session, isLoading } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) },
  });

  if (isLoading) return <p className="py-16 text-center text-bp-muted text-sm">Loading workout</p>;
  if (!session) return <p className="py-16 text-center text-bp-warn text-sm">This workout doesn't exist any more.</p>;
  return <Workout session={session} />;
}

function Workout({ session }: { session: SessionWithDetail }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const elapsed = useElapsed(session.createdAt);
  const isMutating = useIsMutating();

  const addSet = useAddSet();
  const updateSet = useUpdateSet();
  const updateSession = useUpdateSession();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(session.id) });

  const exercises = useMemo(() => session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder), [session.exercises]);

  // Pre-create empty set rows up to each exercise's target set count
  const seeded = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const ex of exercises) {
      const target = ex.targetSets;
      if (!target || ex.sets.length >= target || seeded.current.has(ex.id)) continue;
      seeded.current.add(ex.id);
      const max = ex.sets.length === 0 ? 0 : Math.max(...ex.sets.map((s) => s.setNumber));
      for (let n = max + 1; n <= target; n++) {
        addSet.mutate({ id: session.id, data: { sessionExerciseId: ex.id, setNumber: n } }, { onSuccess: refresh });
      }
    }
  }, [exercises]);

  const sequence = useMemo(() => buildSequence(exercises), [exercises]);
  const firstOpen = sequence.find((s) => !isDone(s.set));
  const [focusId, setFocusId] = useState<string | null>(null);
  const [view, setView] = useState<"focus" | "overview">(exercises.length === 0 ? "overview" : "focus");
  const [saved, setSaved] = useState<SavedSet[] | null>(null);

  const current = sequence.find((s) => s.set.id === focusId) ?? firstOpen ?? null;
  const round = current?.round ? sequence.filter((s) => sameRound(s, current)) : [];
  const doneCount = sequence.filter((s) => isDone(s.set)).length;

  const finish = () => {
    const durationMin = Math.max(1, Math.round((Date.now() - new Date(session.createdAt).getTime()) / 60_000));
    updateSession.mutate(
      { id: session.id, data: { durationMin } },
      {
        onSettled: () => {
          clearDrafts();
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          refresh();
          toast({ title: "Workout saved" });
          setLocation(`/history/${session.id}`);
        },
      },
    );
  };

  const saveSets = (sets: SavedSet[]) => {
    for (const { step, weightKg, reps } of sets) {
      updateSet.mutate(
        { id: step.set.id, data: { weightKg, reps } },
        {
          onSuccess: () => {
            clearDrafts([step.set.id]);
            refresh();
          },
          onError: () => toast({ title: "Set not saved", description: "Check your connection, then save again.", variant: "destructive" }),
        },
      );
    }
    setSaved(sets);
    setFocusId(null);
  };

  const rateSet = (setId: string, effort: Effort) => {
    updateSet.mutate({ id: setId, data: { effort } }, { onSuccess: refresh });
  };

  return (
    <div className="-mx-5">
      <header className="sticky top-0 z-30 bg-bp-bg px-5 pb-3 space-y-3.5" style={{ paddingTop: "calc(0.875rem + env(safe-area-inset-top))" }}>
        <div className="flex justify-between items-center gap-3">
          <IconButton
            label={view === "focus" ? "Show all exercises" : "Back to current set"}
            onClick={() => setView(view === "focus" ? "overview" : "focus")}
            aria-pressed={view === "overview"}
          >
            {view === "focus" ? <List className="w-[18px] h-[18px]" aria-hidden="true" /> : <Crosshair className="w-[18px] h-[18px]" aria-hidden="true" />}
          </IconButton>
          <div className="flex flex-col items-center min-w-0">
            <span className="font-bold text-base tabular" aria-label={`Elapsed ${elapsed}`}>{elapsed}</span>
            <span className="text-xs text-bp-muted truncate max-w-[180px]" data-testid="text-session-name">{cleanName(session.name)}</span>
          </div>
          <BpButton onClick={finish} disabled={isMutating > 0 || updateSession.isPending} className="min-h-11 px-4" data-testid="button-finish-session">
            {updateSession.isPending ? "Saving" : "Finish"}
          </BpButton>
        </div>
        {sequence.length > 0 && (
          <div
            className="h-1 rounded-full bg-bp-surface-2 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={sequence.length}
            aria-valuenow={doneCount}
            aria-label={`${doneCount} of ${sequence.length} sets done`}
          >
            <div className="h-full rounded-full bg-bp-ink" style={{ width: `${(doneCount / sequence.length) * 100}%` }} />
          </div>
        )}
      </header>

      <div className="px-5 pt-5">
        {view === "overview" || !current ? (
          <Overview
            session={session}
            exercises={exercises}
            currentSetId={current?.set.id ?? null}
            allDone={sequence.length > 0 && !firstOpen}
            onPick={(setId) => {
              setFocusId(setId);
              setView("focus");
            }}
            onFinish={finish}
          />
        ) : (
          round.length > 1 ? (
            <RoundSet key={`${current.round!.key}-${current.round!.index}`} steps={round} onSave={saveSets} />
          ) : (
            <FocusSet key={current.set.id} step={current} sequence={sequence} onSave={(w, r) => saveSets([{ step: current, weightKg: w, reps: r }])} />
          )
        )}
      </div>

      {saved && (
        <AfterSetSheet
          saved={saved}
          next={sequence.find((s) => !isDone(s.set) && !saved.some((d) => d.step.set.id === s.set.id)) ?? null}
          onRate={rateSet}
          onContinue={() => {
            setSaved(null);
            setView("focus");
          }}
          onFinish={() => {
            setSaved(null);
            finish();
          }}
        />
      )}
    </div>
  );
}

/* ── Focus: one set at a time ───────────────────────────────────────────── */

function SuggestionLine({ step }: { step: Step }) {
  const { prev, suggestion } = setContext(step);
  if (suggestion == null || !prev?.effort || prev.effort === "right") return null;
  return (
    <p className="flex gap-2 items-start text-sm text-bp-muted">
      <ArrowUp className={cn("w-[18px] h-[18px] shrink-0 mt-px text-bp-ink", prev.effort === "hard" && "rotate-180")} aria-hidden="true" />
      <span>
        Set {prev.setNumber} was {prev.effort === "easy" ? "too easy" : "too hard"}. Try <b className="text-bp-ink tabular">{formatKg(suggestion)} kg</b>.
      </span>
    </p>
  );
}

function SaveBar({ children, onClick, testId }: { children: React.ReactNode; onClick: () => void; testId: string }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-bp-bg from-70% to-transparent">
      <div className="max-w-md mx-auto px-5 pt-6" style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}>
        <BpButton variant="cta" onClick={onClick} data-testid={testId}>
          {children}
        </BpButton>
      </div>
    </div>
  );
}

function FocusSet({ step, sequence, onSave }: { step: Step; sequence: Step[]; onSave: (weightKg: number | null, reps: number) => void }) {
  const { exercise, set } = step;
  const { equipment, usesWeight, exerciseSets } = setContext(step);
  const [draft, setDraft] = useState(() => initialDraft(step));
  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    writeDraft(set.id, next);
  };

  const idx = sequence.findIndex((s) => s.set.id === set.id);
  const nextStep = sequence.slice(idx + 1).find((s) => !isDone(s.set));
  const ctaLabel = nextStep && nextStep.exercise.id !== exercise.id ? `Save set, then ${nextStep.exercise.name}` : "Save set";

  const targetBits = [
    exercise.targetReps != null ? `target ${exercise.targetReps}` : null,
    exercise.targetWeightKg != null ? `at ${formatKg(exercise.targetWeightKg)} kg` : null,
  ].filter(Boolean);
  const last = formatSet(set.lastWeightKg, set.lastReps, equipment);

  return (
    <div className="space-y-5 pt-2 pb-28">
      <div className="space-y-0.5">
        <h1 className="font-display font-extrabold text-[34px] leading-[36px] tracking-[-0.02em]">{exercise.name}</h1>
        <p className="text-sm text-bp-muted pt-1">
          Set {set.setNumber} of {Math.max(exerciseSets.length, exercise.targetSets ?? 0)}
          {targetBits.length > 0 && `, ${targetBits.join(" ")}`}
        </p>
        {last && <p className="text-sm text-bp-muted tabular">Last time {last}</p>}
        {exercise.notes && <p className="text-sm text-bp-muted pt-1">{exercise.notes}</p>}
      </div>

      <div className={cn("grid gap-3", usesWeight ? "grid-cols-2" : "grid-cols-1")}>
        {usesWeight && (
          <Stepper label="Weight in kg" unitLabel="kg" value={draft.weight} onChange={(weight) => update({ weight })} step={weightStep(equipment)} format={formatKg} />
        )}
        <Stepper label="Reps" unitLabel={draft.reps === 1 ? "rep" : "reps"} value={draft.reps} onChange={(v) => update({ reps: Math.max(0, Math.round(v)) })} step={1} />
      </div>

      <SuggestionLine step={step} />
      {equipment === "barbell" && <PlateLoader totalKg={draft.weight} />}

      <SaveBar onClick={() => onSave(usesWeight ? draft.weight : null, draft.reps)} testId="button-save-set">
        {ctaLabel}
      </SaveBar>
    </div>
  );
}

/* ── Superset: one round of every exercise on one screen ────────────────── */

function RoundSet({ steps, onSave }: { steps: Step[]; onSave: (sets: SavedSet[]) => void }) {
  const round = steps[0]!.round!;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(steps.map((s) => [s.set.id, initialDraft(s)])));
  const update = (setId: string, patch: Partial<Draft>) => {
    const next = { ...drafts[setId]!, ...patch };
    setDrafts({ ...drafts, [setId]: next });
    writeDraft(setId, next);
  };

  return (
    <div className="space-y-3.5 pt-2 pb-28">
      <div>
        <p className="text-sm text-bp-muted">Superset {round.label}</p>
        <h1 className="font-display font-extrabold text-[30px] leading-[32px] tracking-[-0.02em]">
          Round {round.index + 1} of {round.total}
        </h1>
      </div>

      {steps.map((step) => {
        const { exercise, set } = step;
        const { equipment, usesWeight } = setContext(step);
        const draft = drafts[set.id]!;
        const last = formatSet(set.lastWeightKg, set.lastReps, equipment);
        return (
          <Card key={set.id} as="section" className="space-y-3.5">
            <div>
              <div className="flex justify-between items-baseline gap-3">
                <h2 className="font-display font-extrabold text-[22px] leading-6 min-w-0 truncate">{exercise.name}</h2>
                {last && <p className="text-[13px] text-bp-muted tabular shrink-0">Last time {last}</p>}
              </div>
              {exercise.notes && <p className="text-[13px] text-bp-muted pt-1">{exercise.notes}</p>}
            </div>
            <div className={cn("grid gap-3", usesWeight ? "grid-cols-2" : "grid-cols-1")}>
              {usesWeight && (
                <Stepper compact label={`${exercise.name}, weight in kg`} unitLabel="kg" value={draft.weight} onChange={(weight) => update(set.id, { weight })} step={weightStep(equipment)} format={formatKg} />
              )}
              <Stepper
                compact
                label={`${exercise.name}, reps`}
                unitLabel={draft.reps === 1 ? "rep" : "reps"}
                value={draft.reps}
                onChange={(v) => update(set.id, { reps: Math.max(0, Math.round(v)) })}
                step={1}
              />
            </div>
            <SuggestionLine step={step} />
            {equipment === "barbell" && <PlateLoader totalKg={draft.weight} />}
          </Card>
        );
      })}

      <SaveBar
        onClick={() =>
          onSave(steps.map((step) => ({ step, weightKg: setContext(step).usesWeight ? drafts[step.set.id]!.weight : null, reps: drafts[step.set.id]!.reps })))
        }
        testId="button-save-round"
      >
        Save round
      </SaveBar>
    </div>
  );
}

/* ── After saving: how did it feel, what's next ─────────────────────────── */

function AfterSetSheet({
  saved,
  next,
  onRate,
  onContinue,
  onFinish,
}: {
  saved: SavedSet[];
  next: Step | null;
  onRate: (setId: string, effort: Effort) => void;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const [efforts, setEfforts] = useState<Record<string, Effort>>(() => Object.fromEntries(saved.map((d) => [d.step.set.id, d.step.set.effort ?? null])));
  const first = saved[0]!;
  const single = saved.length === 1 ? first : null;
  const nextSameExercise = single != null && next?.exercise.id === single.step.exercise.id;
  const nextSameSuperset = first.step.round != null && next?.round?.key === first.step.round.key;
  const following = single ? suggestWeight(single.weightKg, efforts[single.step.set.id], equipmentOf(single.step.exercise)) : null;
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onContinue();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nextLabel = !next ? "" : nextSameSuperset ? `Round ${next.round!.index + 1}` : nextSameExercise ? `Set ${next.set.setNumber}` : `Go to ${next.exercise.name}`;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="saved-title">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-bp-surface rounded-t-[20px] px-5 pt-5 space-y-[18px] max-h-[92dvh] overflow-y-auto"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-[10px] bg-bp-done flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" strokeWidth={3} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="saved-title" className="font-display font-extrabold text-[22px] leading-tight">
              {single ? `Set ${single.step.set.setNumber} saved` : `Round ${first.step.round!.index + 1} saved`}
            </h2>
            {single && (
              <p className="text-sm text-bp-muted tabular truncate">
                {single.step.exercise.name} {formatSet(single.weightKg, single.reps, equipmentOf(single.step.exercise))}
              </p>
            )}
          </div>
        </div>

        {saved.map((d) => {
          const id = d.step.set.id;
          const labelId = `effort-label-${id}`;
          return (
            <div key={id} className="space-y-2">
              <h3 id={labelId} className="font-sans font-bold text-[15px]">
                {single ? "How did that set feel?" : `${d.step.exercise.name} ${formatSet(d.weightKg, d.reps, equipmentOf(d.step.exercise))}`}
              </h3>
              <div role="group" aria-labelledby={labelId} className="grid grid-cols-3 gap-2">
                {(["easy", "right", "hard"] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={efforts[id] === e}
                    onClick={() => {
                      setEfforts({ ...efforts, [id]: e });
                      onRate(id, e);
                    }}
                    className={cn(
                      "rounded-[10px] border-2 border-bp-outline font-bold text-[15px]",
                      single ? "min-h-[52px]" : "min-h-11",
                      efforts[id] === e ? "bg-bp-brand text-bp-on-brand" : "bg-transparent text-bp-ink",
                    )}
                  >
                    {EFFORT_LABELS[e]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {single && efforts[single.step.set.id] && nextSameExercise && following != null && (
          <p className="text-[13px] text-bp-muted">
            {efforts[single.step.set.id] === "right" ? `Set ${next!.set.setNumber} stays at ${formatKg(following)} kg.` : `Set ${next!.set.setNumber} goes to ${formatKg(following)} kg.`}
          </p>
        )}

        {next ? (
          <>
            {!nextSameSuperset && (
              <div className="flex justify-between items-center gap-3 px-3.5 py-3 bg-bp-surface-2 rounded-[10px]">
                <div className="min-w-0">
                  <p className="text-[13px] text-bp-muted">Next</p>
                  <p className="font-bold truncate">
                    {next.round ? `Superset ${next.round.label}, round ${next.round.index + 1}` : `${next.exercise.name}, set ${next.set.setNumber}`}
                  </p>
                </div>
                {!next.round && (next.exercise.targetReps != null || next.exercise.targetWeightKg != null) && (
                  <span className="text-[15px] tabular shrink-0">
                    {formatSet(next.exercise.targetWeightKg, next.exercise.targetReps, equipmentOf(next.exercise))}
                  </span>
                )}
              </div>
            )}
            <BpButton ref={continueRef} variant="cta" onClick={onContinue}>
              {next.round && !nextSameSuperset ? `Go to superset ${next.round.label}` : nextLabel}
            </BpButton>
          </>
        ) : (
          <>
            <p className="text-sm">That was the last planned set.</p>
            <BpButton ref={continueRef} variant="cta" onClick={onFinish}>
              Finish workout
            </BpButton>
            <BpButton variant="ghost" className="w-full" onClick={onContinue}>
              Add more
            </BpButton>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Overview: every exercise, every set ────────────────────────────────── */

function Overview({
  session,
  exercises,
  currentSetId,
  allDone,
  onPick,
  onFinish,
}: {
  session: SessionWithDetail;
  exercises: SessionExerciseWithSets[];
  currentSetId: string | null;
  allDone: boolean;
  onPick: (setId: string) => void;
  onFinish: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const addSet = useAddSet();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(session.id) });

  const handleAddSet = (ex: SessionExerciseWithSets) => {
    const n = ex.sets.length === 0 ? 1 : Math.max(...ex.sets.map((s) => s.setNumber)) + 1;
    addSet.mutate(
      { id: session.id, data: { sessionExerciseId: ex.id, setNumber: n } },
      { onSuccess: refresh, onError: () => toast({ title: "Set not added", variant: "destructive" }) },
    );
  };

  return (
    <div className="space-y-4 pb-10">
      {allDone && (
        <Card className="space-y-3">
          <p className="font-display font-extrabold text-[22px]">All planned sets done</p>
          <BpButton variant="cta" onClick={onFinish}>Finish workout</BpButton>
        </Card>
      )}

      {groupBySuperset(exercises).map((g, gi) => (
        <Card key={gi} className="space-y-3">
          {g.group && g.items.length > 1 && (
            <SectionLabel className="mb-0" right={`${Math.max(...g.items.map((e) => e.sets.length))} rounds`}>
              <span className="text-bp-ink">Superset {g.group}</span>
            </SectionLabel>
          )}
          {g.items.map((ex) => {
            const equipment = equipmentOf(ex);
            return (
              <div key={ex.id} className="space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[15px] truncate">{ex.name}</p>
                    {(ex.targetSets != null || ex.targetReps != null) && (
                      <p className="text-[13px] text-bp-muted tabular">
                        {ex.targetSets ?? "?"} × {ex.targetReps ?? "?"}
                        {ex.targetWeightKg != null ? ` at ${formatKg(ex.targetWeightKg)} kg` : ""}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddSet(ex)}
                    aria-label={`Add a set to ${ex.name}`}
                    title="Add a set"
                    className="h-11 w-11 shrink-0 rounded-[10px] bg-bp-surface-2 flex items-center justify-center"
                    data-testid={`button-add-set-${ex.id}`}
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ex.sets
                    .slice()
                    .sort((a, b) => a.setNumber - b.setNumber)
                    .map((s) => {
                      const done = isDone(s);
                      const isCurrent = s.id === currentSetId;
                      const text = done
                        ? formatSet(s.weightKg, s.reps, equipment)
                        : formatSet(ex.targetWeightKg, ex.targetReps, equipment) || `Set ${s.setNumber}`;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onPick(s.id)}
                          aria-label={`${ex.name} set ${s.setNumber}${done ? `, done ${text}` : ", open"}`}
                          className={cn(
                            "min-h-12 px-1.5 rounded-[10px] text-[15px] tabular flex items-center justify-center gap-1 box-border",
                            done && "bg-bp-done",
                            isCurrent && !done && "bg-bp-brand text-bp-on-brand border-2 border-bp-outline font-bold",
                            !done && !isCurrent && "bg-bp-surface-2 text-bp-muted",
                          )}
                        >
                          {done && <Check className="w-3 h-3 shrink-0" strokeWidth={3} aria-hidden="true" />}
                          <span className="truncate">{text}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </Card>
      ))}

      <AddExerciseRow sessionId={session.id} nextSortOrder={exercises.length} />
      <SessionNotesInput sessionId={session.id} initialNotes={session.notes} />
    </div>
  );
}

function AddExerciseRow({ sessionId, nextSortOrder }: { sessionId: string; nextSortOrder: number }) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const addExercise = useAddSessionExercise({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) }),
      onError: () => toast({ title: "Exercise not added", variant: "destructive" }),
    },
  });

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addExercise.mutate({ id: sessionId, data: { name: trimmed, sortOrder: nextSortOrder, targetSets: 3 } });
    setName("");
  };

  return (
    <div>
      <label htmlFor="add-exercise" className="block font-sans text-[13px] font-bold text-bp-muted mb-2">
        Add an exercise
      </label>
      <div className="flex gap-2">
        <input
          id="add-exercise"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. Lateral Raise"
          disabled={addExercise.isPending}
          data-testid="input-add-exercise-name"
          className="flex-1 min-w-0 h-12 px-3 text-[15px] bg-bp-surface border-2 border-bp-outline rounded-[10px] text-bp-ink placeholder:text-bp-muted"
        />
        <BpButton variant="primary" onClick={submit} disabled={addExercise.isPending || !name.trim()} data-testid="button-add-exercise-to-session">
          <Plus className="w-4 h-4" aria-hidden="true" /> Add
        </BpButton>
      </div>
    </div>
  );
}

function SessionNotesInput({ sessionId, initialNotes }: { sessionId: string; initialNotes?: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const lastSaved = useRef(notes);
  const updateSession = useUpdateSession();
  const { toast } = useToast();

  const save = () => {
    if (notes === lastSaved.current) return;
    lastSaved.current = notes;
    updateSession.mutate(
      { id: sessionId, data: { notes: notes.trim() || null } },
      { onError: () => toast({ title: "Notes not saved", variant: "destructive" }) },
    );
  };

  return (
    <div>
      <label htmlFor="session-notes" className="block font-sans text-[13px] font-bold text-bp-muted mb-2">
        Notes
      </label>
      <textarea
        id="session-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={save}
        placeholder="Anything worth remembering next time"
        rows={3}
        className="w-full bg-bp-surface border-2 border-bp-outline rounded-[10px] px-3 py-2.5 text-[15px] text-bp-ink placeholder:text-bp-muted resize-none"
      />
    </div>
  );
}

