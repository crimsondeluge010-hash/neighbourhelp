import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  TwitterAuthProvider,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

let firebaseAuth: Auth | null = null;
if (firebaseConfigured) {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(app);
}

export function observeAuth(callback: (user: User | null) => void) {
  if (!firebaseAuth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebaseAuth, callback);
}

export function getCurrentFirebaseUser() {
  return firebaseAuth?.currentUser ?? null;
}

export async function getIdToken() {
  const user = getCurrentFirebaseUser();
  return user ? user.getIdToken() : null;
}

export async function signIn(email: string, password: string) {
  if (!firebaseAuth) throw new Error("Firebase Authentication is not configured yet. Add the VITE_FIREBASE_* values to .env.");
  const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return result.user;
}

export type SocialProvider = "google" | "facebook" | "twitter";

export async function signInWithSocialProvider(providerName: SocialProvider) {
  if (!firebaseAuth) throw new Error("Firebase Authentication is not configured yet. Add the VITE_FIREBASE_* values to .env.");
  const provider = providerName === "google"
    ? new GoogleAuthProvider()
    : providerName === "facebook"
      ? new FacebookAuthProvider()
      : new TwitterAuthProvider();
  if (providerName === "google") provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(firebaseAuth, provider);
  return result.user;
}

export async function register(email: string, password: string, displayName: string) {
  if (!firebaseAuth) throw new Error("Firebase Authentication is not configured yet. Add the VITE_FIREBASE_* values to .env.");
  const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  if (displayName) await updateProfile(result.user, { displayName });
  return result.user;
}

export async function logout() {
  if (firebaseAuth) await signOut(firebaseAuth);
}
