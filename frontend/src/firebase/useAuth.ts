import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "./config";
import {
  fetchAuthProfile,
  loginAnonymously,
  register,
  login,
  logout,
  requestPasswordReset,
  confirmReset,
  type AuthProfile,
} from "./authService";

export type UseAuthReturn = {
  user: FirebaseUser | null;
  token: string | null;
  profile: AuthProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signInAnonymous: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>;
};

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        const idToken = await fbUser.getIdToken();
        setToken(idToken);
        const prof = await fetchAuthProfile(fbUser.uid);
        setProfile(prof);
      } else {
        setToken(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInAnonymous = useCallback(async () => {
    setLoading(true);
    await loginAnonymously();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setLoading(true);
    await register(email, password);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    await login(email, password);
  }, []);

  const signOutUser = useCallback(async () => {
    await logout();
    setUser(null);
    setToken(null);
    setProfile(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await requestPasswordReset(email);
  }, []);

  const confirmPwReset = useCallback(async (code: string, newPassword: string) => {
    await confirmReset(code, newPassword);
  }, []);

  return {
    user,
    token,
    profile,
    loading,
    isAdmin: profile?.isAdmin ?? false,
    signInAnonymous,
    signUp,
    signIn,
    signOutUser,
    resetPassword,
    confirmPasswordReset: confirmPwReset,
  };
}
