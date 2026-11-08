import { useState } from "react";

type TeamLogoProps = { name?: string | null; src?: string | null; className?: string };

export function TeamLogo({ name, src, className = "" }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);
  const label = name?.trim() || "Timu";
  return (
    <span className={`team-logo ${className}`} aria-label={label}>
      {src && !failed ? (
        <img src={src} alt={label} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{label.charAt(0).toUpperCase() || "?"}</span>
      )}
    </span>
  );
}
