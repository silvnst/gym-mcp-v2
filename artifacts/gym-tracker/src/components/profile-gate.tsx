import { useEffect } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { Dumbbell } from "lucide-react";
import { ProfileContext } from "@/lib/profile";

const domain = import.meta.env["VITE_AUTH0_DOMAIN"] as string | undefined;
const clientId = import.meta.env["VITE_AUTH0_CLIENT_ID"] as string | undefined;
const audience = import.meta.env["VITE_AUTH0_AUDIENCE"] as string | undefined;

/** Without the three Auth0 settings the app talks to the API unauthenticated (local dev with AUTH_DISABLED=true). */
const AUTH_ENABLED = Boolean(domain && clientId && audience);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!AUTH_ENABLED) return <>{children}</>;
  return (
    <Auth0Provider
      domain={domain!}
      clientId={clientId!}
      cacheLocation="localstorage"
      useRefreshTokens
      authorizationParams={{
        redirect_uri: window.location.origin + import.meta.env.BASE_URL,
        audience,
        scope: "openid profile email offline_access",
      }}
      onRedirectCallback={(appState) => {
        window.history.replaceState({}, document.title, appState?.returnTo ?? import.meta.env.BASE_URL);
      }}
    >
      {children}
    </Auth0Provider>
  );
}

export function ProfileGate({ children }: { children: React.ReactNode }) {
  return AUTH_ENABLED ? <Auth0Gate>{children}</Auth0Gate> : <ProfileLoader signOut={null}>{children}</ProfileLoader>;
}

function Auth0Gate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, error, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  // Attach the access token to every API call; set before the first query fires
  if (isAuthenticated) setAuthTokenGetter(async () => (await getAccessTokenSilently()) ?? null);

  useEffect(() => () => setAuthTokenGetter(null), []);

  if (isLoading) return <Splash />;

  if (!isAuthenticated) {
    return (
      <Screen
        title="Gym tracker"
        text={error ? "Signing in did not work. Try again." : "Sign in to keep training."}
        action={
          <button
            onClick={() =>
              loginWithRedirect({
                appState: { returnTo: window.location.pathname + window.location.search },
              })
            }
            data-testid="button-sign-in"
            className="w-full h-12 rounded-[10px] border-2 border-bp-outline bg-bp-brand text-bp-on-brand shadow-hard press font-bold"
          >
            Sign in
          </button>
        }
      />
    );
  }

  const signOut = () => {
    queryClient.clear();
    void logout({ logoutParams: { returnTo: window.location.origin } });
  };

  return <ProfileLoader signOut={signOut}>{children}</ProfileLoader>;
}

function ProfileLoader({ signOut, children }: { signOut: (() => void) | null; children: React.ReactNode }) {
  // No retries: a 401 or 403 will not fix itself and the user needs to see it
  const { data: user, isLoading, isError } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });

  if (isLoading) return <Splash />;

  if (isError || !user) {
    return (
      <Screen
        title="No access"
        text="This account can't use the app. Sign out and try another one."
        action={
          signOut && (
            <button
              onClick={signOut}
              data-testid="button-sign-out-denied"
              className="w-full h-12 rounded-[10px] border-2 border-bp-outline bg-bp-surface text-bp-ink shadow-hard press font-bold"
            >
              Sign out
            </button>
          )
        }
      />
    );
  }

  return <ProfileContext.Provider value={{ user, signOut }}>{children}</ProfileContext.Provider>;
}

function Splash() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-background">
      <Dumbbell className="w-8 h-8 text-bp-brand animate-pulse" aria-label="Loading" />
    </div>
  );
}

function Screen({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background px-6">
      <div className="w-full max-w-xs space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-[14px] border-2 border-bp-outline bg-bp-brand shadow-hard flex items-center justify-center">
            <Dumbbell className="w-7 h-7 text-bp-on-brand" />
          </div>
          <h1 className="text-[32px] leading-[34px] font-display font-extrabold tracking-[-0.03em]">{title}</h1>
          <p className="text-sm text-bp-muted mt-1">{text}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

export function ProfileAvatar({ name, size = "md", active = false }: { name: string; size?: "sm" | "md"; active?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const sizeCls = size === "sm" ? "h-8 w-8 text-sm" : "h-11 w-11 text-lg";
  return (
    <div
      className={`${sizeCls} rounded-[10px] border-2 border-bp-outline flex items-center justify-center font-display font-extrabold shrink-0 ${
        active ? "bg-bp-brand text-bp-on-brand" : "bg-bp-surface text-bp-ink"
      }`}
    >
      {initial}
    </div>
  );
}
