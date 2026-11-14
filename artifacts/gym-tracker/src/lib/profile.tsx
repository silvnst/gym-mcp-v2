import { createContext, useContext } from "react";
import type { UserRecord } from "@workspace/api-client-react";

export type ProfileContextValue = {
  user: UserRecord;
  /** Ends the Auth0 session; null when the app runs without auth (local development). */
  signOut: (() => void) | null;
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileGate");
  return ctx;
}
