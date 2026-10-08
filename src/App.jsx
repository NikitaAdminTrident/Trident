import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import WeeklyReport from './WeeklyReport'
import SettingsPage from './SettingsPage'
import VehicleChecks from './VehicleChecks'
import LeaveForms from './LeaveForms'
const localMode=import.meta.env.DEV&&import.meta.env.VITE_LOCAL_DEVELOPMENT==='true'
const api=localMode?'http://127.0.0.1:18781':(import.meta.env.VITE_API_URL||'https://trident-quote-api-dsn2tnnc3q-ts.a.run.app').replace(/\/$/,'')
const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID||'1087455515042-ql715veu24peb1hhfrp69sj31t8sahaf.apps.googleusercontent.com'
const owner='nikita.trident2024@gmail.com'
export default function App(){
 const [session,setSession]=useState(null),[error,setError]=useState(''),[document,setDocument]=useState(''),[timesheetDocument,setTimesheetDocument]=useState(''),[page,setPage]=useState('home')
 const button=useRef(null),timesheetFrame=useRef(null),quoteFrame=useRef(null)
 const request=useCallback(async(path,init={})=>{
  const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${session?.token}`)
  const response=await fetch(api+path,{...init,headers}),data=await response.json()
  if(response.status===401){setSession(null);setDocument('');setTimesheetDocument('');setPage('home')}
  if(!response.ok)throw Error(data.error||'Unable to complete this request.')
  return {data,etag:response.headers.get('ETag')}
 },[session])
 useEffect(()=>{
  if(localMode||session||!clientId)return
  let cancelled=false
  const initialise=()=>{if(cancelled)return;if(!window.google?.accounts?.id){timer=setTimeout(initialise,200);return}
   window.google.accounts.id.initialize({client_id:clientId,auto_select:false,callback:async({credential})=>{
    try{setError('');const r=await fetch(`${api}/api/session`,{headers:{Authorization:`Bearer ${credential}`}});const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to sign in.');setSession({token:credential,email:data.email})}catch(e){setError(e.message)}
   }});window.google.accounts.id.renderButton(button.current,{theme:'outline',size:'large',text:'signin_with'})}
  let timer=setTimeout(initialise,0);return()=>{cancelled=true;clearTimeout(timer)}
 },[session])
 useEffect(()=>{
  if(!session||page!=='quotes'||document)return;let cancelled=false
  fetch('/quote-builder.html').then(r=>{if(!r.ok)throw Error('Unable to load the quote builder.');return r.text()}).then(html=>{
   const config=JSON.stringify({api,token:session.token,origin:location.origin}).replace(/</g,'\\u003c')
   const bridge=`<script>(()=>{const c=${config},original=window.fetch.bind(window);window.fetch=async(input,init={})=>{const url=typeof input==='string'?input:input.url;if(new URL(url,c.origin).pathname.startsWith('/api/')){const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+c.token);const response=await original(c.api+new URL(url,c.origin).pathname+new URL(url,c.origin).search,{...init,headers});if(response.status===401)parent.postMessage({type:'trident-signin-expired'},c.origin);return response;}return original(input,init);};})();</script>`
   if(!cancelled)setDocument(html.replace('<head>','<head>'+bridge))
  }).catch(e=>setError(e.message));return()=>{cancelled=true}
 },[session,page,document])
 useEffect(()=>{
  if(!session||page!=='timesheet'||timesheetDocument)return;let cancelled=false
  fetch('/timesheet.html').then(r=>{if(!r.ok)throw Error('Unable to load the time sheet.');return r.text()}).then(html=>{
   const config=JSON.stringify({api,token:session.token,origin:location.origin}).replace(/</g,'\\u003c')
   const bridge=`<script>(()=>{const c=${config},original=window.fetch.bind(window);window.fetch=async(input,init={})=>{const url=typeof input==='string'?input:input.url;if(new URL(url,c.origin).pathname.startsWith('/api/')){const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+c.token);const response=await original(c.api+new URL(url,c.origin).pathname+new URL(url,c.origin).search,{...init,headers});if(response.status===401)parent.postMessage({type:'trident-signin-expired'},c.origin);return response;}return original(input,init);};})();</script>`
   if(!cancelled)setTimesheetDocument(html.replace('<head>','<head>'+bridge))
  }).catch(e=>setError(e.message));return()=>{cancelled=true}
 },[session,page,timesheetDocument])
 useEffect(()=>{const handler=e=>{if(e.origin===location.origin&&e.data?.type==='trident-signin-expired'){setSession(null);setDocument('');setTimesheetDocument('');setPage('home');setError('Your session expired. Sign in again.')}};window.addEventListener('message',handler);return()=>window.removeEventListener('message',handler)},[])
 useEffect(()=>{if(page==='timesheet'&&timesheetDocument)timesheetFrame.current?.contentWindow.postMessage({type:'trident-leave-updated'},location.origin)},[page,timesheetDocument])
 useEffect(()=>{const refresh=()=>quoteFrame.current?.contentWindow.postMessage({type:'trident-quote-settings-updated'},location.origin);window.addEventListener('trident-settings-saved',refresh);return()=>window.removeEventListener('trident-settings-saved',refresh)},[])
 const openLocal=async()=>{try{setError('');const r=await fetch(`${api}/api/dev-session`);const data=await r.json();if(!r.ok)throw Error(data.error||'Start the local development server first.');setSession({token:data.token,email:data.email})}catch(e){setError(e.message)}}
 const signOut=()=>{window.google?.accounts?.id.disableAutoSelect();setSession(null);setDocument('');setTimesheetDocument('');setPage('home');setError('')}
 if(!api||!clientId||api.includes('YOUR-')||clientId.includes('YOUR-'))return <main className="signin"><h1>Trident Quote Builder · Version C</h1><p>Online setup is not finished. Configure the API address and Google sign-in client ID, then rebuild the website.</p></main>
 return session?<div className={`workspace${localMode?' is-local':''}`}>
  <header className="portal-header">
   <button className="portal-brand" aria-label="Trident home" onClick={()=>setPage('home')}><img src="/trident-logo.png" alt="Trident Community Equipment"/></button>
   <nav aria-label="Main navigation">{[['home','Home'],['quotes','Quotes'],['timesheet','Time sheet'],['leave','Leave forms'],['reports','Weekly report'],['vehicles','Vehicle checks'],['settings','Settings']].map(([key,name])=><button key={key} aria-current={page===key?'page':undefined} onClick={()=>setPage(key)}>{name}</button>)}</nav>
   <div className="portal-account"><span>{session.email}</span><button onClick={signOut}>Sign out</button></div>
  </header>
  {localMode&&<div className="development-notice">Local development · Changes are saved on this computer.</div>}
  {error&&<p role="alert">{error}</p>}
  {page==='home'&&<main className="portal-home">
   <div className="home-intro"><span className="home-eyebrow">Trident Community Equipment</span><h1>Welcome to your workspace</h1><p>Choose where you’d like to work.</p></div>
   <div className="module-grid"><button className="module-card" onClick={()=>setPage('quotes')}>
    <span className="module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8M8 16h5"/></svg></span>
    <span className="module-heading">Quotes</span><span className="module-description">Create quotes, manage drafts and view completed quotes.</span><span className="module-link">Open quotes <span aria-hidden="true">→</span></span>
   </button><button className="module-card" onClick={()=>setPage('timesheet')}>
    <span className="module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h4M7 17h4M15 14v3l2 1"/></svg></span>
    <span className="module-heading">Time sheet</span><span className="module-description">Record weekly work and leave hours, add notes and generate a PDF.</span><span className="module-link">Open time sheet <span aria-hidden="true">→</span></span>
   </button>{[['leave','Leave forms','Request leave, review approvals and sync approved dates to time sheets.','M8 3v4M16 3v4M3 10h18M8 15l3 3 5-6M3 5h18v16H3Z'],['reports','Weekly report','View weekly labour hours, a chart and last week’s totals.','M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7'],['vehicles','Vehicle checks','Open vehicle checks.','M4 15V9l2-5h12l2 5v6M4 9h16M7 15v4M17 15v4M4 13h3M17 13h3'],['settings','Settings','Manage technicians, vehicles, time defaults and quote settings.','M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6']].map(([key,name,description,path])=><button className="module-card" key={key} onClick={()=>setPage(key)}><span className="module-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d={path}/></svg></span><span className="module-heading">{name}</span><span className="module-description">{description}</span><span className="module-link">Open {name.toLowerCase()} <span aria-hidden="true">→</span></span></button>)}</div>
  </main>}
  {page==='quotes'&&!document&&<p className="module-loading" role="status">Loading your quotes…</p>}
  {document&&<section className="quote-module" hidden={page!=='quotes'} aria-label="Quotes"><iframe ref={quoteFrame} title="Trident quote builder" srcDoc={document}/></section>}
  {page==='timesheet'&&!timesheetDocument&&<p className="module-loading" role="status">Loading your time sheet…</p>}
  {timesheetDocument&&<section className="quote-module" hidden={page!=='timesheet'} aria-label="Time sheet"><iframe ref={timesheetFrame} title="Trident time sheet" srcDoc={timesheetDocument}/></section>}
  <section hidden={page!=='leave'}><LeaveForms request={request} active={page==='leave'} onChanged={()=>timesheetFrame.current?.contentWindow.postMessage({type:'trident-leave-updated'},location.origin)}/></section>
  {page==='reports'&&<WeeklyReport request={request}/>}
  <section hidden={page!=='vehicles'}><VehicleChecks request={request} active={page==='vehicles'}/></section>
  <section hidden={page!=='settings'}><SettingsPage request={request} onSaved={()=>{timesheetFrame.current?.contentWindow.postMessage({type:'trident-staff-updated'},location.origin);window.dispatchEvent(new Event('trident-settings-saved'))}}/></section>
 </div>:<main className="signin"><h1>Trident Community Equipment</h1><p>Your workspace, wherever you work.</p>{localMode?<button onClick={openLocal}>Open local workspace</button>:<div ref={button}/>}<p>{localMode?'Changes here are saved on this computer. Your live website and cloud quotes are separate.':`Access is restricted to ${owner}.`}</p>{error&&<p role="alert">{error}</p>}</main>
}
