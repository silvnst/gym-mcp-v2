import { Link } from "wouter";
import { Plus, Pencil, Play, Zap } from "lucide-react";
import { useListPlans } from "@workspace/api-client-react";
import { BpButton, Card, PageTitle } from "@/components/bumper";
import { cleanName, groupBySuperset } from "@/lib/training";
import { useStartWorkout } from "@/lib/start-workout";

export default function PlansPage() {
  const { data: plans, isLoading } = useListPlans();
  const { start, isPending } = useStartWorkout();

  return (
    <div>
      <PageTitle
        action={
          <Link
            href="/plans/new"
            data-testid="button-create-plan"
            aria-label="New plan"
            title="New plan"
            className="h-11 w-11 rounded-[10px] border-2 border-bp-outline bg-bp-brand text-bp-on-brand shadow-hard-sm press flex items-center justify-center shrink-0"
          >
            <Plus className="w-5 h-5" strokeWidth={2.6} aria-hidden="true" />
          </Link>
        }
      >
        Plans
      </PageTitle>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 rounded-[14px] border-2 border-bp-outline bg-bp-surface animate-pulse" />
          ))}
        </div>
      ) : !plans || plans.length === 0 ? (
        <Card shadow className="space-y-3">
          <p className="font-display font-extrabold text-[22px]">No plans yet</p>
          <p className="text-sm text-bp-muted">A plan is a list of exercises with sets, reps and weights. Group two exercises to do them as a superset.</p>
          <Link href="/plans/new" className="inline-flex items-center justify-center min-h-12 px-5 rounded-[10px] border-2 border-bp-outline bg-bp-brand text-bp-on-brand shadow-hard-sm press font-bold">
            Create a plan
          </Link>
        </Card>
      ) : (
        <ul className="space-y-4">
          {plans.map((plan) => {
            const exercises = plan.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);
            const groups = groupBySuperset(exercises);
            return (
              <li key={plan.id}>
                <Card className="space-y-3" >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display font-extrabold text-[22px] leading-[26px] truncate" data-testid={`text-plan-name-${plan.id}`}>
                        {cleanName(plan.name)}
                      </h2>
                      <p className="text-[13px] text-bp-muted mt-0.5">
                        {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
                      </p>
                    </div>
                    <Link
                      href={`/plans/${plan.id}/edit`}
                      data-testid={`button-edit-plan-${plan.id}`}
                      aria-label={`Edit ${cleanName(plan.name)}`}
                      title="Edit plan"
                      className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-[10px] border-2 border-bp-outline"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {groups.map((g, i) => (
                      <li key={i} className="flex gap-2 items-baseline">
                        {g.group && g.items.length > 1 ? (
                          <span className="shrink-0 text-[11px] font-bold px-1.5 rounded border-2 border-bp-outline leading-4">{g.group}</span>
                        ) : (
                          <span className="shrink-0 w-[22px]" aria-hidden="true" />
                        )}
                        <span className="min-w-0">{g.items.map((e) => e.name).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                  <BpButton variant="primary" className="w-full" onClick={() => start(plan)} disabled={isPending} data-testid={`button-start-plan-${plan.id}`}>
                    <Play className="w-4 h-4 fill-current" aria-hidden="true" /> Start
                  </BpButton>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <BpButton variant="ghost" className="mt-5 w-full" onClick={() => start(null)} disabled={isPending} data-testid="button-start-empty">
        <Zap className="w-4 h-4" aria-hidden="true" /> Start an empty workout
      </BpButton>
    </div>
  );
}
