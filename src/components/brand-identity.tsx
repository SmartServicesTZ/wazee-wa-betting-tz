import { BadgeCheck } from "lucide-react";
export function BrandIdentity({ handle = true }: { handle?: boolean }) {
  return (
    <span className="brand-identity">
      <strong>Wazee wa Betting TZ</strong>
      <BadgeCheck className="brand-verified" size={16} aria-label="Beji ya akaunti ya brand" />
      {handle && <small>@wazee_betting_tz</small>}
    </span>
  );
}
