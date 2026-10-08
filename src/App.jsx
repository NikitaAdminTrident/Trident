import { useEffect, useRef, useState } from 'react'
import './App.css'
const api=import.meta.env.VITE_API_URL?.replace(/\/$/,'')
const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID
const owner='nikita.trident2024@gmail.com'
export default function App(){
 const [session,setSession]=useState(null),[error,setError]=useState(''),[document,setDocument]=useState('')
 const button=useRef(null)
 useEffect(()=>{
  if(session||!clientId)return
  let cancelled=false
  const initialise=()=>{if(cancelled)return;if(!window.google?.accounts?.id){timer=setTimeout(initialise,200);return}
   window.google.accounts.id.initialize({client_id:clientId,auto_select:false,callback:async({credential})=>{
    try{setError('');const r=await fetch(`${api}/api/session`,{headers:{Authorization:`Bearer ${credential}`}});const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to sign in.');setSession({token:credential,email:data.email})}catch(e){setError(e.message)}
   }});window.google.accounts.id.renderButton(button.current,{theme:'outline',size:'large',text:'signin_with'})}
  let timer=setTimeout(initialise,0);return()=>{cancelled=true;clearTimeout(timer)}
 },[session])
 useEffect(()=>{
  if(!session)return;let cancelled=false
  fetch('/quote-builder.html').then(r=>{if(!r.ok)throw Error('Unable to load the quote builder.');return r.text()}).then(html=>{
   const config=JSON.stringify({api,token:session.token,origin:location.origin}).replace(/</g,'\\u003c')
   const bridge=`<script>(()=>{const c=${config},original=window.fetch.bind(window);window.fetch=async(input,init={})=>{const url=typeof input==='string'?input:input.url;if(new URL(url,c.origin).pathname.startsWith('/api/')){const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+c.token);const response=await original(c.api+new URL(url,c.origin).pathname+new URL(url,c.origin).search,{...init,headers});if(response.status===401)parent.postMessage({type:'trident-signin-expired'},c.origin);return response;}return original(input,init);};})();</script>`
   if(!cancelled)setDocument(html.replace('<head>','<head>'+bridge))
  }).catch(e=>setError(e.message));return()=>{cancelled=true}
 },[session])
 useEffect(()=>{const handler=e=>{if(e.origin===location.origin&&e.data?.type==='trident-signin-expired'){setSession(null);setDocument('');setError('Your session expired. Sign in again.')}};window.addEventListener('message',handler);return()=>window.removeEventListener('message',handler)},[])
 const signOut=()=>{window.google?.accounts?.id.disableAutoSelect();setSession(null);setDocument('');setError('')}
 if(!api||!clientId||api.includes('YOUR-')||clientId.includes('YOUR-'))return <main className="signin"><h1>Trident Quote Builder · Version C</h1><p>Online setup is not finished. Configure the API address and Google sign-in client ID, then rebuild the website.</p></main>
 return session?<div className="workspace"><div className="session"><span>{session.email}</span><button onClick={signOut}>Sign out</button></div>{error&&<p role="alert">{error}</p>}{document?<iframe title="Trident quote builder" srcDoc={document}/>:<p>Loading your quotes…</p>}</div>:<main className="signin"><h1>Trident Quote Builder</h1><p>Version C · Your quotes, wherever you work.</p><div ref={button}/><p>Access is restricted to {owner}.</p>{error&&<p role="alert">{error}</p>}</main>
}
