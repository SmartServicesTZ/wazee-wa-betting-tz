import { BadgeCheck, CheckCircle2 } from "lucide-react";
import { getPredictorBadge } from "../lib/betting";

type Props = { accountVerified?: boolean; winRate?: number; settledTicketCount?: number; compact?: boolean };
export function PredictorBadge({ accountVerified = false, winRate = 0, settledTicketCount = 0, compact = false }: Props) {
  const badge = getPredictorBadge(Number(winRate || 0), Number(settledTicketCount || 0));
  return <span className="predictor-badges">
    {accountVerified && <span className="account-verified" title="Akaunti imethibitishwa"><BadgeCheck size={compact ? 14 : 17} /></span>}
    <span className={`predictor-rating predictor-${badge.color}`} title={badge.eligible ? badge.label : "Inahitaji angalau mikeka 10 iliyokamilika"}>
      <CheckCircle2 size={compact ? 13 : 16} />
      {badge.eligible ? `${Number(winRate).toFixed(0)}%` : compact ? "—" : "Takwimu zinaendelea"}
    </span>
  </span>;
}
