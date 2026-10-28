import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, type Auth, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User } from "firebase/auth";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, runTransaction } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
const firebaseConfig={apiKey:import.meta.env.VITE_FIREBASE_API_KEY??"AIzaSyCMWh-yKE13mQ-SRA3lDugpHXV1kuVMBK8",authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN??"wazee-wa-betting-tz-e7183.firebaseapp.com",projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID??"wazee-wa-betting-tz-e7183",storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET??"wazee-wa-betting-tz-e7183.firebasestorage.app",messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID??"790161817035",appId:import.meta.env.VITE_FIREBASE_APP_ID??"1:790161817035:web:f217cebf1fca1dcb240a4e"};
export const firebaseApp=getApps().length?getApp():initializeApp(firebaseConfig); export const firestore=getFirestore(firebaseApp); export const storage:FirebaseStorage=getStorage(firebaseApp); export const functions=getFunctions(firebaseApp,"europe-west1");
let authInstance:Auth|null=null; export function getFirebaseAuth(){if(typeof window==="undefined")return null;authInstance??=getAuth(firebaseApp);return authInstance;}
export function subscribeToAuth(callback:(user:User|null)=>void){const auth=getFirebaseAuth();return auth?onAuthStateChanged(auth,callback):()=>undefined;}

export function normalizeTanzaniaPhone(value:string){
  const digits=value.replace(/\\D/g,"");
  if(digits.startsWith("255") && digits.length===12) return digits;
  if(digits.startsWith("0") && digits.length===10) return "255"+digits.slice(1);
  if(digits.length===9) return "255"+digits;
  throw new Error("Weka namba sahihi ya Tanzania, mfano 0712345678.");
}
function phoneLoginEmail(phone:string){return normalizeTanzaniaPhone(phone)+"@phone.wazee-wa-betting-tz.com";}
export async function registerWithPhone(phoneInput:string,password:string,profile:{firstName:string;lastName:string}){
  const phone=normalizeTanzaniaPhone(phoneInput);
  const email=phoneLoginEmail(phone);
  const auth=getFirebaseAuth();
  if(!auth) throw new Error("Firebase Auth inapatikana kwenye browser pekee.");
  const result=await createUserWithEmailAndPassword(auth,email,password);
  const firstName=profile.firstName.trim();
  const lastName=profile.lastName.trim();
  const displayName=(firstName+" "+lastName).trim();
  const username="mzee_"+phone.slice(-9);
  try{
    await runTransaction(firestore,async tx=>{
      const usernameRef=doc(firestore,"usernames",username);
      const existingUsername=await tx.get(usernameRef);
      if(existingUsername.exists()) throw new Error("Namba hii tayari imetumika.");
      tx.set(usernameRef,{uid:result.user.uid,createdAt:serverTimestamp()});
      tx.set(doc(firestore,"users",result.user.uid),{
        uid:result.user.uid,email:result.user.email,firstName,lastName,username,phone,
        displayName:displayName||username,role:"USER",followersCount:0,followingCount:0,
        ticketCount:0,wonCount:0,lostCount:0,pendingCount:0,winRate:0,
        createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
    });
    if(displayName) await updateProfile(result.user,{displayName});
    return result.user;
  }catch(error){await signOut(auth);throw error;}
}
export async function loginWithPhone(phoneInput:string,password:string){
  const auth=getFirebaseAuth();
  if(!auth) throw new Error("Firebase Auth inapatikana kwenye browser pekee.");
  const phone=normalizeTanzaniaPhone(phoneInput);
  return (await signInWithEmailAndPassword(auth,phoneLoginEmail(phone),password)).user;
}

export async function registerWithEmail(email:string,password:string,profile:{firstName:string;lastName:string;username:string;phone?:string}){const username=profile.username.trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username))throw new Error("Username: herufi ndogo, namba au underscore pekee (3–24).");const auth=getFirebaseAuth();if(!auth)throw new Error("Firebase Auth inapatikana kwenye browser pekee.");const result=await createUserWithEmailAndPassword(auth,email.trim(),password);const displayName=(profile.firstName+" "+profile.lastName).trim();try{await runTransaction(firestore,async tx=>{const usernameRef=doc(firestore,"usernames",username);const existing=await tx.get(usernameRef);if(existing.exists())throw new Error("Username tayari imetumika.");tx.set(usernameRef,{uid:result.user.uid,createdAt:serverTimestamp()});tx.set(doc(firestore,"users",result.user.uid),{uid:result.user.uid,email:result.user.email,firstName:profile.firstName.trim(),lastName:profile.lastName.trim(),username,phone:profile.phone?.trim()??"",displayName:displayName||username,role:"USER",followersCount:0,followingCount:0,ticketCount:0,wonCount:0,lostCount:0,pendingCount:0,winRate:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});});if(displayName)await updateProfile(result.user,{displayName});return result.user;}catch(error){await signOut(auth);throw error;}}
export async function loginWithEmail(email:string,password:string){const auth=getFirebaseAuth();if(!auth)throw new Error("Firebase Auth inapatikana kwenye browser pekee.");return(await signInWithEmailAndPassword(auth,email.trim(),password)).user;}
export async function loginWithGoogle(){const auth=getFirebaseAuth();if(!auth)throw new Error("Firebase Auth inapatikana kwenye browser pekee.");const result=await signInWithPopup(auth,new GoogleAuthProvider());const profileRef=doc(firestore,"users",result.user.uid);const existing=await getDoc(profileRef);if(!existing.exists()){await setDoc(profileRef,{uid:result.user.uid,email:result.user.email,displayName:result.user.displayName,photoURL:result.user.photoURL,role:"USER",followersCount:0,followingCount:0,ticketCount:0,wonCount:0,lostCount:0,pendingCount:0,winRate:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}else{await setDoc(profileRef,{uid:result.user.uid,email:result.user.email,displayName:result.user.displayName,photoURL:result.user.photoURL,updatedAt:serverTimestamp()},{merge:true});}return result.user;}
export async function resetPassword(email:string){const auth=getFirebaseAuth();if(!auth)throw new Error("Firebase Auth inapatikana kwenye browser pekee.");await sendPasswordResetEmail(auth,email.trim());}
export async function logout(){const auth=getFirebaseAuth();if(auth)await signOut(auth);}
export async function uploadProfileImage(uid:string,file:File){if(!file.type.startsWith("image/")||file.size>5*1024*1024)throw new Error("Tumia picha chini ya 5MB.");const imageRef=ref(storage,"users/"+uid+"/avatar-"+Date.now()+"-"+file.name);await uploadBytes(imageRef,file,{contentType:file.type});const photoURL=await getDownloadURL(imageRef);await setDoc(doc(firestore,"users",uid),{photoURL,updatedAt:serverTimestamp()},{merge:true});return photoURL;}
export async function runAdminSync(date?:string){const callable=httpsCallable<{date?:string},{ok:boolean;count:number;settled:number}>(functions,"adminSync");return (await callable(date?{date}:{ })).data;}
export async function bootstrapSuperAdmin(){const callable=httpsCallable<{}, {ok:boolean;uid:string;role:string}>(functions,"bootstrapSuperAdmin");return (await callable({})).data;}
export async function adminResetUserPassword(uid:string,password:string){const callable=httpsCallable<{uid:string;password:string},{ok:boolean}>(functions,"adminResetUserPassword");return (await callable({uid,password})).data;}
