import { Link } from "@tanstack/react-router";
import { Activity, ExternalLink, Home, ListPlus, Menu, ShieldCheck, Trophy, UserRound, Users, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getUserProfile } from "../lib/firestore";
import { PredictorBadge } from "./predictor-badge";

type ShellUser = { uid: string; displayName?: string | null; photoURL?: string | null };
type PublicProfileSummary = { role?: string; username?: string; displayName?: string; photoURL?: string | null; accountVerified?: boolean; winRate?: number; settledTicketCount?: number };

export function AppShell({ children, user }: { children: ReactNode; user?: ShellUser | null }) {
  const [adminRole, setAdminRole] = useState(false);
  const [publicProfile, setPublicProfile] = useState<PublicProfileSummary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const uid = user?.uid;

  useEffect(() => {
    let active = true;
    if (!uid) {
      setAdminRole(false);
      setPublicProfile(null);
      return () => { active = false; };
    }
    getUserProfile(uid).then((profile) => {
      if (!active) return;
      setAdminRole(profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN");
      setPublicProfile(profile as PublicProfileSummary | null);
    }).catch(() => { if (active) setAdminRole(false); });
    return () => { active = false; };
  }, [uid]);

  const identity = publicProfile?.displayName || user?.displayName || publicProfile?.username || "Mgeni";
  const navItems = [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/matches", label: "Live & Mechi", icon: Activity },
    { to: "/community", label: "Jamii", icon: Users },
    { to: "/create-ticket", label: "Tengeneza Mkeka", icon: ListPlus },
    { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { to: "/dashboard", label: "Akaunti Yangu", icon: UserRound },
  ] as const;

  const sidebarContent = (
    <>
      <div className="rb-sidebar-brand">
        <Link to="/" className="rb-brand" aria-label="Wazee wa Betting TZ — nyumbani">
          <span className="rb-brand-mark">W</span><span><b>WAZEE WA</b><small>BETTING TZ</small></span>
        </Link>
        <button className="rb-close-menu" aria-label="Funga menyu" onClick={() => setMenuOpen(false)}><X size={19}/></button>
      </div>
      <div className="rb-nav-caption">MENU KUU</div>
      <nav className="rb-side-nav" aria-label="Menyu kuu">
        {navItems.map(({to,label,icon:Icon}) => (
          <Link key={to} to={to} activeOptions={{exact:to==="/"}} activeProps={{className:"rb-nav-link active"}} inactiveProps={{className:"rb-nav-link"}} onClick={() => setMenuOpen(false)}>
            <Icon size={18}/><span>{label}</span>{to==="/matches" && <i className="rb-live-pill">LIVE</i>}
          </Link>
        ))}
        {adminRole && <Link to="/admin" className="rb-nav-link" onClick={() => setMenuOpen(false)}><ShieldCheck size={18}/><span>Admin Control</span></Link>}
      </nav>
      <div className="rb-sidebar-spacer"/>
      <a className="rb-invite-card" href="https://chat.whatsapp.com/CNhZ2jsVkgw0Lu0zaZHrlJ?s=cl&p=a&iam=2" target="_blank" rel="noopener noreferrer">
        <span className="rb-invite-icon"><Users size={18}/></span><b>Jiunge na jamii</b><small>Pata updates na mijadala ya michezo</small><strong>Fungua WhatsApp ↗</strong>
      </a>
      <div className="rb-sidebar-user">
        <span className="rb-avatar">{user?.photoURL ? <img src={user.photoURL} alt=""/> : identity.slice(0,1).toUpperCase()}</span>
        <span className="rb-user-copy"><b>{identity}</b><small>{user ? "Akaunti imeingia" : "Mgeni"}</small></span>
        {user ? <Link to="/dashboard" aria-label="Fungua akaunti"><PredictorBadge compact accountVerified={!!publicProfile?.accountVerified} winRate={publicProfile?.winRate??0} settledTicketCount={publicProfile?.settledTicketCount??0}/></Link> : <Link to="/login" aria-label="Ingia"><ExternalLink size={17}/></Link>}
      </div>
    </>
  );

  return (
    <div className="site-shell rb-shell">
      <header className="rb-mobile-header">
        <Link to="/" className="rb-brand"><span className="rb-brand-mark">W</span><span><b>WAZEE WA</b><small>BETTING TZ</small></span></Link>
        <div className="rb-mobile-actions"><span className="rb-live-indicator"><i/> LIVE</span><button aria-label="Fungua menyu" onClick={() => setMenuOpen(true)}><Menu size={22}/></button></div>
      </header>
      <aside className="rb-sidebar">{sidebarContent}</aside>
      {menuOpen && <><button className="rb-menu-scrim" aria-label="Funga menyu" onClick={() => setMenuOpen(false)}/><aside className="rb-sidebar rb-sidebar-mobile">{sidebarContent}</aside></>}
      <div className="rb-main-column">
        <header className="rb-topbar">
          <div><span className="rb-breadcrumb">WAZEE WA BETTING TZ</span><b>Karibu kwenye mchezo</b></div>
          <div className="rb-topbar-actions"><span className="rb-top-live"><i/> Michezo moja kwa moja</span>{user ? <Link to="/dashboard" className="rb-top-profile"><span>{identity.slice(0,1).toUpperCase()}</span>{identity}</Link> : <div className="gsb-auth-actions"><Link to="/register">Jisajili</Link><Link to="/login">Ingia</Link></div>}</div>
        </header>
        <aside className="site-safety-note" aria-label="Taarifa kuhusu coin na malipo"><ShieldCheck size={16}/><span>Coins ni za majaribio tu. Kwa sasa hakuna kuweka au kutoa fedha halisi.</span><Link to="/terms">Soma maelezo</Link></aside>
        <main className="rb-content">{children}</main>
        <footer className="rb-footer"><span>© Wazee wa Betting TZ</span><span>Cheza kwa uwajibikaji · Data hutegemea upatikanaji wa chanzo</span></footer>
      </div>
      <nav className="bottom-nav rb-bottom-nav" aria-label="Menyu ya simu">
        <Link to="/" title="Dashboard"><Home size={19}/><span>Home</span></Link><Link to="/matches" title="Mechi"><Activity size={19}/><span>Mechi</span></Link><Link to="/create-ticket" title="Jenga mkeka"><ListPlus size={19}/><span>Jenga</span></Link><Link to="/community" title="Jamii"><Users size={19}/><span>Jamii</span></Link><Link to={user?"/dashboard":"/login"} title="Akaunti"><UserRound size={19}/><span>Akaunti</span></Link>
      </nav>
    </div>
  );
}
