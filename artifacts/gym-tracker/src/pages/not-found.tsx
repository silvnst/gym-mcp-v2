import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <AlertCircle className="h-10 w-10 text-destructive mb-4 opacity-70" />
      <h1 className="text-3xl font-display font-bold text-foreground mb-2">404</h1>
      <p className="text-sm text-muted-foreground mb-6">Page not found</p>
      <Link
        href="/"
        className="text-sm font-semibold bg-primary text-primary-foreground rounded-full px-5 py-2.5 active:scale-95 transition-transform"
      >
        Back to Plans
      </Link>
    </div>
  );
}
