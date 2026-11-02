import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { House, Dumbbell, TrendingUp, ListChecks, WifiOff, Check, X } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useProfile } from "@/lib/profile";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { ProfileAvatar, NewProfileForm } from "@/components/profile-gate";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Today", icon: House, match: (l: string) => l === "/" },
  { href: "/plans", label: "Plans", icon: Dumbbell, match: (l: string) => l.startsWith("/plans") },
  { href: "/progress", label: "Progress", icon: TrendingUp, match: (l: string) => l.startsWith("/progress") },
  { href: "/history", label: "History", icon: ListChecks, match: (l: string) => l.startsWith("/history") },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isOnline = useOnlineStatus();
  const inWorkout = location.startsWith("/session/");
  useTheme(); // applies the stored theme choice on load

  return (
    <div className="flex flex-col min-h-[100dvh] bg-bp-bg text-bp-ink">
      {!isOnline && (
        <div
          data-testid="banner-offline"
          role="status"
          className="flex items-center justify-center gap-2 bg-bp-warn-soft border-b-2 border-bp-outline px-4 py-2 text-[13px] font-medium"
        >
          <WifiOff className="w-4 h-4 shrink-0 text-bp-warn" aria-hidden="true" />
          <span>You're offline. Changes sync when you reconnect.</span>
        </div>
      )}

      <main className={cn("flex-1 w-full max-w-md mx-auto px-5", inWorkout ? "pt-0 pb-8" : "pt-7 pb-32")}>{children}</main>

      {!inWorkout && (
        <nav aria-label="Main" className="fixed bottom-0 left-0 right-0 z-50 bg-bp-surface border-t-2 border-bp-outline">
          <div
            className="max-w-md mx-auto px-1 grid grid-cols-4"
            style={{ paddingTop: "0.5rem", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {NAV.map((item) => {
              const active = item.match(location);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  className={cn(
                    "min-h-12 flex flex-col items-center justify-center gap-1 rounded-lg text-xs",
                    active ? "text-bp-ink font-bold" : "text-bp-muted font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "h-[30px] w-14 flex items-center justify-center rounded-lg box-border",
                      active && "bg-bp-brand text-bp-on-brand border-2 border-bp-outline",
                    )}
                  >
                    <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

/** Bottom sheet for switching profile and theme, opened from the Today header. */
export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { user, users, switchUser } = useProfile();
  const [theme, setTheme] = useTheme();

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Profile and settings">
      <button aria-label="Close" className="absolute inset-0 bg-black/60 cursor-default" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-bp-surface border-t-2 border-x-2 border-bp-outline rounded-t-[20px] p-5 space-y-5"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display font-extrabold text-[22px]">Profile</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 flex items-center justify-center rounded-[10px] border-2 border-bp-outline"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar">
          {users.map((u) => {
            const isCurrent = u.id === user.id;
            return (
              <button
                key={u.id}
                onClick={() => {
                  if (!isCurrent) switchUser(u.id);
                  onClose();
                }}
                data-testid={`button-switch-profile-${u.id}`}
                className={cn(
                  "w-full flex items-center gap-3 rounded-[14px] p-3 text-left border-2 border-bp-outline",
                  isCurrent ? "bg-bp-done" : "bg-bp-bg",
                )}
              >
                <ProfileAvatar name={u.name} active={isCurrent} size="sm" />
                <span className="font-bold flex-1">{u.name}</span>
                {isCurrent && <Check className="w-5 h-5 shrink-0" aria-label="Current profile" />}
              </button>
            );
          })}
        </div>

        <RenameProfile key={user.id} id={user.id} name={user.name} />

        <NewProfileForm
          onCreated={(created) => {
            switchUser(created.id);
            onClose();
          }}
        />

        <div>
          <h3 id="theme-label" className="font-sans text-[13px] font-bold text-bp-muted mb-2">
            Appearance
          </h3>
          <div role="group" aria-labelledby="theme-label" className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={theme === t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  "min-h-12 rounded-[10px] border-2 border-bp-outline font-bold text-sm",
                  theme === t.value ? "bg-bp-brand text-bp-on-brand shadow-hard-sm" : "bg-transparent text-bp-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RenameProfile({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name);
  const queryClient = useQueryClient();
  const rename = useUpdateUser({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }) },
  });
  const trimmed = value.trim();
  const changed = trimmed.length > 0 && trimmed !== name;

  return (
    <form
      className="flex gap-2 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) rename.mutate({ id, data: { name: trimmed } });
      }}
    >
      <div className="flex-1 min-w-0">
        <label htmlFor="rename-profile" className="block text-[13px] font-bold text-bp-muted mb-1.5">
          Name of this profile
        </label>
        <input
          id="rename-profile"
          value={value}
          maxLength={50}
          onChange={(e) => setValue(e.target.value)}
          className="w-full h-12 px-3 text-[15px] bg-bp-bg border-2 border-bp-outline rounded-[10px] text-bp-ink"
        />
      </div>
      <button
        type="submit"
        disabled={!changed || rename.isPending}
        className="h-12 px-4 rounded-[10px] border-2 border-bp-outline bg-bp-brand text-bp-on-brand font-bold disabled:opacity-40"
      >
        {rename.isPending ? "Saving" : rename.isSuccess && !changed ? "Saved" : "Rename"}
      </button>
    </form>
  );
}
