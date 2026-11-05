import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Clock3, Search, Trophy } from "lucide-react";
import type { User } from "firebase/auth";
import { AppShell } from "../components/app-shell";
import { listMatches } from "../lib/firestore";
import { subscribeToAuth } from "../lib/firebase";

export const Route = createFileRoute("/")({ component: Home });
type Match = Record<string, any> & { id: string; homeTeamName: string; awayTeamName: string; kickoffAt: string };
function TeamBadge({name,src}:{name:string;src?:string}) {
  return <span className="gsb-team-badge">{src ? <img src={src} alt={name} loading="lazy" onError={e=>{e.currentTarget.style.display="none";}}/> : <b>{name?.slice(0,1)||"?"}</b>}</span>;
}
function Home() {
  const [user,setUser]=useState<User|null>(null);
  const [matches,setMatches]=useState<Match[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [tab,setTab]=useState("UPCOMING");
  const [sport,setSport]=useState("Football");
  const [day,setDay]=useState("TODAY");
  const [sort,setSort]=useState("TIME");
  const [market,setMarket]=useState("1X2");
  const [query,setQuery]=useState("");
  const [chosen,setChosen]=useState<Record<string,string>>({});
  const [highlightsOpen,setHighlightsOpen]=useState(true);
  const [searchOpen,setSearchOpen]=useState(false);
  const [slipOpen,setSlipOpen]=useState(false);
  useEffect(()=>subscribeToAuth(setUser),[]);
  const load=()=>{setLoading(true);setError("");listMatches(150).then(rows=>setMatches(rows as Match[])).catch(e=>setError(e instanceof Error?e.message:"Imeshindikana kupakia mechi.")).finally(()=>setLoading(false));};
  useEffect(()=>{load();},[]);
  const visible=useMemo(()=>{
    const now=new Date();
    let rows=matches.filter(m=>{
      const text=(m.homeTeamName+" "+m.awayTeamName+" "+(m.leagueName||"")).toLowerCase();
      const date=new Date(m.kickoffAt);
      const sameDay=date.toDateString()===now.toDateString();
      const status=String(m.status||"").toUpperCase();
      const live=status==="LIVE"||status==="IN_PLAY";
      if(tab==="LIVE"&&!live)return false;
      if(tab==="UPCOMING"&&(live||date.getTime()<now.getTime()))return false;
      if(day==="TODAY"&&!sameDay)return false;
      if(day==="TOMORROW"){const tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);if(date.toDateString()!==tomorrow.toDateString())return false;}
      return text.includes(query.toLowerCase());
    });
    if(sort==="TIME")rows.sort((a,b)=>new Date(a.kickoffAt).getTime()-new Date(b.kickoffAt).getTime());
    if(sort==="LEAGUE")rows.sort((a,b)=>String(a.leagueName).localeCompare(String(b.leagueName)));
    return rows;
  },[matches,tab,day,sort,query]);
  const selections=useMemo(()=>Object.entries(chosen).map(([key,prediction])=>{const [matchId,odd]=key.split("::");const match=matches.find(m=>m.id===matchId);const option=(match?.markets||[]).flatMap((x:any)=>x.options||[]).find((x:any)=>x.prediction===prediction&&x.market===odd);return match&&option?{match,option,key}:null;}).filter(Boolean) as any[],[chosen,matches]);
  const toggle=(m:Match,prediction:string)=>setChosen(current=>{const key=m.id+"::1X2";if(current[key]===prediction){const next={...current};delete next[key];return next;}return {...current,[key]:prediction};});
  const getMarket=(m:Match)=> (m.markets||[]).find((x:any)=>x.market==="1X2") || (m.markets||[]).find((x:any)=>x.market==="FULL_TIME");
  const fmt=(date:string)=>new Date(date).toLocaleTimeString("sw-TZ",{hour:"2-digit",minute:"2-digit"});
  return <AppShell user={user}>
    <div className="gsb-page">
      <section className="gsb-feature-strip"><div className="gsb-feature-title"><span>W</span><b>MECHI ZINAZOVUMA</b></div>{matches.slice(0,4).map(m=>{const mk=getMarket(m);return <article className="gsb-feature-card" key={m.id}><small>{m.leagueName||"Football"} · {fmt(m.kickoffAt)}</small><div className="gsb-feature-teams"><div><TeamBadge name={m.homeTeamName} src={m.homeTeamLogo||m.homeLogo}/><b>{m.homeTeamName}</b></div><i>VS</i><div><TeamBadge name={m.awayTeamName} src={m.awayTeamLogo||m.awayLogo}/><b>{m.awayTeamName}</b></div></div><div className="gsb-feature-odds">{(mk?.options||[]).slice(0,3).map((o:any)=><span key={o.prediction}>{o.prediction}<b>{Number(o.odds).toFixed(2)}</b></span>)}</div></article>})}</section>
      <div className="gsb-main-tabs">{[["LIVE","Live"],["TOP","Top Events"],["UPCOMING","Upcoming"],["COUNTRIES","Countries"]].map(([v,l])=><button className={tab===v?"active":""} key={v} onClick={()=>setTab(v)}>{l}</button>)}</div>
      <div className="gsb-filter-row"><select value={sport} onChange={e=>setSport(e.target.value)}><option>Football</option><option>Basketball</option><option>Tennis</option></select><select value={day} onChange={e=>setDay(e.target.value)}><option value="TODAY">Today</option><option value="TOMORROW">Tomorrow</option><option value="ALL">All dates</option></select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="TIME">By Time</option><option value="LEAGUE">By League</option></select><button onClick={()=>setSearchOpen(v=>!v)}><Search size={17}/></button></div>
      {searchOpen&&<label className="gsb-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tafuta timu au mashindano..."/></label>}
      <div className="gsb-market-tabs">{[["1X2","1X2"],["OVER_UNDER","Under/Over 2.5"],["DOUBLE_CHANCE","Double Chance"],["BTTS","Both Teams to Score"],["HALF_TIME","Half Time"]].map(([v,l])=><button key={v} className={market===v?"active":""} onClick={()=>setMarket(v)}>{l}</button>)}</div>
      <button className="gsb-highlights" onClick={()=>setHighlightsOpen(v=>!v)}><span>Highlights</span>{highlightsOpen?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>
      {highlightsOpen&&<div className="gsb-match-list">
        {loading?<div className="gsb-empty">Inapakia mechi kutoka kwenye Sports API...</div>:error?<div className="gsb-empty">{error}<button onClick={load}>Jaribu tena</button></div>:visible.length===0?<div className="gsb-empty"><Trophy size={28}/><b>Hakuna mechi zilizopatikana.</b><span>Mechi halisi zitaonekana baada ya kusawazishwa na Sports API.</span></div>:visible.map(m=>{const mk=(m.markets||[]).find((x:any)=>x.market===market);const opts=mk?.options||[];return <article className="gsb-match-row" key={m.id}><div className="gsb-league-line"><span>{m.leagueName||"Mashindano"}</span><small>{m.status==="LIVE"?"LIVE":fmt(m.kickoffAt)}</small></div><div className="gsb-match-content"><div className="gsb-team-names"><div><TeamBadge name={m.homeTeamName} src={m.homeTeamLogo||m.homeLogo}/><b>{m.homeTeamName}</b></div><div><TeamBadge name={m.awayTeamName} src={m.awayTeamLogo||m.awayLogo}/><b>{m.awayTeamName}</b></div><small>{new Date(m.kickoffAt).toLocaleDateString("sw-TZ",{weekday:"short",day:"numeric",month:"short"})} · {fmt(m.kickoffAt)}</small></div><div className="gsb-odds-area">{opts.length?opts.slice(0,3).map((o:any,i:number)=>{const label=market==="1X2"?["1","X","2"][i]||o.prediction:o.prediction;const key=m.id+"::1X2";const selected=chosen[key]===o.prediction;return <button key={o.prediction} className={selected?"selected":""} onClick={()=>toggle(m,o.prediction)}><small>{label}</small><b>{Number(o.odds).toFixed(2)}</b></button>}):<span className="gsb-no-odds">Odds hazijapatikana</span>}<Link to="/create-ticket" className="gsb-more-odds">+{Math.max(0,(m.markets||[]).length-1)} markets</Link></div></div></article>})}
      </div>}
      <div className="gsb-bottom-spacer"/>
      <button className={"gsb-slip-fab"+(slipOpen?" open":"")} onClick={()=>setSlipOpen(v=>!v)}>BetSlip <b>{selections.length}</b></button>
      {slipOpen&&<aside className="gsb-slip-panel"><div className="gsb-slip-head"><b>BetSlip ({selections.length})</b><button onClick={()=>setSlipOpen(false)}>×</button></div>{selections.length?selections.map((s:any)=><div className="gsb-slip-item" key={s.key}><b>{s.match.homeTeamName} - {s.match.awayTeamName}</b><span>{s.option.prediction} · {Number(s.option.odds).toFixed(2)}</span><button onClick={()=>setChosen(c=>{const n={...c};delete n[s.key];return n;})}>Ondoa</button></div>):<p>Chagua odds kwenye mechi ili kuongeza kwenye betslip.</p>}<Link className="gsb-slip-create" to="/create-ticket">Tengeneza mkeka</Link></aside>}
    </div>
  </AppShell>;
}