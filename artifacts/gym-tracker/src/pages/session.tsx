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
import { BpButton, Card, IconButton, Notice, PlateLoader, SectionLabel, Stepper } from "@/components/bumper";
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

type Step = { exercise: SessionExerciseWithSets; set: SetRecord };

/** Supersets alternate round by round (A1 set 1, A2 set 1, A1 set 2 …); single exercises run straight through. */
function buildSequence(exercises: SessionExerciseWithSets[]): Step[] {
  const steps: Step[] = [];
  for (const g of groupBySuperset(exercises)) {
    const items = g.items.map((e) => ({ e, sets: e.sets.slice().sort((a, b) => a.setNumber - b.setNumber) }));
    if (g.group && items.length > 1) {
      const rounds = Math.max(...items.map((i) => i.sets.length));
      for (let r = 0; r < rounds; r++) for (const i of items) if (i.sets[r]) steps.push({ exercise: i.e, set: i.sets[r]! });
    } else {
      for (const i of items) for (const s of i.sets) steps.push({ exercise: i.e, set: s });
    }
  }
  return steps;
}

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
  const [saved, setSaved] = useState<{ step: Step; weightKg: number | null; reps: number } | null>(null);

  const current = sequence.find((s) => s.set.id === focusId) ?? firstOpen ?? null;
  const doneCount = sequence.filter((s) => isDone(s.set)).length;

  const finish = () => {
    const durationMin = Math.max(1, Math.round((Date.now() - new Date(session.createdAt).getTime()) / 60_000));
    updateSession.mutate(
      { id: session.id, data: { durationMin } },
      {
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          refresh();
          toast({ title: "Workout saved" });
          setLocation(`/history/${session.id}`);
        },
      },
    );
  };

  const saveSet = (step: Step, weightKg: number | null, reps: number) => {
    updateSet.mutate(
      { id: step.set.id, data: { weightKg, reps } },
      {
        onSuccess: refresh,
        onError: () => toast({ title: "Set not saved", description: "Check your connection, then save again.", variant: "destructive" }),
      },
    );
    setSaved({ step, weightKg, reps });
    setFocusId(null);
  };

  const rateSet = (setId: string, effort: Effort) => {
    updateSet.mutate({ id: setId, data: { effort } }, { onSuccess: refresh });
  };

  return (
    <div className="-mx-5">
      <header className="sticky top-0 z-30 bg-bp-bg border-b-2 border-bp-outline px-5 pt-3.5 pb-3 space-y-3">
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
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${sequence.length}, minmax(0, 1fr))` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={sequence.length}
            aria-valuenow={doneCount}
            aria-label={`${doneCount} of ${sequence.length} sets done`}
          >
            {sequence.map((s) => (
              <span
                key={s.set.id}
                className={cn("h-2 rounded", isDone(s.set) ? "bg-plate-10" : s.set.id === current?.set.id ? "bg-bp-brand" : "bg-bp-surface-2")}
              />
            ))}
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
          <FocusSet
            key={current.set.id}
            step={current}
            sequence={sequence}
            onSave={(w, r) => saveSet(current, w, r)}
          />
        )}
      </div>

      {saved && (
        <AfterSetSheet
          saved={saved}
          next={sequence.find((s) => !isDone(s.set) && s.set.id !== saved.step.set.id) ?? null}
          onRate={(effort) => rateSet(saved.step.set.id, effort)}
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

function FocusSet({ step, sequence, onSave }: { step: Step; sequence: Step[]; onSave: (weightKg: number | null, reps: number) => void }) {
  const { exercise, set } = step;
  const equipment = equipmentOf(exercise);
  const usesWeight = equipment !== "bodyweight";
  const exerciseSets = exercise.sets.slice().sort((a, b) => a.setNumber - b.setNumber);
  const prevInSession = exerciseSets.filter((s) => s.setNumber < set.setNumber && isDone(s)).at(-1);
  const suggestion = suggestWeight(prevInSession?.weightKg ?? null, prevInSession?.effort, equipment);

  const [weight, setWeight] = useState<number | null>(
    usesWeight ? (set.weightKg ?? suggestion ?? prevInSession?.weightKg ?? exercise.targetWeightKg ?? set.lastWeightKg ?? 0) : null,
  );
  const [reps, setReps] = useState<number>(set.reps ?? exercise.targetReps ?? prevInSession?.reps ?? set.lastReps ?? 8);

  const partner = exercise.supersetGroup ? sequence.find((s) => s.exercise.supersetGroup === exercise.supersetGroup && s.exercise.id !== exercise.id) : null;
  const idx = sequence.findIndex((s) => s.set.id === set.id);
  const nextStep = sequence.slice(idx + 1).find((s) => !isDone(s.set));
  const ctaLabel = nextStep && nextStep.exercise.id !== exercise.id ? `Save set, then ${nextStep.exercise.name}` : "Save set";

  const targetBits = [
    exercise.targetReps != null ? `target ${exercise.targetReps}` : null,
    exercise.targetWeightKg != null ? `at ${formatKg(exercise.targetWeightKg)} kg` : null,
  ].filter(Boolean);
  const last = formatSet(set.lastWeightKg, set.lastReps, equipment);

  return (
    <div className="space-y-4 pb-28">
      <div className="space-y-0.5">
        {partner && (
          <p className="text-[13px] font-bold text-bp-muted">
            Superset {exercise.supersetGroup} with {partner.exercise.name}
          </p>
        )}
        <h1 className="font-display font-extrabold text-[34px] leading-[36px] tracking-[-0.02em]">{exercise.name}</h1>
        <p className="text-sm text-bp-muted pt-0.5">
          Set {set.setNumber} of {Math.max(exerciseSets.length, exercise.targetSets ?? 0)}
          {targetBits.length > 0 && `, ${targetBits.join(" ")}`}
        </p>
        {last && <p className="text-sm text-bp-muted tabular">Last time {last}</p>}
        {exercise.notes && <p className="text-sm text-bp-muted pt-1">{exercise.notes}</p>}
      </div>

      {suggestion != null && prevInSession?.effort && prevInSession.effort !== "right" && (
        <Notice tone="tip" icon={<ArrowUp className={cn("w-[18px] h-[18px]", prevInSession.effort === "hard" && "rotate-180")} aria-hidden="true" />}>
          Set {prevInSession.setNumber} was {prevInSession.effort === "easy" ? "too easy" : "too hard"}. Try <b>{formatKg(suggestion)} kg</b>.
        </Notice>
      )}

      <div className={cn("grid gap-3", usesWeight ? "grid-cols-2" : "grid-cols-1")}>
        {usesWeight && (
          <Stepper label="Weight in kg" unitLabel="kg" value={weight} onChange={setWeight} step={weightStep(equipment)} format={formatKg} />
        )}
        <Stepper label="Reps" unitLabel={reps === 1 ? "rep" : "reps"} value={reps} onChange={(v) => setReps(Math.max(0, Math.round(v)))} step={1} />
      </div>

      {equipment === "barbell" && <PlateLoader totalKg={weight} />}

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-bp-bg from-70% to-transparent">
        <div className="max-w-md mx-auto px-5 pt-6" style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}>
          <BpButton variant="cta" onClick={() => onSave(usesWeight ? weight : null, reps)} data-testid="button-save-set">
            {ctaLabel}
          </BpButton>
        </div>
      </div>
    </div>
  );
}

/* ── After a set: how did it feel, what's next ──────────────────────────── */

function AfterSetSheet({
  saved,
  next,
  onRate,
  onContinue,
  onFinish,
}: {
  saved: { step: Step; weightKg: number | null; reps: number };
  next: Step | null;
  onRate: (effort: Effort) => void;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const [effort, setEffort] = useState<Effort>(saved.step.set.effort ?? null);
  const { exercise, set } = saved.step;
  const equipment = equipmentOf(exercise);
  const nextSameExercise = next?.exercise.id === exercise.id;
  const following = suggestWeight(saved.weightKg, effort, equipment);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onContinue();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="saved-title">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-bp-surface border-t-2 border-x-2 border-bp-outline rounded-t-[20px] px-5 pt-5 space-y-[18px]"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-[10px] border-2 border-bp-outline bg-bp-done flex items-center justify-center shrink-0">
            <Check className="w-5 h-5" strokeWidth={3} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="saved-title" className="font-display font-extrabold text-[22px] leading-tight">
              Set {set.setNumber} saved
            </h2>
            <p className="text-sm text-bp-muted tabular truncate">
              {exercise.name} {formatSet(saved.weightKg, saved.reps, equipment)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 id="effort-label" className="font-sans font-bold text-[15px]">How did that set feel?</h3>
          <div role="group" aria-labelledby="effort-label" className="grid grid-cols-3 gap-2">
            {(["easy", "right", "hard"] as const).map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={effort === e}
                onClick={() => {
                  setEffort(e);
                  onRate(e);
                }}
                className={cn(
                  "min-h-[52px] rounded-[10px] border-2 border-bp-outline font-bold text-[15px]",
                  effort === e ? "bg-bp-brand text-bp-on-brand shadow-hard-ink" : "bg-bp-bg text-bp-ink",
                )}
              >
                {EFFORT_LABELS[e]}
              </button>
            ))}
          </div>
          {effort && nextSameExercise && following != null && (
            <p className="text-[13px] text-bp-muted">
              {effort === "right" ? `Set ${next!.set.setNumber} stays at ${formatKg(following)} kg.` : `Set ${next!.set.setNumber} goes to ${formatKg(following)} kg.`}
            </p>
          )}
        </div>

        {next ? (
          <>
            <div className="flex justify-between items-center gap-3 px-3.5 py-3 border-2 border-dashed border-bp-outline rounded-[10px]">
              <div className="min-w-0">
                <p className="text-[13px] text-bp-muted">Next</p>
                <p className="font-bold truncate">
                  {next.exercise.name}, set {next.set.setNumber}
                </p>
              </div>
              {(next.exercise.targetReps != null || next.exercise.targetWeightKg != null) && (
                <span className="text-[15px] tabular shrink-0">
                  {formatSet(next.exercise.targetWeightKg, next.exercise.targetReps, equipmentOf(next.exercise))}
                </span>
              )}
            </div>
            <BpButton ref={continueRef} variant="cta" onClick={onContinue}>
              {nextSameExercise ? `Set ${next.set.setNumber}` : `Go to ${next.exercise.name}`}
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
        <Card shadow className="space-y-3">
          <p className="font-display font-extrabold text-[22px]">All planned sets done</p>
          <BpButton variant="cta" onClick={onFinish}>Finish workout</BpButton>
        </Card>
      )}

      {groupBySuperset(exercises).map((g, gi) => (
        <Card key={gi} shadow={g.items.some((e) => e.sets.some((s) => s.id === currentSetId))} className="space-y-3">
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
                    className="h-11 w-11 shrink-0 rounded-[10px] border-2 border-bp-outline flex items-center justify-center"
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
                            done && "bg-bp-done border-2 border-bp-outline",
                            isCurrent && !done && "bg-bp-brand text-bp-on-brand border-2 border-bp-outline font-bold",
                            !done && !isCurrent && "border-2 border-dashed border-bp-outline text-bp-muted",
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

