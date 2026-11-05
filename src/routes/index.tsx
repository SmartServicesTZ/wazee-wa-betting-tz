import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, Heart, LockKeyhole, Search, ShieldCheck, Trophy, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { AppShell } from "../components/app-shell";
import { listMatches, listPublicTickets, type PublicTicket } from "../lib/firestore";
import { subscribeToAuth } from "../lib/firebase";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  useEffect(() => subscribeToAuth(setUser), []);
  useEffect(() => {
    Promise.all([listPublicTickets(), listMatches()])
      .then(([nextTickets, nextMatches]) => { setTickets(nextTickets); setMatches(nextMatches); })
      .catch((error) => setDataError(error instanceof Error ? error.message : "Imeshindikana kupakia data."))
      .finally(() => setLoading(false));
  }, []);
  const visibleTickets = tickets.filter((ticket) => `${ticket.title} ${ticket.creatorUsername} ${ticket.sport}`.toLowerCase().includes(query.toLowerCase()));
  return <AppShell user={user}>
    <div className="page">
      <section className="hero-card">
      <div className="hero-copy"><span className="eyebrow"><ShieldCheck size={15}/> COMMUNITY • VERIFIED RESULTS</span><h1>Tips, mikeka na prediction — <em>kwa uwazi.</em></h1><p>Unda mkeka wako, shiriki na jamii, na acha mfumo uthibitishe matokeo kutoka sports API. Hakuna winning ticket inayowekwa bila result halisi.</p><div className="hero-actions"><Link className="btn btn-primary" to="/create-ticket">Tengeneza mkeka</Link><Link className="btn btn-secondary" to={user ? "/community" : "/register"}>{user ? "Tembelea jamii" : "Jiunge na jamii"}</Link></div></div>
      <div className="hero-stats"><div><Trophy/><b>LIVE</b><span>Settlement engine</span></div><div><Users/><b>COMMUNITY</b><span>Creators & followers</span></div><div><CheckCircle2/><b>REAL DATA</b><span>Sports API only</span></div></div>
      </section>
      <div className="section-toolbar"><div><span className="eyebrow">DISCOVER</span><h2>Community tickets</h2></div><label className="search"><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Tafuta ticket, creator..." /></label></div>
      {dataError && <div className="alert"><LockKeyhole size={17}/>{dataError}</div>}
      <section className="grid-2">
        <div className="panel"><div className="panel-head"><div><span className="eyebrow">PUBLIC FEED</span><h3>Latest published</h3></div><Link to="/community">Tazama zote <ChevronRight size={16}/></Link></div>
          {loading ? <div className="empty">Inapakia tickets...</div> : visibleTickets.length ? <div className="ticket-list">{visibleTickets.map(ticket => <Link className="ticket" to="/tickets/$ticketId" params={{ticketId:ticket.id}} key={ticket.id}><div className="ticket-avatar">{ticket.creatorName?.[0] ?? "W"}</div><div className="ticket-main"><div className="ticket-line"><b>{ticket.title}</b><span className={`status status-${ticket.status.toLowerCase()}`}>{ticket.status}</span></div><small>@{ticket.creatorUsername} • {ticket.sport} • {ticket.selectionCount} selections</small><div className="ticket-meta"><strong>{Number(ticket.totalOdds).toFixed(2)} odds</strong><span>{ticket.access === "VIP" ? "VIP" : "FREE"}</span><span>{ticket.risk}</span></div></div><ChevronRight size={18}/></Link>)}</div> : <div className="empty"><Trophy size={24}/><b>Hakuna public tickets bado.</b><span>Tickets zitaonekana hapa baada ya mtumiaji kuchapisha.</span><Link className="btn btn-primary" to="/create-ticket">Jenga ticket</Link></div>}
        </div>
        <div className="panel"><div className="panel-head"><div><span className="eyebrow">SPORTS API</span><h3>Upcoming matches</h3></div><Link to="/matches">Ratiba <ChevronRight size={16}/></Link></div>
          {loading ? <div className="empty">Inapakia mechi...</div> : matches.length ? <div className="match-list">{matches.slice(0,8).map(match=><div className="match" key={match.id}><div><small>{match.leagueName ?? "League"}</small><b>{match.homeTeamName} <span>vs</span> {match.awayTeamName}</b></div><time><Clock3 size={14}/>{new Date(match.kickoffAt).toLocaleString("sw-TZ",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"short"})}</time></div>)}</div> : <div className="empty"><CalendarDays size={24}/><b>Ratiba bado haijasawazishwa.</b><span>Admin akishaweka SPORTS_API_KEY, background sync itaingiza matches halisi.</span></div>}
        </div>
      </section>
      <section className="trust-strip"><div><ShieldCheck/><b>Hakuna fake results</b><span>WON/LOST hutokana na final result.</span></div><div><CheckCircle2/><b>Immutable odds snapshot</b><span>Odds huhifadhiwa wakati selection inaongezwa.</span></div><div><Heart/><b>Community controls</b><span>Follow, like, save na comments ni database-backed.</span></div></section>
    </div>
  </AppShell>;
}