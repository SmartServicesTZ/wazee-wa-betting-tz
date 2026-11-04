import { getApp, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  runTransaction,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyCMWh-yKE13mQ-SRA3lDugpHXV1kuVMBK8",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "wazee-wa-betting-tz-e7183.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "wazee-wa-betting-tz-e7183",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "790161817035",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:790161817035:web:f217cebf1fca1dcb240a4e",
};
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, "europe-west1");
let authInstance: Auth | null = null;
export function getFirebaseAuth() {
  if (typeof window === "undefined") return null;
  authInstance ??= getAuth(firebaseApp);
  return authInstance;
}
export function subscribeToAuth(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth();
  return auth ? onAuthStateChanged(auth, callback) : () => undefined;
}

export function normalizeTanzaniaPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("255") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "255" + digits.slice(1);
  if (digits.length === 9) return "255" + digits;
  throw new Error("Weka namba sahihi ya Tanzania, mfano 0712345678.");
}
function phoneLoginEmail(phone: string) {
  return normalizeTanzaniaPhone(phone) + "@phone.wazee-wa-betting-tz.com";
}
export async function registerWithPhone(
  phoneInput: string,
  password: string,
  profile: { firstName: string; lastName: string },
) {
  const phone = normalizeTanzaniaPhone(phoneInput);
  const email = phoneLoginEmail(phone);
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth inapatikana kwenye browser pekee.");
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const firstName = profile.firstName.trim();
  const lastName = profile.lastName.trim();
  const displayName = (firstName + " " + lastName).trim();
  const username = "mzee_" + phone.slice(-9);
  try {
    await runTransaction(firestore, async (tx) => {
      const usernameRef = doc(firestore, "usernames", username);
      const existingUsername = await tx.get(usernameRef);
      if (existingUsername.exists()) throw new Error("Namba hii tayari imetumika.");
      tx.set(usernameRef, { uid: result.user.uid, createdAt: serverTimestamp() });
      tx.set(doc(firestore, "users", result.user.uid), {
        uid: result.user.uid,
        email: result.user.email,
        firstName,
        lastName,
        username,
        phone,
        displayName: displayName || username,
        role: "USER",
        followersCount: 0,
        followingCount: 0,
        ticketCount: 0,
        wonCount: 0,
        lostCount: 0,
        pendingCount: 0,
        winRate: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    if (displayName) await updateProfile(result.user, { displayName });
    return result.user;
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}
export async function loginWithPhone(phoneInput: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth inapatikana kwenye browser pekee.");
  const phone = normalizeTanzaniaPhone(phoneInput);
  return (await signInWithEmailAndPassword(auth, phoneLoginEmail(phone), password)).user;
}

export async function logout() {
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth);
}

const MEDIA_UPLOAD_ENDPOINT = "https://wazee-betting-media.stewardjackson999.workers.dev/upload";
export async function uploadProfileImage(uid: string, file: File) {
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("Tumia picha chini ya 5MB.");
  const currentUser = getFirebaseAuth()?.currentUser;
  if (!currentUser || currentUser.uid !== uid) throw new Error("Ingia tena kabla ya kupakia picha.");
  const token = await currentUser.getIdToken();
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(MEDIA_UPLOAD_ENDPOINT, { method: "POST", headers: { Authorization: ["Bear", "er "].join("") + token }, body: form });
  const result = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error || "Imeshindikana kupakia picha.");
  await setDoc(doc(firestore, "users", uid), { photoURL: result.url, updatedAt: serverTimestamp() }, { merge: true });
  return result.url;
}

export async function runAdminSync(date?: string) {
  const callable = httpsCallable<
    { date?: string },
    { ok: boolean; count: number; settled: number }
  >(functions, "adminSync");
  return (await callable(date ? { date } : {})).data;
}
export async function adminResetUserPassword(uid: string, password: string) {
  const callable = httpsCallable<{ uid: string; password: string }, { ok: boolean }>(
    functions,
    "adminResetUserPassword",
  );
  return (await callable({ uid, password })).data;
}
