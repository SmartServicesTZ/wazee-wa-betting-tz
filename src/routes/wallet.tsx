import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, LockKeyhole, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { AppShell } from "../components/app-shell";
import { subscribeToAuth } from "../lib/firebase";

export const Route = createFileRoute("/wallet")({ component: Wallet });

function Wallet() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => subscribeToAuth(setUser), []);
  if (!user)
    return (
      <AppShell>
        <div className="page narrow">
          <div className="empty">
            <WalletCards size={28} />
            <b>Ingia ili kuona Wallet Demo.</b>
            <Link className="btn btn-primary" to="/login">
              Ingia
            </Link>
          </div>
        </div>
      </AppShell>
    );
  return (
    <AppShell user={user}>
      <div className="page stage2-page wallet-page">
        <div className="page-title">
          <div>
            <span className="eyebrow">ACCOUNT WALLET</span>
            <h1>Wallet yako.</h1>
            <p>Muonekano wa read-only kwa ajili ya maandalizi ya integration ya baadaye.</p>
          </div>
          <span className="demo-badge">
            <LockKeyhole size={13} /> DEMO / READ ONLY
          </span>
        </div>
        <section className="wallet-hero-card">
          <div>
            <span>Demo balance</span>
            <strong>TZS 0.00</strong>
            <small>Hii si pesa halisi na haiwezi kutolewa.</small>
          </div>
          <WalletCards size={54} />
        </section>
        <div className="wallet-actions">
          <button className="btn btn-secondary" disabled>
            <ArrowDownLeft size={16} /> Add funds disabled
          </button>
          <button className="btn btn-secondary" disabled>
            <ArrowUpRight size={16} /> Withdraw disabled
          </button>
        </div>
        <section className="panel">
          <div className="section-toolbar">
            <div>
              <span className="eyebrow">ACTIVITY</span>
              <h2>Wallet activity</h2>
            </div>
            <ReceiptText size={18} />
          </div>
          <div className="empty compact-empty">
            <ReceiptText size={24} />
            <b>Hakuna transaction.</b>
            <span>Malipo, purchases na withdrawals bado hazijawezeshwa.</span>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
