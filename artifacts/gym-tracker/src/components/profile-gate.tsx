import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  getListUsersQueryKey,
  type UserRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dumbbell, Plus } from "lucide-react";
import { getStoredProfileId, storeProfileId, ProfileContext } from "@/lib/profile";

// Apply the stored profile to the fetch layer before any query fires
storeProfileId(getStoredProfileId());

export function ProfileGate({ children }: { children: React.ReactNode }) {
  const [profileId, setProfileId] = useState<string | null>(getStoredProfileId());
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers();

  if (isLoading || !users) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-background">
        <Dumbbell className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  const current = profileId ? users.find((u) => u.id === profileId) : undefined;

  // Works for ids not yet in the cached list (e.g. a just-created profile):
  // clearing the cache refetches the user list, and the gate re-resolves.
  const selectById = (id: string) => {
    storeProfileId(id);
    queryClient.clear();
    setProfileId(id);
  };

  if (!current) {
    // No profile chosen (or the stored one no longer exists)
    if (profileId) storeProfileId(null);
    return <ProfilePicker users={users} onSelect={(u) => selectById(u.id)} />;
  }

  return (
    <ProfileContext.Provider
      value={{
        user: current,
        users,
        switchUser: selectById,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function ProfileAvatar({ name, size = "md", active = false }: { name: string; size?: "sm" | "md"; active?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const sizeCls = size === "sm" ? "h-8 w-8 text-sm" : "h-12 w-12 text-lg";
  return (
    <div
      className={`${sizeCls} rounded-full flex items-center justify-center font-display font-bold shrink-0 ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
      }`}
    >
      {initial}
    </div>
  );
}

export function NewProfileForm({ onCreated }: { onCreated: (user: UserRecord) => void }) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const createUser = useCreateUser({
    mutation: {
      onSuccess: (user) => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setName("");
        onCreated(user);
      },
    },
  });

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createUser.mutate({ data: { name: trimmed } });
  };

  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="New profile name"
        disabled={createUser.isPending}
        data-testid="input-new-profile-name"
        className="flex-1 h-11 px-3 text-sm bg-muted/50 border border-border/60 rounded-xl outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
      />
      <button
        onClick={submit}
        disabled={createUser.isPending || !name.trim()}
        data-testid="button-create-profile"
        aria-label="Create profile"
        className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function ProfilePicker({
  users,
  onSelect,
}: {
  users: UserRecord[];
  onSelect: (user: UserRecord) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background px-6">
      <div className="w-full max-w-xs space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Dumbbell className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold">Who's training?</h1>
          <p className="text-sm text-muted-foreground mt-1">Pick your profile to continue.</p>
        </div>

        <div className="space-y-2">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => onSelect(user)}
              data-testid={`button-profile-${user.id}`}
              className="w-full flex items-center gap-3 bg-card border border-border/60 rounded-2xl p-3 text-left active:scale-[0.98] transition-transform"
            >
              <ProfileAvatar name={user.name} />
              <span className="font-display font-semibold">{user.name}</span>
            </button>
          ))}
        </div>

        <NewProfileForm onCreated={onSelect} />
      </div>
    </div>
  );
}
