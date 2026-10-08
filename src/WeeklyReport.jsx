import { useEffect, useState } from 'react'

function monday(value = new Date()) {
 const d = typeof value === 'string' ? new Date(value + 'T12:00:00') : new Date(value)
 d.setDate(d.getDate() - (d.getDay() + 6) % 7)
 return dateKey(d)
}
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function shift(week, days) { const d = new Date(week+'T12:00:00'); d.setDate(d.getDate()+days); return dateKey(d) }
const amount = n => Number(n).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
const label = day => new Date(day+'T12:00:00').toLocaleDateString('en-NZ')
const colours = ['#9ebddd','#ffc34d','#9dbf83','#c7b0d6','#cfcb80','#8dc9c7','#eead99']

// A second submission for the same technician/week replaces that week in reports.
function weekRows(sheets, staff, week, allHours) {
 const latest = new Map()
 for (const sheet of sheets.filter(s => s.weekStart === week).sort((a,b) => a.submittedAt.localeCompare(b.submittedAt))) latest.set(sheet.technician.trim().toLowerCase(), sheet)
 const names = new Map(staff.map(s => [s.name.trim().toLowerCase(), s.name]))
 for (const [key, sheet] of latest) if (!names.has(key)) names.set(key,sheet.technician)
 return [...names].map(([key,name]) => {
  const sheet=latest.get(key), hours=Array.from({length:7},(_,i) => sheet && (allHours || sheet.days[i].status==='Work') ? Number(sheet.days[i].hours) : 0)
  return {name,hours,total:hours.reduce((sum,n)=>sum+n,0),submitted:!!sheet}
 })
}
function HoursTable({rows,week,title}) {
 const totals = Array.from({length:7},(_,i)=>rows.reduce((sum,r)=>sum+r.hours[i],0))
 return <section className="report-table"><h2>{title}</h2><div className="table-scroll"><table><thead><tr><th scope="col">Name</th>{totals.map((_,i)=><th scope="col" key={i}>{label(shift(week,i))}<small>Hours</small></th>)}<th scope="col">Total<small>Hours</small></th></tr></thead><tbody>{rows.map(row=><tr key={row.name}><th scope="row">{row.name}{!row.submitted&&<small>No submission</small>}</th>{row.hours.map((n,i)=><td key={i}>{n?amount(n):'—'}</td>)}<td>{amount(row.total)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total</th>{totals.map((n,i)=><td key={i}>{amount(n)}</td>)}<td>{amount(totals.reduce((sum,n)=>sum+n,0))}</td></tr></tfoot></table></div></section>
}
function WeeklyChart({rows,week}) {
 const max=Math.max(10,...rows.map(r=>r.total)), ceiling=Math.ceil(max/10)*10
 return <section className="weekly-chart"><h2>Weekly chart</h2><div className="chart-legend">{colours.map((c,i)=><span key={c}><i style={{background:c}}/>{label(shift(week,i))}</span>)}</div><div className="chart-scroll"><svg viewBox={`0 0 ${Math.max(540,rows.length*80+65)} 420`} role="img" aria-label="Weekly hours by technician, stacked by day"><title>Weekly hours by technician</title>{Array.from({length:6},(_,i)=>{const y=290-i*50;return <g key={i}><line x1="50" x2={Math.max(520,rows.length*80+45)} y1={y} y2={y} stroke="#dce3ec"/><text x="40" y={y+4} textAnchor="end" fontSize="11">{amount(ceiling*i/5)}</text></g>})}{rows.map((row,index)=>{let y=290;const x=65+index*80;return <g key={row.name}>{row.hours.map((n,i)=>{const height=n/ceiling*250;y-=height;return <g key={i}><rect x={x} y={y} width="50" height={height} fill={colours[i]}><title>{row.name}: {label(shift(week,i))} — {amount(n)} hours</title></rect>{height>18&&<text x={x+25} y={y+height/2+4} textAnchor="middle" fontSize="11">{amount(n)}</text>}</g>})}<text x={x+25} y="309" transform={`rotate(-40 ${x+25} 309)`} textAnchor="end" fontSize="11">{row.name}</text></g>})}</svg></div></section>
}
export default function WeeklyReport({request}) {
 const [week,setWeek]=useState(monday()),[allHours,setAllHours]=useState(false),[data,setData]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let cancelled=false;Promise.all([request('/api/timesheets'),request('/api/staff-settings')]).then(([s,t])=>{if(!cancelled)setData({sheets:s.data.timesheets,staff:t.data.technicians})}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[request])
 const current=data?weekRows(data.sheets,data.staff,week,allHours):[],previous=data?weekRows(data.sheets,data.staff,shift(week,-7),allHours):[]
 return <main className="workspace-page reports"><div className="page-heading"><div><h1>Weekly report</h1><p>Hours from signed time sheets. The latest submission for each technician and week is used.</p></div><div className="report-controls"><label>Week starting<input type="date" value={week} onChange={e=>e.target.value&&setWeek(monday(e.target.value))}/></label><label>Show<select aria-label="Show" value={allHours?'all':'work'} onChange={e=>setAllHours(e.target.value==='all')}><option value="work">Work hours</option><option value="all">Work and leave hours</option></select></label></div></div>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Loading weekly report…</p>}{data&&<><div className="weekly-layout"><HoursTable rows={current} week={week} title="Weekly labour"/><WeeklyChart rows={current} week={week}/></div>{!data.sheets.some(s=>s.weekStart===week)&&<p className="report-hint">No signed time sheets for this week yet.</p>}<HoursTable rows={previous} week={shift(week,-7)} title="Last week"/></>}</main>
}
