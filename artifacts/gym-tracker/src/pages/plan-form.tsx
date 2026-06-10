import { useEffect } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, ArrowLeft, ChevronUp, ChevronDown } from "lucide-react";
import {
  useCreatePlan,
  useUpdatePlan,
  useGetPlan,
  getListPlansQueryKey,
  getGetPlanQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const exerciseSchema = z.object({
  name: z.string().min(1, "Exercise name is required"),
  targetSets: z.coerce.number().min(1, "Min 1 set"),
  targetReps: z.coerce.number().min(1, "Min 1 rep"),
  targetWeightKg: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.number().optional().nullable()
  ),
  notes: z.string().optional().nullable(),
});

const planSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  notes: z.string().optional().nullable(),
  exercises: z.array(exerciseSchema).min(1, "Add at least one exercise"),
});

type PlanFormValues = z.infer<typeof planSchema>;

const labelCls = "text-[10px] font-semibold tracking-widest uppercase text-muted-foreground";
const inputCls = "rounded-xl bg-muted/50 border-border/60";

export default function PlanFormPage() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const isEditing = !!params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: existingPlan, isLoading: isFetching } = useGetPlan(params.id as string, {
    query: {
      enabled: isEditing,
      queryKey: getGetPlanQueryKey(params.id as string),
    },
  });

  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: "",
      notes: "",
      exercises: [{ name: "", targetSets: 3, targetReps: 10, targetWeightKg: null, notes: "" }],
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "exercises",
  });

  useEffect(() => {
    if (existingPlan && isEditing) {
      form.reset({
        name: existingPlan.name,
        notes: existingPlan.notes || "",
        exercises: existingPlan.exercises
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((e) => ({
            name: e.name,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            targetWeightKg: e.targetWeightKg,
            notes: e.notes || "",
          })),
      });
    }
  }, [existingPlan, isEditing, form]);

  const onSubmit = (data: PlanFormValues) => {
    const formattedData = {
      name: data.name,
      notes: data.notes || undefined,
      exercises: data.exercises.map((e, index) => ({
        ...e,
        sortOrder: index,
      })),
    };

    if (isEditing) {
      updatePlan.mutate(
        { id: params.id as string, data: formattedData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetPlanQueryKey(params.id as string) });
            toast({ title: "Plan updated" });
            setLocation("/");
          },
          onError: () => toast({ title: "Failed to update plan", variant: "destructive" }),
        }
      );
    } else {
      createPlan.mutate(
        { data: formattedData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
            toast({ title: "Plan created" });
            setLocation("/");
          },
          onError: () => toast({ title: "Failed to create plan", variant: "destructive" }),
        }
      );
    }
  };

  if (isEditing && isFetching) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Loading plan…</div>;
  }

  const isPending = createPlan.isPending || updatePlan.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0 rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-primary">
            {isEditing ? "Edit" : "New"}
          </p>
          <h1 className="text-2xl font-display font-bold text-foreground">
            {isEditing ? "Edit Plan" : "Create Plan"}
          </h1>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Plan details */}
          <div className="bg-card rounded-2xl border border-border/60 p-5 space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Plan name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Push Day, Full Body"
                      {...field}
                      data-testid="input-plan-name"
                      className={`${inputCls} text-base font-display font-semibold`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelCls}>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any focus areas or instructions?"
                      className={`${inputCls} resize-none h-20`}
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Exercises */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                Exercises
              </h2>
              <button
                type="button"
                onClick={() =>
                  append({ name: "", targetSets: 3, targetReps: 10, targetWeightKg: null, notes: "" })
                }
                data-testid="button-add-exercise"
                className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform shrink-0"
                aria-label="Add exercise"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className="bg-card rounded-2xl border border-border/60 p-4">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      data-testid={`button-move-up-${index}`}
                      aria-label="Move exercise up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => move(index, index + 1)}
                      disabled={index === fields.length - 1}
                      data-testid={`button-move-down-${index}`}
                      aria-label="Move exercise down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <FormField
                      control={form.control}
                      name={`exercises.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Exercise name"
                              {...field}
                              data-testid={`input-exercise-name-${index}`}
                              className={`${inputCls} font-display font-semibold`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground/50 hover:text-destructive shrink-0"
                    onClick={() => remove(index)}
                    data-testid={`button-remove-exercise-${index}`}
                    aria-label="Remove exercise"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3 pl-9">
                  <FormField
                    control={form.control}
                    name={`exercises.${index}.targetSets`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelCls}>Sets</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} data-testid={`input-sets-${index}`} className={`${inputCls} font-mono`} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`exercises.${index}.targetReps`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelCls}>Reps</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" {...field} data-testid={`input-reps-${index}`} className={`${inputCls} font-mono`} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`exercises.${index}.targetWeightKg`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelCls}>kg</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.5"
                            placeholder="—"
                            {...field}
                            value={field.value || ""}
                            data-testid={`input-weight-${index}`}
                            className={`${inputCls} font-mono`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="mt-3 pl-9">
                  <FormField
                    control={form.control}
                    name={`exercises.${index}.notes`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            placeholder="Notes (e.g. tempo, focus)…"
                            className={`${inputCls} text-sm h-9`}
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}

            {fields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm bg-card rounded-2xl border border-border/60">
                No exercises added yet.
              </div>
            )}

            {form.formState.errors.exercises?.root && (
              <p className="text-sm font-medium text-destructive mt-2">
                {form.formState.errors.exercises.root.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full h-12 text-sm font-bold bg-primary text-primary-foreground rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-60"
            disabled={isPending}
            data-testid="button-save-plan"
          >
            {isPending ? "Saving…" : "Save Plan"}
          </button>
        </form>
      </Form>
    </div>
  );
}
