import { useListPlans, useCreateSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Play, Zap, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function StartSessionPage() {
  const { data: plans, isLoading } = useListPlans();
  const createSession = useCreateSession();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleStartPlan = (planId: string) => {
    const plan = plans?.find((p) => p.id === planId);
    if (!plan) return;

    createSession.mutate(
      {
        data: {
          planId: plan.id,
          name: plan.name,
          date: format(new Date(), "yyyy-MM-dd"),
          exercises: plan.exercises.map((e) => ({
            name: e.name,
            sortOrder: e.sortOrder,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            targetWeightKg: e.targetWeightKg,
            planExerciseId: e.id,
          })),
        },
      },
      {
        onSuccess: (session) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setLocation(`/session/${session.id}`);
        },
        onError: () => toast({ title: "Failed to start session", variant: "destructive" }),
      }
    );
  };

  const handleStartAdhoc = () => {
    createSession.mutate(
      {
        data: {
          name: "Free Session",
          date: format(new Date(), "yyyy-MM-dd"),
          exercises: [],
        },
      },
      {
        onSuccess: (session) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setLocation(`/session/${session.id}`);
        },
        onError: () => toast({ title: "Failed to start session", variant: "destructive" }),
      }
    );
  };

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-1">
          {format(new Date(), "EEEE, MMM d")}
        </p>
        <h1 className="text-3xl font-display font-bold text-foreground">Train</h1>
      </div>

      <button
        onClick={handleStartAdhoc}
        disabled={createSession.isPending}
        data-testid="button-start-empty"
        className="w-full bg-primary text-primary-foreground rounded-2xl p-5 flex justify-between items-center mb-8 shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        <div className="text-left">
          <div className="text-lg font-display font-bold">Quick Start</div>
          <div className="text-xs font-medium opacity-70">Empty session — add exercises as you go</div>
        </div>
        <div className="h-11 w-11 rounded-full bg-primary-foreground/15 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 fill-current" />
        </div>
      </button>

      <div>
        <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
          From a plan
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse bg-card h-20 rounded-2xl" />
            ))}
          </div>
        ) : plans?.length === 0 ? (
          <div className="text-center py-10 px-6 text-muted-foreground bg-card rounded-2xl border border-border/60 text-sm">
            No plans yet.{" "}
            <Link href="/plans/new" className="text-primary font-semibold">
              Create one
            </Link>{" "}
            to start structured workouts.
          </div>
        ) : (
          <div className="space-y-3">
            {plans?.map((plan) => {
              const exercises = plan.exercises.slice().sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <button
                  key={plan.id}
                  onClick={() => handleStartPlan(plan.id)}
                  disabled={createSession.isPending}
                  data-testid={`button-start-plan-${plan.id}`}
                  className="w-full flex items-center gap-4 bg-card rounded-2xl p-4 border border-border/60 text-left active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Play className="w-4 h-4 ml-0.5 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4
                      className="text-base font-display font-semibold text-foreground truncate"
                      data-testid={`text-plan-name-${plan.id}`}
                    >
                      {plan.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {exercises.length} exercise{exercises.length === 1 ? "" : "s"}
                      {exercises.length > 0 && <> · {exercises.map((e) => e.name).slice(0, 3).join(", ")}{exercises.length > 3 ? "…" : ""}</>}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
