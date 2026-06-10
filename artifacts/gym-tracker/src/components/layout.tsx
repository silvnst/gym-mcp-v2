import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Dumbbell, Play, History, WifiOff, Check, X } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useProfile } from "@/lib/profile";
import { ProfileAvatar, NewProfileForm } from "@/components/profile-gate";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isOnline = useOnlineStatus();
  const { user } = useProfile();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Plans", icon: Dumbbell, match: (l: string) => l === "/" || l.startsWith("/plans") },
    { href: "/start", label: "Train", icon: Play, match: (l: string) => l === "/start" || l.startsWith("/session") },
    { href: "/history", label: "History", icon: History, match: (l: string) => l.startsWith("/history") },
  ];

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      {!isOnline && (
        <div
          data-testid="banner-offline"
          className="flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs font-medium text-amber-400"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Offline — changes will sync when you reconnect.</span>
        </div>
      )}

      <main className="flex-1 w-full max-w-md mx-auto px-5 pt-8 pb-28 sm:pb-32">
        {children}
      </main>

      {switcherOpen && <ProfileSwitcher onClose={() => setSwitcherOpen(false)} />}

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border">
        <div
          className="max-w-md mx-auto px-6 flex justify-between items-center"
          style={{ paddingTop: "0.5rem", paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          {navItems.map((item) => {
            const isActive = item.match(location);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center gap-1 w-16 py-1.5 rounded-xl transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div
                  className={`flex items-center justify-center h-8 w-14 rounded-full transition-colors ${
                    isActive ? "bg-primary/15" : ""
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className="text-[10px] font-semibold tracking-wide uppercase">{item.label}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setSwitcherOpen(true)}
            data-testid="nav-profile"
            className="flex flex-col items-center justify-center gap-1 w-16 py-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Switch profile"
          >
            <div className="flex items-center justify-center h-8">
              <ProfileAvatar name={user.name} size="sm" />
            </div>
            <span className="text-[10px] font-semibold tracking-wide uppercase truncate max-w-16">
              {user.name.split(" ")[0]}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function ProfileSwitcher({ onClose }: { onClose: () => void }) {
  const { user, users, switchUser } = useProfile();

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Switch profile">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-card border-t border-x border-border rounded-t-3xl p-5 space-y-4"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-bold">Profiles</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
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
                className={`w-full flex items-center gap-3 rounded-2xl p-3 text-left active:scale-[0.98] transition-transform border ${
                  isCurrent ? "border-primary/50 bg-primary/5" : "border-border/60 bg-muted/30"
                }`}
              >
                <ProfileAvatar name={u.name} active={isCurrent} />
                <span className="font-display font-semibold flex-1">{u.name}</span>
                {isCurrent && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>

        <NewProfileForm
          onCreated={(created) => {
            switchUser(created.id);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
