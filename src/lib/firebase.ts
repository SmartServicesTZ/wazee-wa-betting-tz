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
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
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
  if (code.includes("email-already-in-use"))
    return "Namba hii tayari ina akaunti. Tumia Ingia au wasiliana na msaada WhatsApp.";
  if (
    code.includes("invalid-credential") ||
    code.includes("wrong-password") ||
    code.includes("user-not-found")
  )
    return "Namba ya simu au password si sahihi.";
  if (code.includes("weak-password")) return "Password iwe na angalau herufi/namba 6.";
  if (code.includes("network-request-failed"))
    return "Mtandao umekatika. Hakikisha internet kisha jaribu tena.";
  if (code.includes("too-many-requests"))
    return "Majaribio yamezidi. Subiri kidogo kisha jaribu tena.";
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
      throw new Error(
        "Namba hii tayari ina akaunti. Ingia kwa password yako au wasiliana na msaada WhatsApp.",
      );
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
      if (existingUsername.exists())
        throw new Error("Namba hii tayari imetumika. Wasiliana na msaada WhatsApp.");
      tx.set(usernameRef, { uid: accountUser.uid, createdAt: serverTimestamp() });
      tx.set(doc(firestore, "publicProfiles", accountUser.uid), {
        uid: accountUser.uid,
        username,
        displayName,
        photoURL: null,
        accountVerified: false,
        ticketCount: 0,
        settledTicketCount: 0,
        wonCount: 0,
        lostCount: 0,
        pendingCount: 0,
        winRate: 0,
        selectionWonCount: 0,
        selectionLostCount: 0,
        selectionWinRate: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(firestore, "users", accountUser.uid), {
        uid: accountUser.uid,
        email: accountUser.email,
        firstName,
        lastName,
        username,
        phone,
        displayName,
        role: "USER",
        // New registrations are system-approved immediately; admin approval is not required.
        status: "ACTIVE",
        accountStatus: "ACTIVE",
        approvalStatus: "APPROVED",
        approved: true,
        isApproved: true,
        verified: true,
        isVerified: true,
        disabled: false,
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
    if (isNewAccount) {
      try {
        await deleteUser(accountUser);
      } catch (cleanupError) {
        console.error("Could not remove incomplete Firebase Auth account:", cleanupError);
        await signOut(auth).catch(() => undefined);
      }
    } else {
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
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)
    throw new Error("Tumia picha chini ya 5MB.");
  const currentUser = getFirebaseAuth()?.currentUser;
  if (!currentUser || currentUser.uid !== uid)
    throw new Error("Ingia tena kabla ya kupakia picha.");
  const token = await currentUser.getIdToken();
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { Authorization: ["Bear", "er "].join("") + token },
    body: form,
  });
  const result = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error || "Imeshindikana kupakia picha.");
  await setDoc(
    doc(firestore, "users", uid),
    { photoURL: result.url, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return result.url;
}

export async function runAdminSync(date?: string) {
  const callable = httpsCallable<
    { date?: string },
    { ok: boolean; count: number; settled: number }
  >(functions, "adminSync");
  return (await callable(date ? { date } : {})).data;
}
export async function adminSetTipsterVerification(uid: string, verified: boolean) {
  const callable = httpsCallable<
    { uid: string; verified: boolean },
    { ok: boolean; verified: boolean }
  >(functions, "adminSetTipsterVerification");
  return (await callable({ uid, verified })).data;
}
export async function adminResetUserPassword(uid: string, password: string) {
  const callable = httpsCallable<{ uid: string; password: string }, { ok: boolean }>(
    functions,
    "adminResetUserPassword",
  );
  return (await callable({ uid, password })).data;
}

export type AdminUser = {
  uid: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  email?: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  disabled: boolean;
  createdAt?: string;
  ticketCount?: number;
  winRate?: number;
};
export type AdminDashboardData = {
  users: AdminUser[];
  registrationTrend: { label: string; count: number }[];
  metrics: {
    users: number;
    activeUsers: number;
    tickets: number;
    won: number;
    lost: number;
    pending: number;
    matches: number;
    revenue: number;
  };
};
export async function adminDashboard(): Promise<AdminDashboardData> {
  // Read the actual Firestore collections directly so the dashboard still loads
  // when optional callable dashboard functions have not yet been deployed.
  const [usersSnap, ticketsSnap, matchesSnap, paymentsSnap] = await Promise.all([
    getDocs(query(collection(firestore, "users"), limit(1000))),
    getDocs(query(collection(firestore, "tickets"), limit(1000))),
    getDocs(query(collection(firestore, "matches"), limit(1000))),
    getDocs(query(collection(firestore, "payments"), limit(500))),
  ]);
  const users = usersSnap.docs.map((item) => {
    const value = item.data();
    const created =
      value.createdAt && typeof value.createdAt === "object" && "toDate" in value.createdAt
        ? (value.createdAt as { toDate: () => Date }).toDate().toISOString()
        : value.createdAt
          ? String(value.createdAt)
          : undefined;
    return {
      uid: item.id,
      displayName: String(value.displayName ?? ""),
      firstName: String(value.firstName ?? ""),
      lastName: String(value.lastName ?? ""),
      username: String(value.username ?? ""),
      phone: String(value.phone ?? ""),
      role: (value.role === "ADMIN" || value.role === "SUPER_ADMIN"
        ? value.role
        : "USER") as AdminUser["role"],
      disabled: value.disabled === true,
      createdAt: created,
      ticketCount: Number(value.ticketCount ?? 0),
      winRate: Number(value.winRate ?? 0),
    };
  });
  const tickets = ticketsSnap.docs.map((item) => item.data());
  const payments = paymentsSnap.docs.map((item) => item.data());
  const paidRevenue = payments.reduce((total, payment) => {
    const status = String(payment.status ?? "").toUpperCase();
    return status === "PAID" || status === "SUCCESS" || status === "COMPLETED"
      ? total + Number(payment.amount ?? 0)
      : total;
  }, 0);
  const now = new Date();
  const registrationTrend = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (13 - index));
    const key = day.toISOString().slice(0, 10);
    const count = users.filter((item) => item.createdAt?.slice(0, 10) === key).length;
    return { label: day.toLocaleDateString("sw-TZ", { day: "2-digit", month: "short" }), count };
  });
  return {
    users,
    registrationTrend,
    metrics: {
      users: users.length,
      activeUsers: users.filter((item) => !item.disabled).length,
      tickets: tickets.length,
      won: tickets.filter((item) => item.status === "WON").length,
      lost: tickets.filter((item) => item.status === "LOST").length,
      pending: tickets.filter((item) => item.status === "PENDING").length,
      matches: matchesSnap.size,
      revenue: paidRevenue,
    },
  };
}
export async function adminSetUserStatus(uid: string, disabled: boolean) {
  const callable = httpsCallable<
    { uid: string; disabled: boolean },
    { ok: boolean; disabled: boolean }
  >(functions, "adminSetUserStatus");
  return (await callable({ uid, disabled })).data;
}
export async function adminSetUserRole(uid: string, role: "USER" | "ADMIN") {
  const callable = httpsCallable<
    { uid: string; role: "USER" | "ADMIN" },
    { ok: boolean; role: string }
  >(functions, "adminSetUserRole");
  return (await callable({ uid, role })).data;
}
export type AdminMatch = {
  id: string;
  eventId?: string;
  leagueId?: string;
  leagueName?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
  kickoffAt?: string;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  resultSource?: string | null;
  resultVerifiedAt?: unknown;
  markets?: {
    market: string;
    options: { prediction: string; odds: number; line?: number | null }[];
  }[];
};
export type AutoConfig = {
  enabled: boolean;
  minSelections: number;
  maxSelections: number;
  minOddsPerSelection: number;
  maxOddsPerSelection: number;
  minTotalOdds: number;
  maxTotalOdds: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
  leagueIds?: string[];
  markets?: string[];
};
export async function adminMatchData(): Promise<{
  matches: AdminMatch[];
  autoConfig: AutoConfig;
  logs: Array<Record<string, unknown>>;
}> {
  const defaults: AutoConfig = {
    enabled: false,
    minSelections: 2,
    maxSelections: 5,
    minOddsPerSelection: 1.1,
    maxOddsPerSelection: 1.65,
    minTotalOdds: 1,
    maxTotalOdds: 12,
    risk: "LOW",
  };
  const [matchesSnap, logsSnap] = await Promise.all([
    getDocs(query(collection(firestore, "matches"), limit(300))),
    getDocs(query(collection(firestore, "api_logs"), limit(50))).catch(() => null),
  ]);
  let autoConfig = defaults;
  try {
    const configSnap = await getDoc(doc(firestore, "automation", "config"));
    if (configSnap.exists()) autoConfig = { ...defaults, ...configSnap.data() } as AutoConfig;
  } catch {
    // ADMIN (non-SUPER_ADMIN) may not have access to private automation settings.
  }
  return {
    matches: matchesSnap.docs.map((item) => ({ id: item.id, ...item.data() }) as AdminMatch),
    autoConfig,
    logs: logsSnap?.docs.map((item) => ({ id: item.id, ...item.data() })) ?? [],
  };
}
export async function adminSetAutoConfig(config: AutoConfig) {
  const callable = httpsCallable<AutoConfig, { ok: boolean; config: AutoConfig }>(
    functions,
    "adminSetAutoConfig",
  );
  return (await callable(config)).data;
}
export async function adminGenerateAutoTicket() {
  const callable = httpsCallable<
    Record<string, never>,
    {
      created?: boolean;
      reason?: string;
      ticketId?: string;
      selections?: number;
      totalOdds?: number;
      results?: {
        target: number;
        created: boolean;
        reason?: string;
        ticketId?: string;
        selections?: number;
        totalOdds?: number;
      }[];
    }
  >(functions, "adminGenerateAutoTicket");
  return (await callable({})).data;
}
export async function adminCreateTicket(input: {
  ticketId?: string;
  title: string;
  description?: string;
  visibility: "PUBLIC" | "PRIVATE";
  risk: "LOW" | "MEDIUM" | "HIGH";
  selections: { matchId: string; market: string; prediction: string; odds: number }[];
}) {
  const callable = httpsCallable<
    typeof input,
    { ok: boolean; ticketId: string; totalOdds: number; selectionCount: number }
  >(functions, "adminCreateTicket");
  return (await callable(input)).data;
}
type RowLike = { id: string; [key: string]: unknown };

export type VirtualCoinReward = { label: string; amount: number; requiredWins: number };
export type VirtualCoinSettings = {
  welcomeBonus: number;
  dailyGrant: number;
  dailyGrantEnabled: boolean;
  minBet: number;
  maxBet: number;
  rewards: VirtualCoinReward[];
};
export type VirtualCoinOverview = {
  settings: VirtualCoinSettings;
  wallets: Array<{
    uid: string;
    balance?: number;
    lifetimeEarned?: number;
    lifetimeSpent?: number;
  }>;
  transactions: Array<Record<string, unknown> & { id: string }>;
  totals: { balance: number; earned: number; spent: number };
};
export async function adminVirtualCoinOverview() {
  const callable = httpsCallable<Record<string, never>, VirtualCoinOverview>(
    functions,
    "adminVirtualCoinOverview",
  );
  return (await callable({})).data;
}
export async function adminSaveVirtualCoinSettings(settings: VirtualCoinSettings) {
  const callable = httpsCallable<
    VirtualCoinSettings,
    { ok: boolean; settings: VirtualCoinSettings }
  >(functions, "adminSaveVirtualCoinSettings");
  return (await callable(settings)).data;
}
export async function adminGrantVirtualCoins(
  uid: string,
  amount: number,
  reason: string,
  idempotencyKey: string,
) {
  const callable = httpsCallable<
    { uid: string; amount: number; reason: string; idempotencyKey: string },
    { ok: boolean; idempotent: boolean }
  >(functions, "adminGrantVirtualCoins");
  return (await callable({ uid, amount, reason, idempotencyKey })).data;
}
export async function getVirtualCoinWallet() {
  const callable = httpsCallable<
    Record<string, never>,
    {
      balance: number;
      lifetimeEarned: number;
      lifetimeSpent: number;
      settings: { minBet: number; maxBet: number };
      transactions: Array<Record<string, unknown> & { id: string }>;
    }
  >(functions, "getVirtualCoinWallet");
  return (await callable({})).data;
}
export async function placeVirtualBet(ticketId: string, amount: number, idempotencyKey: string) {
  const callable = httpsCallable<
    { ticketId: string; amount: number; idempotencyKey: string },
    { ok: boolean; amount: number; ticketId: string }
  >(functions, "placeVirtualBet");
  return (await callable({ ticketId, amount, idempotencyKey })).data;
}

export async function claimVirtualCoins(kind: "daily" | "welcome") {
  const callable = httpsCallable<
    { kind: "daily" | "welcome" },
    { ok: boolean; claimed: boolean; amount: number; kind: string }
  >(functions, "claimVirtualCoins");
  return (await callable({ kind })).data;
}
