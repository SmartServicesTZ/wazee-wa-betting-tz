import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  await setDoc(
    doc(firestore, "publicProfiles", input.uid),
    {
      uid: input.uid,
      username: input.username,
      displayName: input.displayName,
      photoURL: input.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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
  const snap = await getDocs(
    query(collection(firestore, "tickets"), where("visibility", "==", "PUBLIC"), limit(max)),
  );
  return snap.docs.map((item) => ({ id: item.id, ...item.data() })) as PublicTicket[];
}
export async function listMatches(max = 30) {
  const snap = await getDocs(
    query(collection(firestore, "matches"), orderBy("kickoffAt", "asc"), limit(max)),
  );
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}
export async function getTicket(ticketId: string) {
  const ticket = await getDoc(doc(firestore, "tickets", ticketId));
  if (!ticket.exists()) return null;
  const selections = await getDocs(
    query(collection(firestore, "tickets", ticketId, "selections"), orderBy("createdAt", "asc")),
  );
  return {
    id: ticket.id,
    ...ticket.data(),
    selections: selections.docs.map((item) => ({ id: item.id, ...item.data() })),
  };
}
export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(firestore, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function toggleLike(ticketId: string, uid: string) {
  const ref = doc(firestore, "likes", ticketId + "_" + uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { ticketId, userId: uid, createdAt: serverTimestamp() });
  return true;
}
export async function toggleSave(ticketId: string, uid: string) {
  const ref = doc(firestore, "savedTickets", ticketId + "_" + uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { ticketId, userId: uid, createdAt: serverTimestamp() });
  return true;
}
export async function addComment(
  ticketId: string,
  authorId: string,
  authorName: string,
  text: string,
) {
  if (!text.trim()) throw new Error("Andika comment kwanza.");
  return addDoc(collection(firestore, "comments"), {
    ticketId,
    authorId,
    authorName,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}
export async function followUser(followingId: string, followerId: string) {
  if (followingId === followerId) throw new Error("Huwezi kujifollow.");
  const ref = doc(firestore, "followers", followingId + "_" + followerId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { followingId, followerId, createdAt: serverTimestamp() });
  return true;
}

export async function getPublicSiteContent() {
  const snap = await getDoc(doc(firestore, "publicSiteContent", "main"));
  return snap.exists() ? snap.data() : null;
}
