import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, BadgeCheck, Search, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { AppShell } from "../components/app-shell";
import { subscribeToAuth } from "../lib/firebase";
import { listPublicTickets, type PublicTicket } from "../lib/firestore";

export const Route = createFileRoute("/marketplace")({ component: Marketplace });

function Marketplace() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => subscribeToAuth(setUser), []);
  useEffect(() => {
    listPublicTickets(12)
      .then(setTickets)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell user={user}>
      <div className="page stage2-page">
        <section className="marketplace-hero">
          <div>
            <span className="eyebrow">
              <Sparkles size={14} /> MARKETPLACE
            </span>
            <h1>Mikeka ya kuchagua.</h1>
            <p>Gundua previews za mikeka ya jamii na tipsters wenye rekodi inayoonekana.</p>
          </div>
          <div className="marketplace-hero-note">
            <BadgeCheck size={20} />
            <span>
              <b>Demo experience</b>
              <small>Malipo halisi hayajawezeshwa.</small>
            </span>
          </div>
        </section>
        <div className="stage2-toolbar">
          <label className="market-search">
            <Search size={17} />
            <input placeholder="Tafuta mkeka, ligi au tipster..." />
          </label>
          <div className="stage2-filter-pills">
            <button className="is-active">Maarufu</button>
            <button>Odds mpya</button>
            <button>Tipsters</button>
          </div>
        </div>
        <div className="marketplace-layout">
          <aside className="seller-card">
            <span className="eyebrow">SELLER CENTRE</span>
            <div className="seller-avatar">W</div>
            <h2>Jenga reputation yako.</h2>
            <p>
              Omba kuwa seller na uweke mikeka yako mbele ya community. Earnings hapa ni demo tu.
            </p>
            <Link className="btn btn-primary" to="/seller-center">
              Fungua Seller Center <ArrowUpRight size={15} />
            </Link>
          </aside>
          <section className="marketplace-content">
            <div className="section-toolbar">
              <div>
                <span className="eyebrow">FEATURED LISTINGS</span>
                <h2>Previews za leo</h2>
              </div>
              <span className="listing-count">
                <ShoppingBag size={15} /> {tickets.length || 0} listings
              </span>
            </div>
            {loading ? (
              <div className="panel empty">Inapakia marketplace previews...</div>
            ) : tickets.length ? (
              <div className="marketplace-grid">
                {tickets.slice(0, 8).map((ticket) => (
                  <article className="listing-card" key={ticket.id}>
                    <div className="listing-head">
                      <div className="seller-mini">
                        <span>{ticket.creatorName?.[0] ?? "W"}</span>
                        <div>
                          <b>{ticket.creatorName || "Wazee wa Betting TZ"}</b>
                          <small>@{ticket.creatorUsername || "wazee_betting_tz"}</small>
                        </div>
                      </div>
                      <BadgeCheck size={17} className="verified-icon" />
                    </div>
                    <div className="listing-copy">
                      <span className="status status-pending">PREVIEW</span>
                      <h3>{ticket.title}</h3>
                      <p>
                        {ticket.selectionCount} selections • {Number(ticket.totalOdds).toFixed(2)}{" "}
                        odds
                      </p>
                    </div>
                    <div className="listing-metrics">
                      <span>
                        <Star size={13} /> Community pick
                      </span>
                      <b>DEMO</b>
                    </div>
                    <div className="listing-actions">
                      <Link to="/tickets/$ticketId" params={{ ticketId: ticket.id }}>
                        Angalia
                      </Link>
                      <button onClick={() => toast.info("Hii ni demo — malipo hayajawezeshwa.")}>
                        Preview purchase
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="panel empty">Hakuna listings za kuonyesha sasa.</div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
