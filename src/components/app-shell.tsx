import { Link } from "@tanstack/react-router";
import { Bell, Home, ListPlus, ShieldCheck, Trophy, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getUserProfile } from "../lib/firestore";

type ShellUser = { uid: string; displayName?: string | null; photoURL?: string | null };
export function AppShell({ children, user }: { children: ReactNode; user?: ShellUser | null }) {
  const [adminRole, setAdminRole] = useState(false);
  useEffect(() => {
    let active = true;
    if (!user) {
      setAdminRole(false);
      return () => { active = false; };
    }
    getUserProfile(user.uid)
      .then((profile) => {
        if (active) setAdminRole(profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN");
      })
      .catch(() => { if (active) setAdminRole(false); });
    return () => { active = false; };
  }, [user?.uid]);
  return <div className="site-shell">
    <header className="topbar">
      <Link to="/" className="brand"><span className="brand-mark">W</span><span><b>WAZEE WA</b><small>BETTING TZ</small></span></Link>
      <nav className="top-nav"><Link to="/">Nyumbani</Link><Link to="/matches">Mechi</Link><Link to="/create-ticket">Tengeneza mkeka</Link><Link to="/community">Jamii</Link><Link to="/leaderboard">Leaderboard</Link><a href="https://chat.whatsapp.com/CNhZ2jsVkgw0Lu0zaZHrlJ?s=cl&p=a&iam=2" target="_blank" rel="noopener noreferrer">WhatsApp</a>{adminRole && <Link to="/admin" className="admin-entry"><ShieldCheck size={15}/> Admin Dashboard</Link>}</nav>
      <div className="top-user"><Bell size={19}/><Link to={user ? "/dashboard" : "/login"} className="user-chip">{user?.photoURL ? <img src={user.photoURL}/> : <span>{user ? (user.displayName?.[0] ?? "U") : "?"}</span>}<b>{user ? (user.displayName ?? "Akaunti") : "Ingia"}</b></Link></div>
    </header>
    <main>{children}</main>
    <nav className="bottom-nav"><Link to="/"><Home size={20}/><span>Nyumbani</span></Link><Link to="/matches"><Trophy size={20}/><span>Mechi</span></Link><Link to="/create-ticket"><ListPlus size={20}/><span>Jenga</span></Link><Link to={user ? "/dashboard" : "/login"}><UserRound size={20}/><span>Akaunti</span></Link></nav>
  </div>;
}
