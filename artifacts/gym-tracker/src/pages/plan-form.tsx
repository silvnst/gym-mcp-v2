import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, ArrowLeft, ChevronUp, ChevronDown } from "lucide-react";
import {
  useCreatePlan,
  useUpdatePlan,
  useDeletePlan,
  useGetPlan,
  getListPlansQueryKey,
  getGetPlanQueryKey,
  type Equipment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BpButton, Card } from "@/components/bumper";
import { cleanName, guessEquipment } from "@/lib/training";
import { cn } from "@/lib/utils";

const GROUPS = ["A", "B", "C", "D"] as const;
const EQUIPMENT: { value: Exclude<Equipment, null>; label: string }[] = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbells" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "machine", label: "Machine" },
  { value: "cable", label: "Cable" },
  { value: "other", label: "Other" },
];

const optionalNumber = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).nullable());

const exerciseSchema = z.object({
  name: z.string().trim().min(1, "Give the exercise a name"),
  targetSets: z.coerce.number().int().min(1, "At least 1 set"),
  targetReps: z.coerce.number().int().min(1, "At least 1 rep"),
  targetWeightKg: optionalNumber,
  notes: z.string().optional().nullable(),
  supersetGroup: z.string().nullable(),
  equipment: z.string().nullable(),
});

const planSchema = z.object({
  name: z.string().trim().min(1, "Give the plan a name"),
  notes: z.string().optional().nullable(),
  exercises: z.array(exerciseSchema).min(1, "Add at least one exercise"),
});

type PlanFormValues = z.infer<typeof planSchema>;

const emptyExercise = (): PlanFormValues["exercises"][number] => ({
  name: "",
  targetSets: 3,
  targetReps: 8,
  targetWeightKg: null,
  notes: "",
  supersetGroup: null,
  equipment: null,
});

const fieldCls = "w-full h-12 px-3 bg-bp-bg border-2 border-bp-outline rounded-[10px] text-[15px] text-bp-ink placeholder:text-bp-muted";
const labelCls = "block text-[13px] font-bold text-bp-muted mb-1.5";

export default function PlanFormPage() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const planId = params.id as string | undefined;
  const isEditing = !!planId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: existingPlan, isLoading: isFetching } = useGetPlan(planId ?? "", {
    query: { enabled: isEditing, queryKey: getGetPlanQueryKey(planId ?? "") },
  });

  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: { name: "", notes: "", exercises: [emptyExercise()] },
    mode: "onBlur",
  });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "exercises" });
  const errors = form.formState.errors;

  useEffect(() => {
    if (!existingPlan) return;
    form.reset({
      name: cleanName(existingPlan.name),
      notes: existingPlan.notes ?? "",
      exercises: existingPlan.exercises
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((e) => ({
          name: e.name,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          targetWeightKg: e.targetWeightKg ?? null,
          notes: e.notes ?? "",
          supersetGroup: e.supersetGroup ?? null,
          equipment: e.equipment ?? guessEquipment(e.name),
        })),
    });
  }, [existingPlan]);

  const done = (title: string) => {
    queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
    if (planId) queryClient.invalidateQueries({ queryKey: getGetPlanQueryKey(planId) });
    toast({ title });
    setLocation("/plans");
  };

  const onSubmit = (data: PlanFormValues) => {
    const payload = {
      name: data.name.trim(),
      notes: data.notes?.trim() || null,
      exercises: data.exercises.map((e, i) => ({
        name: e.name.trim(),
        sortOrder: i,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeightKg: e.targetWeightKg,
        notes: e.notes?.trim() || null,
        supersetGroup: e.supersetGroup,
        equipment: e.equipment as Equipment,
      })),
    };
    const onError = () => toast({ title: "Plan not saved", description: "Check your connection and try again.", variant: "destructive" });
    if (planId) updatePlan.mutate({ id: planId, data: payload }, { onSuccess: () => done("Plan saved"), onError });
    else createPlan.mutate({ data: payload }, { onSuccess: () => done("Plan created"), onError });
  };

  const onDelete = () => {
    if (!planId) return;
    deletePlan.mutate(
      { id: planId },
      {
        onSuccess: () => done("Plan deleted"),
        onError: () => toast({ title: "Plan not deleted", variant: "destructive" }),
      },
    );
  };

  if (isEditing && isFetching) return <p className="py-16 text-center text-bp-muted text-sm">Loading plan</p>;

  const isPending = createPlan.isPending || updatePlan.isPending;
  const watched = form.watch("exercises");
  const planName = form.watch("name");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pb-4" noValidate>
      <div className="flex justify-between items-center gap-3 -mt-2">
        <Link href="/plans" aria-label="Back to plans" title="Back" className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-[10px] border-2 border-bp-outline bg-bp-surface">
          <ArrowLeft className="w-[18px] h-[18px]" aria-hidden="true" />
        </Link>
        <h1 className="font-sans font-bold text-base">{isEditing ? "Edit plan" : "New plan"}</h1>
        {isEditing ? (
          <BpButton variant="danger" className="min-h-11" onClick={() => setConfirmDelete(true)}>
            Delete
          </BpButton>
        ) : (
          <span className="w-11" aria-hidden="true" />
        )}
      </div>

      {confirmDelete && (
        <Card className="bg-bp-warn-soft space-y-3" >
          <p className="text-sm font-bold">Delete “{planName || "this plan"}”? Workouts you logged with it stay in your history.</p>
          <div className="flex gap-2">
            <BpButton onClick={() => setConfirmDelete(false)}>Keep plan</BpButton>
            <BpButton variant="primary" onClick={onDelete} disabled={deletePlan.isPending}>
              {deletePlan.isPending ? "Deleting" : "Delete plan"}
            </BpButton>
          </div>
        </Card>
      )}

      <div>
        <label htmlFor="plan-name" className={labelCls}>Name</label>
        <input id="plan-name" {...form.register("name")} placeholder="e.g. Full body A" className={cn(fieldCls, "font-display font-extrabold text-xl")} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-[13px] text-bp-warn mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="plan-notes" className={labelCls}>Notes</label>
        <textarea id="plan-notes" {...form.register("notes")} rows={2} placeholder="Goal, rest times, how to progress" className={cn(fieldCls, "h-auto py-2.5 resize-none")} />
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-baseline">
          <h2 className="font-sans text-[13px] font-bold text-bp-muted">Exercises</h2>
          <span className="text-[13px] text-bp-muted">Same letter = superset</span>
        </div>

        {fields.map((field, index) => {
          const group = watched[index]?.supersetGroup ?? null;
          const prevGroup = index > 0 ? watched[index - 1]?.supersetGroup ?? null : null;
          const nextGroup = watched[index + 1]?.supersetGroup ?? null;
          const joinedAbove = !!group && group === prevGroup;
          const joinedBelow = !!group && group === nextGroup;
          const exErrors = errors.exercises?.[index];
          const id = (k: string) => `ex-${field.id}-${k}`;

          return (
            <div key={field.id} className={cn(joinedAbove && "-mt-2")}>
              <Card
                className={cn(
                  "space-y-3",
                  joinedAbove && "rounded-t-none border-t-0",
                  joinedBelow && "rounded-b-none",
                  group && "bg-bp-surface",
                  !joinedBelow && "shadow-hard",
                )}
              >
                {group && !joinedAbove && <p className="text-[13px] font-bold">Superset {group}</p>}
                <div className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <label htmlFor={id("name")} className="sr-only">Exercise name</label>
                    <input
                      id={id("name")}
                      {...form.register(`exercises.${index}.name`, {
                        onBlur: (e) => {
                          if (!form.getValues(`exercises.${index}.equipment`)) form.setValue(`exercises.${index}.equipment`, guessEquipment(e.target.value));
                        },
                      })}
                      placeholder="Exercise, e.g. Back Squat"
                      className={cn(fieldCls, "font-bold")}
                      aria-invalid={!!exErrors?.name}
                    />
                    {exErrors?.name && <p className="text-[13px] text-bp-warn mt-1">{exErrors.name.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor={id("sets")} className={labelCls}>Sets</label>
                    <input id={id("sets")} type="number" inputMode="numeric" min={1} {...form.register(`exercises.${index}.targetSets`)} className={cn(fieldCls, "tabular text-center")} />
                  </div>
                  <div>
                    <label htmlFor={id("reps")} className={labelCls}>Reps</label>
                    <input id={id("reps")} type="number" inputMode="numeric" min={1} {...form.register(`exercises.${index}.targetReps`)} className={cn(fieldCls, "tabular text-center")} />
                  </div>
                  <div>
                    <label htmlFor={id("kg")} className={labelCls}>kg</label>
                    <input id={id("kg")} type="number" inputMode="decimal" step="0.25" min={0} {...form.register(`exercises.${index}.targetWeightKg`)} placeholder="Optional" className={cn(fieldCls, "tabular text-center placeholder:text-xs")} />
                  </div>
                </div>
                {(exErrors?.targetSets || exErrors?.targetReps) && (
                  <p className="text-[13px] text-bp-warn">{exErrors?.targetSets?.message ?? exErrors?.targetReps?.message}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={id("equipment")} className={labelCls}>Equipment</label>
                    <select id={id("equipment")} {...form.register(`exercises.${index}.equipment`, { setValueAs: (v) => v || null })} className={fieldCls}>
                      <option value="">Not set</option>
                      {EQUIPMENT.map((e) => (
                        <option key={e.value} value={e.value}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span id={id("group-label")} className={labelCls}>Superset</span>
                    <Controller
                      control={form.control}
                      name={`exercises.${index}.supersetGroup`}
                      render={({ field: f }) => (
                        <div role="group" aria-labelledby={id("group-label")} className="grid grid-cols-5 gap-1">
                          {[null, ...GROUPS].map((g) => (
                            <button
                              key={g ?? "none"}
                              type="button"
                              aria-pressed={f.value === g}
                              aria-label={g ? `Superset ${g}` : "No superset"}
                              onClick={() => f.onChange(g)}
                              className={cn(
                                "h-12 rounded-[8px] border-2 border-bp-outline font-bold text-sm",
                                f.value === g ? "bg-bp-brand text-bp-on-brand" : "bg-transparent",
                              )}
                            >
                              {g ?? "–"}
                            </button>
                          ))}
                        </div>
                      )}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={id("notes")} className={labelCls}>Notes</label>
                  <input id={id("notes")} {...form.register(`exercises.${index}.notes`)} placeholder="Tempo, rest, cues" className={fieldCls} />
                </div>

                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move ${watched[index]?.name?.trim() || "exercise"} up`} title="Move up" className="h-11 w-11 rounded-[10px] border-2 border-bp-outline flex items-center justify-center disabled:opacity-30">
                    <ChevronUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => move(index, index + 1)} disabled={index === fields.length - 1} aria-label={`Move ${watched[index]?.name?.trim() || "exercise"} down`} title="Move down" className="h-11 w-11 rounded-[10px] border-2 border-bp-outline flex items-center justify-center disabled:opacity-30">
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {fields.length > 1 && (
                    <BpButton variant="danger" className="min-h-11 text-sm ml-auto" onClick={() => remove(index)}>
                      <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove
                    </BpButton>
                  )}
                </div>
              </Card>
            </div>
          );
        })}

        {errors.exercises?.root && <p className="text-[13px] text-bp-warn">{errors.exercises.root.message}</p>}

        <BpButton className="w-full" onClick={() => append(emptyExercise())} data-testid="button-add-exercise">
          <Plus className="w-[18px] h-[18px]" aria-hidden="true" /> Add exercise
        </BpButton>
      </div>

      <BpButton type="submit" variant="cta" disabled={isPending} data-testid="button-save-plan">
        {isPending ? "Saving" : isEditing ? "Save plan" : "Create plan"}
      </BpButton>
    </form>
  );
}
