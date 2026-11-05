import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { loginWithPhone } from "../lib/firebase";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await loginWithPhone(phone, password);
      toast.success("Umeingia kikamilifu.");
      await nav({ to: "/dashboard", replace: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Namba au password si sahihi.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="brand">
          <span className="brand-mark">W</span>
          <span><b>WAZEE WA</b><small>BETTING TZ</small></span>
        </Link>
        <span className="eyebrow">AKAUNTI YAKO</span>
        <h1>Karibu tena</h1>
        <p>Ingia kwa namba yako ya simu na password.</p>
        <form onSubmit={handleSubmit}>
          <label>Namba ya simu
            <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={e => setPhone(e.target.value)} required disabled={busy} />
          </label>
          <label>Password
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} />
          </label>
          {error && <div role="alert" className="form-error" style={{ marginTop: 12, padding: 12, borderRadius: 10, color: "#b42318", background: "#fef3f2" }}>{error}</div>}
          <button className="btn btn-primary full" type="submit" disabled={busy}>
            {busy ? "Inathibitisha..." : "Ingia"}
          </button>
        </form>
        <a className="text-link" href={"https://wa.me/255698232313?text=" + encodeURIComponent("Habari, nimesahau password ya akaunti yangu ya Wazee wa Betting TZ. Naomba msaada.")} target="_blank" rel="noreferrer">Umesahau password?</a>
        <div className="auth-footer">Huna akaunti? <Link to="/register">Jisajili</Link></div>
      </div>
    </div>
  );
}
