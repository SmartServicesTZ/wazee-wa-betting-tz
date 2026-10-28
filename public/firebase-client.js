import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCMWh-yKE13mQ-SRA3lDugpHXV1kuVMBK8",
  authDomain: "wazee-wa-betting-tz-e7183.firebaseapp.com",
  projectId: "wazee-wa-betting-tz-e7183",
  storageBucket: "wazee-wa-betting-tz-e7183.firebasestorage.app",
  messagingSenderId: "790161817035",
  appId: "1:790161817035:web:f217cebf1fca1dcb240a4e",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
let currentUser = null;
let currentProfile = null;
let selections = [];
let registering = false;

const escapeHtml = (value) =>
  String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);

function notify(message, type = "success") {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `position:fixed;right:20px;bottom:20px;z-index:50;background:${type === "error" ? "#6a2d27" : "#b8f34b"};color:${type === "error" ? "#fff" : "#071714"};padding:12px 16px;border-radius:8px;font:600 12px Manrope,sans-serif;box-shadow:0 10px 30px #0008`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function closeModal() {
  document.querySelectorAll(".firebase-modal").forEach((modal) => modal.remove());
}

function normalizeTzPhone(raw) {
  let digits = String(raw || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) digits = "255" + digits.slice(1);
  if (digits.startsWith("255")) return "+" + digits;
  if (digits.length >= 9 && digits.length <= 12) return "+255" + digits.slice(-9);
  throw new Error("Weka namba sahihi ya Tanzania, mfano 0712345678.");
}

async function savePhoneProfile(user, firstName, lastName, phone) {
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || user.displayName || "Mwanachama";
  const profileRef = doc(db, "users", user.uid);
  const old = await getDoc(profileRef);
  const oldData = old.exists() ? old.data() : {};
  const username = oldData.username || ("tz" + String(phone).replace(/\D/g, "").slice(-9));
  await updateProfile(user, { displayName });
  await setDoc(profileRef, {
    uid: user.uid, firstName: firstName || oldData.firstName || displayName.split(" ")[0],
    lastName: lastName || oldData.lastName || displayName.split(" ").slice(1).join(" "),
    displayName, phone: phone || user.phoneNumber || oldData.phone || "",
    username, role: oldData.role || "USER",
    followersCount: oldData.followersCount || 0, followingCount: oldData.followingCount || 0,
    ticketCount: oldData.ticketCount || 0, wonCount: oldData.wonCount || 0,
    lostCount: oldData.lostCount || 0, pendingCount: oldData.pendingCount || 0,
    winRate: oldData.winRate || 0, updatedAt: serverTimestamp(),
    ...(!old.exists() ? { createdAt: serverTimestamp() } : {})
  }, { merge: true });
  if (!(await getDoc(doc(db, "usernames", username))).exists()) {
    await setDoc(doc(db, "usernames", username), { uid: user.uid, username, createdAt: serverTimestamp() }, { merge: true });
  }
}

function phoneLoginEmail(raw) {
  const phone = normalizeTzPhone(raw);
  return phone.replace(/\D/g, "") + "@phone.wazeebetting.local";
}

function showAuthModal() {
  closeModal();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop firebase-modal";
  modal.innerHTML = `<div class="modal login-modal redesigned-auth-card" data-modal-panel>
    <button class="modal-close" data-close aria-label="Funga">×</button>
    <div class="login-mark">W</div>
    <span class="section-kicker">WAZEE WA BETTING TZ</span>
    <h2>${registering ? "Fungua akaunti" : "Karibu tena"}</h2>
    <p>${registering ? "Jaza taarifa tano tu kufungua akaunti." : "Ingia kwa namba yako ya simu na password."}</p>
    <form data-auth-form>
      ${registering ? '<div class="auth-name-grid"><label>Jina la kwanza<input data-first-name autocomplete="given-name" placeholder="Jina la kwanza" required /></label><label>Jina la mwisho<input data-last-name autocomplete="family-name" placeholder="Jina la mwisho" required /></label></div>' : ""}
      <label>Namba ya simu<input data-phone type="tel" autocomplete="tel" inputmode="tel" placeholder="0712 345 678" required /></label>
      <label>Password<span class="auth-password-wrap"><input data-password type="password" autocomplete="${registering ? "new-password" : "current-password"}" placeholder="Weka password" minlength="6" required /><button type="button" data-show-password aria-label="Onyesha password">Onyesha</button></span></label>
      ${registering ? '<label>Thibitisha password<input data-confirm-password type="password" autocomplete="new-password" placeholder="Rudia password" minlength="6" required /></label>' : '<p class="auth-forgot"><a href="https://wa.me/255698232313?text=Habari%2C%20nimesahau%20password%20ya%20akaunti%20yangu%20ya%20Wazee%20wa%20Betting%20TZ." target="_blank" rel="noopener noreferrer">Sahau password?</a></p>'}
      <p data-error class="modal-error" role="alert" style="display:none"></p>
      <button class="primary-button full auth-submit" type="submit" data-submit>${registering ? "Jisajili" : "Ingia"}</button>
    </form>
    <button class="link-button" data-toggle>${registering ? "Tayari una akaunti? Ingia" : "Huna akaunti? Jisajili"}</button>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close]")) closeModal();
    if (event.target.closest("[data-toggle]")) { registering = !registering; showAuthModal(); }
  });
  modal.querySelector("[data-show-password]").addEventListener("click", () => {
    const input = modal.querySelector("[data-password]");
    input.type = input.type === "password" ? "text" : "password";
    modal.querySelector("[data-show-password]").textContent = input.type === "password" ? "Onyesha" : "Ficha";
  });
  modal.querySelector("[data-auth-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = modal.querySelector("[data-error]");
    const submit = modal.querySelector("[data-submit]");
    error.style.display = "none";
    submit.disabled = true;
    try {
      const phone = normalizeTzPhone(modal.querySelector("[data-phone]").value);
      const password = modal.querySelector("[data-password]").value;
      if (password.length < 6) throw new Error("Password iwe na angalau herufi/tarakimu 6.");
      const email = phoneLoginEmail(phone);
      if (registering) {
        const firstName = modal.querySelector("[data-first-name]").value.trim();
        const lastName = modal.querySelector("[data-last-name]").value.trim();
        const confirm = modal.querySelector("[data-confirm-password]").value;
        if (!firstName || !lastName) throw new Error("Jaza jina la kwanza na jina la mwisho.");
        if (password !== confirm) throw new Error("Password hazifanani.");
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await savePhoneProfile(result.user, firstName, lastName, phone);
        closeModal();
        notify("Akaunti imetengenezwa kwa mafanikio.");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        closeModal();
        notify("Umeingia kwa mafanikio.");
      }
    } catch (err) {
      error.textContent = err?.code === "auth/email-already-in-use" ? "Namba hii tayari ina akaunti. Jaribu kuingia." :
        err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password" || err?.code === "auth/user-not-found" ? "Namba ya simu au password si sahihi." :
        err?.code === "auth/weak-password" ? "Password iwe na angalau herufi/tarakimu 6." :
        err?.message || "Imeshindikana. Jaribu tena.";
      error.style.display = "block";
    } finally { submit.disabled = false; }
  });
}
async function readDashboardData(uid, publicOnly = false) {
  const ticketQuery = publicOnly
    ? query(collection(db, "tickets"), where("creatorId", "==", uid), where("visibility", "==", "PUBLIC"))
    : query(collection(db, "tickets"), where("creatorId", "==", uid));
  const draftsRequest = publicOnly ? Promise.resolve({ docs: [] }) : getDocs(collection(db, "users", uid, "drafts"));
  const savedRequest = publicOnly ? Promise.resolve({ docs: [] }) : getDocs(query(collection(db, "savedTickets"), where("userId", "==", uid)));
  const [profileSnapshot, ticketsSnapshot, draftsSnapshot, savedSnapshot, followersSnapshot, followingSnapshot] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDocs(ticketQuery),
    draftsRequest,
    savedRequest,
    getDocs(query(collection(db, "followers"), where("followedId", "==", uid))),
    getDocs(query(collection(db, "followers"), where("followerId", "==", uid))),
  ]);
  const tickets = ticketsSnapshot.docs.map((ticket) => ({ id: ticket.id, ...ticket.data() }));
  const statuses = tickets.map((ticket) => String(ticket.status || "PENDING").toUpperCase());
  const won = statuses.filter((status) => status === "WON").length;
  const lost = statuses.filter((status) => status === "LOST").length;
  const pending = statuses.filter((status) => !["WON", "LOST"].includes(status)).length;
  return {
    profile: profileSnapshot.exists() ? profileSnapshot.data() : {},
    tickets,
    drafts: draftsSnapshot.docs.map((draft) => ({ id: draft.id, ...draft.data() })),
    saved: savedSnapshot.docs.map((ticket) => ({ id: ticket.id, ...ticket.data() })),
    won,
    lost,
    pending,
    winRate: won + lost ? `${Math.round((won / (won + lost)) * 100)}%` : "—",
    followers: followersSnapshot.size,
    following: followingSnapshot.size,
  };
}

function statMarkup(label, value) {
  return `<div class="stat-card"><div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div></div>`;
}

async function showDashboardModal() {
  if (!currentUser) return showAuthModal();
  closeModal();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop firebase-modal";
  modal.innerHTML = '<div class="modal" data-modal-panel><p>Inapakia dashboard...</p></div>';
  document.body.appendChild(modal);
  try {
    const data = await readDashboardData(currentUser.uid);
    currentProfile = data.profile;
    const profile = data.profile;
    modal.querySelector("[data-modal-panel]").innerHTML = `<div class="modal-head"><div><span class="section-kicker">USER DASHBOARD</span><h2>${escapeHtml(profile.displayName || currentUser.email || "Mwanachama")}</h2><p>@${escapeHtml(profile.username || "username")} · ${escapeHtml(profile.role || "USER")}</p></div><button data-close>×</button></div>
      <div class="dashboard-stats">${statMarkup("Tickets", data.tickets.length)}${statMarkup("Won", data.won)}${statMarkup("Lost", data.lost)}${statMarkup("Pending", data.pending)}${statMarkup("Win rate", data.winRate)}${statMarkup("Followers", data.followers)}${statMarkup("Following", data.following)}</div>
      <div class="dashboard-actions"><button class="primary-button" data-create-ticket>Create Ticket</button><button class="ghost-button" data-public-profile>Public profile</button><button class="ghost-button" data-logout>Logout</button></div>
      <div class="dashboard-section"><span class="section-kicker">PROFILE</span><div class="profile-fields"><label>First name<input data-first-name value="${escapeHtml(profile.firstName || "")}" /></label><label>Last name<input data-last-name value="${escapeHtml(profile.lastName || "")}" /></label><label>Username<input value="${escapeHtml(profile.username || "")}" disabled /></label><label>Email<input value="${escapeHtml(profile.email || currentUser.email || "")}" disabled /></label><label>Phone<input data-phone value="${escapeHtml(profile.phone || "")}" /></label><label>Bio<input data-bio value="${escapeHtml(profile.bio || "")}" /></label></div><button class="ghost-button full" data-save-profile>Save profile</button></div>
      <div class="dashboard-section"><span class="section-kicker">MY TICKETS</span><div data-ticket-list>${data.tickets.length ? data.tickets.map((ticket) => `<div class="selection-row"><span>${escapeHtml(ticket.title || "Untitled ticket")}</span><b>${escapeHtml(ticket.status || "PENDING")}</b></div>`).join("") : '<div class="empty-slip">Bado hujapublish ticket yoyote.</div>'}</div></div>
      <div class="dashboard-section"><span class="section-kicker">SAVED TICKETS</span><div>${data.saved.length ? data.saved.map((ticket) => `<div class="selection-row"><span>${escapeHtml(ticket.title || ticket.ticketId || "Saved ticket")}</span></div>`).join("") : '<div class="empty-slip">Hakuna saved tickets bado.</div>'}</div></div>
      <label style="text-align:left">Profile image<input data-avatar type="file" accept="image/*" /></label><button class="ghost-button full" data-upload>Upload picha</button>`;
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close]")) closeModal();
    });
    modal.querySelector("[data-logout]").addEventListener("click", async () => { await signOut(auth); closeModal(); notify("Umetoka kwenye akaunti."); });
    modal.querySelector("[data-create-ticket]").addEventListener("click", showDraftModal);
    modal.querySelector("[data-public-profile]").addEventListener("click", () => { if (profile.username) location.href = `?profile=${encodeURIComponent(profile.username)}`; else notify("Username haijawekwa.", "error"); });
    modal.querySelector("[data-save-profile]").addEventListener("click", async () => {
      const firstName = modal.querySelector("[data-first-name]").value.trim();
      const lastName = modal.querySelector("[data-last-name]").value.trim();
      const phone = modal.querySelector("[data-phone]").value.trim();
      const bio = modal.querySelector("[data-bio]").value.trim();
      if (!firstName || !lastName) return notify("First name na last name zinahitajika.", "error");
      try { await updateDoc(doc(db, "users", currentUser.uid), { firstName, lastName, phone, bio, displayName: `${firstName} ${lastName}`, updatedAt: serverTimestamp() }); await updateProfile(currentUser, { displayName: `${firstName} ${lastName}` }); currentProfile = { ...currentProfile, firstName, lastName, phone, bio, displayName: `${firstName} ${lastName}` }; notify("Profile imehifadhiwa."); } catch (profileError) { notify(profileError?.message || "Profile haijahifadhiwa.", "error"); }
    });
    modal.querySelector("[data-upload]").addEventListener("click", async () => {
      const file = modal.querySelector("[data-avatar]").files[0];
      if (!file) return notify("Chagua picha kwanza.", "error");
      if (file.size > 5 * 1024 * 1024) return notify("Picha iwe chini ya 5 MB.", "error");
      try { const imageRef = ref(storage, `users/${currentUser.uid}/avatar-${Date.now()}-${file.name}`); await uploadBytes(imageRef, file, { contentType: file.type }); const photoURL = await getDownloadURL(imageRef); await updateDoc(doc(db, "users", currentUser.uid), { photoURL, updatedAt: serverTimestamp() }); currentProfile = { ...currentProfile, photoURL }; notify("Profile image imehifadhiwa."); } catch (storageError) { notify(storageError?.message || "Upload imeshindikana.", "error"); }
    });
  } catch (dashboardError) {
    modal.querySelector("[data-modal-panel]").innerHTML = `<div class="modal-head"><h2>Dashboard haijapatikana</h2><button data-close>×</button></div><p class="modal-error">${escapeHtml(dashboardError?.message || "Jaribu tena baadaye.")}</p>`;
    modal.querySelector("[data-close]").addEventListener("click", closeModal);
  }
}

async function showPublicProfile(username) {
  closeModal();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop firebase-modal";
  modal.innerHTML = '<div class="modal" data-modal-panel><p>Inapakia profile...</p></div>';
  document.body.appendChild(modal);
  try {
    const usernameSnapshot = await getDoc(doc(db, "usernames", username.toLowerCase()));
    if (!usernameSnapshot.exists()) throw new Error("Profile hii haikupatikana.");
    const uid = usernameSnapshot.data().uid;
    const data = await readDashboardData(uid, true);
    const profile = data.profile;
    const followId = currentUser ? `${currentUser.uid}_${uid}` : null;
    const alreadyFollowing = followId ? (await getDoc(doc(db, "followers", followId))).exists() : false;
    modal.querySelector("[data-modal-panel]").innerHTML = `<div class="modal-head"><div><span class="section-kicker">PUBLIC PROFILE</span><h2>${escapeHtml(profile.displayName || `@${username}`)}</h2><p>@${escapeHtml(profile.username || username)}</p></div><button data-close>×</button></div><p>${escapeHtml(profile.bio || "Mwanachama wa Wazee wa Betting TZ.")}</p><div class="dashboard-stats">${statMarkup("Tickets", data.tickets.length)}${statMarkup("Won", data.won)}${statMarkup("Lost", data.lost)}${statMarkup("Pending", data.pending)}${statMarkup("Win rate", data.winRate)}${statMarkup("Followers", data.followers)}${statMarkup("Following", data.following)}</div><button class="primary-button full" data-follow>${alreadyFollowing ? "Unfollow" : "Follow"}</button><div class="dashboard-section"><span class="section-kicker">MY TICKETS</span><div>${data.tickets.length ? data.tickets.map((ticket) => `<div class="selection-row"><span>${escapeHtml(ticket.title || "Untitled ticket")}</span><b>${escapeHtml(ticket.status || "PENDING")}</b></div>`).join("") : '<div class="empty-slip">Hakuna public tickets bado.</div>'}</div></div>`;
    modal.addEventListener("click", (event) => { if (event.target === modal || event.target.closest("[data-close]")) closeModal(); });
    modal.querySelector("[data-follow]").addEventListener("click", async () => {
      if (!currentUser) return showAuthModal();
      try {
        if (alreadyFollowing) await deleteDoc(doc(db, "followers", followId));
        else await setDoc(doc(db, "followers", followId), { followerId: currentUser.uid, followedId: uid, createdAt: serverTimestamp() });
        notify(alreadyFollowing ? "Umeacha kufollow." : "Umeanza kufollow creator.");
        await showPublicProfile(username);
      } catch (followError) { notify(followError?.message || "Follow action imeshindikana.", "error"); }
    });
  } catch (profileError) {
    modal.querySelector("[data-modal-panel]").innerHTML = `<div class="modal-head"><h2>Profile haijapatikana</h2><button data-close>×</button></div><p class="modal-error">${escapeHtml(profileError?.message || "Jaribu tena baadaye.")}</p>`;
    modal.querySelector("[data-close]").addEventListener("click", closeModal);
  }
}

function showDraftModal() {
  closeModal();
  if (!currentUser) {
    notify("Ingia kwanza ili kuhifadhi mkeka kwenye Firestore.", "error");
    showAuthModal();
    return;
  }
  const modal = document.createElement("div");
  modal.className = "modal-backdrop firebase-modal";
  modal.innerHTML = `<div class="modal" data-modal-panel>
    <div class="modal-head"><div><span class="section-kicker">TICKET BUILDER</span><h2>Hifadhi mkeka</h2></div><button data-close>×</button></div>
    <label>Kichwa cha mkeka<input data-title placeholder="Weekend ya uhakika" /></label>
    <div class="modal-selections"><div class="label-row"><b>Selections</b><span>${selections.length} zimechaguliwa</span></div>
      ${selections.length ? selections.map((selection) => `<div class="selection-row"><span>${escapeHtml(selection)}</span><b>1.65</b></div>`).join("") : '<div class="empty-slip">Chagua mechi au pick kwenye ukurasa.</div>'}
    </div>
    <button class="primary-button full" data-save>Hifadhi draft kwenye Firestore</button>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close]")) closeModal();
  });
  modal.querySelector("[data-save]").addEventListener("click", async () => {
    try {
      await addDoc(collection(db, "users", currentUser.uid, "drafts"), {
        title: modal.querySelector("[data-title]").value.trim() || "Mkeka mpya",
        selections,
        totalOdds: Number((selections.length ? 1.65 ** selections.length : 1).toFixed(2)),
        status: "DRAFT",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      closeModal();
      notify("Mkeka umehifadhiwa kwenye Firestore.");
    } catch (firestoreError) {
      notify(firestoreError?.message || "Imeshindikana kuhifadhi draft.", "error");
    }
  });
}


function wireAuthRoute() {
  const path = location.pathname.replace(/\/+$/, "").toLowerCase();
  const isRegister = path.endsWith("/register");
  const isLogin = path.endsWith("/login");
  if (!isRegister && !isLogin) return false;
  document.body.innerHTML = `
    <main class="auth-page redesigned-auth-page">
      <section class="auth-card redesigned-auth-card">
        <a href="/wazee-wa-betting-tz/" class="brand"><span class="brand-mark">W</span><span><b>WAZEE WA</b><small>BETTING TZ</small></span></a>
        <span class="eyebrow">JAMII YA WAZEE WA BETTING TZ</span>
        <h1>${isRegister ? "Fungua akaunti" : "Karibu tena"}</h1>
        <p>${isRegister ? "Jaza taarifa tano tu kufungua akaunti." : "Ingia kwa namba yako ya simu na password."}</p>
        <form data-auth-form>
          ${isRegister ? '<div class="auth-name-grid"><label>Jina la kwanza<input data-first required autocomplete="given-name" placeholder="Jina la kwanza" /></label><label>Jina la mwisho<input data-last required autocomplete="family-name" placeholder="Jina la mwisho" /></label></div>' : ""}
          <label>Namba ya simu<input data-phone required type="tel" autocomplete="tel" inputmode="tel" placeholder="0712 345 678" /></label>
          <label>Password<span class="auth-password-wrap"><input data-password required type="password" minlength="6" autocomplete="${isRegister ? "new-password" : "current-password"}" placeholder="Weka password" /><button type="button" data-show-password>Onyesha</button></span></label>
          ${isRegister ? '<label>Thibitisha password<input data-confirm-password required type="password" minlength="6" autocomplete="new-password" placeholder="Rudia password" /></label>' : '<p class="auth-forgot"><a href="https://wa.me/255698232313?text=Habari%2C%20nimesahau%20password%20ya%20akaunti%20yangu%20ya%20Wazee%20wa%20Betting%20TZ." target="_blank" rel="noopener noreferrer">Sahau password?</a></p>'}
          <p data-auth-error role="alert" class="auth-error" hidden></p>
          <button class="btn btn-primary full auth-submit" type="submit" data-submit>${isRegister ? "Jisajili" : "Ingia"}</button>
        </form>
        <p class="auth-footer">${isRegister ? 'Tayari una akaunti? <a href="/wazee-wa-betting-tz/login">Ingia</a>' : 'Huna akaunti? <a href="/wazee-wa-betting-tz/register">Jisajili</a>'}</p>
        <p class="auth-footer"><a href="/wazee-wa-betting-tz/">← Rudi mwanzo</a></p>
      </section>
    </main>`;
  const form = document.querySelector("[data-auth-form]");
  const errorBox = document.querySelector("[data-auth-error]");
  const submit = document.querySelector("[data-submit]");
  const showError = (message) => { errorBox.textContent = message; errorBox.hidden = false; };
  document.querySelector("[data-show-password]").addEventListener("click", () => {
    const input = document.querySelector("[data-password]");
    input.type = input.type === "password" ? "text" : "password";
    document.querySelector("[data-show-password]").textContent = input.type === "password" ? "Onyesha" : "Ficha";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    submit.disabled = true;
    try {
      const phone = normalizeTzPhone(form.querySelector("[data-phone]").value);
      const password = form.querySelector("[data-password]").value;
      if (password.length < 6) throw new Error("Password iwe na angalau herufi/tarakimu 6.");
      const email = phoneLoginEmail(phone);
      if (isRegister) {
        const firstName = form.querySelector("[data-first]").value.trim();
        const lastName = form.querySelector("[data-last]").value.trim();
        const confirm = form.querySelector("[data-confirm-password]").value;
        if (!firstName || !lastName) throw new Error("Jaza jina la kwanza na jina la mwisho.");
        if (password !== confirm) throw new Error("Password hazifanani.");
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await savePhoneProfile(result.user, firstName, lastName, phone);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      location.href = "/wazee-wa-betting-tz/";
    } catch (err) {
      showError(err?.code === "auth/email-already-in-use" ? "Namba hii tayari ina akaunti. Jaribu kuingia." :
        err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password" || err?.code === "auth/user-not-found" ? "Namba ya simu au password si sahihi." :
        err?.code === "auth/weak-password" ? "Password iwe na angalau herufi/tarakimu 6." :
        err?.message || "Imeshindikana. Jaribu tena.");
    } finally { submit.disabled = false; }
  });
  return true;
}
function wirePage() {
  document.querySelectorAll(".profile-button").forEach((button) => button.addEventListener("click", () => currentUser ? showDashboardModal() : showAuthModal()));
  document.querySelectorAll(".primary-button").forEach((button) => {
    if (button.closest(".modal")) return;
    button.addEventListener("click", showDraftModal);
  });
  document.querySelectorAll(".match-card, .picks button").forEach((button) => button.addEventListener("click", () => {
    const label = button.textContent.replace(/\s+/g, " ").trim().replace(/\+ ongeza$/, "");
    if (!selections.includes(label)) selections.push(label);
    notify("Selection imeongezwa kwenye mkeka.");
  }));
  const profileUsername = new URLSearchParams(location.search).get("profile");
  if (profileUsername) showPublicProfile(profileUsername);
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  currentProfile = null;
  if (user) getDoc(doc(db, "users", user.uid)).then((snapshot) => { currentProfile = snapshot.exists() ? snapshot.data() : null; });
  document.querySelectorAll(".profile-button").forEach((button) => {
    const copy = button.querySelector(".profile-copy");
    if (copy) {
      copy.querySelector("b").textContent = user?.displayName || "Karibu";
      copy.querySelector("small").textContent = user ? "Akaunti yangu" : "Ingia / Jisajili";
    }
  });
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { if (!wireAuthRoute()) wirePage(); });
else if (!wireAuthRoute()) wirePage();
