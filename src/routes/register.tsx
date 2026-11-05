import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { registerWithPhone } from "../lib/firebase";

export const Route = createFileRoute("/register")({ component: Register });

function Register() {
  const nav = useNavigate();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password !== confirm) {
      const message = "Password hazifanani.";
      setError(message);
      toast.error(message);
      return;
    }
    if (password.length < 6) {
      const message = "Password iwe na angalau herufi/namba 6.";
      setError(message);
      toast.error(message);
      return;
    }
    setBusy(true);
    try {
      await registerWithPhone(phone, password, { firstName, lastName });
      toast.success("Akaunti imetengenezwa. Karibu!");
      await nav({ to: "/dashboard", replace: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Usajili umeshindikana. Jaribu tena.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <Link to="/" className="brand">
          <span className="brand-mark">W</span>
          <span><b>WAZEE WA</b><small>BETTING TZ</small></span>
        </Link>
        <span className="eyebrow">JIUNGE NA JAMII</span>
        <h1>Unda akaunti</h1>
        <p>Jaza majina yako na namba ya simu ili kujiunga.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>Jina la kwanza
              <input autoComplete="given-name" value={firstName} onChange={e => setFirst(e.target.value)} required disabled={busy} />
            </label>
            <label>Jina la mwisho
              <input autoComplete="family-name" value={lastName} onChange={e => setLast(e.target.value)} required disabled={busy} />
            </label>
            <label className="span-2">Namba ya simu
              <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={e => setPhone(e.target.value)} required disabled={busy} />
            </label>
            <label>Password
              <input type="password" autoComplete="new-password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} />
            </label>
            <label>Thibitisha password
              <input type="password" autoComplete="new-password" minLength={6} value={confirm} onChange={e => setConfirm(e.target.value)} required disabled={busy} />
            </label>
          </div>
          {error && <div role="alert" className="form-error" style={{ marginTop: 12, padding: 12, borderRadius: 10, color: "#b42318", background: "#fef3f2" }}>{error}</div>}
          <button className="btn btn-primary full" type="submit" disabled={busy}>
            {busy ? "Inatengeneza akaunti..." : "Jisajili"}
          </button>
        </form>
        <div className="auth-footer">Una akaunti? <Link to="/login">Ingia</Link></div>
      </div>
    </div>
  );
}
