import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { restoreTrashItem } from "@workspace/api-client-react";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";

/** Bringing deleted plans and workouts back, from the toast after deleting or from the trash page. */
export function useRestore() {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Not a mutation hook: the page that offered the undo is usually gone by the time it is tapped
  const restore = async (id: string) => {
    setPendingId(id);
    try {
      const item = await restoreTrashItem(id);
      // A restored plan or workout shows up in lists, bests and progress again
      await queryClient.invalidateQueries();
      toast({ title: item.kind === "plan" ? "Plan restored" : "Workout restored" });
    } catch {
      toast({ title: "Not restored", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setPendingId(null);
    }
  };

  /** The toast after a delete, with the way back. */
  const offerUndo = (id: string, title: string) =>
    toast({
      title,
      description: "You can bring it back for 30 days.",
      action: (
        <ToastAction altText="Undo delete" onClick={() => void restore(id)} className="h-11 rounded-[10px] border-2 border-bp-outline px-4 font-bold">
          Undo
        </ToastAction>
      ),
    });

  return { restore, offerUndo, pendingId };
}
