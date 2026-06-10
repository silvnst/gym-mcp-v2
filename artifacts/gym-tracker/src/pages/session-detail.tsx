import { useState, useRef, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  useGetSession,
  useDeleteSession,
  useUpdateSession,
  useUpdateSet,
  useDeleteSet,
  useAddSet,
  useAddSessionExercise,
  useUpdateSessionExercise,
  useDeleteSessionExercise,
  getGetSessionQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import type { SessionWithDetail, SessionExerciseWithSets, SetRecord } from "@workspace/api-client-react";
import { ArrowLeft, Calendar, Clock, Trash2, Pencil, Check, Plus, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatDuration, formatVolume } from "@/lib/utils";

export default function SessionDetailPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: session, isLoading } = useGetSession(params.id as string, {
    query: {
      enabled: !!params.id,
      queryKey: getGetSessionQueryKey(params.id as string),
    },
  });

  const deleteSession = useDeleteSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
        toast({ title: "Workout deleted" });
        setLocation("/history");
      },
      onError: () => {
        toast({ title: "Failed to delete workout", variant: "destructive" });
        setConfirming(false);
      },
    },
  });

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Loading workout…</div>;
  }

  if (!session) {
    return <div className="py-16 text-center text-destructive text-sm">Workout not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/history">
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0 rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold tracking-widest uppercase text-primary">Workout</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {confirming ? (
            <>
              <button
                onClick={() => setConfirming(false)}
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
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing((e) => !e)}
                data-testid="button-edit-session"
                className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full transition-colors ${
                  editing ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                {editing ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Done
                  </>
                ) : (
                  <>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </>
                )}
              </button>
              {!editing && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirming(true)}
                  data-testid="button-delete-session"
                  className="shrink-0 rounded-full text-muted-foreground/50 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {editing ? <SessionEditView session={session} /> : <SessionReadView session={session} />}
    </div>
  );
}

// ── Read-only view ─────────────────────────────────────────────────────────────

function SessionReadView({ session }: { session: SessionWithDetail }) {
  const exercises = session.exercises ?? [];

  const totalVolume = exercises.reduce((acc, exercise) => {
    return (
      acc +
      (exercise.sets ?? []).reduce((setAcc, set) => {
        const reps = set.reps ?? 0;
        const weight = set.weightKg ?? 0;
        return setAcc + reps * weight;
      }, 0)
    );
  }, 0);

  const totalSets = exercises.reduce(
    (acc, ex) => acc + (ex.sets ?? []).filter((s) => s.reps != null && s.weightKg != null).length,
    0
  );

  return (
    <>
      {/* Overview card */}
      <div className="bg-card rounded-2xl border border-border/60 p-5">
        <h1 className="text-2xl font-display font-bold mb-2">{session.name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            {format(parseISO(session.date), "EEE, MMM d, yyyy")}
          </span>
          {session.durationMin != null && (
            <span className="flex items-center gap-1.5" data-testid="text-session-duration">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {formatDuration(session.durationMin)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-muted/60 rounded-xl p-3 text-center">
            <div className="text-lg font-display font-bold text-primary leading-tight">
              {totalVolume > 0 ? formatVolume(totalVolume) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mt-0.5">
              Volume
            </div>
          </div>
          <div className="bg-muted/60 rounded-xl p-3 text-center">
            <div className="text-lg font-display font-bold text-primary leading-tight">{totalSets}</div>
            <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mt-0.5">
              Sets
            </div>
          </div>
          <div className="bg-muted/60 rounded-xl p-3 text-center">
            <div className="text-lg font-display font-bold text-primary leading-tight">{exercises.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mt-0.5">
              Exercises
            </div>
          </div>
        </div>

        {session.notes && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1.5">
              Notes
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{session.notes}</p>
          </div>
        )}
      </div>

      {/* Exercises */}
      <div className="space-y-4">
        {exercises.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm bg-card rounded-2xl border border-border/60">
            No exercises logged in this workout.
          </div>
        ) : (
          exercises
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((exercise, index) => {
              const allSets = (exercise.sets ?? []).slice().sort((a, b) => a.setNumber - b.setNumber);
              const hasTarget =
                exercise.targetReps != null || exercise.targetWeightKg != null || exercise.targetSets != null;

              return (
                <div key={exercise.id} className="bg-card rounded-2xl border border-border/60 p-4">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-xs font-mono text-primary">
                        {(index + 1).toString().padStart(2, "0")}
                      </span>
                      <h4 className="text-base font-display font-semibold truncate">{exercise.name}</h4>
                    </div>
                    {hasTarget && (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Target {exercise.targetSets ?? "—"}×{exercise.targetReps ?? "—"}
                        {exercise.targetWeightKg ? ` @ ${exercise.targetWeightKg} kg` : ""}
                      </span>
                    )}
                  </div>

                  {allSets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No sets logged.</p>
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-border/40">
                      <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] text-[10px] font-semibold tracking-widest uppercase text-muted-foreground bg-muted/50 px-3 py-2 gap-2">
                        <div className="text-center">Set</div>
                        <div className="text-right">kg</div>
                        <div className="text-right">Reps</div>
                        <div className="text-right">Vol</div>
                      </div>
                      <div className="divide-y divide-border/30">
                        {allSets.map((set) => {
                          const vol =
                            set.reps != null && set.weightKg != null ? set.reps * set.weightKg : null;
                          return (
                            <div
                              key={set.id}
                              className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-2 px-3 py-2.5 text-sm items-center"
                            >
                              <div className="text-center font-mono text-muted-foreground text-xs">
                                {set.setNumber}
                              </div>
                              <div className="text-right font-mono font-medium tabular-nums">
                                {set.weightKg ?? <span className="text-muted-foreground/40">—</span>}
                              </div>
                              <div className="text-right font-mono font-medium tabular-nums">
                                {set.reps ?? <span className="text-muted-foreground/40">—</span>}
                              </div>
                              <div className="text-right font-mono text-primary/80 text-xs tabular-nums">
                                {vol != null && vol > 0 ? Math.round(vol) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>
    </>
  );
}

// ── Edit view ──────────────────────────────────────────────────────────────────

function SessionEditView({ session }: { session: SessionWithDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(session.id) });
    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
  };

  const updateSession = useUpdateSession({
    mutation: {
      onSuccess: invalidate,
      onError: () => toast({ title: "Failed to save changes", variant: "destructive" }),
    },
  });

  const addExercise = useAddSessionExercise({
    mutation: {
      onSuccess: invalidate,
      onError: () => toast({ title: "Failed to add exercise", variant: "destructive" }),
    },
  });

  const [name, setName] = useState(session.name);
  const [date, setDate] = useState(session.date);
  const [duration, setDuration] = useState(
    session.durationMin != null ? session.durationMin.toString() : ""
  );
  const [notes, setNotes] = useState(session.notes ?? "");
  const [newExerciseName, setNewExerciseName] = useState("");

  const saveMeta = () => {
    const parsedDuration = duration.trim() === "" ? null : parseInt(duration, 10);
    updateSession.mutate({
      id: session.id,
      data: {
        name: name.trim() || session.name,
        date,
        notes: notes.trim() || null,
        durationMin:
          parsedDuration != null && Number.isFinite(parsedDuration) && parsedDuration >= 0
            ? parsedDuration
            : null,
      },
    });
  };

  const handleAddExercise = () => {
    const trimmed = newExerciseName.trim();
    if (!trimmed) return;
    addExercise.mutate({
      id: session.id,
      data: { name: trimmed, sortOrder: session.exercises.length },
    });
    setNewExerciseName("");
  };

  const sortedExercises = session.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const labelCls = "text-[10px] font-semibold tracking-widest uppercase text-muted-foreground";

  return (
    <>
      {/* Session meta editor */}
      <div className="bg-card rounded-2xl border border-primary/30 p-5 space-y-4">
        <div className="space-y-1.5">
          <label className={labelCls}>Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveMeta}
            data-testid="input-edit-session-name"
            className="rounded-xl bg-muted/50 border-border/60 font-display font-semibold text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onBlur={saveMeta}
              data-testid="input-edit-session-date"
              className="rounded-xl bg-muted/50 border-border/60"
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Duration (min)</label>
            <Input
              type="text"
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={saveMeta}
              placeholder="e.g. 60"
              data-testid="input-edit-session-duration"
              className="rounded-xl bg-muted/50 border-border/60 font-mono tabular-nums"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveMeta}
            placeholder="Workout notes…"
            rows={2}
            className="w-full bg-muted/50 border border-border/60 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 resize-none transition-colors"
          />
        </div>
      </div>

      {/* Exercise editors */}
      <div className="space-y-4">
        {sortedExercises.map((exercise) => (
          <ExerciseEditor
            key={exercise.id}
            sessionId={session.id}
            exercise={exercise}
            onChanged={invalidate}
          />
        ))}

        {/* Add exercise */}
        <div className="flex gap-2">
          <Input
            placeholder="Add exercise…"
            value={newExerciseName}
            onChange={(e) => setNewExerciseName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddExercise()}
            disabled={addExercise.isPending}
            data-testid="input-edit-add-exercise"
            className="flex-1 h-11 rounded-xl bg-card border-border/60"
          />
          <Button
            onClick={handleAddExercise}
            disabled={addExercise.isPending || !newExerciseName.trim()}
            data-testid="button-edit-add-exercise"
            className="shrink-0 h-11 rounded-xl font-semibold"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function ExerciseEditor({
  sessionId,
  exercise,
  onChanged,
}: {
  sessionId: string;
  exercise: SessionExerciseWithSets;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(exercise.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateExercise = useUpdateSessionExercise({
    mutation: {
      onSuccess: onChanged,
      onError: () => toast({ title: "Failed to rename exercise", variant: "destructive" }),
    },
  });

  const deleteExercise = useDeleteSessionExercise({
    mutation: {
      onSuccess: onChanged,
      onError: () => toast({ title: "Failed to delete exercise", variant: "destructive" }),
    },
  });

  const addSet = useAddSet({
    mutation: {
      onSuccess: onChanged,
      onError: () => toast({ title: "Failed to add set", variant: "destructive" }),
    },
  });

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === exercise.name) {
      setName(exercise.name);
      return;
    }
    updateExercise.mutate({ id: sessionId, exerciseId: exercise.id, data: { name: trimmed } });
  };

  const handleAddSet = () => {
    const nextSetNumber =
      exercise.sets.length === 0 ? 1 : Math.max(...exercise.sets.map((s) => s.setNumber)) + 1;
    addSet.mutate({
      id: sessionId,
      data: { sessionExerciseId: exercise.id, setNumber: nextSetNumber },
    });
  };

  const sortedSets = exercise.sets.slice().sort((a, b) => a.setNumber - b.setNumber);

  return (
    <div className="bg-card rounded-2xl border border-primary/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).blur()}
          data-testid={`input-edit-exercise-name-${exercise.id}`}
          className="flex-1 rounded-xl bg-muted/50 border-border/60 font-display font-semibold"
        />
        {confirmDelete ? (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs font-semibold text-muted-foreground px-2.5 py-2 rounded-full bg-muted"
            >
              No
            </button>
            <button
              onClick={() =>
                deleteExercise.mutate({ id: sessionId, exerciseId: exercise.id })
              }
              disabled={deleteExercise.isPending}
              data-testid={`button-confirm-delete-exercise-${exercise.id}`}
              className="text-xs font-semibold text-destructive-foreground bg-destructive px-2.5 py-2 rounded-full disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            data-testid={`button-delete-exercise-${exercise.id}`}
            aria-label="Delete exercise"
            className="h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-destructive shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-2 px-1 text-[10px] font-semibold text-muted-foreground tracking-widest uppercase mb-1">
        <div className="text-center">Set</div>
        <div className="text-center">kg</div>
        <div className="text-center">Reps</div>
        <div></div>
      </div>

      {sortedSets.length === 0 ? (
        <div className="px-2 py-3 text-center text-xs text-muted-foreground">No sets.</div>
      ) : (
        sortedSets.map((set) => (
          <EditableSetRow key={set.id} set={set} onChanged={onChanged} />
        ))
      )}

      <button
        className="mt-2 w-full text-xs font-semibold text-primary flex items-center justify-center gap-1 py-2.5 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors"
        onClick={handleAddSet}
        data-testid={`button-edit-add-set-${exercise.id}`}
      >
        <Plus className="w-3.5 h-3.5" /> Add set
      </button>
    </div>
  );
}

function EditableSetRow({ set, onChanged }: { set: SetRecord; onChanged: () => void }) {
  const { toast } = useToast();
  const updateSet = useUpdateSet({
    mutation: {
      onSuccess: onChanged,
      onError: () => toast({ title: "Failed to save set", variant: "destructive" }),
    },
  });
  const deleteSet = useDeleteSet({
    mutation: {
      onSuccess: onChanged,
      onError: () => toast({ title: "Failed to delete set", variant: "destructive" }),
    },
  });

  const [reps, setReps] = useState(set.reps != null ? set.reps.toString() : "");
  const [weight, setWeight] = useState(set.weightKg != null ? set.weightKg.toString() : "");
  const lastSavedReps = useRef(reps);
  const lastSavedWeight = useRef(weight);

  // Sync local inputs when server state changes (e.g. after invalidation)
  useEffect(() => {
    const serverReps = set.reps != null ? set.reps.toString() : "";
    const serverWeight = set.weightKg != null ? set.weightKg.toString() : "";
    if (serverReps !== lastSavedReps.current) {
      setReps(serverReps);
      lastSavedReps.current = serverReps;
    }
    if (serverWeight !== lastSavedWeight.current) {
      setWeight(serverWeight);
      lastSavedWeight.current = serverWeight;
    }
  }, [set.reps, set.weightKg]);

  const handleSave = () => {
    if (reps === lastSavedReps.current && weight === lastSavedWeight.current) return;
    lastSavedReps.current = reps;
    lastSavedWeight.current = weight;

    const parsedReps = reps ? parseInt(reps, 10) : null;
    const parsedWeight = weight ? parseFloat(weight) : null;
    updateSet.mutate({
      id: set.id,
      data: {
        reps: parsedReps !== null && Number.isFinite(parsedReps) ? parsedReps : null,
        weightKg: parsedWeight !== null && Number.isFinite(parsedWeight) ? parsedWeight : null,
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
      (e.target as HTMLElement).blur();
    }
  };

  const inputCls =
    "h-10 w-full text-center text-sm font-mono tabular-nums bg-muted/50 rounded-lg outline-none transition-colors text-foreground border border-transparent focus:border-primary/60 focus:bg-muted placeholder:text-muted-foreground/40";

  return (
    <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-2 items-center py-0.5">
      <div className="text-center text-xs font-mono text-muted-foreground">{set.setNumber}</div>
      <input
        type="text"
        inputMode="decimal"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder="—"
        data-testid={`input-edit-set-${set.id}-weight`}
        className={inputCls}
      />
      <input
        type="text"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder="—"
        data-testid={`input-edit-set-${set.id}-reps`}
        className={inputCls}
      />
      <button
        onClick={() => deleteSet.mutate({ id: set.id })}
        data-testid={`button-edit-delete-set-${set.id}`}
        aria-label="Delete set"
        className="h-8 w-8 mx-auto flex items-center justify-center text-muted-foreground/40 hover:text-destructive"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
