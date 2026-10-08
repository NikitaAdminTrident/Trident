import {useState} from 'react'
import StaffSettings from './StaffSettings'
import TimeSettings from './TimeSettings'
import QuoteSettings from './QuoteSettings'
export default function SettingsPage({request,onSaved}){
 const [tab,setTab]=useState('staff')
 return <div className="settings-workspace"><nav className="settings-tabs" aria-label="Settings sections">{[['staff','Technicians & vehicles'],['time','Time sheet defaults'],['quotes','Quote settings']].map(([key,name])=><button key={key} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{name}</button>)}</nav><section hidden={tab!=='staff'}><StaffSettings request={request} onSaved={onSaved}/></section><section hidden={tab!=='time'}><TimeSettings request={request} onSaved={onSaved}/></section><section hidden={tab!=='quotes'}><QuoteSettings request={request} onSaved={onSaved}/></section></div>
}
