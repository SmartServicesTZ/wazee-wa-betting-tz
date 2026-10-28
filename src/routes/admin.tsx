import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw, ShieldAlert, Users, Ticket, Activity, Flag, CreditCard, Trophy, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "../components/app-shell";
import { firestore, runAdminSync, subscribeToAuth } from "../lib/firebase";
import { getUserProfile } from "../lib/firestore";

export const Route = createFileRoute("/admin")({ component: Admin });
type Row = { id: string; [key: string]: any };
type Tab = "overview" | "users" | "tickets" | "reports" | "payments" | "logs";

function Admin() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [users, setUsers] = useState<Row[]>([]);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [reports, setReports] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [logs, setLogs] = useState<Row[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(profile?.role);
  const isSuperAdmin = profile?.role === "SUPER_ADMIN";

  useEffect(() => subscribeToAuth(setUser), []);
  useEffect(() => {
    let active = true;
    if (!user) { setProfile(null); return; }
    getUserProfile(user.uid).then((value) => { if (active) setProfile(value); })
      .catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, [user]);

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [u, t, r, p, l] = await Promise.all([
        getDocs(query(collection(firestore, "users"), limit(100))),
        getDocs(query(collection(firestore, "tickets"), orderBy("createdAt", "desc"), limit(100))),
        getDocs(query(collection(firestore, "reports"), limit(100))),
        getDocs(query(collection(firestore, "payments"), limit(100))),
        getDocs(query(collection(firestore, "api_logs"), orderBy("createdAt", "desc"), limit(20))),
      ]);
      setUsers(u.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTickets(t.docs.map((d) => ({ id: d.id, ...d.data() })));
      setReports(r.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPayments(p.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLogs(l.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kupakia taarifa za Admin.");
    } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { if (isAdmin) void loadData(); }, [isAdmin, loadData]);

  if (!user) return <AppShell><div className="page narrow"><div className="empty"><ShieldAlert size={28}/><b>Ingia kwa akaunti yenye ruhusa ya Admin.</b><Link className="btn btn-primary" to="/login">Ingia</Link></div></div></AppShell>;
  if (profile === null) return <AppShell user={user}><div className="page narrow"><div className="empty"><ShieldAlert size={28}/><b>Inapakia au akaunti haina profile.</b></div></div></AppShell>;
  if (!isAdmin) return <AppShell user={user}><div className="page narrow"><div className="empty"><ShieldAlert size={28}/><b>Huna ruhusa ya Admin.</b><span>Dashboard hii inahitaji role ya ADMIN au SUPER_ADMIN iliyothibitishwa kwenye Firestore.</span><Link to="/dashboard">Rudi kwenye dashboard yako</Link></div></div></AppShell>;

  const setUserRole = async (target: Row) => {
    if (!isSuperAdmin || target.id === user.uid || target.role === "SUPER_ADMIN") return;
    const nextRole = target.role === "ADMIN" ? "USER" : "ADMIN";
    try {
      await updateDoc(doc(firestore, "users", target.id), { role: nextRole });
      setUsers((items) => items.map((item) => item.id === target.id ? { ...item, role: nextRole } : item));
      toast.success("Role ya mtumiaji imebadilishwa.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Imeshindikana kubadilisha role."); }
  };

  const toggleTicketVisibility = async (ticket: Row) => {
    const next = ticket.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC";
    try {
      await updateDoc(doc(firestore, "tickets", ticket.id), { visibility: next, updatedAt: new Date() });
      setTickets((items) => items.map((item) => item.id === ticket.id ? { ...item, visibility: next } : item));
      toast.success(next === "PUBLIC" ? "Tiketi imewekwa wazi." : "Tiketi imefichwa.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Imeshindikana kubadilisha tiketi."); }
  };

  const removeTicket = async (ticket: Row) => {
    if (!window.confirm("Una uhakika unataka kufuta tiketi hii?")) return;
    try {
      await deleteDoc(doc(firestore, "tickets", ticket.id));
      setTickets((items) => items.filter((item) => item.id !== ticket.id));
      toast.success("Tiketi imefutwa.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Imeshindikana kufuta tiketi."); }
  };

  const nav: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Muhtasari", icon: Activity },
    { id: "users", label: "Watumiaji", icon: Users },
    { id: "tickets", label: "Tiketi", icon: Ticket },
    { id: "reports", label: "Ripoti", icon: Flag },
    { id: "payments", label: "Malipo", icon: CreditCard },
    { id: "logs", label: "API / Logs", icon: Activity },
  ];
  const countCard = (label: string, value: number, icon: any) => {
    const Icon = icon;
    return <div className="stat-box" key={label}><Icon/><small>{label}</small><b>{value}</b></div>;
  };
  const fmt = (value: any) => value?.toDate ? value.toDate().toLocaleString("sw-TZ") : value ? String(value) : "—";

  return <AppShell user={user}><div className="page">
    <div className="page-title"><div><span className="eyebrow">WAZEE WA BETTING TZ • CONTROL CENTER</span><h1>Admin dashboard</h1><p>Karibu {profile.displayName || user.displayName || "Admin"} — role: <b>{profile.role}</b></p></div>
      <button className="btn btn-primary" disabled={busy || loading} onClick={async () => { setBusy(true); try { const result = await runAdminSync(); toast.success("Sync imekamilika: " + result.count + " mechi; " + result.settled + " tiketi zimesettle."); await loadData(); } catch (error) { toast.error(error instanceof Error ? error.message : "Sync imeshindikana."); } finally { setBusy(false); } }}><RefreshCw size={17}/>{busy ? "Inasawazisha..." : "Sawazisha michezo"}</button>
    </div>
    <div className="admin-grid" style={{ gridTemplateColumns: "minmax(0,1fr)", gap: 16 }}>
      <div className="panel"><div className="admin-links" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setTab(item.id)}><Icon size={16}/>{item.label}</button>; })}<button className="btn btn-secondary" onClick={() => void loadData()}><RefreshCw size={16}/> Pakia upya</button></div></div>
      {loading && <div className="empty">Inapakia data kutoka Firestore...</div>}
      {tab === "overview" && <>
        <div className="stat-grid admin-stats">{countCard("Watumiaji (hadi 100)", users.length, Users)}{countCard("Tiketi (hadi 100)", tickets.length, Ticket)}{countCard("Ripoti", reports.length, Flag)}{countCard("Malipo", payments.length, CreditCard)}{countCard("API logs", logs.length, Activity)}{countCard("Role yako", isSuperAdmin ? 1 : 0, ShieldCheck)}</div>
        <div className="grid-2"><div className="panel"><div className="panel-head"><h3>Shughuli za Admin</h3></div><div className="admin-links"><span>Watumiaji: angalia profile na majukumu</span><span>Tiketi: ficha au onyesha, futa ikihitajika</span><span>Ripoti: kagua taarifa za jamii</span><span>Malipo: angalia rekodi zilizopo</span><span>API / Logs: fuatilia matatizo ya sync</span><span>{isSuperAdmin ? "SUPER_ADMIN: anaweza kutoa/kuondoa role ya ADMIN" : "Role management imezuiwa kwa SUPER_ADMIN pekee"}</span></div></div><div className="panel"><div className="panel-head"><h3>Logs za karibuni</h3></div>{logs.length ? <div className="log-list">{logs.slice(0,6).map(log => <div key={log.id}><b>{log.type || "Tukio"}</b><span>{log.ok === false ? "FAILED" : "OK"}</span><small>{log.error || fmt(log.createdAt)}</small></div>)}</div> : <div className="empty compact">Hakuna API logs zilizopatikana.</div>}</div></div>
      </>}
      {tab === "users" && <div className="panel"><div className="panel-head"><h3>Watumiaji</h3><small>{users.length} wa kwanza</small></div>{users.length ? <div className="ticket-list">{users.map(item => <div className="ticket" key={item.id}><div className="ticket-avatar">{String(item.displayName || item.firstName || "U").slice(0,1).toUpperCase()}</div><div className="ticket-main"><div className="ticket-line"><b>{item.displayName || [item.firstName,item.lastName].filter(Boolean).join(" ") || "Mtumiaji"}</b><span className="status">{item.role || "USER"}</span></div><small>{item.phone || item.email || item.id}</small><div className="ticket-meta"><span>Tickets: {item.ticketCount ?? 0}</span><span>Win rate: {item.winRate ?? 0}%</span></div></div>{isSuperAdmin && item.id !== user.uid && item.role !== "SUPER_ADMIN" && <button className="btn btn-secondary" onClick={() => void setUserRole(item)}>{item.role === "ADMIN" ? "Ondoa Admin" : "Mpe Admin"}</button>}</div>)}</div> : <div className="empty">Hakuna watumiaji walioonekana.</div>}</div>}
      {tab === "tickets" && <div className="panel"><div className="panel-head"><h3>Usimamizi wa tiketi</h3><small>{tickets.length} za karibuni</small></div>{tickets.length ? <div className="ticket-list">{tickets.map(item => <div className="ticket" key={item.id}><div className="ticket-avatar">{String(item.title || "T").slice(0,1)}</div><div className="ticket-main"><div className="ticket-line"><b>{item.title || "Tiketi bila jina"}</b><span className={"status status-" + String(item.status || "PENDING").toLowerCase()}>{item.status || "PENDING"}</span></div><small>{item.creatorName || item.creatorUsername || item.creatorId || "Creator hajulikani"}</small><div className="ticket-meta"><span>{item.visibility || "PRIVATE"}</span><span>{item.totalOdds ?? "—"} odds</span><span>{fmt(item.createdAt)}</span></div></div><button className="btn btn-secondary" onClick={() => void toggleTicketVisibility(item)}>{item.visibility === "PUBLIC" ? <EyeOff size={15}/> : <Eye size={15}/>} {item.visibility === "PUBLIC" ? "Ficha" : "Onyesha"}</button><button className="btn btn-secondary" onClick={() => void removeTicket(item)}>Futa</button></div>)}</div> : <div className="empty">Hakuna tiketi zilizopatikana.</div>}</div>}
      {tab === "reports" && <div className="panel"><div className="panel-head"><h3>Ripoti za watumiaji</h3><small>{reports.length}</small></div>{reports.length ? <div className="ticket-list">{reports.map(item => <div className="ticket" key={item.id}><div className="ticket-main"><b>{item.reason || item.type || "Ripoti"}</b><small>{item.description || item.details || "Hakuna maelezo"}</small><div className="ticket-meta"><span>Reporter: {item.reporterId || "—"}</span><span>Target: {item.targetId || item.ticketId || "—"}</span><span>{fmt(item.createdAt)}</span></div></div></div>)}</div> : <div className="empty">Hakuna ripoti zilizopo.</div>}</div>}
      {tab === "payments" && <div className="panel"><div className="panel-head"><h3>Malipo na subscriptions</h3><small>{payments.length}</small></div>{payments.length ? <div className="ticket-list">{payments.map(item => <div className="ticket" key={item.id}><div className="ticket-main"><b>{item.provider || item.method || "Malipo"}</b><small>{item.userId || "Mtumiaji hajatajwa"}</small><div className="ticket-meta"><span>{item.status || "—"}</span><span>{item.amount ?? "—"} {item.currency || "TZS"}</span><span>{fmt(item.createdAt)}</span></div></div></div>)}</div> : <div className="empty">Hakuna rekodi za malipo zilizopatikana.</div>}</div>}
      {tab === "logs" && <div className="panel"><div className="panel-head"><h3>API / System logs</h3><small>{logs.length}</small></div>{logs.length ? <div className="log-list">{logs.map(log => <div key={log.id}><b>{log.type || "Tukio"}</b><span>{log.ok === false ? "FAILED" : "OK"}</span><small>{log.error || fmt(log.createdAt)}</small></div>)}</div> : <div className="empty">Hakuna logs zilizopatikana.</div>}</div>}
      <p className="muted" style={{ fontSize: 12 }}>Orodha inaonyesha rekodi zisizozidi 100 kwa kila sehemu. Ruhusa halisi zinathibitishwa na Firebase Security Rules; UI peke yake haitoi mamlaka.</p>
    </div>
  </div></AppShell>;
}
