import { useState } from "react";
import { useListPlans, useDeletePlan, getListPlansQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Trash2, Dumbbell, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function HomePage() {
  const { data: plans, isLoading } = useListPlans();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const deletePlan = useDeletePlan();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: string) => {
    deletePlan.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
          toast({ title: "Plan deleted" });
          setConfirmId(null);
        },
        onError: () => {
          toast({ title: "Failed to delete plan", variant: "destructive" });
          setConfirmId(null);
        },
      }
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-1">Library</p>
          <h1 className="text-3xl font-display font-bold text-foreground">Plans</h1>
        </div>
        <Link
          href="/plans/new"
          data-testid="button-create-plan"
          className="h-11 w-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 active:scale-95 transition-transform shrink-0"
          aria-label="New plan"
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-card h-28 rounded-2xl" />
          ))}
        </div>
      ) : plans?.length === 0 ? (
        <div className="bg-card rounded-2xl flex flex-col items-center justify-center h-60 text-center space-y-4 px-6 border border-border/60">
          <div className="rounded-full bg-primary/10 p-4">
            <Dumbbell className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-display font-semibold">No plans yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Create your first workout plan to get started.</p>
          </div>
          <Link
            href="/plans/new"
            data-testid="button-create-first-plan"
            className="text-sm font-semibold px-5 py-2.5 bg-primary text-primary-foreground rounded-full active:scale-95 transition-transform"
          >
            Create Plan
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {plans?.map((plan) => {
            const isConfirming = confirmId === plan.id;
            const exercises = plan.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);

            if (isConfirming) {
              return (
                <div
                  key={plan.id}
                  className="bg-card border border-destructive/40 p-4 rounded-2xl flex items-center justify-between gap-3"
                >
                  <p className="text-sm font-medium">Delete “{plan.name}”?</p>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-xs font-semibold text-muted-foreground px-3 py-2 rounded-full bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      disabled={deletePlan.isPending}
                      data-testid={`button-confirm-delete-plan-${plan.id}`}
                      className="text-xs font-semibold text-destructive-foreground bg-destructive px-3 py-2 rounded-full disabled:opacity-60"
                    >
                      {deletePlan.isPending ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={plan.id}
                data-testid={`card-plan-${plan.id}`}
                className="bg-card rounded-2xl p-5 border border-border/60"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3
                      className="text-lg font-display font-semibold text-foreground truncate"
                      data-testid={`text-plan-name-${plan.id}`}
                    >
                      {plan.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {exercises.length} exercise{exercises.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0 -mr-2 -mt-1">
                    <Link
                      href={`/plans/${plan.id}/edit`}
                      data-testid={`button-edit-plan-${plan.id}`}
                      className="text-muted-foreground hover:text-foreground h-9 w-9 flex items-center justify-center rounded-full"
                      aria-label="Edit plan"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => setConfirmId(plan.id)}
                      data-testid={`button-delete-plan-${plan.id}`}
                      className="text-muted-foreground hover:text-destructive h-9 w-9 flex items-center justify-center rounded-full"
                      aria-label="Delete plan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {exercises.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {exercises.slice(0, 4).map((e) => (
                      <span
                        key={e.id}
                        className="text-[11px] font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full"
                      >
                        {e.name}
                      </span>
                    ))}
                    {exercises.length > 4 && (
                      <span className="text-[11px] font-medium text-muted-foreground px-1 py-1">
                        +{exercises.length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
