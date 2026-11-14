import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { House, Dumbbell, TrendingUp, ListChecks, WifiOff, LogOut, Trash2, X } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useProfile } from "@/lib/profile";
import { useTheme, type ThemeChoice } from "@/lib/theme";
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
    <div className="flex flex-col min-h-[100dvh] bg-bp-bg text-bp-ink" style={inWorkout ? undefined : { paddingTop: "env(safe-area-inset-top)" }}>
      {/* Installed app: scrolled content must not show through behind the status bar */}
      <div aria-hidden="true" className="fixed top-0 left-0 right-0 z-40 bg-bp-bg" style={{ height: "env(safe-area-inset-top)" }} />

      {!isOnline && (
        <div
          data-testid="banner-offline"
          role="status"
          className="flex items-center justify-center gap-2 bg-bp-warn-soft px-4 py-2 text-[13px] font-medium"
        >
          <WifiOff className="w-4 h-4 shrink-0 text-bp-warn" aria-hidden="true" />
          <span>You're offline. Changes sync when you reconnect.</span>
        </div>
      )}

      <main className={cn("flex-1 w-full max-w-md mx-auto px-5", inWorkout ? "pt-0 pb-8" : "pt-7 pb-32")}>{children}</main>

      {!inWorkout && (
        <nav aria-label="Main" className="fixed bottom-0 left-0 right-0 z-50 bg-bp-surface border-t border-bp-line">
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
                  <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
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

/** Bottom sheet for the profile name, theme and sign out, opened from the Today header. */
export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useProfile();
  const [theme, setTheme] = useTheme();

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Profile and settings">
      <button aria-label="Close" className="absolute inset-0 bg-black/60 cursor-default" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-bp-surface rounded-t-[20px] p-5 space-y-5"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display font-extrabold text-[22px]">Profile</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 flex items-center justify-center rounded-[10px] bg-bp-surface-2"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <RenameProfile key={user.id} name={user.name} />

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
                  theme === t.value ? "bg-bp-brand text-bp-on-brand" : "bg-transparent text-bp-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Link
          href="/trash"
          onClick={onClose}
          data-testid="link-trash"
          className="w-full min-h-12 rounded-[10px] border-2 border-bp-outline font-bold text-sm flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          Recently deleted
        </Link>

        {signOut && (
          <button
            type="button"
            onClick={signOut}
            data-testid="button-sign-out"
            className="w-full min-h-12 rounded-[10px] border-2 border-bp-outline font-bold text-sm flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

function RenameProfile({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const queryClient = useQueryClient();
  const rename = useUpdateMe({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }) },
  });
  const trimmed = value.trim();
  const changed = trimmed.length > 0 && trimmed !== name;

  return (
    <form
      className="flex gap-2 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) rename.mutate({ data: { name: trimmed } });
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
