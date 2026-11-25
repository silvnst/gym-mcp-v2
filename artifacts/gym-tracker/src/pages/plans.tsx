import { Link } from "wouter";
import { parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Play, Zap } from "lucide-react";
import { getListPlansQueryKey, useListPlans, useListSessions, usePatchPlan, type PlanWithExercises } from "@workspace/api-client-react";
import { BpButton, Card, Chip, PageTitle, SectionLabel } from "@/components/bumper";
import { cleanName, daysBetween, groupBySuperset, lastDoneByPlan, pickNextPlan, rotation } from "@/lib/training";
import { useStartWorkout } from "@/lib/start-workout";
import { useToast } from "@/hooks/use-toast";

function lastDoneLabel(date: string | undefined): string {
  if (!date) return "not done yet";
  const days = daysBetween(parseISO(date), new Date());
  if (days <= 0) return "done today";
  if (days === 1) return "done yesterday";
  return `done ${days} days ago`;
}

export default function PlansPage() {
  const { data: plans, isLoading } = useListPlans();
  const { data: sessions } = useListSessions({ limit: 30 });
  const { start, isPending } = useStartWorkout();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const patchPlan = usePatchPlan({
    mutation: {
      onSettled: () => queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() }),
      onError: () => toast({ title: "Plan not changed", description: "Check your connection and try again.", variant: "destructive" }),
    },
  });

  const setActive = (plan: PlanWithExercises, active: boolean) => {
    // Show the change at once; the refetch afterwards brings the server's state
    queryClient.setQueryData<PlanWithExercises[]>(getListPlansQueryKey(), (old) => old?.map((p) => (p.id === plan.id ? { ...p, active } : p)));
    patchPlan.mutate({ id: plan.id, data: { active } });
  };

  const lastDone = plans && sessions ? lastDoneByPlan(plans, sessions) : new Map<string, string>();
  const active = plans ? rotation(plans, lastDone) : [];
  const others = plans?.filter((p) => !p.active) ?? [];
  const nextId = plans && sessions ? pickNextPlan(plans, sessions)?.id : undefined;

  const renderPlan = (plan: PlanWithExercises) => {
    const exercises = plan.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const groups = groupBySuperset(exercises);
    return (
      <li key={plan.id}>
        <Card className="space-y-3">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              {plan.id === nextId && <p className="text-[13px] font-bold text-bp-muted">Up next</p>}
              <h2 className="font-display font-extrabold text-[22px] leading-[26px] truncate" data-testid={`text-plan-name-${plan.id}`}>
                {cleanName(plan.name)}
              </h2>
              <p className="text-[13px] text-bp-muted mt-0.5">
                {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}, {lastDoneLabel(lastDone.get(plan.id))}
              </p>
            </div>
            <Link
              href={`/plans/${plan.id}/edit`}
              data-testid={`button-edit-plan-${plan.id}`}
              aria-label={`Edit ${cleanName(plan.name)}`}
              title="Edit plan"
              className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-[10px] bg-bp-surface-2"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="space-y-1.5 text-sm">
            {groups.map((g, i) => (
              <li key={i} className="flex gap-2 items-baseline">
                {g.group && g.items.length > 1 ? (
                  <span className="shrink-0 text-[11px] font-bold px-1.5 rounded bg-bp-surface-2 leading-5">{g.group}</span>
                ) : (
                  <span className="shrink-0 w-[22px]" aria-hidden="true" />
                )}
                <span className="min-w-0">{g.items.map((e) => e.name).join(", ")}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Chip
              pressed={plan.active}
              onClick={() => setActive(plan, !plan.active)}
              aria-label={`Active: ${cleanName(plan.name)}`}
              data-testid={`button-active-plan-${plan.id}`}
            >
              Active
            </Chip>
            <BpButton variant="primary" className="flex-1" onClick={() => start(plan)} disabled={isPending} data-testid={`button-start-plan-${plan.id}`}>
              <Play className="w-4 h-4 fill-current" aria-hidden="true" /> Start
            </BpButton>
          </div>
        </Card>
      </li>
    );
  };

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
            <div key={i} className="h-36 rounded-[14px] bg-bp-surface animate-pulse" />
          ))}
        </div>
      ) : !plans || plans.length === 0 ? (
        <Card className="space-y-3">
          <p className="font-display font-extrabold text-[22px]">No plans yet</p>
          <p className="text-sm text-bp-muted">A plan is a list of exercises with sets, reps and weights. Group two exercises to do them as a superset.</p>
          <Link href="/plans/new" className="inline-flex items-center justify-center min-h-12 px-5 rounded-[10px] border-2 border-bp-outline bg-bp-brand text-bp-on-brand shadow-hard-sm press font-bold">
            Create a plan
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          <section>
            <SectionLabel right={active.length > 1 ? "Done least recently comes next" : undefined}>Active</SectionLabel>
            {active.length > 0 ? (
              <ul className="space-y-4">{active.map(renderPlan)}</ul>
            ) : (
              <p className="text-sm text-bp-muted">
                Mark the plans you are training right now as active. Today then suggests the one you did least recently, so two active plans alternate.
              </p>
            )}
          </section>
          {others.length > 0 && (
            <section>
              <SectionLabel>Not active</SectionLabel>
              <ul className="space-y-4">{others.map(renderPlan)}</ul>
            </section>
          )}
        </div>
      )}

      <BpButton variant="ghost" className="mt-5 w-full" onClick={() => start(null)} disabled={isPending} data-testid="button-start-empty">
        <Zap className="w-4 h-4" aria-hidden="true" /> Start an empty workout
      </BpButton>
    </div>
  );
}
