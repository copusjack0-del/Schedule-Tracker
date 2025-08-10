/* Pocket Schedule+Pay - mobile PWA with Gmail import and paycheck estimator */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const storeKey = 'pocket-schedule.v2';

const COLORS = ['#22d3ee','#60a5fa','#34d399','#f59e0b','#f97316','#ef4444','#a78bfa'];

let state = {
  events: load()?.events || [],
  pay: load()?.pay || {
    rate: 0, otThreshold: 40, otMultiplier: 1.5, deductionPct: 0,
    lastPayday: '' // yyyy-mm-dd
  },
  focusDate: new Date(),
  deferredPrompt: null,
  imports: [] // pending imported events preview
};

/* ---------- Storage ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(storeKey)) || null; }
  catch { return null; }
}
function save() { localStorage.setItem(storeKey, JSON.stringify({ events: state.events, pay: state.pay })); }

/* ---------- Date helpers ---------- */
function startOfWeek(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function ymd(d){ return new Date(d).toISOString().slice(0,10); }
function formatDateHuman(d){ return new Date(d).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}); }

/* ---------- UI: Tabs ---------- */
window.addEventListener('DOMContentLoaded', () => {
  $$('#app .tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
});
function switchTab(id){
  $$('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
  $$('.tabpane').forEach(p=>p.classList.toggle('active', p.id===id));
}

/* ---------- Schedule rendering ---------- */
function renderWeekbar() {
  const wrap = $('#weekbar'); if (!wrap) return;
  wrap.innerHTML = '';
  const start = startOfWeek(state.focusDate), end = addDays(start,6);
  $('#rangeTitle').textContent = `${start.toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${end.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
  for (let i=0;i<7;i++){
    const day = addDays(start,i);
    const el = document.createElement('button');
    el.className = 'daychip' + (ymd(day)===ymd(state.focusDate) ? ' active' : '');
    el.innerHTML = `<small>${day.toLocaleDateString(undefined,{weekday:'short'})}</small><strong>${day.getDate()}</strong>`;
    el.onclick = ()=>{ state.focusDate = day; render(); };
    wrap.appendChild(el);
  }
}
function renderDays() {
  const container = $('#dayList'); if (!container) return;
  container.innerHTML = '';
  const start = startOfWeek(state.focusDate);
  for (let i=0;i<7;i++){
    const day = addDays(start,i);
    const evs = state.events.filter(e => e.date === ymd(day))
      .sort((a,b) => (a.start||'24:00').localeCompare(b.start||'24:00'));
    const card = document.createElement('section');
    card.className = 'day-card';
    const today = ymd(day) === ymd(new Date()) ? ' • Today' : '';
    card.innerHTML = `<h3>${formatDateHuman(day)}${today}</h3>`;
    if (!evs.length){ const empty=document.createElement('div'); empty.className='muted'; empty.textContent='No events'; card.appendChild(empty);}
    else evs.forEach(ev=>card.appendChild(renderEvent(ev)));
    container.appendChild(card);
  }
}
function renderEvent(ev) {
  const tpl = $('#eventItemTmpl').content.cloneNode(true);
  const article = tpl.querySelector('.event');
  tpl.querySelector('.dot').style.background = ev.color || COLORS[0];
  tpl.querySelector('.title').textContent = ev.title;
  tpl.querySelector('.time').textContent = formatTimeRange(ev.start, ev.end);
  const loc = tpl.querySelector('.location');
  const notes = tpl.querySelector('.notes');
  loc.textContent = ev.location || ''; notes.textContent = ev.notes || '';
  if (!ev.location) loc.classList.add('hidden'); else loc.classList.remove('hidden');
  if (!ev.notes) notes.classList.add('hidden'); else notes.classList.remove('hidden');
  tpl.querySelector('.edit').addEventListener('click', () => openDialog(ev));
  return article;
}
function formatTimeRange(s,e){
  if (!s && !e) return '';
  const fmt = t => {
    if (!t) return '';
    const [h,m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h,m||0,0,0);
    return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  }
  return [fmt(s), fmt(e)].filter(Boolean).join(' – ');
}

/* ---------- Color choices ---------- */
function renderColorChoices() {
  const wrap = $('#colorChoices'); if (!wrap) return;
  wrap.innerHTML = '';
  COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.style.background = c;
    btn.onclick = () => { $('#color').value = c; $$('.colors > button').forEach(b=>b.classList.remove('selected')); btn.classList.add('selected'); };
    wrap.appendChild(btn);
  });
}

/* ---------- Dialog CRUD ---------- */
function openDialog(ev=null) {
  $('#eventForm').reset();
  $('#btnDelete').classList.toggle('hidden', !ev);
  $('#btnDuplicate').classList.toggle('hidden', !ev);
  $('#dialogTitle').textContent = ev ? 'Edit Event' : 'Add Event';

  if (ev) {
    $('#eventId').value = ev.id; $('#title').value = ev.title; $('#date').value = ev.date;
    $('#start').value = ev.start || ''; $('#end').value = ev.end || '';
    $('#location').value = ev.location || ''; $('#notes').value = ev.notes || '';
    $('#color').value = ev.color || COLORS[0];
  } else {
    $('#eventId').value = ''; $('#date').value = ymd(state.focusDate); $('#color').value = COLORS[0];
  }
  renderColorChoices();
  const sel = $('#color').value;
  $$('.colors > button').forEach(b => { if (b.style.background === sel) b.classList.add('selected'); });
  $('#eventDialog').showModal();
}

function upsertEventFromForm(e) {
  e.preventDefault();
  const id = $('#eventId').value || crypto.randomUUID();
  const ev = {
    id,
    title: $('#title').value.trim(),
    date: $('#date').value,
    start: $('#start').value || null,
    end: $('#end').value || null,
    location: $('#location').value.trim() || null,
    notes: $('#notes').value.trim() || null,
    color: $('#color').value || COLORS[0],
  };
  if (!ev.title) return;
  const idx = state.events.findIndex(x => x.id === id);
  if (idx >= 0) state.events[idx] = ev; else state.events.push(ev);
  save(); $('#eventDialog').close(); render(); recalcPay();
}
function deleteEvent(){ const id=$('#eventId').value; state.events = state.events.filter(e=>e.id!==id); save(); $('#eventDialog').close(); render(); recalcPay(); }
function duplicateEvent(){ const id=$('#eventId').value; const src=state.events.find(e=>e.id===id); if(!src)return; const copy={...src,id:crypto.randomUUID()}; state.events.push(copy); save(); render(); recalcPay(); }

/* ---------- Export/Import ---------- */
function exportJSON(){
  const blob = new Blob([JSON.stringify(state.events,null,2)],{type:'application/json'}); triggerDownload(blob,`pocket-schedule-${Date.now()}.json`);
}
function exportICS(){
  const ics = toICS(state.events);
  const blob = new Blob([ics], {type:'text/calendar'}); triggerDownload(blob, `pocket-schedule-${Date.now()}.ics`);
}
function triggerDownload(blob, filename){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
function toICS(events){
  const esc = s => (s||'').toString().replace(/([,;])/g,'\\$1').replace(/\n/g,'\\n');
  const dtLocal = (date,time='00:00') => {
    const [h,m]= (time||'00:00').split(':').map(Number);
    const d= new Date(`${date}T${time||'00:00'}:00`);
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(h||0)}${pad(m||0)}00`;
  };
  const out = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pocket Schedule+Pay//EN'];
  events.forEach(ev=>{
    out.push('BEGIN:VEVENT',`UID:${ev.id}`,`DTSTAMP:${dtLocal(ev.date,ev.start||'00:00')}`,`DTSTART:${dtLocal(ev.date,ev.start||'00:00')}`, ev.end?`DTEND:${dtLocal(ev.date,ev.end)}`:'', `SUMMARY:${esc(ev.title)}`, ev.location?`LOCATION:${esc(ev.location)}`:'', ev.notes?`DESCRIPTION:${esc(ev.notes)}`:'', 'END:VEVENT');
  });
  out.push('END:VCALENDAR'); return out.filter(Boolean).join('\r\n');
}
function importJSON(file){
  const r=new FileReader();
  r.onload=()=>{ try{
    const data=JSON.parse(r.result); if(!Array.isArray(data)) throw new Error('Invalid file');
    const cleaned=data.map(e=>({ id:e.id||crypto.randomUUID(), title:String(e.title||'Untitled'), date:e.date||ymd(new Date()), start:e.start||null, end:e.end||null, location:e.location||null, notes:e.notes||null, color:e.color||COLORS[0]}));
    state.events=cleaned; save(); render(); recalcPay(); alert('Import complete ✔');
  }catch{ alert('Import failed. Use JSON exported from this app.'); } };
  r.readAsText(file);
}

/* ---------- PAY CALC ---------- */
function hoursBetween(start,end){
  if(!start||!end) return 0;
  const [h1,m1]=start.split(':').map(Number), [h2,m2]=end.split(':').map(Number);
  let t = (h2*60+m2) - (h1*60+m1);
  if (t<0) t+=24*60; // allow overnight
  return t/60;
}
function groupHoursByWeek(events){
  // week starts Monday
  const weeks = new Map(); // key ISO week start yyyy-mm-dd -> {regular, ot, total}
  events.forEach(e=>{
    const hrs=hoursBetween(e.start,e.end);
    const wk = ymd(startOfWeek(e.date));
    const obj = weeks.get(wk)||{days:[], hours:0};
    obj.days.push({date:e.date, hrs}); obj.hours+=hrs; weeks.set(wk,obj);
  });
  // apply OT threshold per week
  const res = new Map();
  for (const [wk,info] of weeks) {
    const reg = Math.min(info.hours, state.pay.otThreshold||40);
    const ot = Math.max(0, info.hours - (state.pay.otThreshold||40));
    res.set(wk, { regular: reg, ot, total: info.hours });
  }
  return res;
}
function currentPayPeriod(now=new Date()){
  // bi-weekly: periods every 14 days from lastPayday
  const start = new Date(state.pay.lastPayday || new Date());
  start.setHours(0,0,0,0);
  const dayMs = 86400000;
  let s = new Date(start);
  while (s.getTime() + 14*dayMs <= now.setHours(0,0,0,0)) {
    s = new Date(s.getTime()+14*dayMs);
  }
  const e = new Date(s.getTime()+14*dayMs-1);
  return {start:s, end:e};
}
function recalcPay(){
  const sum = $('#paySummary'); if (!sum) return;
  const period = currentPayPeriod(new Date());
  // events within period
  const evs = state.events.filter(e => {
    const d = new Date(e.date+'T00:00:00'); return d>=period.start && d<=period.end;
  });
  const weekly = groupHoursByWeek(evs);
  let regH=0, otH=0, totalH=0;
  for (const v of weekly.values()){ regH+=v.regular; otH+=v.ot; totalH+=v.total; }
  const rate = Number(state.pay.rate||0), mult=Number(state.pay.otMultiplier||1.5), ded=Number(state.pay.deductionPct||0);
  const gross = regH*rate + otH*rate*mult;
  const net = gross * (1 - ded/100);
  sum.innerHTML = `
    <div class="row"><span>Period</span><strong>${period.start.toLocaleDateString()} – ${period.end.toLocaleDateString()}</strong></div>
    <div class="row"><span>Hours (Regular)</span><strong>${regH.toFixed(2)}</strong></div>
    <div class="row"><span>Hours (OT)</span><strong>${otH.toFixed(2)}</strong></div>
    <div class="row"><span>Gross</span><strong>$${gross.toFixed(2)}</strong></div>
    <div class="row"><span>Estimated Net</span><strong>$${net.toFixed(2)}</strong></div>
  `;
}

/* ---------- EMAIL PARSE ---------- */
// Opinionated parsers for common shift email formats. Extend as needed.
function parseShiftsFromText(text){
  const results = [];
  // 1) Patterns like: Fri Aug 15, 2025 09:00 - 17:00 @ Location
  const lineRe = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4}).*?(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})(?:.*?@?\s*([^\n]+))?/gi;
  let m;
  while ((m = lineRe.exec(text)) !== null) {
    const [, , mon, day, year, s, e, loc] = m;
    const date = new Date(`${mon} ${day}, ${year}`);
    results.push({ title:'Shift', date: ymd(date), start: s, end: e, location: (loc||'').trim() || null, notes: null, color: '#34d399' });
  }
  // 2) Patterns like: 2025-08-15 09:00-17:00 (Location)
  const isoRe = /(\d{4}-\d{2}-\d{2}).{0,10}?(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})(?:.*?\(([^)]+)\))?/g;
  while ((m = isoRe.exec(text)) !== null) {
    const [, d, s, e, loc] = m;
    results.push({ title:'Shift', date: d, start: s, end: e, location: (loc||'').trim() || null, notes: null, color: '#34d399' });
  }
  // 3) Standalone times within a dated block like “Date: Aug 15, 2025 … Time: 7:30 AM - 3:30 PM”
  const blockRe = /Date:\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}).*?Time:\s*([0-9:apm\s]+)\s*[-–]\s*([0-9:apm\s]+)/gis;
  while ((m = blockRe.exec(text)) !== null) {
    const [, ds, sRaw, eRaw] = m;
    const date = new Date(ds);
    const s = to24h(sRaw), e = to24h(eRaw);
    if (s && e) results.push({ title:'Shift', date: ymd(date), start: s, end: e, location: null, notes: null, color: '#34d399' });
  }
  return dedupe(results);
}
function to24h(str){
  if(!str) return null;
  const s=str.trim().toUpperCase();
  const m=s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);
  if(!m) return null;
  let h=Number(m[1]); const min=Number(m[2]||0); const ap=m[3]||'';
  if (ap==='PM' && h<12) h+=12;
  if (ap==='AM' && h===12) h=0;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}
function dedupe(evs){
  const seen=new Set(); const out=[];
  for(const e of evs){
    const key=[e.title,e.date,e.start,e.end,e.location].join('|');
    if(!seen.has(key)){ seen.add(key); out.push(e); }
  }
  return out;
}

/* ---------- Gmail orchestration UI ---------- */
async function gmailFetchFlow(){
  try{
    $('#gmailStatus').textContent = 'Fetching…';
    const days = Number($('#gmailDays').value || 30);
    const query = $('#gmailQuery').value || 'subject:(schedule OR shift)';
    const emails = await Gmail.fetchMessages({query, daysBack: days, max: 50});
    const allShifts = [];
    emails.forEach(em => { const found = parseShiftsFromText((em.subject||'')+'\n'+(em.text||'')); allShifts.push(...found); });
    // preview
    state.imports = allShifts;
    renderImportPreview();
    $('#gmailStatus').textContent = `Found ${allShifts.length} shift(s). Review below.`;
    $('#commitImports').disabled = allShifts.length === 0;
  }catch(err){
    $('#gmailStatus').textContent = 'Fetch failed. ' + err.message;
  }
}
function renderImportPreview(){
  const wrap = $('#importPreview'); wrap.innerHTML='';
  if (!state.imports.length){ const div=document.createElement('div'); div.className='muted'; div.textContent='No parsed shifts yet.'; wrap.appendChild(div); return; }
  const byDate = new Map();
  state.imports.forEach(e=>{ const k=e.date; if(!byDate.has(k)) byDate.set(k,[]); byDate.get(k).push(e); });
  [...byDate.keys()].sort().forEach(d=>{
    const card=document.createElement('section'); card.className='day-card';
    card.innerHTML = `<h3>${formatDateHuman(d)}</h3>`;
    byDate.get(d).sort((a,b)=> (a.start||'24:00').localeCompare(b.start||'24:00'))
      .forEach(ev=> card.appendChild(renderEvent(ev)));
    wrap.appendChild(card);
  });
}

/* ---------- Boot & Listeners ---------- */
window.addEventListener('DOMContentLoaded', () => {
  render(); recalcPay();

  // schedule nav
  $('#fab').onclick = ()=>openDialog();
  $('#btnPrev').onclick = ()=>{ state.focusDate = addDays(startOfWeek(state.focusDate), -7); render(); };
  $('#btnNext').onclick = ()=>{ state.focusDate = addDays(startOfWeek(state.focusDate), 7); render(); };
  $('#btnToday').onclick = ()=>{ state.focusDate = new Date(); render(); };

  // modal events
  $('#eventForm').addEventListener('submit', upsertEventFromForm);
  $('#btnDelete').onclick = deleteEvent;
  $('#btnDuplicate').onclick = duplicateEvent;
  $('#btnClose').onclick = ()=>$('#eventDialog').close();

  // export/import
  $('#btnExport').onclick = async ()=>{ const c = await choose(['JSON (backup)', 'ICS (calendar)']); if(c==='JSON (backup)') exportJSON(); if(c==='ICS (calendar)') exportICS(); };
  $('#importFile').addEventListener('change', e => { const f=e.target.files?.[0]; if(f) importJSON(f); e.target.value=''; });

  // pay settings defaults
  $('#payRate').value = state.pay.rate || '';
  $('#otThreshold').value = state.pay.otThreshold ?? 40;
  $('#otMultiplier').value = state.pay.otMultiplier ?? 1.5;
  $('#deductionPct').value = state.pay.deductionPct ?? 0;
  $('#lastPayday').value = state.pay.lastPayday || '';

  $('#savePay').onclick = ()=>{
    state.pay.rate = Number($('#payRate').value||0);
    state.pay.otThreshold = Number($('#otThreshold').value||40);
    state.pay.otMultiplier = Number($('#otMultiplier').value||1.5);
    state.pay.deductionPct = Number($('#deductionPct').value||0);
    state.pay.lastPayday = $('#lastPayday').value || '';
    save(); recalcPay();
  };
  $('#calcNow').onclick = recalcPay;

  // settings button → Pay tab (quick access)
  $('#btnSettings').onclick = ()=>switchTab('payTab');

  // Gmail
  $('#gmailConnect').onclick = ()=>Gmail.connect();
  $('#gmailDisconnect').onclick = ()=>Gmail.disconnect();
  $('#gmailFetch').onclick = gmailFetchFlow;
  $('#parsePasted').onclick = ()=>{
    const txt = $('#pasteBox').value || '';
    state.imports = parseShiftsFromText(txt);
    renderImportPreview();
    $('#commitImports').disabled = state.imports.length===0;
  };
  $('#commitImports').onclick = ()=>{
    // commit imports (avoid duplicates by same date/start/end/location)
    const keys = new Set(state.events.map(e=>[e.title,e.date,e.start,e.end,e.location].join('|')));
    state.imports.forEach(e=>{
      const k=[e.title,e.date,e.start,e.end,e.location].join('|');
      if(!keys.has(k)){ state.events.push({...e, id: crypto.randomUUID()}); keys.add(k); }
    });
    state.imports = [];
    save(); render(); recalcPay();
    alert('Shifts added to your schedule ✔');
    $('#commitImports').disabled = true;
    $('#importPreview').innerHTML='';
  };

  // PWA install
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); state.deferredPrompt = e; $('#btnInstall').classList.remove('hidden');
  });
  $('#btnInstall').onclick = async ()=>{
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    $('#btnInstall').classList.add('hidden'); state.deferredPrompt = null;
  };
});

function render(){ renderWeekbar(); renderDays(); }

/* small action-sheet */
function choose(options){
  return new Promise(resolve=>{
    const dlg=document.createElement('dialog');
    dlg.innerHTML=`<form method="dialog" style="padding:0;border:0;background:transparent;">
      <div style="background:var(--panel);border:1px solid #1f2937;border-radius:16px;box-shadow:var(--shadow);overflow:hidden;">
        ${options.map(o=>`<button value="${o}" style="display:block;width:100%;text-align:left;padding:12px 14px;background:#0b1328;border:0;color:var(--text);border-bottom:1px solid #1f2937;">${o}</button>`).join('')}
        <button value="" style="display:block;width:100%;text-align:center;padding:12px 14px;background:transparent;border:0;color:var(--muted);">Cancel</button>
      </div></form>`;
    dlg.addEventListener('close', ()=>{ resolve(dlg.returnValue||null); dlg.remove(); });
    document.body.appendChild(dlg); dlg.showModal();
  });
}
