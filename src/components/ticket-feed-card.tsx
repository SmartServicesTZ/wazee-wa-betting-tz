import { Link } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import type { PublicTicket } from "../lib/firestore";
import { shareTicketLink } from "../lib/share";

type TicketFeedCardProps = {
  ticket: PublicTicket;
  compact?: boolean;
};

export function TicketFeedCard({ ticket, compact = false }: TicketFeedCardProps) {
  const share = async () => {
    try {
      const result = await shareTicketLink(ticket.id, ticket.title);
      if (result === "copied") toast.success("Link ya mkeka imenakiliwa.");
      if (result === "manual") toast.info("Nakili link iliyoonyeshwa ili kuishiriki.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kushiriki mkeka.");
    }
  };

  const createdAt = ticket.createdAt as { toDate?: () => Date } | undefined;
  const postedAt = createdAt?.toDate?.();
  const dateLabel = postedAt
    ? postedAt.toLocaleString("sw-TZ", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Mkeka mpya";

  return (
    <article className={`ticket-feed-card${compact ? " compact" : ""}`}>
      <Link
        className="ticket-feed-card-main"
        to="/tickets/$ticketId"
        params={{ ticketId: ticket.id }}
      >
        <div className="ticket-feed-author">
          <span className="ticket-avatar">{ticket.creatorName?.[0] ?? "W"}</span>
          <span className="ticket-feed-author-copy">
            <b>{ticket.creatorName || "Mwanajamii"}</b>
            <small>
              @{ticket.creatorUsername || "mwanajamii"} · {dateLabel}
            </small>
          </span>
          <span className={`status status-${String(ticket.status ?? "PENDING").toLowerCase()}`}>
            {ticket.status ?? "PENDING"}
          </span>
        </div>
        <h3>{ticket.title || "Mkeka wa jamii"}</h3>
        {!compact && ticket.description && (
          <p className="ticket-feed-description">{ticket.description}</p>
        )}
        <div className="ticket-feed-meta">
          <span>{ticket.selectionCount ?? 0} mechi</span>
          <span>
            Odds jumla <b>{Number(ticket.totalOdds ?? 0).toFixed(2)}</b>
          </span>
          <span>
            {ticket.risk === "LOW"
              ? "Hatari ndogo"
              : ticket.risk === "HIGH"
                ? "Hatari kubwa"
                : "Hatari ya kati"}
          </span>
        </div>
      </Link>
      <div className="ticket-feed-actions">
        <Link to="/tickets/$ticketId" params={{ ticketId: ticket.id }}>
          Like na comment
        </Link>
        <button type="button" onClick={share} aria-label="Shiriki link ya mkeka">
          <Share2 size={16} /> Shiriki
        </button>
      </div>
    </article>
  );
}
