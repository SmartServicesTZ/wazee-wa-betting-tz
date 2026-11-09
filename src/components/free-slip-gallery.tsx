import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, ImageDown, Share2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { listAutomatedFreeTickets, type PublicFreeTicket } from "../lib/firestore";
import { TeamLogo } from "./team-logo";

type OddsTarget = 3 | 5 | 10;
const TARGETS: Array<{ value: OddsTarget; label: string }> = [
  { value: 3, label: "Odds 3" },
  { value: 5, label: "Odds 5" },
  { value: 10, label: "Odds 10" },
];

function tanzaniaDateKey(value: unknown) {
  const date =
    value instanceof Date
      ? value
      : value && typeof value === "object" && "toDate" in value
        ? (value as { toDate: () => Date }).toDate()
        : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(date);
}
function formatDate(value: unknown) {
  const date =
    value instanceof Date
      ? value
      : value && typeof value === "object" && "toDate" in value
        ? (value as { toDate: () => Date }).toDate()
        : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime())
    ? "Tarehe haijulikani"
    : new Intl.DateTimeFormat("sw-TZ", {
        timeZone: "Africa/Dar_es_Salaam",
        dateStyle: "medium",
      }).format(date);
}
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(new Date());
}
function ticketDate(ticket: PublicFreeTicket) {
  return ticket.automationWindow?.slice(0, 10) || tanzaniaDateKey(ticket.createdAt);
}
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
async function makeSlipImage(ticket: PublicFreeTicket, target: OddsTarget) {
  const items = ticket.selections ?? [];
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = Math.max(1280, 420 + items.length * 122 + 270);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kifaa hakiwezi kutengeneza picha.");
  const bg = ctx.createLinearGradient(0, 0, 1080, canvas.height);
  bg.addColorStop(0, "#071a38");
  bg.addColorStop(1, "#06101f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1d66d1";
  ctx.fillRect(0, 0, 1080, 22);
  ctx.fillStyle = "#f5f9ff";
  ctx.font = "800 48px Arial";
  ctx.fillText("WAZEE WA BETTING TZ", 58, 94);
  ctx.fillStyle = "#70b7ff";
  ctx.font = "800 34px Arial";
  ctx.fillText(`MKEKA WA LEO • ODDS ${target}`, 58, 150);
  ctx.fillStyle = "#b8c9dd";
  ctx.font = "24px Arial";
  ctx.fillText(formatDate(ticket.createdAt), 58, 193);
  ctx.fillStyle = "#ffffff12";
  ctx.fillRect(55, 220, 970, 2);
  let y = 258;
  for (const [index, selection] of items.entries()) {
    ctx.fillStyle = "#102c50";
    ctx.beginPath();
    ctx.roundRect(48, y, 984, 96, 16);
    ctx.fill();
    ctx.fillStyle = "#70b7ff";
    ctx.font = "800 24px Arial";
    ctx.fillText(String(index + 1).padStart(2, "0"), 72, y + 38);
    const homeLogo = selection.homeTeamLogo
      ? loadImage(selection.homeTeamLogo).catch(() => null)
      : Promise.resolve(null);
    const awayLogo = selection.awayTeamLogo
      ? loadImage(selection.awayTeamLogo).catch(() => null)
      : Promise.resolve(null);
    const [home, away] = await Promise.all([homeLogo, awayLogo]);
    if (home) ctx.drawImage(home, 120, y + 17, 42, 42);
    if (away) ctx.drawImage(away, 168, y + 17, 42, 42);
    ctx.fillStyle = "#f5f9ff";
    ctx.font = "800 24px Arial";
    ctx.fillText(`${selection.homeTeam} vs ${selection.awayTeam}`.slice(0, 46), 225, y + 38);
    ctx.fillStyle = "#b8c9dd";
    ctx.font = "20px Arial";
    ctx.fillText(
      `${selection.leagueName || "Mashindano"} • ${selection.prediction}`.slice(0, 55),
      225,
      y + 70,
    );
    ctx.fillStyle = "#8ed0ff";
    ctx.font = "800 28px Arial";
    ctx.textAlign = "right";
    ctx.fillText(Number(selection.odds).toFixed(2), 990, y + 55);
    ctx.textAlign = "left";
    y += 114;
  }
  ctx.fillStyle = "#153d70";
  ctx.beginPath();
  ctx.roundRect(48, y + 16, 984, 150, 18);
  ctx.fill();
  ctx.fillStyle = "#b8c9dd";
  ctx.font = "800 23px Arial";
  ctx.fillText("JUMLA YA ODDS", 78, y + 70);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 62px Arial";
  ctx.fillText(Number(ticket.totalOdds).toFixed(2), 78, y + 132);
  ctx.fillStyle = "#c7d5e5";
  ctx.font = "19px Arial";
  ctx.fillText(
    "Odds zinatokana na data iliyopo; hakuna uhakika wa ushindi.",
    55,
    canvas.height - 72,
  );
  ctx.fillStyle = "#70b7ff";
  ctx.font = "800 20px Arial";
  ctx.fillText("Cheza kwa uwajibikaji • FREE", 55, canvas.height - 36);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Picha haikutengenezwa."))),
      "image/png",
    ),
  );
}
function SlipPoster({ ticket, target }: { ticket: PublicFreeTicket; target: OddsTarget }) {
  const [busy, setBusy] = useState(false);
  const exportImage = async (share: boolean) => {
    setBusy(true);
    try {
      const blob = await makeSlipImage(ticket, target);
      const file = new File([blob], `mkeka-wa-leo-odds-${target}.png`, { type: "image/png" });
      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Mkeka wa Leo — Odds ${target}` });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success("Picha ya mkeka imehifadhiwa.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Picha haikutengenezwa.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="free-slip-poster">
      <div className="free-slip-poster-head">
        <div>
          <span className="eyebrow">FREE • DATA HALISI</span>
          <h3>Mkeka wa Leo — Odds {target}</h3>
          <p>
            {formatDate(ticket.createdAt)} · {ticket.selections?.length ?? 0} chaguo
          </p>
        </div>
        <strong>{Number(ticket.totalOdds).toFixed(2)}</strong>
      </div>
      <div className="free-slip-selections">
        {(ticket.selections ?? []).map((selection, index) => (
          <div
            className="free-slip-selection"
            key={selection.id ?? `${selection.matchId}-${index}`}
          >
            <span className="free-slip-number">{index + 1}</span>
            <div className="free-slip-teams">
              <div>
                <TeamLogo name={selection.homeTeam} src={selection.homeTeamLogo ?? null} />
                <b>{selection.homeTeam}</b>
              </div>
              <div>
                <TeamLogo name={selection.awayTeam} src={selection.awayTeamLogo ?? null} />
                <b>{selection.awayTeam}</b>
              </div>
              <small>
                {selection.leagueName || "Mashindano"} · {selection.prediction}
              </small>
            </div>
            <b className="free-slip-odd">{Number(selection.odds).toFixed(2)}</b>
          </div>
        ))}
      </div>
      <div className="free-slip-actions">
        <Link
          className="btn btn-secondary"
          to="/tickets/$ticketId"
          params={{ ticketId: ticket.id }}
        >
          Fungua mkeka
        </Link>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void exportImage(false)}
        >
          <ImageDown size={16} /> Pakua picha
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void exportImage(true)}>
          <Share2 size={16} /> Shiriki
        </button>
      </div>
    </article>
  );
}
function History({ tickets }: { tickets: PublicFreeTicket[] }) {
  return (
    <div className="free-slip-history">
      <div className="free-slip-history-title">
        <h3>Historia ya kundi hili</h3>
        <span>{tickets.length} rekodi</span>
      </div>
      {tickets.length ? (
        tickets.map((ticket) => (
          <Link
            className="free-slip-history-row"
            key={ticket.id}
            to="/tickets/$ticketId"
            params={{ ticketId: ticket.id }}
          >
            <CalendarDays size={18} />
            <div>
              <b>{formatDate(ticket.createdAt)}</b>
              <small>
                {(ticket.selections ?? [])
                  .map((s) => `${s.prediction} (${Number(s.odds).toFixed(2)})`)
                  .join(" · ")}
              </small>
            </div>
            <strong>{Number(ticket.totalOdds).toFixed(2)}</strong>
            <span className={`status status-${String(ticket.status).toLowerCase()}`}>
              {ticket.status === "PENDING"
                ? "Inasubiri"
                : ticket.status === "WON" || ticket.status === "LOST"
                  ? ticket.status
                  : "Haijathibitishwa"}
            </span>
          </Link>
        ))
      ) : (
        <div className="free-slip-empty">
          <Trophy size={22} />
          <span>Hakuna historia ya kundi hili bado.</span>
        </div>
      )}
    </div>
  );
}
export function FreeSlipGallery() {
  const [target, setTarget] = useState<OddsTarget>(3);
  const [tickets, setTickets] = useState<PublicFreeTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  useEffect(() => {
    let active = true;
    listAutomatedFreeTickets(60)
      .then((rows) => {
        if (active) setTickets(rows);
      })
      .catch(() => {
        if (active) setTickets([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const grouped = useMemo(
    () => tickets.filter((ticket) => Number(ticket.targetOdds) === target),
    [tickets, target],
  );
  const today = useMemo(
    () => grouped.find((ticket) => ticketDate(ticket) === todayKey()) ?? null,
    [grouped],
  );
  const history = useMemo(
    () => grouped.filter((ticket) => ticket.id !== today?.id).slice(0, 30),
    [grouped, today],
  );
  return (
    <section className="free-slip-gallery" aria-labelledby="free-slips-heading">
      <div className="free-slip-heading">
        <div>
          <span className="eyebrow">MIKEKA YA BURE</span>
          <h2 id="free-slips-heading">Chagua kundi la odds</h2>
          <p>Data halisi iliyopo kwenye mfumo. Hakuna uhakika wa ushindi.</p>
        </div>
        <span className="free-slip-risk">Betting ina hatari</span>
      </div>
      <div className="free-slip-tabs" role="tablist" aria-label="Makundi ya mikeka ya bure">
        {TARGETS.map((item) => (
          <button
            key={item.value}
            role="tab"
            aria-selected={target === item.value}
            className={target === item.value ? "active" : ""}
            onClick={() => setTarget(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="free-slip-empty">Inapakia mikeka ya bure...</div>
      ) : today ? (
        <SlipPoster ticket={today} target={target} />
      ) : (
        <div className="free-slip-empty">
          <Trophy size={22} />
          <b>Hakuna mkeka wa leo wa Odds {target}.</b>
          <span>Haikuundwa kwa sababu hakuna data ya kutosha iliyokidhi kundi hili.</span>
        </div>
      )}
      <button
        className="free-slip-history-toggle"
        onClick={() => setHistoryOpen((value) => !value)}
      >
        <span>Historia ya Odds {target}</span>
        {historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {historyOpen && <History tickets={history} />}
    </section>
  );
}
