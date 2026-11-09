import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { firestore } from "./firebase";
import { calculateTotalOdds, type Selection } from "./betting";

type UserProfileRecord = {
  id: string;
  uid?: string;
  role?: string;
  username?: string;
  phone?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string | null;
  ticketCount?: number;
  wonCount?: number;
  lostCount?: number;
  pendingCount?: number;
  winRate?: number;
};

export type PublicTicket = {
  id: string;
  creatorId: string;
  creatorUsername: string;
  creatorName: string;
  creatorPhotoURL?: string;
  title: string;
  description?: string;
  sport: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  visibility: "PUBLIC" | "PRIVATE";
  access: "FREE" | "VIP";
  totalOdds: number;
  status: string;
  selectionCount: number;
  createdAt?: unknown;
  automated?: boolean;
  automatedDisclosure?: string;
};

export type PublicFreeTicket = PublicTicket & {
  targetOdds?: number;
  automationWindow?: string;
  selections: Array<{
    id?: string;
    matchId: string;
    market?: string;
    prediction: string;
    odds: number;
    homeTeam: string;
    awayTeam: string;
    homeTeamLogo?: string | null;
    awayTeamLogo?: string | null;
    kickoffAt?: unknown;
    leagueName?: string;
    status?: string;
  }>;
};

export type TicketComment = {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt?: unknown;
};

export async function createTicket(input: {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  title: string;
  description?: string;
  sport: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  visibility: "PUBLIC" | "PRIVATE";
  access: "FREE" | "VIP";
  selections: Selection[];
}) {
  if (!input.selections.length) throw new Error("Ongeza angalau selection moja.");
  const totalOdds = calculateTotalOdds(input.selections);
  const ref = await addDoc(collection(firestore, "tickets"), {
    creatorId: input.uid,
    creatorUsername: input.username,
    creatorName: input.displayName,
    creatorPhotoURL: input.photoURL ?? null,
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    sport: input.sport,
    risk: input.risk,
    visibility: input.visibility,
    access: input.access,
    totalOdds,
    status: "PENDING",
    selectionCount: input.selections.length,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const publicProfileRef = doc(firestore, "publicProfiles", input.uid);
  const existingPublicProfile = await getDoc(publicProfileRef);
  if (existingPublicProfile.exists()) {
    await setDoc(
      publicProfileRef,
      {
        uid: input.uid,
        username: input.username,
        displayName: input.displayName,
        photoURL: input.photoURL ?? null,
        accountVerified: existingPublicProfile.data().accountVerified !== false,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    await setDoc(publicProfileRef, {
      uid: input.uid,
      username: input.username,
      displayName: input.displayName,
      photoURL: input.photoURL ?? null,
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
  }

  await Promise.all(
    input.selections.map((selection, index) =>
      setDoc(doc(firestore, "tickets", ref.id, "selections", String(index + 1)), {
        ...selection,
        kickoffAt: Timestamp.fromDate(new Date(selection.kickoffAt)),
        odds: Number(selection.odds),
        status: "PENDING",
        createdAt: serverTimestamp(),
      }),
    ),
  );
  return ref.id;
}

export async function listPublicTickets(max = 20) {
  const candidateLimit = Math.min(500, Math.max(max, max * 3));
  const snapshot = await getDocs(
    query(
      collection(firestore, "tickets"),
      where("visibility", "==", "PUBLIC"),
      limit(candidateLimit),
    ),
  );
  const newest = [...snapshot.docs]
    .sort((a, b) => timestampMillis(b.data().createdAt) - timestampMillis(a.data().createdAt))
    .slice(0, max);
  return Promise.all(
    newest.map(async (item) => {
      const data = item.data();
      const profile = await getDoc(doc(firestore, "publicProfiles", String(data.creatorId))).catch(
        () => null,
      );
      const publicData = profile?.exists() ? profile.data() : {};
      return {
        id: item.id,
        ...data,
        creatorAccountVerified: publicData?.accountVerified === true,
        creatorWinRate: Number(publicData?.winRate ?? 0),
        creatorSettledTicketCount: Number(publicData?.settledTicketCount ?? 0),
      } as PublicTicket;
    }),
  );
}

export async function listAutomatedFreeTickets(max = 60): Promise<PublicFreeTicket[]> {
  const snapshot = await getDocs(
    query(
      collection(firestore, "tickets"),
      where("automated", "==", true),
      limit(Math.min(100, max)),
    ),
  );
  const candidates = snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }) as PublicFreeTicket)
    .filter((ticket) => ticket.access === "FREE" && [3, 5, 10].includes(Number(ticket.targetOdds)))
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))
    .slice(0, max);
  return Promise.all(
    candidates.map(async (ticket) => {
      const selections = await getDocs(
        query(
          collection(firestore, "tickets", ticket.id, "selections"),
          orderBy("createdAt", "asc"),
        ),
      );
      return {
        ...ticket,
        selections: selections.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as PublicFreeTicket["selections"],
      };
    }),
  );
}

function timestampMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value) || 0;
  return 0;
}

async function listMatchesFrom(kickoffAt: string, max: number) {
  const snapshot = await getDocs(
    query(
      collection(firestore, "matches"),
      where("kickoffAt", ">=", kickoffAt),
      orderBy("kickoffAt", "asc"),
      limit(max),
    ),
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listUpcomingMatches(max = 150) {
  return listMatchesFrom(new Date().toISOString(), max);
}

const LIVE_MATCH_STATUSES = ["LIVE", "IN_PLAY", "1H", "HT", "2H", "ET", "BT", "P", "INT", "SUSP"];

export async function listCurrentAndUpcomingMatches(max = 150) {
  const [upcoming, liveSnapshot] = await Promise.all([
    listUpcomingMatches(max),
    getDocs(
      query(
        collection(firestore, "matches"),
        where("status", "in", LIVE_MATCH_STATUSES),
        limit(50),
      ),
    ),
  ]);
  const live = liveSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const unique = new Map([...live, ...upcoming].map((match) => [match.id, match]));
  return [...unique.values()].sort(
    (a, b) => new Date(String(a.kickoffAt)).getTime() - new Date(String(b.kickoffAt)).getTime(),
  );
}

export async function listMatches(max = 30) {
  const snapshot = await getDocs(
    query(collection(firestore, "matches"), orderBy("kickoffAt", "asc"), limit(max)),
  );
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getTicket(ticketId: string) {
  const ticket = await getDoc(doc(firestore, "tickets", ticketId));
  if (!ticket.exists()) return null;
  const data = ticket.data();
  const [selections, profile] = await Promise.all([
    getDocs(
      query(collection(firestore, "tickets", ticketId, "selections"), orderBy("createdAt", "asc")),
    ),
    getDoc(doc(firestore, "publicProfiles", String(data.creatorId))).catch(() => null),
  ]);
  const publicData = profile?.exists() ? profile.data() : {};
  return {
    id: ticket.id,
    ...data,
    creatorAccountVerified: publicData?.accountVerified === true,
    creatorWinRate: Number(publicData?.winRate ?? 0),
    creatorSettledTicketCount: Number(publicData?.settledTicketCount ?? 0),
    selections: selections.docs.map((item) => ({ id: item.id, ...item.data() })),
  };
}

export async function getUserProfile(uid: string) {
  const snapshot = await getDoc(doc(firestore, "users", uid));
  if (!snapshot.exists()) return null;
  const user = { id: snapshot.id, ...snapshot.data() } as UserProfileRecord;
  const publicRef = doc(firestore, "publicProfiles", uid);
  const publicSnapshot = await getDoc(publicRef);
  const publicData = {
    uid,
    username: user.username ?? `mzee_${String(user.phone ?? "").slice(-9)}`,
    displayName: user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
    photoURL: user.photoURL ?? null,
    accountVerified: false,
  };
  if (!publicSnapshot.exists()) {
    await setDoc(publicRef, {
      ...publicData,
      ticketCount: Number(user.ticketCount ?? 0),
      settledTicketCount: Number((user.wonCount ?? 0) + (user.lostCount ?? 0)),
      wonCount: Number(user.wonCount ?? 0),
      lostCount: Number(user.lostCount ?? 0),
      pendingCount: Number(user.pendingCount ?? 0),
      winRate: Number(user.winRate ?? 0),
      selectionWonCount: 0,
      selectionLostCount: 0,
      selectionWinRate: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else if (
    !publicSnapshot.data().username ||
    !publicSnapshot.data().displayName ||
    !Object.prototype.hasOwnProperty.call(publicSnapshot.data(), "accountVerified")
  ) {
    await setDoc(
      publicRef,
      {
        ...publicData,
        accountVerified: publicSnapshot.data().accountVerified === false ? false : true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  return user;
}

export async function toggleLike(ticketId: string, uid: string) {
  const reference = doc(firestore, "likes", `${ticketId}_${uid}`);
  const snapshot = await getDoc(reference);
  if (snapshot.exists()) {
    await deleteDoc(reference);
    return false;
  }
  await setDoc(reference, { ticketId, userId: uid, createdAt: serverTimestamp() });
  return true;
}

export async function toggleSave(ticketId: string, uid: string) {
  const reference = doc(firestore, "savedTickets", `${ticketId}_${uid}`);
  const snapshot = await getDoc(reference);
  if (snapshot.exists()) {
    await deleteDoc(reference);
    return false;
  }
  await setDoc(reference, { ticketId, userId: uid, createdAt: serverTimestamp() });
  return true;
}

export async function addComment(
  ticketId: string,
  authorId: string,
  authorName: string,
  text: string,
) {
  const cleanText = text.trim();
  const cleanAuthorName = authorName.trim().slice(0, 80);
  if (!cleanText) throw new Error("Andika comment kwanza.");
  if (cleanText.length > 1000) throw new Error("Comment haiwezi kuzidi herufi 1000.");
  if (!cleanAuthorName) throw new Error("Jina la mtumiaji halijapatikana.");
  return addDoc(collection(firestore, "comments"), {
    ticketId,
    authorId,
    authorName: cleanAuthorName,
    text: cleanText,
    createdAt: serverTimestamp(),
  });
}

export async function getTicketEngagement(ticketId: string, uid?: string) {
  const likesQuery = query(collection(firestore, "likes"), where("ticketId", "==", ticketId));
  const commentsQuery = query(collection(firestore, "comments"), where("ticketId", "==", ticketId));
  const [likes, comments, userLike] = await Promise.all([
    getCountFromServer(likesQuery),
    getCountFromServer(commentsQuery),
    uid ? getDoc(doc(firestore, "likes", `${ticketId}_${uid}`)) : Promise.resolve(null),
  ]);
  return {
    likeCount: likes.data().count,
    commentCount: comments.data().count,
    liked: userLike?.exists() ?? false,
  };
}

export async function listTicketComments(ticketId: string, max = 20) {
  const snapshot = await getDocs(
    query(collection(firestore, "comments"), where("ticketId", "==", ticketId), limit(100)),
  );
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }) as TicketComment)
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))
    .slice(0, max);
}

export async function followUser(followingId: string, followerId: string) {
  if (followingId === followerId) throw new Error("Huwezi kujifollow.");
  const reference = doc(firestore, "followers", `${followingId}_${followerId}`);
  const snapshot = await getDoc(reference);
  if (snapshot.exists()) {
    await deleteDoc(reference);
    return false;
  }
  await setDoc(reference, { followingId, followerId, createdAt: serverTimestamp() });
  return true;
}

export async function getPublicSiteContent() {
  const snapshot = await getDoc(doc(firestore, "publicSiteContent", "main"));
  return snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null;
}
