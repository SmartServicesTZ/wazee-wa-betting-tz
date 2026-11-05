import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { getPublicSiteContent } from "../lib/firestore";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  const [content, setContent] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void getPublicSiteContent()
      .then((value) => setContent(value as Record<string, unknown> | null))
      .catch(() => setContent(null));
  }, []);
  const text = String(
    content?.["terms"] ?? "Sheria na masharti zitaongezwa na msimamizi wa tovuti.",
  );
  const whatsapp = String(content?.["supportWhatsApp"] ?? "+255698232313").replace(/[^0-9]/g, "");
  return (
    <AppShell>
      <div className="page narrow">
        <Link to="/" className="back-link">
          Rudi nyumbani
        </Link>
        <section className="panel">
          <span className="eyebrow">TAARIFA ZA TOVUTI</span>
          <h1>Sheria na masharti</h1>
          <p className="terms-copy">{text}</p>
          <a className="btn btn-secondary" href={`https://wa.me/${whatsapp}`}>
            Wasiliana na msaada WhatsApp
          </a>
        </section>
      </div>
    </AppShell>
  );
}
