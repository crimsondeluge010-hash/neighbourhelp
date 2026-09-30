import { cert, getApps, initializeApp } from "firebase-admin/app";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAuth as getFirebaseAuth } from "firebase-admin/auth";
import type { Request } from "express";

export type FirebaseUser = Pick<DecodedIdToken, "uid" | "email" | "name" | "picture"> & { adminClaim?: boolean };

function getAdminAuth() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) as {
      projectId: string;
      clientEmail: string;
      privateKey: string;
    };
    initializeApp({
      credential: cert({
        projectId: serviceAccount.projectId,
        clientEmail: serviceAccount.clientEmail,
        privateKey: serviceAccount.privateKey.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirebaseAuth();
}

export async function verifyFirebaseRequest(req: Request): Promise<FirebaseUser> {
  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!token) throw new Error("Missing Firebase ID token");

  const auth = getAdminAuth();
  if (!auth) throw new Error("Firebase Admin is not configured");
  const decoded = await auth.verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
    adminClaim: decoded.admin === true || decoded.role === "admin",
  };
}

export function isFirebaseAdmin(user: FirebaseUser) {
  const allowedUids = new Set((process.env.ADMIN_FIREBASE_UIDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  const allowedEmails = new Set((process.env.ADMIN_FIREBASE_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return Boolean(user.adminClaim || allowedUids.has(user.uid) || (user.email && allowedEmails.has(user.email.toLowerCase())));
}

export function firebaseClientConfig() {
  return {
    apiKey: process.env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.VITE_FIREBASE_APP_ID ?? "",
  };
}
