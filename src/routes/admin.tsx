import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
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
  adminSetUserRole,
  adminSetUserStatus,
  firestore,
  logout,
  runAdminSync,
  subscribeToAuth,
  type AdminDashboardData,
  type AdminUser,
} from "../lib/firebase";
import { getUserProfile } from "../lib/firestore";

export const Route = createFileRoute("/admin")({ component: Admin });
type Section = "overview" | "users" | "tickets" | "reports" | "payments" | "logs";
type Row = { id: string; [key: string]: unknown };
const sections: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Muhtasari", icon: LayoutDashboard },
  { id: "users", label: "Watumiaji", icon: Users },
  { id: "tickets", label: "Tiketi", icon: Ticket },
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
      const [summary, ticketSnap, reportSnap, paymentSnap, logSnap] = await Promise.all([
        adminDashboard(),
        getDocs(query(collection(firestore, "tickets"), orderBy("createdAt", "desc"), limit(100))),
        getDocs(query(collection(firestore, "reports"), orderBy("createdAt", "desc"), limit(100))),
        getDocs(query(collection(firestore, "payments"), orderBy("createdAt", "desc"), limit(100))),
        getDocs(query(collection(firestore, "api_logs"), orderBy("createdAt", "desc"), limit(30))),
      ]);
      setData(summary);
      setTickets(ticketSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setReports(reportSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setPayments(paymentSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLogs(logSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
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
            <TicketsSection tickets={tickets} onToggle={toggleTicket} onDelete={removeTicket} />
          )}
          {section === "reports" && (
            <RowsSection
              title="Ripoti za jamii"
              rows={reports}
              empty="Hakuna ripoti zilizopokelewa."
              render={(row) => (
                <>
                  <b>{String(row.reason ?? row.type ?? "Ripoti")}</b>
                  <small>{String(row.description ?? row.details ?? "Hakuna maelezo")}</small>
                  <span>
                    Reporter: {String(row.reporterId ?? "—")} · {fmt(row.createdAt)}
                  </span>
                </>
              )}
            />
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
  onToggle,
  onDelete,
}: {
  tickets: Row[];
  onToggle: (row: Row) => void;
  onDelete: (row: Row) => void;
}) {
  return (
    <div className="admin-content">
      <div className="admin-section-heading">
        <div>
          <span className="admin-kicker">CONTENT MODERATION</span>
          <h2>Tiketi</h2>
          <p>Angalia na simamia tiketi zilizopo kwenye Firestore.</p>
        </div>
        <span className="admin-count">{tickets.length} loaded</span>
      </div>
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
