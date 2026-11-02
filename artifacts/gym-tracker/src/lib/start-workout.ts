import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCreateSession, getListSessionsQueryKey, type PlanWithExercises } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

/** Starts a workout from a plan (or an empty one) and opens it. */
export function useStartWorkout() {
  const createSession = useCreateSession();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const start = (plan: PlanWithExercises | null) => {
    const exercises = plan
      ? plan.exercises
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((e) => ({
            name: e.name,
            sortOrder: e.sortOrder,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            targetWeightKg: e.targetWeightKg,
            planExerciseId: e.id,
            supersetGroup: e.supersetGroup ?? null,
            equipment: e.equipment ?? null,
          }))
      : [];
    createSession.mutate(
      {
        data: {
          planId: plan?.id ?? null,
          name: plan?.name ?? "Free workout",
          date: format(new Date(), "yyyy-MM-dd"),
          exercises,
        },
      },
      {
        onSuccess: (session) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setLocation(`/session/${session.id}`);
        },
        onError: () => toast({ title: "Couldn't start the workout", description: "Check your connection and try again.", variant: "destructive" }),
      },
    );
  };

  return { start, isPending: createSession.isPending };
}
