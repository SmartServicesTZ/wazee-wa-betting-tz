import { getApp, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  createUserWithEmailAndPassword,
  deleteUser,
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
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "wazee-wa-betting-tz-e7183.firebaseapp.com",
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
  const digits = value.replace(/\\D/g, "");
  if (digits.startsWith("255") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "255" + digits.slice(1);
  if (digits.length === 9) return "255" + digits;
  throw new Error("Weka namba sahihi ya Tanzania, mfano 0712345678.");
}
function phoneLoginEmail(phone: string) {
  return normalizeTanzaniaPhone(phone) + "@phone.wazee-wa-betting-tz.com";
}
function authErrorMessage(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("email-already-in-use")) return "Namba hii tayari ina akaunti. Tumia Ingia au wasiliana na msaada WhatsApp.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Namba ya simu au password si sahihi.";
  if (code.includes("weak-password")) return "Password iwe na angalau herufi/namba 6.";
  if (code.includes("network-request-failed")) return "Mtandao umekatika. Hakikisha internet kisha jaribu tena.";
  if (code.includes("too-many-requests")) return "Majaribio yamezidi. Subiri kidogo kisha jaribu tena.";
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
export async function registerWithPhone(
  phoneInput: string,
  password: string,
  profile: { firstName: string; lastName: string },
) {
  const phone = normalizeTanzaniaPhone(phoneInput);
  const firstName = profile.firstName.trim();
  const lastName = profile.lastName.trim();
  if (!firstName || !lastName) throw new Error("Jaza jina la kwanza na la mwisho.");
  if (password.length < 6) throw new Error("Password iwe na angalau herufi/namba 6.");
  const email = phoneLoginEmail(phone);
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth inapatikana kwenye browser pekee.");
  let accountUser: User;
  let isNewAccount = true;
  try {
    accountUser = (await createUserWithEmailAndPassword(auth, email, password)).user;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (!code.includes("email-already-in-use")) {
      throw new Error(authErrorMessage(error, "Usajili umeshindikana. Jaribu tena."));
    }
    // Recover an Auth account left behind by an earlier failed profile creation.
    try {
      accountUser = (await signInWithEmailAndPassword(auth, email, password)).user;
    } catch {
      throw new Error("Namba hii tayari ina akaunti. Ingia kwa password yako au wasiliana na msaada WhatsApp.");
    }
    const existingProfile = await getDoc(doc(firestore, "users", accountUser.uid));
    if (existingProfile.exists()) {
      await signOut(auth);
      throw new Error("Namba hii tayari ina akaunti. Tafadhali ingia.");
    }
    isNewAccount = false;
  }
  const displayName = (firstName + " " + lastName).trim();
  const username = "mzee_" + phone.slice(-9);
  try {
    // Set the display name before creating the profile, so no later profile update
    // can make a successful registration look like a failed one.
    await updateProfile(accountUser, { displayName });
    await runTransaction(firestore, async (tx) => {
      const usernameRef = doc(firestore, "usernames", username);
      const existingUsername = await tx.get(usernameRef);
      if (existingUsername.exists()) throw new Error("Namba hii tayari imetumika. Wasiliana na msaada WhatsApp.");
      tx.set(usernameRef, { uid: accountUser.uid, createdAt: serverTimestamp() });
      tx.set(doc(firestore, "users", accountUser.uid), {
        uid: accountUser.uid,
        email: result.user.email,
        firstName,
        lastName,
        username,
        phone,
        displayName,
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
    return accountUser;
  } catch (error) {
    // A failed Firestore profile write must not leave an Auth-only account behind.
    try {
      await deleteUser(result.user);
    } catch (cleanupError) {
      console.error("Could not remove incomplete Firebase Auth account:", cleanupError);
      await signOut(auth).catch(() => undefined);
    }
    throw new Error(authErrorMessage(error, "Usajili umeshindikana. Jaribu tena."));
  }
}
export async function loginWithPhone(phoneInput: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase Auth inapatikana kwenye browser pekee.");
  const phone = normalizeTanzaniaPhone(phoneInput);
  try {
    return (await signInWithEmailAndPassword(auth, phoneLoginEmail(phone), password)).user;
  } catch (error) {
    throw new Error(authErrorMessage(error, "Namba ya simu au password si sahihi."));
  }
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
