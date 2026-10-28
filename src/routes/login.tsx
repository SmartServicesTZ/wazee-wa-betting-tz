import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { loginWithPhone } from "../lib/firebase";
export const Route = createFileRoute("/login")({ component: Login });
function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="auth-page"><div className="auth-card"><Link to="/" className="brand"><span className="brand-mark">W</span><span><b>WAZEE WA</b><small>BETTING TZ</small></span></Link><span className="eyebrow">AKAUNTI YAKO</span><h1>Karibu tena</h1><p>Ingia kwa namba yako ya simu na password.</p><form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); try { await loginWithPhone(phone,password); toast.success("Umeingia."); nav({ to: "/dashboard" }); } catch (e) { toast.error(e instanceof Error ? e.message : "Namba au password si sahihi."); } finally { setBusy(false); } }}><label>Namba ya simu<input type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={e => setPhone(e.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="btn btn-primary full" type="submit" disabled={busy}>{busy ? "Inasubiri..." : "Ingia"}</button></form><a className="text-link" href={"https://wa.me/255698232313?text="+encodeURIComponent("Habari, nimesahau password ya akaunti yangu ya Wazee wa Betting TZ. Naomba msaada.")} target="_blank" rel="noreferrer">Umesahau password?</a><div className="auth-footer">Huna akaunti? <Link to="/register">Jisajili</Link></div></div></div>;
}