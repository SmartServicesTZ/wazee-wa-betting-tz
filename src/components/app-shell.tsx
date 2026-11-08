import { Link } from "@tanstack/react-router";
import {
  CircleDot,
  ExternalLink,
  Home,
  ListPlus,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getUserProfile } from "../lib/firestore";
import { PredictorBadge } from "./predictor-badge";

type ShellUser = { uid: string; displayName?: string | null; photoURL?: string | null };
type PublicProfileSummary = {
  role?: string;
  username?: string;
  displayName?: string;
  photoURL?: string | null;
  accountVerified?: boolean;
  winRate?: number;
  settledTicketCount?: number;
};

export function AppShell({ children, user }: { children: ReactNode; user?: ShellUser | null }) {
  const [adminRole, setAdminRole] = useState(false);
  const [publicProfile, setPublicProfile] = useState<PublicProfileSummary | null>(null);
  const uid = user?.uid;

  useEffect(() => {
    let active = true;
    if (!uid) {
      setAdminRole(false);
      setPublicProfile(null);
      return () => {
        active = false;
      };
    }

    getUserProfile(uid)
      .then((profile) => {
        if (active) {
          setAdminRole(profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN");
          setPublicProfile(profile as PublicProfileSummary | null);
        }
      })
      .catch(() => {
        if (active) setAdminRole(false);
      });

    return () => {
      active = false;
    };
  }, [uid]);

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Wazee wa Betting TZ — nyumbani">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>
            <b>WAZEE WA</b>
            <small>BETTING TZ</small>
          </span>
        </Link>

        <nav className="top-nav" aria-label="Menyu kuu">
          <Link to="/" title="Nyumbani">
            <Home size={15} aria-hidden="true" /> Nyumbani
          </Link>
          <Link to="/matches" title="Mechi">
            <Trophy size={15} aria-hidden="true" /> Mechi
          </Link>
          <Link to="/community" title="Jamii">
            <Users size={15} aria-hidden="true" /> Jamii
          </Link>
          <Link to="/create-ticket" title="Tengeneza mkeka">
            <ListPlus size={15} aria-hidden="true" /> Tengeneza mkeka
          </Link>
          <Link to="/leaderboard" title="Leaderboard">
            <CircleDot size={15} aria-hidden="true" /> Ubora
          </Link>
          {adminRole && (
            <Link to="/admin" className="admin-entry" title="Dashibodi ya msimamizi">
              <ShieldCheck size={15} aria-hidden="true" /> Admin
            </Link>
          )}
          <a
            href="https://chat.whatsapp.com/CNhZ2jsVkgw0Lu0zaZHrlJ?s=cl&p=a&iam=2"
            target="_blank"
            rel="noopener noreferrer"
            title="Jiunge na WhatsApp"
          >
            <ExternalLink size={14} aria-hidden="true" /> WhatsApp
          </a>
        </nav>

        <div className="top-user">
          {user ? (
            <Link to="/dashboard" className="user-chip" aria-label="Fungua akaunti yako">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" />
              ) : (
                <span>{user.displayName?.[0] ?? "U"}</span>
              )}
              <b>{user.displayName ?? "Akaunti"}</b>
              <PredictorBadge
                compact
                accountVerified={!!publicProfile}
                winRate={publicProfile?.winRate ?? 0}
                settledTicketCount={publicProfile?.settledTicketCount ?? 0}
              />
            </Link>
          ) : (
            <div className="gsb-auth-actions" aria-label="Ingia au jisajili">
              <Link to="/register">Jisajili</Link>
              <Link to="/login">Ingia</Link>
            </div>
          )}
        </div>
      </header>

      <aside className="site-safety-note" aria-label="Taarifa kuhusu coin na malipo">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>Coins ni za majaribio tu. Kwa sasa hakuna kuweka au kutoa fedha halisi.</span>
        <Link to="/terms">Soma maelezo</Link>
      </aside>

      <main>{children}</main>

      <nav className="bottom-nav" aria-label="Menyu ya simu">
        <Link to="/" title="Nyumbani">
          <Home size={20} aria-hidden="true" />
          <span>Nyumbani</span>
        </Link>
        <Link to="/matches" title="Mechi">
          <Trophy size={20} aria-hidden="true" />
          <span>Mechi</span>
        </Link>
        <Link to="/create-ticket" title="Tengeneza mkeka">
          <ListPlus size={20} aria-hidden="true" />
          <span>Jenga</span>
        </Link>
        <Link to="/community" title="Jamii">
          <Users size={20} aria-hidden="true" />
          <span>Jamii</span>
        </Link>
        <Link to={user ? "/dashboard" : "/login"} title="Akaunti">
          <UserRound size={20} aria-hidden="true" />
          <span>Akaunti</span>
        </Link>
      </nav>
    </div>
  );
}
