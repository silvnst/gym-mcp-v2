import { Link, useLocation } from "wouter";
import { Dumbbell, Play, History, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isOnline = useOnlineStatus();

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

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border">
        <div
          className="max-w-md mx-auto px-8 flex justify-between items-center"
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
                className={`flex flex-col items-center justify-center gap-1 w-20 py-1.5 rounded-xl transition-colors ${
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
        </div>
      </nav>
    </div>
  );
}
