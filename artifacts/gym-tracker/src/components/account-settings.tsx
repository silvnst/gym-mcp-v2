import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import {
  useGetGarminStatus,
  useConnectGarmin,
  useDisconnectGarmin,
  useDeleteMe,
  getGetGarminStatusQueryKey,
  getGetReadinessQueryKey,
} from "@workspace/api-client-react";
import { BpButton } from "@/components/bumper";
import { useProfile } from "@/lib/profile";

const labelCls = "block text-[13px] font-bold text-bp-muted mb-1.5";

/** The server's own words for a failed request, when it sent any. */
function serverMessage(error: unknown): string | null {
  const data = (error as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string" ? data.error : null;
}

/** Connect or disconnect the profile's own Garmin account. */
export function GarminSettings() {
  const queryClient = useQueryClient();
  const { data: status } = useGetGarminStatus({ query: { queryKey: getGetGarminStatusQueryKey() } });
  const [apiKey, setApiKey] = useState("");
  const [confirming, setConfirming] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetGarminStatusQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetReadinessQueryKey() });
  };
  const connect = useConnectGarmin({ mutation: { onSuccess: () => { setApiKey(""); refresh(); } } });
  const disconnect = useDisconnectGarmin({ mutation: { onSuccess: () => { setConfirming(false); refresh(); } } });

  if (!status || (!status.linked && !status.canConnect)) return null;

  if (status.linked) {
    return (
      <div>
        <h3 className={labelCls}>Garmin</h3>
        {confirming ? (
          <div className="space-y-2.5">
            <p className="text-sm">Disconnect Garmin? Sleep, heart and activity data synced so far is removed from this app.</p>
            <div className="grid grid-cols-2 gap-2">
              <BpButton onClick={() => setConfirming(false)}>Keep connected</BpButton>
              <BpButton onClick={() => disconnect.mutate()} disabled={disconnect.isPending} data-testid="button-garmin-disconnect-confirm">
                {disconnect.isPending ? "Disconnecting" : "Disconnect"}
              </BpButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="flex-1 min-w-0 text-sm">
              <span className="font-bold">Connected.</span>{" "}
              <span className="text-bp-muted">
                {status.lastSyncAt ? `Synced ${formatDistanceToNowStrict(new Date(status.lastSyncAt))} ago.` : status.running ? "First sync is running." : "Not synced yet."}
              </span>
            </p>
            <BpButton onClick={() => setConfirming(true)} className="min-h-11 px-4" data-testid="button-garmin-disconnect">
              Disconnect
            </BpButton>
          </div>
        )}
      </div>
    );
  }

  const key = apiKey.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (key) connect.mutate({ data: { apiKey: key } });
      }}
      className="space-y-1.5"
    >
      <div className="flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <label htmlFor="garmin-key" className={labelCls}>
            Garmin API key
          </label>
          <input
            id="garmin-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            aria-describedby="garmin-key-hint"
            className="w-full h-12 px-3 text-[15px] bg-bp-bg border-2 border-bp-outline rounded-[10px] text-bp-ink"
          />
        </div>
        <button
          type="submit"
          disabled={!key || connect.isPending}
          data-testid="button-garmin-connect"
          className="h-12 px-4 rounded-[10px] border-2 border-bp-outline bg-bp-surface text-bp-ink font-bold disabled:opacity-40"
        >
          {connect.isPending ? "Checking" : "Connect"}
        </button>
      </div>
      {connect.isError ? (
        <p className="text-[13px] text-bp-warn" role="alert">
          {serverMessage(connect.error) ?? "Garmin couldn't be reached. Check your connection and try again."}
        </p>
      ) : (
        <p id="garmin-key-hint" className="text-[13px] text-bp-muted">
          Optional. With your personal API key from Garmin Connect the app shows sleep, HRV and a recovery check. The key is stored encrypted.
        </p>
      )}
    </form>
  );
}

/** Deletes the profile and everything in it, after a second tap. */
export function DeleteAccount() {
  const { signOut } = useProfile();
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteMe({
    mutation: {
      onSuccess: () => {
        if (signOut) signOut();
        else window.location.assign(import.meta.env.BASE_URL);
      },
    },
  });

  if (!confirming) {
    return (
      <BpButton variant="danger" className="w-full" onClick={() => setConfirming(true)} data-testid="button-delete-account">
        Delete account
      </BpButton>
    );
  }
  return (
    <div className="space-y-2.5">
      <p className="text-sm">Delete this profile with all plans, workouts and Garmin data? This can't be undone.</p>
      {remove.isError && (
        <p className="text-[13px] text-bp-warn" role="alert">
          The account wasn't deleted. Check your connection and try again.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <BpButton onClick={() => setConfirming(false)}>Keep account</BpButton>
        <BpButton variant="danger" className="border-bp-warn" onClick={() => remove.mutate()} disabled={remove.isPending} data-testid="button-delete-account-confirm">
          {remove.isPending ? "Deleting" : "Delete account"}
        </BpButton>
      </div>
    </div>
  );
}
