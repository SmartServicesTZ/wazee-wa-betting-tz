import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, where } from "firebase/firestore";
import { firestore } from "./firebase";
import { calculateTotalOdds, type Selection } from "./betting";
export type PublicTicket={id:string;creatorId:string;creatorUsername:string;creatorName:string;creatorPhotoURL?:string;title:string;description?:string;sport:string;risk:"LOW"|"MEDIUM"|"HIGH";visibility:"PUBLIC"|"PRIVATE";access:"FREE"|"VIP";totalOdds:number;status:string;selectionCount:number;createdAt?:unknown};
export async function createTicket(input:{uid:string;username:string;displayName:string;photoURL?:string;title:string;description?:string;sport:string;risk:"LOW"|"MEDIUM"|"HIGH";visibility:"PUBLIC"|"PRIVATE";access:"FREE"|"VIP";selections:Selection[]}){
 if(!input.selections.length)throw new Error("Ongeza angalau selection moja.");const totalOdds=calculateTotalOdds(input.selections);
 const ref=await addDoc(collection(firestore,"tickets"),{creatorId:input.uid,creatorUsername:input.username,creatorName:input.displayName,creatorPhotoURL:input.photoURL??null,title:input.title.trim(),description:input.description?.trim()??"",sport:input.sport,risk:input.risk,visibility:input.visibility,access:input.access,totalOdds,status:"PENDING",selectionCount:input.selections.length,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
 const publicProfileRef=doc(firestore,"publicProfiles",input.uid);const existingPublicProfile=await getDoc(publicProfileRef);if(existingPublicProfile.exists()){await setDoc(publicProfileRef,{uid:input.uid,username:input.username,displayName:input.displayName,photoURL:input.photoURL??null,accountVerified:existingPublicProfile.data().accountVerified!==false,updatedAt:serverTimestamp()},{merge:true});}else{await setDoc(publicProfileRef,{uid:input.uid,username:input.username,displayName:input.displayName,photoURL:input.photoURL??null,accountVerified:true,ticketCount:0,settledTicketCount:0,wonCount:0,lostCount:0,pendingCount:0,winRate:0,selectionWonCount:0,selectionLostCount:0,selectionWinRate:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}
 await Promise.all(input.selections.map((selection,index)=>setDoc(doc(firestore,"tickets",ref.id,"selections",String(index+1)),{...selection,kickoffAt:Timestamp.fromDate(new Date(selection.kickoffAt)),odds:Number(selection.odds),status:"PENDING",createdAt:serverTimestamp()})));
 return ref.id;
}
export async function listPublicTickets(max=20){const snap=await getDocs(query(collection(firestore,"tickets"),where("visibility","==","PUBLIC"),limit(max)));return Promise.all(snap.docs.map(async item=>{const data=item.data();const profile=await getDoc(doc(firestore,"publicProfiles",String(data.creatorId))).catch(()=>null);const p=profile?.exists()?profile.data():{};return{id:item.id,...data,creatorAccountVerified:true,creatorWinRate:Number(p?.winRate??0),creatorSettledTicketCount:Number(p?.settledTicketCount??0)} as PublicTicket;}));}
async function listMatchesFrom(kickoffAt: string, max: number) {
  const snap = await getDocs(
    query(
      collection(firestore, "matches"),
      where("kickoffAt", ">=", kickoffAt),
      orderBy("kickoffAt", "asc"),
      limit(max),
    ),
  );
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listUpcomingMatches(max = 150) {
  return listMatchesFrom(new Date().toISOString(), max);
}

export async function listCurrentAndUpcomingMatches(max = 150) {
  return listMatchesFrom(new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), max);
}

export async function listMatches(max=30){const snap=await getDocs(query(collection(firestore,"matches"),orderBy("kickoffAt","asc"),limit(max)));return snap.docs.map(item=>({id:item.id,...item.data()}));}
export async function getTicket(ticketId:string){const ticket=await getDoc(doc(firestore,"tickets",ticketId));if(!ticket.exists())return null;const data=ticket.data();const [selections,profile]=await Promise.all([getDocs(query(collection(firestore,"tickets",ticketId,"selections"),orderBy("createdAt","asc"))),getDoc(doc(firestore,"publicProfiles",String(data.creatorId))).catch(()=>null)]);const p=profile?.exists()?profile.data():{};return{id:ticket.id,...data,creatorAccountVerified:p?.accountVerified===true,creatorWinRate:Number(p?.winRate??0),creatorSettledTicketCount:Number(p?.settledTicketCount??0),selections:selections.docs.map(item=>({id:item.id,...item.data()}))};}
export async function getUserProfile(uid:string){
 const snap=await getDoc(doc(firestore,"users",uid));
 if(!snap.exists())return null;
 const user={id:snap.id,...snap.data()} as any;
 const publicRef=doc(firestore,"publicProfiles",uid);
 const publicSnap=await getDoc(publicRef);
 const publicData={uid,username:user.username??("mzee_"+String(user.phone??"").slice(-9)),displayName:user.displayName??[user.firstName,user.lastName].filter(Boolean).join(" "),photoURL:user.photoURL??null,accountVerified:true};
 if(!publicSnap.exists()){
  await setDoc(publicRef,{...publicData,ticketCount:Number(user.ticketCount??0),settledTicketCount:Number((user.wonCount??0)+(user.lostCount??0)),wonCount:Number(user.wonCount??0),lostCount:Number(user.lostCount??0),pendingCount:Number(user.pendingCount??0),winRate:Number(user.winRate??0),selectionWonCount:0,selectionLostCount:0,selectionWinRate:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
 }else if(!publicSnap.data().username||!publicSnap.data().displayName||!Object.prototype.hasOwnProperty.call(publicSnap.data(),"accountVerified")){
  await setDoc(publicRef,{...publicData,accountVerified:publicSnap.data().accountVerified===false?false:true,updatedAt:serverTimestamp()},{merge:true});
 }
 return user;
}
export async function toggleLike(ticketId:string,uid:string){const ref=doc(firestore,"likes",ticketId+"_"+uid);const snap=await getDoc(ref);if(snap.exists()){await deleteDoc(ref);return false;}await setDoc(ref,{ticketId,userId:uid,createdAt:serverTimestamp()});return true;}
export async function toggleSave(ticketId:string,uid:string){const ref=doc(firestore,"savedTickets",ticketId+"_"+uid);const snap=await getDoc(ref);if(snap.exists()){await deleteDoc(ref);return false;}await setDoc(ref,{ticketId,userId:uid,createdAt:serverTimestamp()});return true;}
export async function addComment(ticketId:string,authorId:string,authorName:string,text:string){if(!text.trim())throw new Error("Andika comment kwanza.");return addDoc(collection(firestore,"comments"),{ticketId,authorId,authorName,text:text.trim(),createdAt:serverTimestamp()});}
export async function followUser(followingId:string,followerId:string){if(followingId===followerId)throw new Error("Huwezi kujifollow.");const ref=doc(firestore,"followers",followingId+"_"+followerId);const snap=await getDoc(ref);if(snap.exists()){await deleteDoc(ref);return false;}await setDoc(ref,{followingId,followerId,createdAt:serverTimestamp()});return true;}
