import {
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

export type AuthProfile = {
  role: string;
  permissions: string[];
  isAdmin: boolean;
};

export type AuthState = {
  user: FirebaseUser | null;
  token: string | null;
  profile: AuthProfile | null;
  loading: boolean;
};

/** Create the user and authProfile docs in Firestore on first sign-in. */
async function ensureUserDocs(user: FirebaseUser): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return;

  await setDoc(userRef, {
    createdAt: serverTimestamp(),
    anonymous: user.isAnonymous,
    email: user.email ?? null,
    consentFlags: {},
  });

  await setDoc(doc(db, "authProfiles", user.uid), {
    role: "user",
    permissions: [],
    isAdmin: false,
  });
}

/** Fetch role/permissions from Firestore authProfiles doc. */
export async function fetchAuthProfile(uid: string): Promise<AuthProfile> {
  const snap = await getDoc(doc(db, "authProfiles", uid));
  if (!snap.exists()) {
    return { role: "user", permissions: [], isAdmin: false };
  }
  const data = snap.data();
  return {
    role: (data.role as string) ?? "user",
    permissions: (data.permissions as string[]) ?? [],
    isAdmin: (data.isAdmin as boolean) ?? false,
  };
}

export async function loginAnonymously(): Promise<FirebaseUser> {
  const credential = await signInAnonymously(auth);
  await ensureUserDocs(credential.user);
  return credential.user;
}

export async function register(email: string, password: string): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserDocs(credential.user);
  return credential.user;
}

export async function login(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function confirmReset(code: string, newPassword: string): Promise<void> {
  await firebaseConfirmPasswordReset(auth, code, newPassword);
}

export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
