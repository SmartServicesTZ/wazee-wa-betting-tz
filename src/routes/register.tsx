import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { registerWithPhone } from "../lib/firebase";
export const Route=createFileRoute("/register")({component:Register});
function Register(){
  const nav=useNavigate();
  const[firstName,setFirst]=useState("");
  const[lastName,setLast]=useState("");
  const[phone,setPhone]=useState("");
  const[password,setPassword]=useState("");
  const[confirm,setConfirm]=useState("");
  const[busy,setBusy]=useState(false);
  return <div className="auth-page"><div className="auth-card wide"><Link to="/" className="brand"><span className="brand-mark">W</span><span><b>WAZEE WA</b><small>BETTING TZ</small></span></Link><span className="eyebrow">JIUNGE NA JAMII</span><h1>Unda akaunti</h1><p>Jaza majina yako na namba ya simu ili kujiunga.</p><form onSubmit={async e=>{e.preventDefault();if(password!==confirm){toast.error("Password hazifanani.");return}if(password.length<6){toast.error("Password iwe na angalau herufi/namba 6.");return}setBusy(true);try{await registerWithPhone(phone,password,{firstName,lastName});toast.success("Akaunti imetengenezwa.");nav({to:"/dashboard"});}catch(e){toast.error(e instanceof Error?e.message:"Usajili umeshindikana.");}finally{setBusy(false)}}}><div className="form-grid"><label>Jina la kwanza<input autoComplete="given-name" value={firstName} onChange={e=>setFirst(e.target.value)} required /></label><label>Jina la mwisho<input autoComplete="family-name" value={lastName} onChange={e=>setLast(e.target.value)} required /></label><label className="span-2">Namba ya simu<input type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={e=>setPhone(e.target.value)} required /></label><label>Password<input type="password" autoComplete="new-password" minLength={6} value={password} onChange={e=>setPassword(e.target.value)} required /></label><label>Thibitisha password<input type="password" autoComplete="new-password" minLength={6} value={confirm} onChange={e=>setConfirm(e.target.value)} required /></label></div><button className="btn btn-primary full" type="submit" disabled={busy}>{busy?"Inatengeneza...":"Jisajili"}</button></form><div className="auth-footer">Una akaunti? <Link to="/login">Ingia</Link></div></div></div>;
}