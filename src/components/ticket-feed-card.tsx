import { Link } from "@tanstack/react-router";
import type { User } from "firebase/auth";
import { Heart, MessageCircle, Send, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import {
  addComment,
  getTicketEngagement,
  listTicketComments,
  toggleLike,
  type PublicTicket,
  type TicketComment,
} from "../lib/firestore";
import { shareTicketLink } from "../lib/share";
import { BrandIdentity } from "./brand-identity";

type TicketFeedCardProps = {
  ticket: PublicTicket;
  currentUser?: User | null;
  compact?: boolean;
};

function formatPostedAt(value: unknown) {
  const timestamp = value as { toDate?: () => Date } | undefined;
  const date = timestamp?.toDate?.();
  return date
    ? date.toLocaleString("sw-TZ", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sasa hivi";
}

function formatOptionalNumber(value: unknown, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}${suffix}` : "—";
}

export function TicketFeedCard({
  ticket,
  currentUser = null,
  compact = false,
}: TicketFeedCardProps) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [reactionLoading, setReactionLoading] = useState(true);
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [commentError, setCommentError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setReactionLoading(true);
    getTicketEngagement(ticket.id, currentUser?.uid)
      .then((engagement) => {
        if (!active) return;
        setLiked(engagement.liked);
        setLikeCount(engagement.likeCount);
        setCommentCount(engagement.commentCount);
      })
      .catch(() => {
        if (active) setCommentError("Takwimu za likes na comments hazijapakia.");
      })
      .finally(() => {
        if (active) setReactionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ticket.id, currentUser?.uid]);

  const loadComments = async () => {
    setCommentsLoading(true);
    setCommentError("");
    try {
      const rows = await listTicketComments(ticket.id, 20);
      setComments(rows);
      setCommentsLoaded(true);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "Comments hazijapakia.");
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleLike = async () => {
    if (!currentUser || likeBusy) return;
    setLikeBusy(true);
    try {
      const nextLiked = await toggleLike(ticket.id, currentUser.uid);
      setLiked(nextLiked);
      setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kuweka like.");
    } finally {
      setLikeBusy(false);
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = commentText.trim();
    if (!currentUser || !text || commentBusy) return;
    setCommentBusy(true);
    try {
      const authorName =
        currentUser.displayName || currentUser.email?.split("@")[0] || "Mwanajamii";
      await addComment(ticket.id, currentUser.uid, authorName, text);
      setCommentText("");
      setCommentCount((count) => count + 1);
      await loadComments();
      toast.success("Maoni yako yamechapishwa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kuchapisha comment.");
    } finally {
      setCommentBusy(false);
    }
  };

  const share = async () => {
    try {
      const result = await shareTicketLink(ticket.id, ticket.title);
      if (result === "copied") toast.success("Link ya mkeka imenakiliwa.");
      if (result === "manual") toast.info("Nakili link iliyoonyeshwa ili kuishiriki.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kushiriki mkeka.");
    }
  };

  return (
    <article className={`ticket-feed-card${compact ? " compact" : ""}`}>
      <Link
        className="ticket-feed-card-main"
        to="/tickets/$ticketId"
        params={{ ticketId: ticket.id }}
      >
        <div className="ticket-feed-author">
          <span className="ticket-avatar">
            {ticket.creatorPhotoURL ? (
              <img src={ticket.creatorPhotoURL} alt="" loading="lazy" />
            ) : (
              (ticket.creatorName?.[0] ?? "W")
            )}
          </span>
          <span className="ticket-feed-author-copy">
            {ticket.automated ? (
              <BrandIdentity />
            ) : (
              <>
                <b>{ticket.creatorName || "Mwanajamii"}</b>
                <small>
                  {ticket.creatorCountryFlag ? `${ticket.creatorCountryFlag} ` : ""}@{ticket.creatorUsername || "mwanajamii"} · {formatPostedAt(ticket.createdAt)}
                </small>
              </>
            )}
          </span>
          <span className="ticket-feed-badges">
            <span className={`ticket-access-badge ${ticket.access === "VIP" ? "vip" : "free"}`}>
              {ticket.access === "VIP" ? "VIP" : "BURE"}
            </span>
            <span className={`status status-${String(ticket.status ?? "PENDING").toLowerCase()}`}>
              {ticket.status ?? "PENDING"}
            </span>
          </span>
        </div>
        <h3>{ticket.title || "Mkeka wa jamii"}</h3>
        {ticket.automated && (
          <p className="brand-disclaimer">
            Mkeka wa mfumo — Wazee wa Betting TZ. Hakuna uhakika wa ushindi. Cheza kwa uwajibikaji.
          </p>
        )}
        {!compact && ticket.description && (
          <p className="ticket-feed-description">{ticket.description}</p>
        )}
        <div className="ticket-feed-meta">
          <span>{ticket.selectionCount ?? 0} mechi</span>
          <span>
            Odds jumla <b>{formatOptionalNumber(ticket.totalOdds)}</b>
          </span>
          <span>
            {ticket.risk === "LOW"
              ? "Hatari ndogo"
              : ticket.risk === "HIGH"
                ? "Hatari kubwa"
                : "Hatari ya kati"}
          </span>
        </div>
        <div className="ticket-feed-finance">
          <span>Probability <b>{formatOptionalNumber(ticket.winProbability, "%")}</b></span>
          <span>Stake <b>{formatOptionalNumber(ticket.stake)}</b></span>
          <span>Potential <b>{formatOptionalNumber(ticket.potentialWin)}</b></span>
          <span>ROI <b>{formatOptionalNumber(ticket.roi, "%")}</b></span>
        </div>
      </Link>
      <div className="ticket-feed-actions" aria-label="Vitendo vya mkeka">
        <Link className="ticket-bet-now" to="/tickets/$ticketId" params={{ ticketId: ticket.id }}>BET NOW</Link>
        {currentUser ? (
          <button
            type="button"
            className={liked ? "ticket-reaction-active" : ""}
            aria-pressed={liked}
            disabled={reactionLoading || likeBusy}
            onClick={handleLike}
          >
            <Heart size={16} fill={liked ? "currentColor" : "none"} />
            <span>{liked ? "Ume-like" : "Like"}</span>
            <b>{reactionLoading ? "…" : likeCount}</b>
          </button>
        ) : (
          <Link to="/login" aria-label="Ingia ili ku-like mkeka">
            <Heart size={16} /> Like <b>{reactionLoading ? "…" : likeCount}</b>
          </Link>
        )}
        <button
          type="button"
          className={commentsOpen ? "ticket-reaction-active" : ""}
          aria-expanded={commentsOpen}
          onClick={() => {
            const open = !commentsOpen;
            setCommentsOpen(open);
            if (open && !commentsLoaded) void loadComments();
          }}
        >
          <MessageCircle size={16} /> Maoni <b>{reactionLoading ? "…" : commentCount}</b>
        </button>
        <button
          className="ticket-feed-share-action"
          type="button"
          onClick={share}
          aria-label="Shiriki link ya mkeka"
        >
          <Share2 size={16} /> Shiriki
        </button>
      </div>
      {commentsOpen && (
        <section className="ticket-inline-comments" aria-label={`Maoni ya ${ticket.title}`}>
          {commentsLoading ? (
            <p className="ticket-comments-state">Inapakia maoni...</p>
          ) : commentError ? (
            <div className="ticket-comments-state ticket-comments-error">
              <span>{commentError}</span>
              <button type="button" onClick={() => void loadComments()}>
                Jaribu tena
              </button>
            </div>
          ) : comments.length ? (
            <div className="ticket-inline-comment-list">
              {comments.map((comment) => (
                <article className="ticket-inline-comment" key={comment.id}>
                  <span className="ticket-inline-comment-avatar">
                    {comment.authorName?.[0] ?? "W"}
                  </span>
                  <div>
                    <div className="ticket-inline-comment-meta">
                      <b>{comment.authorName || "Mwanajamii"}</b>
                      <small>{formatPostedAt(comment.createdAt)}</small>
                    </div>
                    <p>{comment.text}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="ticket-comments-state">Hakuna maoni bado. Anza mazungumzo.</p>
          )}
          {currentUser ? (
            <form className="ticket-inline-comment-form" onSubmit={submitComment}>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Andika maoni yako..."
                aria-label="Andika maoni yako"
                maxLength={1000}
                rows={2}
              />
              <div className="ticket-inline-comment-submit">
                <small>{commentText.length}/1000</small>
                <button type="submit" disabled={commentBusy || !commentText.trim()}>
                  <Send size={15} /> {commentBusy ? "Inatuma..." : "Tuma maoni"}
                </button>
              </div>
            </form>
          ) : (
            <p className="ticket-comments-login">
              <Link to="/login">Ingia</Link> ili kuandika maoni.
            </p>
          )}
        </section>
      )}
    </article>
  );
}
