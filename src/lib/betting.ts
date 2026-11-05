export type TicketStatus = "PENDING" | "WON" | "LOST" | "VOID" | "CANCELLED";
export type SelectionStatus = TicketStatus;
export type MarketKey = "1X2" | "DOUBLE_CHANCE" | "OVER_UNDER" | "BTTS" | "DRAW_NO_BET" | "HANDICAP" | "HALF_TIME" | "FULL_TIME";

export type Selection = {
  id?: string;
  matchId: string;
  market: MarketKey;
  line?: number | null;
  prediction: string;
  odds: number;
  status?: SelectionStatus;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  leagueName?: string;
};

export function calculateTotalOdds(selections: Pick<Selection, "odds">[]) {
  return Number(selections.reduce((total, item) => total * Number(item.odds || 1), 1).toFixed(2));
}

export function canEditTicket(kickoffDates: string[]) {
  return kickoffDates.every((date) => new Date(date).getTime() > Date.now());
}

export function deriveTicketStatus(statuses: SelectionStatus[]): TicketStatus {
  if (!statuses.length) return "PENDING";
  if (statuses.includes("CANCELLED")) return "CANCELLED";
  const active = statuses.filter((status) => status !== "VOID");
  if (!active.length) return "VOID";
  if (active.includes("LOST")) return "LOST";
  if (active.includes("PENDING")) return "PENDING";
  return "WON";
}


export type PredictorBadge = { color: "red" | "blue" | "green" | "neutral"; label: string; eligible: boolean };
export function getPredictorBadge(winRate: number, settledTicketCount: number): PredictorBadge {
  if (settledTicketCount < 10) return { color: "neutral", label: "Takwimu zinaendelea", eligible: false };
  if (winRate < 35) return { color: "red", label: "Matokeo mabaya", eligible: true };
  if (winRate < 65) return { color: "blue", label: "Matokeo ya wastani", eligible: true };
  return { color: "green", label: "Matokeo mazuri sana", eligible: true };
}
export function getWinRate(won: number, lost: number) {
  const completed = won + lost;
  return completed ? Number(((won / completed) * 100).toFixed(2)) : 0;
}
