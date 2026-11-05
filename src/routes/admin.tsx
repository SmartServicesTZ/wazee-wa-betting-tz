import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Flag,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Trophy,
  Unlock,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { toast } from "sonner";
import { AppShell } from "../components/app-shell";
import {
  adminDashboard,
  adminCreateTicket,
  adminGenerateAutoTicket,
  adminMatchData,
  adminSetAutoConfig,
  adminSetUserRole,
  adminSetUserStatus,
  firestore,
  logout,
  runAdminSync,
  subscribeToAuth,
  type AdminDashboardData,
  type AdminMatch,
  type AutoConfig,
  type AdminUser,
} from "../lib/firebase";
import { getUserProfile } from "../lib/firestore";

export const Route = createFileRoute("/admin")({ component: Admin });
type Section = "overview" | "users" | "tickets" | "matches" | "reports" | "payments" | "logs";
type Row = { id: string; [key: string]: unknown };
const sections: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Muhtasari", icon: LayoutDashboard },
  { id: "users", label: "Watumiaji", icon: Users },
  { id: "tickets", label: "Tiketi", icon: Ticket },
  { id: "matches", label: "Mechi / Odds", icon: CalendarDays },
  { id: "reports", label: "Ripoti", icon: Flag },
  { id: "payments", label: "Malipo", icon: CreditCard },
  { id: "logs", label: "API / Logs", icon: Activity },
];
const fmt = (value: unknown) => {
  if (!value) return "—";
  if (typeof value === "object" && value !== null && "toDate" in value)
    return (value as { toDate: () => Date }).toDate().toLocaleString("sw-TZ");
  return String(value);
};
const initials = (value: string) => value.trim().slice(0, 1).toUpperCase() || "U";

function Admin() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [reports, setReports] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [logs, setLogs] = useState<Row[]>([]);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [autoConfig, setAutoConfig] = useState<AutoConfig | null>(null);
  const [autoLogs, setAutoLogs] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedUserTickets, setSelectedUserTickets] = useState<Row[]>([]);
  useEffect(() => subscribeToAuth(setUser), []);
  useEffect(() => {
    if (user)
      getUserProfile(user.uid).then((value) => setProfile(value as Record<string, unknown> | null));
  }, [user]);
  useEffect(() => {
    if (!selectedUser) {
      setSelectedUserTickets([]);
      return;
    }
    getDocs(
      query(
        collection(firestore, "tickets"),
        where("creatorId", "==", selectedUser.uid),
        limit(20),
      ),
    )
      .then((snapshot) =>
        setSelectedUserTickets(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      )
      .catch(() => setSelectedUserTickets([]));
  }, [selectedUser]);
  const isAdmin = profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";
  const isSuperAdmin = profile?.role === "SUPER_ADMIN";
  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [summary, ticketSnap, reportSnap, paymentSnap, logSnap, matchData] = await Promise.all([
        adminDashboard(),
        getDocs(query(collection(firestore, "tickets"), orderBy("createdAt", "desc"), limit(100))),
        getDocs(query(collection(firestore, "reports"), orderBy("createdAt", "desc"), limit(100))),
        getDocs(query(collection(firestore, "payments"), orderBy("createdAt", "desc"), limit(100))),
        getDocs(query(collection(firestore, "api_logs"), orderBy("createdAt", "desc"), limit(30))),
        adminMatchData(),
      ]);
      setData(summary);
      setTickets(ticketSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setReports(reportSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setPayments(paymentSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLogs(logSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setMatches(matchData.matches);
      setAutoConfig(matchData.autoConfig);
      setAutoLogs(matchData.logs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kupakia dashboard.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);
  useEffect(() => void load(), [load]);
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.users ?? []).filter(
      (item) =>
        !term ||
        [item.displayName, item.firstName, item.lastName, item.phone, item.email, item.username]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
    );
  }, [data?.users, search]);
  if (!user)
    return (
      <AccessState>
        <b>Ingia kwa akaunti yenye ruhusa ya Admin.</b>
        <Link className="btn btn-primary" to="/login">
          Ingia
        </Link>
      </AccessState>
    );
  if (profile === null)
    return (
      <AccessState user={user}>
        <b>Inapakia profile ya Admin...</b>
      </AccessState>
    );
  if (!isAdmin)
    return (
      <AccessState user={user}>
        <ShieldAlert size={28} />
        <b>Huna ruhusa ya Admin.</b>
        <span>Dashboard hii inalindwa na role ya ADMIN au SUPER_ADMIN.</span>
        <Link to="/dashboard">Rudi dashboard yako</Link>
      </AccessState>
    );
  const changeStatus = async (target: AdminUser) => {
    setBusy(true);
    try {
      const disabled = !target.disabled;
      await adminSetUserStatus(target.uid, disabled);
      setData((current) =>
        current
          ? {
              ...current,
              users: current.users.map((item) =>
                item.uid === target.uid ? { ...item, disabled } : item,
              ),
            }
          : current,
      );
      setSelectedUser((current) =>
        current?.uid === target.uid ? { ...current, disabled } : current,
      );
      toast.success(disabled ? "Akaunti imezuiwa." : "Akaunti imefunguliwa.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Imeshindikana kubadilisha hali ya akaunti.",
      );
    } finally {
      setBusy(false);
    }
  };
  const changeRole = async (target: AdminUser) => {
    if (!isSuperAdmin || target.uid === user.uid || target.role === "SUPER_ADMIN") return;
    setBusy(true);
    try {
      const role = target.role === "ADMIN" ? "USER" : "ADMIN";
      await adminSetUserRole(target.uid, role);
      setData((current) =>
        current
          ? {
              ...current,
              users: current.users.map((item) =>
                item.uid === target.uid ? { ...item, role } : item,
              ),
            }
          : current,
      );
      setSelectedUser((current) => (current?.uid === target.uid ? { ...current, role } : current));
      toast.success(`Role imebadilishwa kuwa ${role}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kubadilisha role.");
    } finally {
      setBusy(false);
    }
  };
  const sync = async () => {
    setBusy(true);
    try {
      const result = await runAdminSync();
      toast.success(`Sync: ${result.count} mechi, ${result.settled} tiketi zimesettle.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync imeshindikana.");
    } finally {
      setBusy(false);
    }
  };
  const toggleTicket = async (ticket: Row) => {
    const visibility = ticket.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC";
    try {
      await updateDoc(doc(firestore, "tickets", ticket.id), { visibility, updatedAt: new Date() });
      setTickets((items) =>
        items.map((item) => (item.id === ticket.id ? { ...item, visibility } : item)),
      );
      toast.success(visibility === "PUBLIC" ? "Tiketi imeonyeshwa." : "Tiketi imefichwa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kubadilisha tiketi.");
    }
  };
  const removeTicket = async (ticket: Row) => {
    if (!window.confirm("Una uhakika unataka kufuta tiketi hii?")) return;
    try {
      await deleteDoc(doc(firestore, "tickets", ticket.id));
      setTickets((items) => items.filter((item) => item.id !== ticket.id));
      toast.success("Tiketi imefutwa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kufuta tiketi.");
    }
  };
  const editTicket = async (ticket: Row) => {
    const title = window.prompt("Jina jipya la tiketi", String(ticket.title ?? ""));
    if (!title?.trim()) return;
    try {
      await updateDoc(doc(firestore, "tickets", ticket.id), {
        title: title.trim(),
        updatedAt: new Date(),
      });
      setTickets((items) =>
        items.map((item) => (item.id === ticket.id ? { ...item, title: title.trim() } : item)),
      );
      toast.success("Tiketi imehaririwa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kuhariri tiketi.");
    }
  };
  return (
    <AppShell user={user}>
      <div className="admin-layout">
        <aside className={`admin-sidebar ${mobileOpen ? "is-open" : ""}`}>
          <div className="admin-sidebar-head">
            <div>
              <span className="admin-kicker">WAZEE WA</span>
              <b>CONTROL ROOM</b>
            </div>
            <button className="admin-close" onClick={() => setMobileOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="admin-profile">
            <div className="admin-avatar">
              {initials(String(profile?.displayName ?? user.displayName ?? "Admin"))}
            </div>
            <div>
              <b>{String(profile?.displayName ?? user.displayName ?? "Admin")}</b>
              <span>{String(profile?.role ?? "ADMIN")}</span>
            </div>
          </div>
          <nav className="admin-sidebar-nav">
            {sections.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={section === item.id ? "active" : ""}
                  onClick={() => {
                    setSection(item.id);
                    setMobileOpen(false);
                  }}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {item.id === "reports" && reports.length > 0 && <em>{reports.length}</em>}
                </button>
              );
            })}
          </nav>
          <div className="admin-sidebar-foot">
            <Link to="/">
              <ChevronRight size={15} /> Tazama website
            </Link>
            <button onClick={() => void logout()}>
              <LogOut size={15} /> Toka
            </button>
          </div>
        </aside>
        {mobileOpen && (
          <button
            className="admin-backdrop"
            aria-label="Funga menu"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <main className="admin-main">
          <header className="admin-topbar">
            <button className="admin-menu" onClick={() => setMobileOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <span className="admin-kicker">ADMINISTRATION / {section.toUpperCase()}</span>
              <h1>{sections.find((item) => item.id === section)?.label}</h1>
            </div>
            <div className="admin-top-actions">
              <button
                className="admin-icon-button"
                onClick={() => void load()}
                disabled={loading}
                title="Pakia upya"
              >
                <RefreshCw size={17} className={loading ? "spin" : ""} />
              </button>
              <button className="admin-sync" onClick={() => void sync()} disabled={busy}>
                <Activity size={16} /> {busy ? "Inafanya..." : "Sync data"}
              </button>
            </div>
          </header>
          {loading && (
            <div className="admin-loading">
              <span /> Inapakia data halisi kutoka Firebase...
            </div>
          )}
          {section === "overview" && (
            <Overview data={data} payments={payments} onUsers={() => setSection("users")} />
          )}
          {section === "users" && (
            <UsersSection
              users={filteredUsers}
              query={search}
              setQuery={setSearch}
              onSelect={setSelectedUser}
            />
          )}
          {section === "tickets" && (
            <TicketsSection
              tickets={tickets}
              matches={matches}
              onToggle={toggleTicket}
              onDelete={removeTicket}
              onEdit={editTicket}
              onCreated={load}
            />
          )}
          {section === "matches" && autoConfig && (
            <MatchesSection
              matches={matches}
              config={autoConfig}
              logs={autoLogs}
              onConfig={async (next) => {
                try {
                  const result = await adminSetAutoConfig(next);
                  setAutoConfig(result.config);
                  toast.success("Mipangilio ya automatic tickets imehifadhiwa.");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Imeshindikana kuhifadhi config.",
                  );
                }
              }}
              onGenerate={async () => {
                try {
                  const result = await adminGenerateAutoTicket();
                  if (result.created)
                    toast.success(`Automatic ticket imetengenezwa: ${result.selections} mechi.`);
                  else
                    toast.info(
                      `Hakuna ticket iliyotengenezwa: ${result.reason ?? "hakuna qualifying data"}.`,
                    );
                  await load();
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Automatic ticket imeshindikana.",
                  );
                }
              }}
            />
          )}
          {section === "reports" && (
            <ReportsSection reports={reports} onExport={() => exportRows("reports.csv", reports)} />
          )}
          {section === "payments" && (
            <RowsSection
              title="Malipo na subscriptions"
              rows={payments}
              empty="Hakuna rekodi za malipo."
              render={(row) => (
                <>
                  <b>{String(row.provider ?? row.method ?? "Malipo")}</b>
                  <small>
                    {String(row.status ?? "—")} · {String(row.amount ?? "—")}{" "}
                    {String(row.currency ?? "TZS")}
                  </small>
                  <span>
                    {String(row.userId ?? "Mtumiaji hajatajwa")} · {fmt(row.createdAt)}
                  </span>
                </>
              )}
            />
          )}
          {section === "logs" && (
            <RowsSection
              title="API na system logs"
              rows={logs}
              empty="Hakuna logs zilizopatikana."
              render={(row) => (
                <>
                  <b>{String(row.type ?? "Tukio")}</b>
                  <small className={row.ok === false ? "danger-text" : "success-text"}>
                    {row.ok === false ? "FAILED" : "OK"}
                  </small>
                  <span>{String(row.error ?? fmt(row.createdAt))}</span>
                </>
              )}
            />
          )}
        </main>
        {selectedUser && (
          <UserDrawer
            user={selectedUser}
            tickets={selectedUserTickets}
            busy={busy}
            canManage={
              isSuperAdmin && selectedUser.uid !== user.uid && selectedUser.role !== "SUPER_ADMIN"
            }
            onClose={() => setSelectedUser(null)}
            onStatus={() => void changeStatus(selectedUser)}
            onRole={() => void changeRole(selectedUser)}
          />
        )}
      </div>
    </AppShell>
  );
}
function AccessState({ children, user }: { children: ReactNode; user?: User }) {
  return (
    <AppShell user={user}>
      <div className="page narrow">
        <div className="empty">{children}</div>
      </div>
    </AppShell>
  );
}
function Overview({
  data,
  payments,
  onUsers,
}: {
  data: AdminDashboardData | null;
  payments: Row[];
  onUsers: () => void;
}) {
  if (!data)
    return (
      <div className="admin-empty">
        <Activity size={24} />
        <b>Hakuna summary iliyopatikana.</b>
        <span>Bonyeza refresh ujaribu tena.</span>
      </div>
    );
  const cards = [
    ["Watumiaji", data.metrics.users, Users, "blue"],
    ["Active users", data.metrics.activeUsers, CheckCircle2, "green"],
    ["Tiketi zote", data.metrics.tickets, Ticket, "purple"],
    ["Mechi", data.metrics.matches, Trophy, "gold"],
    ["WIN", data.metrics.won, Trophy, "green"],
    ["LOST", data.metrics.lost, Flag, "red"],
    ["Zinasubiri", data.metrics.pending, Activity, "gold"],
    [
      "Mapato",
      data.metrics.revenue ? `${data.metrics.revenue.toLocaleString()} TZS` : "—",
      CreditCard,
      "purple",
    ],
  ] as const;
  return (
    <div className="admin-content">
      <div className="admin-welcome">
        <div>
          <span className="admin-kicker">LIVE OPERATIONS</span>
          <h2>Karibu kwenye control room.</h2>
          <p>Snapshot ya data iliyopo sasa kwenye Firebase. Hakuna takwimu zilizobuniwa.</p>
        </div>
        <button className="admin-outline" onClick={onUsers}>
          <Users size={16} /> Simamia users
        </button>
      </div>
      <div className="admin-stat-grid">
        {cards.map(([label, value, Icon, tone]) => (
          <div className={`admin-stat ${tone}`} key={label}>
            <div className="admin-stat-icon">
              <Icon size={18} />
            </div>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="admin-columns">
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <span className="admin-kicker">REGISTRATIONS</span>
              <h3>Usajili wa siku 14</h3>
            </div>
            <BarChart3 size={20} />
          </div>
          <RegistrationChart points={data.registrationTrend} />
        </div>
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <span className="admin-kicker">ACCOUNT HEALTH</span>
              <h3>Hali ya mfumo</h3>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="health-list">
            <div>
              <span>
                <CheckCircle2 size={16} /> Auth profiles
              </span>
              <b>{data.metrics.users}</b>
            </div>
            <div>
              <span>
                <Ticket size={16} /> Tiketi pending
              </span>
              <b>{data.metrics.pending}</b>
            </div>
            <div>
              <span>
                <CreditCard size={16} /> Payment records
              </span>
              <b>{payments.length}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function RegistrationChart({ points }: { points: { label: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((item) => item.count));
  return (
    <div className="admin-chart">
      {points.map((item) => (
        <div className="chart-column" key={item.label}>
          <div
            className="chart-value"
            style={{ height: `${Math.max(5, (item.count / max) * 100)}%` }}
            title={`${item.count} users`}
          >
            <span>{item.count || ""}</span>
          </div>
          <small>{item.label}</small>
        </div>
      ))}
    </div>
  );
}
function UsersSection({
  users,
  query: search,
  setQuery,
  onSelect,
}: {
  users: AdminUser[];
  query: string;
  setQuery: (value: string) => void;
  onSelect: (user: AdminUser) => void;
}) {
  return (
    <div className="admin-content">
      <div className="admin-section-heading">
        <div>
          <span className="admin-kicker">USER DIRECTORY</span>
          <h2>Watumiaji</h2>
          <p>Search kwa jina, username, email au namba ya simu.</p>
        </div>
        <span className="admin-count">{users.length} results</span>
      </div>
      <div className="admin-search">
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tafuta mtumiaji..."
        />
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mtumiaji</th>
              <th>Simu</th>
              <th>Usajili</th>
              <th>Tickets</th>
              <th>Hali</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.uid}>
                <td>
                  <div className="table-user">
                    <div className="admin-avatar small">
                      {initials(item.displayName || item.username || "User")}
                    </div>
                    <div>
                      <b>
                        {item.displayName ||
                          `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() ||
                          "Mtumiaji"}
                      </b>
                      <small>
                        @{item.username || "—"} · {item.role}
                      </small>
                    </div>
                  </div>
                </td>
                <td>{item.phone || item.email || "—"}</td>
                <td>{fmt(item.createdAt)}</td>
                <td>{item.ticketCount ?? 0}</td>
                <td>
                  <span className={`account-pill ${item.disabled ? "blocked" : "active"}`}>
                    {item.disabled ? "BLOCKED" : "ACTIVE"}
                  </span>
                </td>
                <td>
                  <button className="row-action" onClick={() => onSelect(item)}>
                    Angalia <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && (
          <div className="admin-empty compact">
            <Search size={22} />
            <b>Hakuna mtumiaji anayelingana na search.</b>
          </div>
        )}
      </div>
    </div>
  );
}
function TicketsSection({
  tickets,
  matches,
  onToggle,
  onDelete,
  onEdit,
  onCreated,
}: {
  tickets: Row[];
  matches: AdminMatch[];
  onToggle: (row: Row) => void;
  onDelete: (row: Row) => void;
  onEdit: (row: Row) => void;
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [selectionValue, setSelectionValue] = useState("");
  const [selections, setSelections] = useState<
    { matchId: string; market: string; prediction: string; odds: number }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const addSelection = () => {
    const [matchId, market, prediction, odds] = selectionValue.split("||");
    if (!matchId || selections.some((item) => item.matchId === matchId)) return;
    setSelections((items) => [...items, { matchId, market, prediction, odds: Number(odds) }]);
    setSelectionValue("");
  };
  const create = async () => {
    if (!title.trim() || !selections.length) return;
    setSaving(true);
    try {
      await adminCreateTicket({ title: title.trim(), visibility, risk: "MEDIUM", selections });
      toast.success("Tiketi imetengenezwa kwa odds zilizothibitishwa.");
      setTitle("");
      setSelections([]);
      setOpen(false);
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kutengeneza tiketi.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="admin-content">
      <div className="admin-section-heading">
        <div>
          <span className="admin-kicker">CONTENT MODERATION</span>
          <h2>Tiketi</h2>
          <p>Angalia, tengeneza na simamia tiketi zilizopo kwenye Firestore.</p>
        </div>
        <div className="admin-row-actions">
          <span className="admin-count">{tickets.length} loaded</span>
          <button className="admin-sync" onClick={() => setOpen((value) => !value)}>
            {open ? "Funga" : "+ Tiketi mpya"}
          </button>
        </div>
      </div>
      {open && (
        <div className="admin-card ticket-composer">
          <div className="admin-kicker">VERIFIED SPORTS API BUILDER</div>
          <h3>Tengeneza tiketi mpya</h3>
          <p className="composer-note">
            Odds na selections lazima ziwepo kwenye match data ya Sports API; hakuna odds za
            kuingiza kwa mkono.
          </p>
          <div className="composer-grid">
            <label>
              Jina la tiketi
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Mkeka wa leo"
              />
            </label>
            <label>
              Visibility
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as "PUBLIC" | "PRIVATE")}
              >
                <option value="PUBLIC">PUBLIC</option>
                <option value="PRIVATE">PRIVATE</option>
              </select>
            </label>
          </div>
          <div className="composer-add">
            <select
              value={selectionValue}
              onChange={(event) => setSelectionValue(event.target.value)}
            >
              <option value="">Chagua mechi na odds...</option>
              {matches
                .filter((match) => String(match.status ?? "").toUpperCase() !== "PST")
                .map((match) =>
                  (match.markets ?? []).flatMap((market) =>
                    (market.options ?? []).map((option) => (
                      <option
                        key={`${match.id}-${market.market}-${option.prediction}-${option.odds}`}
                        value={`${match.id}||${market.market}||${option.prediction}||${option.odds}`}
                      >
                        {match.homeTeamName} v {match.awayTeamName} · {market.market}{" "}
                        {option.prediction} @ {option.odds}
                      </option>
                    )),
                  ),
                )}
            </select>
            <button className="admin-outline" onClick={addSelection}>
              Ongeza
            </button>
          </div>
          <div className="composer-selections">
            {selections.map((item) => (
              <span key={item.matchId}>
                {item.market} {item.prediction} @ {item.odds}{" "}
                <button
                  onClick={() =>
                    setSelections((current) =>
                      current.filter((value) => value.matchId !== item.matchId),
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <button
            className="admin-sync"
            disabled={saving || !title.trim() || !selections.length}
            onClick={() => void create()}
          >
            {saving ? "Inatengeneza..." : "Tengeneza tiketi"}
          </button>
        </div>
      )}
      <div className="admin-card admin-list-card">
        {tickets.length ? (
          tickets.map((item) => (
            <div className="admin-list-row" key={item.id}>
              <div className="admin-avatar small">{initials(String(item.title ?? "T"))}</div>
              <div className="admin-list-main">
                <div>
                  <b>{String(item.title ?? "Tiketi bila jina")}</b>
                  <span
                    className={`status status-${String(item.status ?? "pending").toLowerCase()}`}
                  >
                    {String(item.status ?? "PENDING")}
                  </span>
                </div>
                <small>
                  {String(
                    item.creatorName ??
                      item.creatorUsername ??
                      item.creatorId ??
                      "Creator hajulikani",
                  )}{" "}
                  · {fmt(item.createdAt)}
                </small>
                <span>
                  {String(item.selectionCount ?? 0)} selections · {String(item.totalOdds ?? "—")}{" "}
                  odds · {String(item.visibility ?? "PRIVATE")}
                </span>
              </div>
              <div className="admin-row-actions">
                <button className="row-action" onClick={() => onEdit(item)}>
                  Hariri
                </button>
                <button className="row-action" onClick={() => onToggle(item)}>
                  {item.visibility === "PUBLIC" ? <EyeOff size={14} /> : <Eye size={14} />}
                  {item.visibility === "PUBLIC" ? "Ficha" : "Onyesha"}
                </button>
                <button className="row-action danger-action" onClick={() => onDelete(item)}>
                  Futa
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="admin-empty">
            <Ticket size={24} />
            <b>Hakuna tiketi zilizopatikana.</b>
          </div>
        )}
      </div>
    </div>
  );
}
function MatchesSection({
  matches,
  config,
  logs,
  onConfig,
  onGenerate,
}: {
  matches: AdminMatch[];
  config: AutoConfig;
  logs: Row[];
  onConfig: (config: AutoConfig) => Promise<void>;
  onGenerate: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(config), [config]);
  const save = async () => {
    setSaving(true);
    try {
      await onConfig(draft);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="admin-content">
      <div className="admin-section-heading">
        <div>
          <span className="admin-kicker">SPORTS API / VERIFIED RESULTS</span>
          <h2>Mechi na Automatic Tickets</h2>
          <p>
            Mechi, odds na matokeo hapa hutoka Sports API pekee. Matokeo yasiyo na source hayasettle
            tickets.
          </p>
        </div>
        <span className="admin-count">{matches.length} matches</span>
      </div>
      <div className="admin-columns">
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <span className="admin-kicker">FIXTURES</span>
              <h3>Mechi zilizohifadhiwa</h3>
            </div>
            <CalendarDays size={20} />
          </div>
          <div className="admin-list-card">
            {matches.length ? (
              matches.slice(0, 80).map((match) => (
                <div className="admin-list-row" key={match.id}>
                  <div className="admin-avatar small">
                    <Trophy size={15} />
                  </div>
                  <div className="admin-list-main">
                    <div>
                      <b>
                        {match.homeTeamName} v {match.awayTeamName}
                      </b>
                      <span
                        className={`status ${match.resultSource ? "status-won" : "status-pending"}`}
                      >
                        {match.status ?? "—"}
                      </span>
                    </div>
                    <small>
                      {match.leagueName ?? "—"} ·{" "}
                      {match.kickoffAt ? new Date(match.kickoffAt).toLocaleString("sw-TZ") : "—"}
                    </small>
                    <span>
                      {match.homeScore ?? "—"} - {match.awayScore ?? "—"} ·{" "}
                      {match.markets?.length ?? 0} markets ·{" "}
                      {match.resultSource
                        ? `Source: ${match.resultSource}`
                        : "Result haijathibitishwa"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-empty compact">
                <CalendarDays size={22} />
                <b>Hakuna mechi kutoka Sports API.</b>
                <span>Fanya Sync data; ikiwa API imefika limit, error itaonekana kwenye Logs.</span>
              </div>
            )}
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <span className="admin-kicker">AUTOMATION POLICY</span>
              <h3>Automatic Tickets</h3>
            </div>
            <Activity size={20} />
          </div>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
            />{" "}
            Iwezeshwe
          </label>
          <div className="composer-grid">
            <label>
              Min mechi
              <input
                type="number"
                min="2"
                max="10"
                value={draft.minSelections}
                onChange={(event) =>
                  setDraft({ ...draft, minSelections: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Max mechi
              <input
                type="number"
                min="2"
                max="10"
                value={draft.maxSelections}
                onChange={(event) =>
                  setDraft({ ...draft, maxSelections: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Min odds/selection
              <input
                type="number"
                step="0.01"
                value={draft.minOddsPerSelection}
                onChange={(event) =>
                  setDraft({ ...draft, minOddsPerSelection: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Max odds/selection
              <input
                type="number"
                step="0.01"
                value={draft.maxOddsPerSelection}
                onChange={(event) =>
                  setDraft({ ...draft, maxOddsPerSelection: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Min total odds
              <input
                type="number"
                step="0.01"
                value={draft.minTotalOdds}
                onChange={(event) =>
                  setDraft({ ...draft, minTotalOdds: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Max total odds
              <input
                type="number"
                step="0.01"
                value={draft.maxTotalOdds}
                onChange={(event) =>
                  setDraft({ ...draft, maxTotalOdds: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <div className="admin-row-actions">
            <button className="admin-outline" disabled={saving} onClick={() => void save()}>
              {saving ? "Inahifadhi..." : "Hifadhi policy"}
            </button>
            <button className="admin-sync" onClick={() => void onGenerate()}>
              Tengeneza sasa
            </button>
          </div>
          <div className="automation-history">
            <span className="admin-kicker">AUTOMATION HISTORY</span>
            {logs
              .filter((row) => String(row.type ?? "").includes("auto-ticket"))
              .slice(0, 5)
              .map((row) => (
                <div key={row.id}>
                  <b>{row.ok === false ? "FAILED" : "OK"}</b>
                  <span>{String(row.error ?? fmt(row.createdAt))}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsSection({ reports, onExport }: { reports: Row[]; onExport: () => void }) {
  return (
    <div className="admin-content">
      <div className="admin-section-heading">
        <div>
          <span className="admin-kicker">REPORTING / AUDIT</span>
          <h2>Ripoti</h2>
          <p>Ripoti hizi zinatumia records halisi za tickets, users na admin activity.</p>
        </div>
        <button className="admin-outline" onClick={onExport}>
          Pakua CSV
        </button>
      </div>
      <div className="admin-card">
        <div className="report-grid">
          <div>
            <span>Ripoti za jamii</span>
            <b>{reports.length}</b>
          </div>
          <div>
            <span>Win/Lost records</span>
            <b>Angalia Overview</b>
          </div>
          <div>
            <span>Admin activity</span>
            <b>API / Logs</b>
          </div>
        </div>
        <div className="admin-list-card">
          {reports.length ? (
            reports.map((row) => (
              <div className="admin-list-row" key={row.id}>
                <div className="admin-list-main admin-row-copy">
                  <b>{String(row.reason ?? row.type ?? "Ripoti")}</b>
                  <small>{String(row.description ?? row.details ?? "Hakuna maelezo")}</small>
                  <span>
                    Reporter: {String(row.reporterId ?? "—")} · {fmt(row.createdAt)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="admin-empty compact">
              <Flag size={22} />
              <b>Hakuna ripoti zilizopokelewa.</b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function exportRows(filename: string, rows: Row[]) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    keys.join(","),
    ...rows.map((row) => keys.map((key) => escape(row[key])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function RowsSection({
  title,
  rows,
  empty,
  render,
}: {
  title: string;
  rows: Row[];
  empty: string;
  render: (row: Row) => ReactNode;
}) {
  return (
    <div className="admin-content">
      <div className="admin-section-heading">
        <div>
          <span className="admin-kicker">FIREBASE COLLECTION</span>
          <h2>{title}</h2>
        </div>
        <span className="admin-count">{rows.length} loaded</span>
      </div>
      <div className="admin-card admin-list-card">
        {rows.length ? (
          rows.map((row) => (
            <div className="admin-list-row" key={row.id}>
              <div className="admin-list-main admin-row-copy">{render(row)}</div>
            </div>
          ))
        ) : (
          <div className="admin-empty">
            <Activity size={24} />
            <b>{empty}</b>
          </div>
        )}
      </div>
    </div>
  );
}
function UserDrawer({
  user,
  tickets,
  busy,
  canManage,
  onClose,
  onStatus,
  onRole,
}: {
  user: AdminUser;
  tickets: Row[];
  busy: boolean;
  canManage: boolean;
  onClose: () => void;
  onStatus: () => void;
  onRole: () => void;
}) {
  return (
    <div className="admin-drawer-backdrop" onClick={onClose}>
      <aside className="admin-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="admin-kicker">USER PROFILE</span>
            <h2>{user.displayName || user.username || "Mtumiaji"}</h2>
          </div>
          <button className="admin-icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="drawer-identity">
          <div className="admin-avatar large">
            {initials(user.displayName || user.username || "User")}
          </div>
          <div>
            <b>{user.phone || user.email || "—"}</b>
            <span>@{user.username || "—"}</span>
          </div>
        </div>
        <div className="drawer-facts">
          <div>
            <small>ROLE</small>
            <b>{user.role}</b>
          </div>
          <div>
            <small>STATUS</small>
            <b className={user.disabled ? "danger-text" : "success-text"}>
              {user.disabled ? "BLOCKED" : "ACTIVE"}
            </b>
          </div>
          <div>
            <small>REGISTERED</small>
            <b>{fmt(user.createdAt)}</b>
          </div>
          <div>
            <small>TICKETS</small>
            <b>{user.ticketCount ?? 0}</b>
          </div>
        </div>
        <div className="drawer-ticket-list">
          <div className="admin-kicker">RECENT TICKETS</div>
          {tickets.length ? (
            tickets.map((ticket) => (
              <div key={ticket.id}>
                <b>{String(ticket.title ?? "Tiketi")}</b>
                <span>
                  {String(ticket.status ?? "PENDING")} · {fmt(ticket.createdAt)}
                </span>
              </div>
            ))
          ) : (
            <small>Hakuna tiketi zilizopatikana.</small>
          )}
        </div>
        <div className="drawer-actions">
          <button
            className="admin-outline full"
            disabled={busy || user.role === "SUPER_ADMIN"}
            onClick={onStatus}
          >
            {user.disabled ? <Unlock size={16} /> : <Lock size={16} />}
            {user.disabled ? "Fungua akaunti" : "Zuia akaunti"}
          </button>
          {canManage && (
            <button className="admin-outline full" disabled={busy} onClick={onRole}>
              <ShieldCheck size={16} />
              {user.role === "ADMIN" ? "Ondoa Admin" : "Mpe Admin"}
            </button>
          )}
        </div>
        <p className="drawer-note">
          Account status hubadilishwa na Firebase Admin SDK. UI haiwezi kumpa user wa kawaida
          mamlaka ya Admin.
        </p>
      </aside>
    </div>
  );
}
