import { Link } from "wouter";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { useListTrash } from "@workspace/api-client-react";
import { BpButton, Card } from "@/components/bumper";
import { useRestore } from "@/hooks/use-restore";
import { cleanName } from "@/lib/training";

export default function TrashPage() {
  const { data: items, isLoading, isError } = useListTrash();
  const { restore, pendingId } = useRestore();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Back to today" title="Back" className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-[10px] bg-bp-surface-2">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Link>
        <h1 className="font-display font-extrabold text-[26px] leading-7 tracking-[-0.02em]">Recently deleted</h1>
      </div>
      <p className="text-sm text-bp-muted">Deleted plans and workouts stay here for 30 days. After that they are gone for good.</p>

      {isLoading ? (
        <div className="h-20 rounded-[14px] bg-bp-surface animate-pulse" />
      ) : isError ? (
        <p className="text-sm text-bp-warn">The list didn't load. Check your connection and open this page again.</p>
      ) : !items || items.length === 0 ? (
        <Card>
          <p className="font-bold">Nothing deleted</p>
          <p className="text-sm text-bp-muted">When you delete a plan or a workout, you can bring it back from here.</p>
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(item.expiresAt), new Date()));
            return (
              <Card as="li" key={item.id} className="flex items-center gap-3 p-3.5">
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{cleanName(item.name)}</p>
                  <p className="text-[13px] text-bp-muted tabular">
                    {item.kind === "plan" ? "Plan" : "Workout"}, deleted {format(parseISO(item.deletedAt), "d MMM")}, {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                  </p>
                </div>
                <BpButton onClick={() => restore(item.id)} disabled={pendingId === item.id} className="min-h-11 px-4" data-testid={`button-restore-${item.id}`}>
                  {pendingId === item.id ? "Restoring" : "Restore"}
                </BpButton>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
