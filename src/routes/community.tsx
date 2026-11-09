import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { AppShell } from "../components/app-shell";
import { TicketFeedCard } from "../components/ticket-feed-card";
import { subscribeToAuth } from "../lib/firebase";
import { listPublicTickets, type PublicTicket } from "../lib/firestore";

export const Route = createFileRoute("/community")({ component: Community });

function Community() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessFilter, setAccessFilter] = useState<"ALL" | "FREE" | "VIP">("ALL");

  useEffect(() => subscribeToAuth(setUser), []);
  useEffect(() => {
    let active = true;
    listPublicTickets(20)
      .then((rows) => {
        if (active) setTickets(rows);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Imeshindikana kupakia jamii.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleTickets =
    accessFilter === "ALL"
      ? tickets
      : tickets.filter((ticket) => (ticket.access ?? "FREE") === accessFilter);
  const freeCount = tickets.filter((ticket) => (ticket.access ?? "FREE") === "FREE").length;
  const vipCount = tickets.filter((ticket) => ticket.access === "VIP").length;

  return (
    <AppShell user={user}>
      <div className="page narrow community-page">
        <div className="page-title">
          <div>
            <span className="eyebrow">JAMII</span>
            <h1>Mikeka ya wanajamii</h1>
            <p>Angalia mikeka mipya, toa maoni, like, au shiriki link na marafiki.</p>
          </div>
          <Link className="btn btn-primary" to="/create-ticket">
            Chapisha mkeka
          </Link>
        </div>
        <div className="community-feed">
          {!loading && !error && tickets.length > 0 && (
            <div className="community-access-filters" role="group" aria-label="Chuja aina ya mkeka">
              {(
                [
                  ["ALL", "Mikeka yote", tickets.length],
                  ["FREE", "Bure", freeCount],
                  ["VIP", "VIP", vipCount],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={accessFilter === value ? "active" : ""}
                  aria-pressed={accessFilter === value}
                  onClick={() => setAccessFilter(value)}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="panel empty">Inapakia mikeka ya jamii...</div>
          ) : error ? (
            <div className="panel empty">
              <b>Feed haijapakia.</b>
              <span>{error}</span>
              <button className="btn btn-secondary" onClick={() => window.location.reload()}>
                Jaribu tena
              </button>
            </div>
          ) : visibleTickets.length ? (
            visibleTickets.map((ticket) => (
              <TicketFeedCard key={ticket.id} ticket={ticket} currentUser={user} />
            ))
          ) : (
            <div className="panel empty">
              <b>
                {tickets.length
                  ? `Hakuna mikeka ya ${accessFilter === "VIP" ? "VIP" : "bure"} kwa sasa.`
                  : "Bado hakuna mikeka ya umma."}
              </b>
              <span>
                {tickets.length
                  ? "Chagua aina nyingine au rudi baadaye."
                  : "Chapisha mkeka wako wa kwanza ili kuanzisha mjadala."}
              </span>
              {!tickets.length && (
                <Link className="btn btn-primary" to="/create-ticket">
                  Tengeneza mkeka
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
