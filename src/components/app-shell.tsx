import { Link } from "@tanstack/react-router";
import { Bell, Home, ListPlus, Trophy, UserRound } from "lucide-react";
import type { ReactNode } from "react";
export function AppShell({ children, user }: { children: ReactNode; user?: { displayName?: string | null; photoURL?: string | null } | null }) {
  return <div className="site-shell">
    <header className="topbar">
      <Link to="/" className="brand"><span className="brand-mark">W</span><span><b>WAZEE WA</b><small>BETTING TZ</small></span></Link>
      <nav className="top-nav"><Link to="/">Nyumbani</Link><Link to="/create-ticket">Tengeneza mkeka</Link><Link to="/community">Jamii</Link><Link to="/leaderboard">Leaderboard</Link></nav>
      <div className="top-user"><Bell size={19}/><Link to={user ? "/dashboard" : "/login"} className="user-chip">{user?.photoURL ? <img src={user.photoURL}/> : <span>{user ? (user.displayName?.[0] ?? "U") : "?"}</span>}<b>{user ? (user.displayName ?? "Akaunti") : "Ingia"}</b></Link></div>
    </header>
    <main>{children}</main>
    <nav className="bottom-nav"><Link to="/"><Home size={20}/><span>Nyumbani</span></Link><Link to="/create-ticket"><ListPlus size={20}/><span>Jenga</span></Link><Link to="/leaderboard"><Trophy size={20}/><span>Leaderboard</span></Link><Link to={user ? "/dashboard" : "/login"}><UserRound size={20}/><span>Akaunti</span></Link></nav>
  </div>;
}