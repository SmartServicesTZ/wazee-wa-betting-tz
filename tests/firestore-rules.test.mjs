import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const projectId = "demo-wazee-rules";
let testEnv;

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

test("a signed-in user can create their own USER profile", async () => {
  const db = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(
    setDoc(doc(db, "users/alice"), {
      uid: "alice",
      role: "USER",
      email: "alice@example.invalid",
    }),
  );
});

test("a signed-in user cannot create a profile with an admin role", async () => {
  const db = testEnv.authenticatedContext("alice").firestore();
  await assertFails(
    setDoc(doc(db, "users/alice"), {
      uid: "alice",
      role: "ADMIN",
    }),
  );
});

test("a user cannot change their existing role to admin", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), {
      uid: "alice",
      role: "USER",
    });
  });

  const db = testEnv.authenticatedContext("alice").firestore();
  await assertFails(
    setDoc(doc(db, "users/alice"), { uid: "alice", role: "ADMIN" }, { merge: true }),
  );
});

test("public tickets are readable while private tickets are owner-only", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "tickets/public-ticket"), {
      creatorId: "alice",
      visibility: "PUBLIC",
      status: "PENDING",
      totalOdds: 2.4,
    });
    await setDoc(doc(db, "tickets/private-ticket"), {
      creatorId: "alice",
      visibility: "PRIVATE",
      status: "PENDING",
      totalOdds: 2.4,
    });
  });

  const bobDb = testEnv.authenticatedContext("bob").firestore();
  const aliceDb = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(getDoc(doc(bobDb, "tickets/public-ticket")));
  await assertFails(getDoc(doc(bobDb, "tickets/private-ticket")));
  await assertSucceeds(getDoc(doc(aliceDb, "tickets/private-ticket")));
});

test("private ticket selections inherit the parent ticket visibility", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "tickets/private-ticket"), {
      creatorId: "alice",
      visibility: "PRIVATE",
      status: "PENDING",
      totalOdds: 2.4,
    });
    await setDoc(doc(db, "tickets/private-ticket/selections/1"), {
      prediction: "Home",
      odds: 2.4,
    });
  });

  const bobDb = testEnv.authenticatedContext("bob").firestore();
  const aliceDb = testEnv.authenticatedContext("alice").firestore();
  await assertFails(getDoc(doc(bobDb, "tickets/private-ticket/selections/1")));
  await assertSucceeds(getDoc(doc(aliceDb, "tickets/private-ticket/selections/1")));
});
