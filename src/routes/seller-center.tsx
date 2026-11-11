import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, BarChart3, Clock3, LockKeyhole, Plus, Store, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { AppShell } from "../components/app-shell";
import { subscribeToAuth } from "../lib/firebase";

export const Route = createFileRoute("/seller-center")({ component: SellerCenter });

function SellerCenter() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => subscribeToAuth(setUser), []);
  if (!user) {
    return (
      <AppShell>
        <div className="page narrow">
          <div className="empty">
            <Store size={28} />
            <b>Ingia ili kufungua Seller Center.</b>
            <Link className="btn btn-primary" to="/login">
              Ingia
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell user={user}>
      <div className="page stage2-page">
        <div className="page-title">
          <div>
            <span className="eyebrow">SELLER CENTRE</span>
            <h1>Jenga duka lako.</h1>
            <p>Dashboard ya demo ya creators wanaotaka kushiriki mikeka yao.</p>
          </div>
          <button className="btn btn-primary" onClick={() => undefined}>
            <Plus size={16} /> Create listing
          </button>
        </div>
        <div className="seller-status-banner">
          <Clock3 size={18} />
          <div>
            <b>Application status: Demo preview</b>
            <span>Approval ya seller na payment provider inahitajika kabla ya mauzo halisi.</span>
          </div>
          <BadgeCheck size={18} />
        </div>
        <div className="stage2-stat-grid">
          <div className="stage2-stat">
            <BarChart3 size={18} />
            <small>Listings</small>
            <b>0</b>
            <span>Demo data only</span>
          </div>
          <div className="stage2-stat">
            <Store size={18} />
            <small>Profile views</small>
            <b>—</b>
            <span>Will connect later</span>
          </div>
          <div className="stage2-stat">
            <WalletCards size={18} />
            <small>Demo earnings</small>
            <b>TZS 0</b>
            <span>Not real money</span>
          </div>
        </div>
        <div className="seller-grid">
          <section className="panel">
            <div className="section-toolbar">
              <div>
                <span className="eyebrow">MY LISTINGS</span>
                <h2>Listings zako</h2>
              </div>
              <span className="demo-badge">DEMO</span>
            </div>
            <div className="empty compact-empty">
              <Store size={24} />
              <b>Bado hujaweka listing.</b>
              <span>Anza na ticket iliyotengenezwa kwenye account yako.</span>
              <Link className="btn btn-secondary" to="/create-ticket">
                Tengeneza mkeka
              </Link>
            </div>
          </section>
          <section className="panel">
            <div className="section-toolbar">
              <div>
                <span className="eyebrow">PAYOUTS</span>
                <h2>Withdrawals</h2>
              </div>
              <LockKeyhole size={18} />
            </div>
            <div className="wallet-demo-card">
              <b>Real-money wallet haijawezeshwa</b>
              <span>Withdrawals zimezimwa mpaka provider na backend ya malipo ithibitishwe.</span>
              <button className="btn btn-secondary" disabled>
                Withdraw disabled
              </button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
