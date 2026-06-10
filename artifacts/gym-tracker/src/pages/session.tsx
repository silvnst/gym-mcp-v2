import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetSession,
  useAddSet,
  useUpdateSet,
  useDeleteSet,
  useAddSessionExercise,
  useUpdateSession,
  getGetSessionQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useIsMutating } from "@tanstack/react-query";
import { Check, Plus, X, WifiOff, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { SetRecord } from "@workspace/api-client-react";

function buildLastSessionSummary(
  sets: { setNumber: number; lastWeightKg?: number | null; lastReps?: number | null }[],
): string | null {
  const prevSets = sets
    .filter((s) => s.lastWeightKg != null || s.lastReps != null)
    .sort((a, b) => a.setNumber - b.setNumber);

  if (prevSets.length === 0) return null;

  const allSameWeight = prevSets.every((s) => s.lastWeightKg === prevSets[0]!.lastWeightKg);
  const allSameReps = prevSets.every((s) => s.lastReps === prevSets[0]!.lastReps);

  if (allSameWeight && allSameReps) {
    const w = prevSets[0]!.lastWeightKg != null ? `${prevSets[0]!.lastWeightKg}kg` : null;
    const r = prevSets[0]!.lastReps != null ? `${prevSets[0]!.lastReps} reps` : null;
    const detail = [w, r].filter(Boolean).join(" × ");
    return `${prevSets.length} × ${detail}`;
  }

  return prevSets
    .map((s) => {
      const w = s.lastWeightKg != null ? `${s.lastWeightKg}kg` : null;
      const r = s.lastReps != null ? `${s.lastReps}` : null;
      return [w, r].filter(Boolean).join("×");
    })
    .join(", ");
}

function useElapsedTime(startIso: string) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(startIso));
  useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(startIso)), 1000);
    return () => clearInterval(id);
  }, [startIso]);
  return elapsed;
}

function formatElapsed(startIso: string): string {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const { data: session, isLoading } = useGetSession(params.id as string, {
    query: {
      enabled: !!params.id,
      queryKey: getGetSessionQueryKey(params.id as string),
    },
  });

  const elapsed = useElapsedTime(session?.createdAt ?? new Date().toISOString());

  const addSet = useAddSet();
  const deleteSet = useDeleteSet();
  const updateSession = useUpdateSession();

  const addExercise = useAddSessionExercise({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(params.id as string) });
      },
      onError: () => {
        toast({ title: "Failed to add exercise", variant: "destructive" });
      },
    },
  });

  const handleAddSet = (exerciseId: string, existingSets: { setNumber: number }[]) => {
    const nextSetNumber =
      existingSets.length === 0 ? 1 : Math.max(...existingSets.map((s) => s.setNumber)) + 1;
    addSet.mutate(
      {
        id: session!.id,
        data: {
          sessionExerciseId: exerciseId,
          setNumber: nextSetNumber,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(params.id as string) });
        },
        onError: () => {
          toast({
            title: "Failed to add set",
            description: isOnline ? "Try again." : "You appear to be offline.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleDeleteSet = (setId: string) => {
    deleteSet.mutate(
      { id: setId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(params.id as string) });
        },
        onError: () => {
          toast({ title: "Failed to delete set", variant: "destructive" });
        },
      }
    );
  };

  const seededExercises = useRef<Set<string>>(new Set());

  // Pre-create empty set rows up to each exercise's target set count
  useEffect(() => {
    if (!session) return;
    for (const exercise of session.exercises) {
      const target = exercise.targetSets;
      if (!target || exercise.sets.length >= target) continue;
      if (seededExercises.current.has(exercise.id)) continue;
      seededExercises.current.add(exercise.id);
      const existingMax =
        exercise.sets.length === 0 ? 0 : Math.max(...exercise.sets.map((s) => s.setNumber));
      for (let i = existingMax + 1; i <= target; i++) {
        addSet.mutate(
          { id: session.id, data: { sessionExerciseId: exercise.id, setNumber: i } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(session.id) });
            },
          }
        );
      }
    }
  }, [session]);

  const isMutating = useIsMutating();

  const handleFinish = () => {
    if (!session) return;
    const startedAt = new Date(session.createdAt).getTime();
    const durationMin = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));

    updateSession.mutate(
      { id: session.id, data: { durationMin } },
      {
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(session.id) });
          toast({ title: "Workout saved", description: "Great job." });
          setLocation("/history");
        },
      }
    );
  };

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Loading session…</div>;
  }

  if (!session) {
    return <div className="py-16 text-center text-destructive text-sm">Session not found</div>;
  }

  const sortedExercises = session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="-mt-8 -mx-5">
      {!isOnline && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2 flex items-center gap-2 text-xs text-amber-400 font-medium">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          Offline — changes may not be saved until you reconnect
        </div>
      )}

      {/* Sticky header with live timer */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-lg border-b border-border px-5 py-3 flex justify-between items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-primary mb-0.5">
            <Timer className="w-3.5 h-3.5" />
            <span className="text-sm font-mono font-medium tabular-nums">{elapsed}</span>
          </div>
          <h1 className="text-lg font-display font-bold truncate" data-testid="text-session-name">
            {session.name}
          </h1>
        </div>
        <button
          onClick={handleFinish}
          disabled={isMutating > 0}
          data-testid="button-finish-session"
          title={isMutating > 0 ? "Saving changes…" : undefined}
          className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-bold shrink-0 active:scale-95 transition-transform disabled:opacity-60"
        >
          {isMutating > 0 ? "Saving…" : "Finish"}
        </button>
      </div>

      <div className="px-5 pt-6 pb-8 space-y-8">
        {sortedExercises.map((exercise, index) => (
          <div key={exercise.id} className="bg-card rounded-2xl border border-border/60 p-4">
            <div className="mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-primary">{(index + 1).toString().padStart(2, "0")}</span>
                <h3 className="text-lg font-display font-semibold truncate">{exercise.name}</h3>
              </div>
              {exercise.notes && (
                <p className="text-xs text-muted-foreground mt-1">{exercise.notes}</p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs">
                {(exercise.targetSets || exercise.targetReps || exercise.targetWeightKg) && (
                  <span className="text-muted-foreground">
                    Target {exercise.targetSets || "—"}×{exercise.targetReps || "—"}
                    {exercise.targetWeightKg ? ` @ ${exercise.targetWeightKg} kg` : ""}
                  </span>
                )}
                {(() => {
                  const summary = buildLastSessionSummary(exercise.sets);
                  return summary ? (
                    <span className="text-muted-foreground/70" data-testid={`last-session-summary-${exercise.id}`}>
                      Last: {summary}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            <div className="space-y-1">
              <div className="grid grid-cols-[2.5rem_1fr_1fr_3.5rem] gap-2 px-1 text-[10px] font-semibold text-muted-foreground tracking-widest uppercase mb-1">
                <div className="text-center">Set</div>
                <div className="text-center">kg</div>
                <div className="text-center">Reps</div>
                <div></div>
              </div>

              {exercise.sets.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No sets yet — add your first one.
                </div>
              ) : (
                exercise.sets
                  .slice()
                  .sort((a, b) => a.setNumber - b.setNumber)
                  .map((set) => (
                    <SetRow
                      key={set.id}
                      sessionId={session.id}
                      set={set}
                      targetReps={exercise.targetReps}
                      targetWeight={exercise.targetWeightKg}
                      onDelete={() => handleDeleteSet(set.id)}
                    />
                  ))
              )}

              <button
                className="mt-2 w-full text-xs font-semibold text-primary flex items-center justify-center gap-1 py-2.5 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors"
                onClick={() => handleAddSet(exercise.id, exercise.sets)}
                data-testid={`button-add-set-${exercise.id}`}
              >
                <Plus className="w-3.5 h-3.5" /> Add set
              </button>
            </div>
          </div>
        ))}

        <AddExerciseRow
          onAdd={(name) =>
            addExercise.mutate({
              id: params.id as string,
              data: { name, sortOrder: session?.exercises.length ?? 0 },
            })
          }
          isPending={addExercise.isPending}
        />

        <SessionNotesInput sessionId={session.id} initialNotes={session.notes} />
      </div>
    </div>
  );
}

function AddExerciseRow({
  onAdd,
  isPending,
}: {
  onAdd: (name: string) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
    inputRef.current?.focus();
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
        Add exercise
      </h3>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          placeholder="Exercise name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={isPending}
          data-testid="input-add-exercise-name"
          className="flex-1 h-11 rounded-xl bg-card border-border/60"
        />
        <Button
          onClick={handleSubmit}
          disabled={isPending || !name.trim()}
          data-testid="button-add-exercise-to-session"
          className="shrink-0 h-11 rounded-xl font-semibold"
        >
          <Plus className="h-4 w-4 mr-1" />
          {isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function SetRow({
  sessionId,
  set,
  targetReps,
  targetWeight,
  onDelete,
}: {
  sessionId: string;
  set: SetRecord;
  targetReps?: number | null;
  targetWeight?: number | null;
  onDelete: () => void;
}) {
  const updateSet = useUpdateSet();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [reps, setReps] = useState(set.reps != null ? set.reps.toString() : "");
  const [weight, setWeight] = useState(set.weightKg != null ? set.weightKg.toString() : "");

  const lastSavedReps = useRef(reps);
  const lastSavedWeight = useRef(weight);

  // Per-field interaction tracking for the current focus session.
  // touched: the field was focused at least once (reset on focus).
  // dirty: the user typed something (reset on focus, set on onChange).
  // Placeholder promotion only fires when touched && !dirty && field is empty.
  const weightTouched = useRef(false);
  const weightDirty = useRef(false);
  const repsTouched = useRef(false);
  const repsDirty = useRef(false);

  const handleSave = () => {
    let effectiveWeight = weight;
    let effectiveReps = reps;

    // Promote placeholder only when the user explicitly focused this field
    // and left without typing anything.
    if (effectiveWeight === "" && weightTouched.current && !weightDirty.current && set.lastWeightKg != null) {
      effectiveWeight = set.lastWeightKg.toString();
    }
    if (effectiveReps === "" && repsTouched.current && !repsDirty.current && set.lastReps != null) {
      effectiveReps = set.lastReps.toString();
    }

    if (effectiveReps === lastSavedReps.current && effectiveWeight === lastSavedWeight.current) return;

    lastSavedReps.current = effectiveReps;
    lastSavedWeight.current = effectiveWeight;

    if (effectiveWeight !== weight) setWeight(effectiveWeight);
    if (effectiveReps !== reps) setReps(effectiveReps);

    const parsedReps = effectiveReps ? parseInt(effectiveReps, 10) : null;
    const parsedWeight = effectiveWeight ? parseFloat(effectiveWeight) : null;
    updateSet.mutate(
      {
        id: set.id,
        data: {
          reps: parsedReps !== null && Number.isFinite(parsedReps) ? parsedReps : null,
          weightKg: parsedWeight !== null && Number.isFinite(parsedWeight) ? parsedWeight : null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
        },
        onError: () => {
          toast({
            title: "Failed to save set",
            description: "Check your connection and try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
      (e.target as HTMLElement).blur();
    }
  };

  const isCompleted = reps !== "" && weight !== "";

  const baseInput =
    "h-11 w-full text-center text-base font-mono tabular-nums bg-muted/50 rounded-lg outline-none transition-colors text-foreground border border-transparent focus:border-primary/60 focus:bg-muted";

  return (
    <div className="grid grid-cols-[2.5rem_1fr_1fr_3.5rem] gap-2 items-center py-0.5">
      <div className="text-center text-xs font-mono text-muted-foreground">{set.setNumber}</div>

      <input
        type="text"
        inputMode="decimal"
        value={weight}
        onFocus={() => { weightTouched.current = true; weightDirty.current = false; }}
        onChange={(e) => { weightDirty.current = true; setWeight(e.target.value); }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={(set.lastWeightKg ?? targetWeight ?? "—").toString()}
        data-testid={`input-set-${set.id}-weight`}
        className={`${baseInput} placeholder:text-muted-foreground/40`}
      />

      <input
        type="text"
        inputMode="numeric"
        value={reps}
        onFocus={() => { repsTouched.current = true; repsDirty.current = false; }}
        onChange={(e) => { repsDirty.current = true; setReps(e.target.value); }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={(set.lastReps ?? targetReps ?? "—").toString()}
        data-testid={`input-set-${set.id}-reps`}
        className={`${baseInput} placeholder:text-muted-foreground/40`}
      />

      <div className="flex items-center justify-end gap-0.5 pr-1">
        <div
          className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
            isCompleted ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground/30"
          }`}
        >
          <Check className="w-3.5 h-3.5" />
        </div>
        <button
          onClick={onDelete}
          data-testid={`button-delete-set-${set.id}`}
          className="h-8 w-8 flex items-center justify-center text-muted-foreground/40 hover:text-destructive"
          aria-label="Delete set"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SessionNotesInput({
  sessionId,
  initialNotes,
}: {
  sessionId: string;
  initialNotes?: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const lastSaved = useRef(notes);
  const updateSession = useUpdateSession();
  const { toast } = useToast();

  const save = () => {
    if (notes === lastSaved.current) return;
    lastSaved.current = notes;
    updateSession.mutate(
      { id: sessionId, data: { notes: notes.trim() || null } },
      {
        onError: () => {
          toast({ title: "Failed to save session notes", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
        Session notes
      </h3>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={save}
        placeholder="How did it go? Any observations…"
        rows={3}
        className="w-full bg-card border border-border/60 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 resize-none transition-colors"
      />
    </div>
  );
}
