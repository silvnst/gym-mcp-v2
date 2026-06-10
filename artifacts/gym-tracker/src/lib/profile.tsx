import { createContext, useContext } from "react";
import { setUserId, type UserRecord } from "@workspace/api-client-react";

const STORAGE_KEY = "gym.profileId";

export function getStoredProfileId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeProfileId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode) — header still set for this session
  }
  setUserId(id);
}

export type ProfileContextValue = {
  user: UserRecord;
  users: UserRecord[];
  switchUser: (id: string) => void;
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileGate");
  return ctx;
}
