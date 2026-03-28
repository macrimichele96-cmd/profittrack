// ─── COSTANTI ────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"];
const MONTH_FULL  = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAY_NAMES   = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
const DAY_FULL    = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];

const CATS_USC = [
  { id:'cibo',        label:'Cibo',        emoji:'🛒', color:'#FF9F0A' },
  { id:'casa',        label:'Casa',        emoji:'🏠', color:'#0A84FF' },
  { id:'trasporti',   label:'Trasporti',   emoji:'🚗', color:'#30D158' },
  { id:'svago',       label:'Svago',       emoji:'🎬', color:'#BF5AF2' },
  { id:'salute',      label:'Salute',      emoji:'❤️',  color:'#FF453A' },
  { id:'abbonamenti', label:'Abbonamenti', emoji:'📦', color:'#64D2FF' },
  { id:'altro',       label:'Altro',       emoji:'💸', color:'#8E8E93' },
];
const CATS_INC = [
  { id:'stipendio',    label:'Stipendio',    emoji:'💼', color:'#32D74B' },
  { id:'extra',        label:'Extra',        emoji:'💰', color:'#FFD60A' },
  { id:'investimenti', label:'Investimenti', emoji:'📈', color:'#30D158' },
  { id:'regalo',       label:'Regalo',       emoji:'🎁', color:'#FF6B6B' },
];

// ─── STATO ───────────────────────────────────────────────────────────────────
let db        = safeLoad('pt_db')        || {};
let gSettings = safeLoad('pt_settings')  || { stip:0, oreGiorno:8, pagaH:0, restDays:[0,6] };
let recurring = safeLoad('pt_recurring') || [];

if (gSettings.ore && !gSettings.oreGiorno) gSettings.oreGiorno = gSettings.ore / 5;

let currentView   = new Date();
let viewMode      = 'month';
let modalType     = 'usc';
let selectedCat   = CATS_USC[0];
let currentRecCat = { label:'Casa', emoji:'🏠' };
let calendarOpen  = false;
let swRegistration = null;

// ─── SICUREZZA DATI ──────────────────────────────────────────────────────────
function safeLoad(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function safeSave(key, data) {
  try {
    const str = JSON.stringify(data);
    // Sanity check: can we parse it back?
    JSON.parse(str);
    localStorage.setItem(key, str);
    return true;
  } catch (e) {
    console.error('SafeSave failed:', e);
    return false;
  }
}

function sanitizeAmount(val) {
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100) / 100;
}

function save() {
  if (!safeSave('pt_db', db)) {
    console.warn('DB save failed — keeping previous version');
  }
}

// ─── SERVICE WORKER ──────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    swRegistration = reg;
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          document.getElementById('updateBanner').style.display = 'flex';
        }
      });
    });
  }).catch(() => {});
}

function applyUpdate() {
  if (swRegistration && swRegistration.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  window.location.reload();
}

// ─── CALCOLO ORE PRECISO ─────────────────────────────────────────────────────
function countWorkDays(year, month, restDays) {
  const days = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    if (!restDays.includes(new Date(year, month, d).getDay())) count++;
  }
  return count;
}

function calcOreMese(oreGiorno, restDays, year, month, oreExtra) {
  return Math.round(countWorkDays(year, month, restDays) * oreGiorno + (oreExtra || 0));
}

function isWorkDay(date, restDays) {
  return !restDays.includes(date.getDay());
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.onload = () => {
  if (!gSettings.stip || gSettings.stip === 0) {
    document.getElementById('onboarding').style.display = 'flex';
    const restDays = gSettings.restDays || [0,6];
    document.querySelectorAll('#ob_days .day-btn').forEach(btn => {
      btn.classList.toggle('active', restDays.includes(parseInt(btn.dataset.day)));
      btn.onclick = () => btn.classList.toggle('active');
    });
  } else {
    bootApp();
  }
};

function bootApp() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  populateSettingsDayPicker();
  render();
  renderRecurringList();
  renderHistoryChart();
  renderAvgBox();
  const p = new URLSearchParams(window.location.search);
  if (p.get('action') === 'expense') { openModal(); setModalType('usc'); }
  if (p.get('action') === 'income')  { openModal(); setModalType('inc'); }
}

function completeOnboarding() {
  const stip      = sanitizeAmount(document.getElementById('ob_stip').value);
  const oreGiorno = sanitizeAmount(document.getElementById('ob_ore').value);
  if (stip <= 0 || oreGiorno <= 0) { shakeEl('onboarding'); return; }
  const restDays = [];
  document.querySelectorAll('#ob_days .day-btn.active').forEach(b => restDays.push(parseInt(b.dataset.day)));
  const now = new Date();
  const k   = monthKey(now.getFullYear(), now.getMonth());
  if (!db[k]) db[k] = { settings:null, income:[], expenses:[], appliedRec:[] };
  const ore   = calcOreMese(oreGiorno, restDays, now.getFullYear(), now.getMonth(), 0);
  const pagaH = ore > 0 ? stip / ore : 0;
  db[k].workParams = { oreGiorno, restDays, oreExtra:0 };
  db[k].salary     = stip;
  db[k].settings   = { stip, oreGiorno, restDays, ore, oreExtra:0, pagaH, _fromGlobal:false };
  gSettings = { stip, oreGiorno, pagaH, restDays };
  safeSave('pt_settings', gSettings);
  save();
  bootApp();
}

// ─── DAY PICKER ──────────────────────────────────────────────────────────────
function toggleDayBtn(btn) { btn.classList.toggle('active'); liveCalcPreview(); }

function populateSettingsDayPicker() {
  const restDays = gSettings.restDays || [0,6];
  document.querySelectorAll('#set_days .day-btn').forEach(btn => {
    btn.classList.toggle('active', restDays.includes(parseInt(btn.dataset.day)));
  });
}

function getSelectedRestDays(id) {
  const days = [];
  document.querySelectorAll(`#${id} .day-btn.active`).forEach(b => days.push(parseInt(b.dataset.day)));
  return days;
}

function liveCalcPreview() {
  const oreG     = sanitizeAmount(document.getElementById('set_ore').value);
  const stip     = sanitizeAmount(document.getElementById('set_stip').value);
  const oreExtra = sanitizeAmount(document.getElementById('set_extra')?.value);
  const restDays = getSelectedRestDays('set_days');
  const el = document.getElementById('calcPreview');
  if (!el || oreG <= 0) { if(el) el.style.display='none'; return; }
  const vY = currentView.getFullYear(), vM = currentView.getMonth();
  const oreCorr = calcOreMese(oreG, restDays, vY, vM, oreExtra);
  const wdCorr  = countWorkDays(vY, vM, restDays);
  const prevY = vM === 0 ? vY-1 : vY, prevM = vM === 0 ? 11 : vM-1;
  const orePrec = calcOreMese(oreG, restDays, prevY, prevM, 0);
  let html = `<strong>${wdCorr}</strong> giorni lav. questo mese · <strong>${oreCorr}h</strong>`;
  if (stip > 0 && orePrec > 0) {
    const pagaH = stip / orePrec;
    html += `<br>€${stip.toFixed(0)} ÷ ${orePrec}h (${MONTH_NAMES[prevM]}) = <strong>€${pagaH.toFixed(2)}/h</strong>`;
  }
  el.innerHTML = html;
  el.style.display = 'block';
}

// ─── NAVIGAZIONE ─────────────────────────────────────────────────────────────
function showPage(pageId, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  window.scrollTo(0,0);
  render();
  if (pageId === 'page-settings') { renderRecurringList(); liveCalcPreview(); }
  if (pageId === 'page-analisi')  { renderHistoryChart(); renderAvgBox(); }
}

// Tap sul date-pill:
// Tap sul titolo data: cicla sempre GIORNO→MESE→ANNO→GIORNO
// Il calendario si apre con il pulsante 📅 che appare solo in vista giorno
function handleDatePillTap() {
  if (viewMode === 'day') {
    viewMode = 'month';
    // Resetta al primo del mese corrente
    currentView.setDate(1);
    closeCalendar();
    render();
  } else if (viewMode === 'month') {
    viewMode = 'year';
    currentView.setDate(1);
    render();
  } else { // year → torna a month (non a day direttamente)
    viewMode = 'month';
    currentView = new Date(); // torna al mese corrente
    currentView.setDate(1);
    render();
  }
}

// Apre il calendario per scegliere un giorno specifico
function openDayPicker() {
  viewMode = 'day';
  currentView = new Date();
  render();
  setTimeout(() => openCalendar(), 60);
}

function changeDate(dir) {
  if (viewMode === 'day') {
    // In vista giorno le frecce saltano 1 settimana
    currentView.setDate(currentView.getDate() + dir * 7);
  } else if (viewMode === 'month') {
    currentView.setDate(1);
    currentView.setMonth(currentView.getMonth() + dir);
  } else {
    currentView.setFullYear(currentView.getFullYear() + dir);
  }
  render();
}

// ─── CALENDARIO ──────────────────────────────────────────────────────────────
function toggleCalendar() {
  calendarOpen ? closeCalendar() : openCalendar();
}

function openCalendar() {
  calendarOpen = true;
  buildCalendar();
  const cal = document.getElementById('dayCalendar');
  const bd  = document.getElementById('calBackdrop');
  cal.style.display = 'block';
  bd.style.display  = 'block';
  // Double rAF ensures iOS Safari applies display:block before transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cal.classList.add('open');
    });
  });
}

function closeCalendar() {
  calendarOpen = false;
  const cal = document.getElementById('dayCalendar');
  const bd  = document.getElementById('calBackdrop');
  cal.classList.remove('open');
  bd.style.display = 'none';
  setTimeout(() => { cal.style.display = 'none'; }, 220);
}

function buildCalendar() {
  const y = currentView.getFullYear(), m = currentView.getMonth();
  const today    = new Date();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInM  = new Date(y, m+1, 0).getDate();
  const restDays = gSettings.restDays || [0,6];
  const k = monthKey(y, m);

  let html = `<div class="cal-header-actions">
    <button class="cal-view-btn" onclick="switchToMonthView()">Mese</button>
    <button class="cal-view-btn" onclick="switchToYearView()">Anno</button>
    <button class="cal-close-btn" onclick="closeCalendar()">✕</button>
  </div>
  <div class="cal-nav">
    <button onclick="calShiftMonth(-1)">‹</button>
    <span>${MONTH_FULL[m]} ${y}</span>
    <button onclick="calShiftMonth(1)">›</button>
  </div><div class="cal-grid">`;

  ['D','L','M','M','G','V','S'].forEach(d => { html += `<div class="cal-head">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell"></div>';

  for (let d = 1; d <= daysInM; d++) {
    const wd      = new Date(y, m, d).getDay();
    const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
    const isCurr  = y === currentView.getFullYear() && m === currentView.getMonth() && d === currentView.getDate() && viewMode === 'day';
    const isRest  = restDays.includes(wd);
    const hasData = db[k] && (
      (db[k].expenses||[]).some(e => { const dt=new Date(e.ts||e.id); return dt.getDate()===d && dt.getMonth()===m && dt.getFullYear()===y; }) ||
      (db[k].income  ||[]).some(i => { const dt=new Date(i.ts||i.id); return dt.getDate()===d && dt.getMonth()===m && dt.getFullYear()===y; })
    );
    let cls = 'cal-cell cal-day';
    if (isRest)  cls += ' cal-rest';
    if (isToday) cls += ' cal-today';
    if (isCurr)  cls += ' cal-current';
    html += `<div class="${cls}" onclick="selectCalDay(${y},${m},${d})">
      ${d}${hasData && !isCurr ? '<span class="cal-dot"></span>' : ''}
    </div>`;
  }
  html += '</div>';
  document.getElementById('dayCalendar').innerHTML = html;
}

function calShiftMonth(dir) {
  // Sposta il mese visualizzato nel calendario senza cambiare currentView
  const tmp = new Date(currentView.getFullYear(), currentView.getMonth() + dir, 1);
  // Temporaneamente aggiorna year/month per buildCalendar
  currentView.setFullYear(tmp.getFullYear());
  currentView.setMonth(tmp.getMonth());
  currentView.setDate(1);
  buildCalendar();
}

function selectCalDay(y, m, d) {
  currentView = new Date(y, m, d);
  viewMode = 'day';
  closeCalendar();
  render();
}

function switchToMonthView() {
  const calY = currentView.getFullYear();
  const calM = currentView.getMonth();
  closeCalendar();
  viewMode = 'month';
  currentView = new Date(calY, calM, 1);
  render();
}

function switchToYearView() {
  const calY = currentView.getFullYear();
  closeCalendar();
  viewMode = 'year';
  currentView = new Date(calY, 0, 1);
  render();
}

// ─── DROPDOWN (ricorrenti) ────────────────────────────────────────────────────
function openRecCatSheet() {
  document.getElementById('recCatBackdrop').classList.add('active');
  document.getElementById('recCatSheet').classList.add('active');
}
function closeRecCatSheet() {
  document.getElementById('recCatBackdrop').classList.remove('active');
  document.getElementById('recCatSheet').classList.remove('active');
}
function selectRecCat(label, emoji) {
  currentRecCat = { label, emoji };
  document.getElementById('rec_label').textContent = label;
  document.getElementById('rec_emoji').textContent = emoji;
  closeRecCatSheet();
}

// ─── DATA HELPERS ────────────────────────────────────────────────────────────
function monthKey(y, m) { return `${y}-${m}`; }
function curMonthKey()  { return monthKey(currentView.getFullYear(), currentView.getMonth()); }
function initMonthKey(k) {
  if (!db[k]) db[k] = { settings:null, income:[], expenses:[], appliedRec:[] };
  if (!db[k].appliedRec) db[k].appliedRec = [];
}

function prevKey(k) {
  const [y, m] = k.split('-').map(Number);
  return m === 0 ? `${y-1}-11` : `${y}-${m-1}`;
}

function getWorkParams(k) {
  if (db[k]?.workParams) return db[k].workParams;
  // Propagate from most recent month with workParams
  const [ky, km] = k.split('-').map(Number);
  const sorted = Object.keys(db)
    .filter(x => db[x].workParams)
    .filter(x => { const [xy,xm]=x.split('-').map(Number); return xy<ky||(xy===ky&&xm<km); })
    .sort((a,b) => { const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number); return (by*12+bm)-(ay*12+am); });
  if (sorted.length) return db[sorted[0]].workParams;
  return { oreGiorno: gSettings.oreGiorno||8, restDays: gSettings.restDays||[0,6], oreExtra:0 };
}

function getSalaryForMonth(k) {
  if (db[k]?.salary != null) return db[k].salary;
  if (db[k]?.settings?.stip && !db[k].settings._fromGlobal) return db[k].settings.stip;
  return 0;
}

function getOreForMonth(k) {
  const wp = getWorkParams(k);
  const [y, m] = k.split('-').map(Number);
  return calcOreMese(wp.oreGiorno, wp.restDays, y, m, wp.oreExtra||0);
}

function getPagaHForMonth(k) {
  const stip = getSalaryForMonth(k);
  const orePrec = getOreForMonth(prevKey(k));
  if (orePrec <= 0 || stip <= 0) return 0;
  return stip / orePrec;
}

function getEffectiveSettings(k) {
  const stip  = getSalaryForMonth(k);
  const wp    = getWorkParams(k);
  const [y,m] = k.split('-').map(Number);
  const ore   = calcOreMese(wp.oreGiorno, wp.restDays, y, m, wp.oreExtra||0);
  return { stip, oreGiorno: wp.oreGiorno, restDays: wp.restDays, ore, oreExtra: wp.oreExtra||0, pagaH: getPagaHForMonth(k) };
}

function getAvgSettings() {
  const keys = Object.keys(db).filter(k => db[k]?.salary != null && db[k].salary > 0);
  if (!keys.length) return { stip: gSettings.stip||0, pagaH: gSettings.pagaH||0, oreGiorno: gSettings.oreGiorno||8, count:0 };
  const stips  = keys.map(k => getSalaryForMonth(k));
  const pagaHs = keys.map(k => getPagaHForMonth(k)).filter(p => p > 0);
  const oreGs  = keys.map(k => getWorkParams(k).oreGiorno||8);
  return {
    stip:      stips.reduce((a,b)=>a+b,0)/stips.length,
    pagaH:     pagaHs.length ? pagaHs.reduce((a,b)=>a+b,0)/pagaHs.length : 0,
    oreGiorno: oreGs.reduce((a,b)=>a+b,0)/oreGs.length,
    count:     keys.length
  };
}

function getMonthData(k) {
  const d = db[k] || { settings:null, income:[], expenses:[], appliedRec:[] };
  const s = getEffectiveSettings(k);
  const extraInc = d.income.reduce((a,b)=>a+b.imp,0);
  const uscite   = d.expenses.reduce((a,b)=>a+b.imp,0);
  const totInc   = s.stip + extraInc;
  return { stip:s.stip, extraInc, totInc, uscite, net:totInc-uscite, pagaH:s.pagaH, income:d.income, expenses:d.expenses };
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function openModal() {
  buildCatGrid();
  document.getElementById('modal_amount').value = '';
  document.getElementById('timeDeterrent').style.display = 'none';
  document.getElementById('modalBackdrop').classList.add('active');
  document.getElementById('modalSheet').classList.add('active');
  setTimeout(() => document.getElementById('modal_amount').focus(), 320);
}
function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('active');
  document.getElementById('modalSheet').classList.remove('active');
}
function setModalType(type) {
  modalType = type;
  document.getElementById('typeBtnUsc').classList.toggle('active', type==='usc');
  document.getElementById('typeBtnInc').classList.toggle('active', type==='inc');
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = type==='usc' ? 'Aggiungi Uscita' : 'Aggiungi Entrata';
  btn.className   = `btn-primary modal-confirm-btn${type==='inc'?' btn-green':''}`;
  selectedCat = type==='usc' ? CATS_USC[0] : CATS_INC[0];
  buildCatGrid();
  document.getElementById('timeDeterrent').style.display = 'none';
}
function buildCatGrid() {
  const cats = modalType==='usc' ? CATS_USC : CATS_INC;
  document.getElementById('catGrid').innerHTML = cats.map(c => `
    <button class="cat-pill${c.id===selectedCat.id?' active':''}" style="--cat-color:${c.color}" onclick="selectModalCat('${c.id}')">
      <span class="cat-pill-emoji">${c.emoji}</span><span>${c.label}</span>
    </button>`).join('');
}
function selectModalCat(id) {
  selectedCat = (modalType==='usc'?CATS_USC:CATS_INC).find(c=>c.id===id)||CATS_USC[0];
  buildCatGrid();
}

// ─── TIME DETERRENT (brief #1) ───────────────────────────────────────────────
function onModalAmountInput() {
  const td = document.getElementById('timeDeterrent');
  if (modalType !== 'usc') { td.style.display='none'; return; }
  const imp = sanitizeAmount(document.getElementById('modal_amount').value);
  if (!imp || imp <= 0) { td.style.display='none'; return; }
  const k = curMonthKey();
  const pagaH = getPagaHForMonth(k) || gSettings.pagaH || 0;
  if (!pagaH) { td.style.display='none'; return; }
  const ore = imp / pagaH;
  let cls = 'time-deterrent';
  if (ore > 40) cls += ' td-red';
  else if (ore > 8) cls += ' td-orange';
  td.className = cls;
  td.style.display = 'block';
  td.textContent = `⏱ Questo acquisto ti costa ${ore.toFixed(1)} ore di lavoro`;
}

function confirmEntry() {
  const imp = sanitizeAmount(document.getElementById('modal_amount').value);
  if (!imp || imp <= 0) { shakeEl('modal_amount'); return; }
  if (viewMode === 'year') { closeModal(); return; }
  const entryDate = viewMode === 'day'
    ? new Date(currentView.getFullYear(), currentView.getMonth(), currentView.getDate())
    : new Date();
  const k = monthKey(entryDate.getFullYear(), entryDate.getMonth());
  initMonthKey(k);
  const entry = { id:Date.now(), ts:entryDate.getTime(), imp, cat:selectedCat.label, emoji:selectedCat.emoji, color:selectedCat.color };
  if (modalType==='usc') db[k].expenses.push(entry);
  else                   db[k].income.push(entry);
  save(); closeModal(); render();
}

// ─── IMPOSTAZIONI ────────────────────────────────────────────────────────────
function toggleOvertime() {
  const f = document.getElementById('overtimeField');
  const c = document.getElementById('overtimeChevron');
  const open = f.style.display !== 'none';
  f.style.display = open ? 'none' : 'block';
  c.textContent   = open ? '+' : '−';
}

function saveSettings() {
  if (viewMode === 'year') { alert("Passa alla vista mensile o giornaliera."); return; }
  const stip     = sanitizeAmount(document.getElementById('set_stip').value);
  const oreG     = sanitizeAmount(document.getElementById('set_ore').value);
  const oreExtra = sanitizeAmount(document.getElementById('set_extra')?.value);
  const restDays = getSelectedRestDays('set_days');
  if (oreG <= 0) { shakeEl('settingsCard'); return; }
  const k = curMonthKey(); initMonthKey(k);
  db[k].workParams = { oreGiorno:oreG, restDays, oreExtra };
  if (stip > 0) db[k].salary = stip;
  gSettings = { stip: stip||gSettings.stip, oreGiorno:oreG, restDays, pagaH:getPagaHForMonth(k) };
  safeSave('pt_settings', gSettings);
  const ore = getOreForMonth(k);
  db[k].settings = { stip:getSalaryForMonth(k), oreGiorno:oreG, restDays, ore, oreExtra, pagaH:getPagaHForMonth(k) };
  save(); liveCalcPreview(); render(); renderAvgBox();
}

// ─── RECURRING ───────────────────────────────────────────────────────────────
function saveRecurring() {
  const imp  = sanitizeAmount(document.getElementById('rec_imp').value);
  const nota = document.getElementById('rec_nota').value.trim();
  if (imp <= 0) return;
  recurring.push({ id:Date.now(), nome:nota||currentRecCat.label, imp, cat:currentRecCat.label, emoji:currentRecCat.emoji });
  safeSave('pt_recurring', recurring);
  document.getElementById('rec_imp').value  = '';
  document.getElementById('rec_nota').value = '';
  renderRecurringList(); render();
}
function deleteRecurring(id) {
  recurring = recurring.filter(r => r.id !== id);
  safeSave('pt_recurring', recurring);
  renderRecurringList(); render();
}
function applyRecurring() {
  if (viewMode === 'year') return;
  const k = curMonthKey(); initMonthKey(k);
  let added = 0;
  recurring.forEach(r => {
    if (!db[k].appliedRec.includes(r.id)) {
      db[k].expenses.push({ id:Date.now()+Math.random(), ts:Date.now(), imp:r.imp, cat:r.cat, emoji:r.emoji||'📌', color:'#8E8E93', isRec:true, nome:r.nome });
      db[k].appliedRec.push(r.id);
      added++;
    }
  });
  if (!added) return;
  save(); render();
}
function renderRecurringList() {
  const el = document.getElementById('recurringList'); if (!el) return;
  if (!recurring.length) { el.innerHTML = emptyState('Nessuna spesa fissa aggiunta'); return; }
  const tot = recurring.reduce((a,r)=>a+r.imp,0);
  el.innerHTML = recurring.map(r => `
    <div class="rec-row">
      <span class="rec-emoji">${r.emoji||'📌'}</span>
      <span class="rec-name">${r.nome}</span>
      <span class="rec-amt">€${fmtAmt(r.imp)}</span>
      <button class="del-btn-sm" onclick="deleteRecurring(${r.id})">✕</button>
    </div>`).join('') +
    `<div class="rec-total">Totale fisso €${tot.toFixed(0)}/mese</div>`;
}

// ─── ANALISI ─────────────────────────────────────────────────────────────────
function renderAvgBox() {
  const el = document.getElementById('avgInfoBox'); if (!el) return;
  const avg = getAvgSettings();
  const pagaH = avg.pagaH||0, stip = avg.stip||0, oreG = avg.oreGiorno||8;
  if (stip > 0) {
    const base = avg.count>0 ? `media ${avg.count} ${avg.count===1?'mese':'mesi'}` : 'dati attuali';
    el.innerHTML = `📊 <strong>${base}</strong> — Stipendio <strong>€${stip.toFixed(0)}</strong> · <strong>€${pagaH.toFixed(2)}/h</strong> · <strong>${oreG}h/giorno</strong>`;
    el.style.display = 'block';
  } else {
    el.innerHTML = '⚠️ Nessuno stipendio impostato. Vai su Impostazioni.';
    el.style.display = 'block';
  }
}

function validaAcquisto() {
  const prezzo = sanitizeAmount(document.getElementById('det_prezzo').value);
  const out = document.getElementById('detOut');
  if (!prezzo) { shakeEl('det_prezzo'); return; }
  const avg = getAvgSettings();
  if (!avg.pagaH) { out.style.display='block'; out.innerHTML='Configura prima i parametri mensili.'; return; }
  const ore    = prezzo / avg.pagaH;
  const perc   = (prezzo / avg.stip * 100).toFixed(1);
  const giorni = (ore / (avg.oreGiorno||8)).toFixed(1);
  out.style.display = 'block';
  out.innerHTML = `<strong>${ore.toFixed(1)} ore</strong> di lavoro (${giorni} giornate)<br><span style="font-size:13px;opacity:.8;">${perc}% del tuo stipendio medio</span>`;
}

function calcolaSostenibilita() {
  const target = sanitizeAmount(document.getElementById('obj_target').value);
  const anni   = sanitizeAmount(document.getElementById('obj_anni').value);
  const out = document.getElementById('objOut');
  if (!target || !anni) return;
  const mensile = target / (anni * 12);
  const avg = getAvgSettings();
  let extra = avg.stip>0 ? `<br><span style="font-size:13px;opacity:.75;">${(mensile/avg.stip*100).toFixed(1)}% del tuo stipendio medio</span>` : '';
  out.style.display = 'block';
  out.innerHTML = `<strong>€${mensile.toFixed(0)}/mese</strong> per ${anni} ${anni===1?'anno':'anni'}${extra}`;
}

// ─── STORICO ─────────────────────────────────────────────────────────────────
function renderHistoryChart() {
  const el = document.getElementById('historyChart');
  const leg = document.getElementById('historyLegend');
  if (!el) return;
  const months = [], now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const k = monthKey(d.getFullYear(), d.getMonth());
    const m = getMonthData(k);
    const has = m.totInc>0||m.uscite>0;
    months.push({ label:MONTH_NAMES[d.getMonth()], net:has?m.net:null, uscite:has?m.uscite:null });
  }
  const valid = months.filter(m=>m.net!==null);
  if (!valid.length) {
    el.innerHTML = emptyState('I dati appariranno man mano che aggiungi mesi.');
    if(leg) leg.innerHTML=''; return;
  }
  const allV = valid.flatMap(m=>[Math.abs(m.net),m.uscite]).filter(v=>v>0);
  const maxV = Math.max(...allV)*1.2||1;
  const W=300,H=120,bP=20,tP=6,cH=H-bP-tP,gW=W/12,bW=Math.floor(gW*.3),gap=2;
  let svg = `<line x1="0" y1="${H-bP}" x2="${W}" y2="${H-bP}" stroke="var(--border)" stroke-width="1"/>`;
  months.forEach((m,i)=>{
    const cx=gW*i+gW/2;
    svg+=`<text x="${cx}" y="${H-5}" text-anchor="middle" fill="var(--sub)" font-size="7" font-family="-apple-system,sans-serif" opacity="${m.net!==null?1:.3}">${m.label}</text>`;
    if(!m.net===null) return;
    if(m.uscite===null) return;
    const uH=Math.max(2,m.uscite/maxV*cH),nH=Math.max(2,Math.abs(m.net)/maxV*cH);
    const nC=m.net>=0?'#32D74B':'#FF453A',base=H-bP;
    svg+=`<rect x="${(cx-bW-gap/2).toFixed(1)}" y="${(base-uH).toFixed(1)}" width="${bW}" height="${uH.toFixed(1)}" rx="2" fill="#0A84FF" opacity=".7"/>`;
    svg+=`<rect x="${(cx+gap/2).toFixed(1)}" y="${(base-nH).toFixed(1)}" width="${bW}" height="${nH.toFixed(1)}" rx="2" fill="${nC}" opacity=".85"/>`;
  });
  el.innerHTML=`<svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible;">${svg}</svg>`;
  if(leg) leg.innerHTML=`<div class="chart-legend">
    <div class="legend-item"><div class="legend-dot" style="background:#0A84FF"></div><span>Uscite</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:#32D74B"></div><span>Flusso +</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:#FF453A"></div><span>Flusso −</span></div>
  </div>`;
}

// ─── PIE ─────────────────────────────────────────────────────────────────────
function renderPie(expenses) {
  const section=document.getElementById('pieSection');
  const svgEl=document.getElementById('pieChart');
  const legend=document.getElementById('pieLegend');
  if(!section||!expenses.length){if(section)section.style.display='none';return;}
  const totals={};
  expenses.forEach(e=>{if(!totals[e.cat])totals[e.cat]={val:0,color:e.color};totals[e.cat].val+=e.imp;});
  const total=Object.values(totals).reduce((a,b)=>a+b.val,0);
  const entries=Object.entries(totals).sort((a,b)=>b[1].val-a[1].val);
  const cx=60,cy=60,r=52,ir=26;
  let angle=-Math.PI/2,slices='';
  entries.forEach(([cat,{val,color}])=>{
    const a=val/total*Math.PI*2;if(a<.01)return;
    const ea=angle+a;
    slices+=`<path d="M${cx},${cy} L${(cx+r*Math.cos(angle)).toFixed(1)},${(cy+r*Math.sin(angle)).toFixed(1)} A${r},${r} 0 ${a>Math.PI?1:0},1 ${(cx+r*Math.cos(ea)).toFixed(1)},${(cy+r*Math.sin(ea)).toFixed(1)} Z" fill="${color}" opacity=".9"/>`;
    angle=ea;
  });
  slices+=`<circle cx="${cx}" cy="${cy}" r="${ir}" fill="var(--card-bg)"/>`;
  slices+=`<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="var(--text)" font-size="9" font-weight="700" font-family="-apple-system,sans-serif">€${total.toFixed(0)}</text>`;
  svgEl.innerHTML=slices;
  legend.innerHTML=entries.map(([cat,{val,color}])=>
    `<div class="pie-leg-row"><span class="pie-dot" style="background:${color}"></span><span class="pie-cat">${cat}</span><span class="pie-pct">${(val/total*100).toFixed(0)}%</span></div>`
  ).join('');
  section.style.display='block';
}

// ─── EXPORT / IMPORT ─────────────────────────────────────────────────────────
function exportBackup() {
  const a = Object.assign(document.createElement('a'),{
    href:"data:text/json;charset=utf-8,"+encodeURIComponent(localStorage.getItem('pt_db')),
    download:`ProfitTrack_${new Date().toISOString().slice(0,10)}.json`
  });
  document.body.appendChild(a);a.click();a.remove();
}
function exportCSV() {
  let csv="Anno-Mese,Data,Tipo,Categoria,Importo\n";
  Object.keys(db).forEach(k=>{
    (db[k].income||[]).forEach(i=>{const d=i.ts?new Date(i.ts).toLocaleDateString('it-IT'):k;csv+=`${k},${d},Entrata,"${i.cat}",${i.imp}\n`;});
    (db[k].expenses||[]).forEach(e=>{const d=e.ts?new Date(e.ts).toLocaleDateString('it-IT'):k;csv+=`${k},${d},Uscita,"${e.cat}",${e.imp}\n`;});
  });
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:'ProfitTrack.csv'});
  document.body.appendChild(a);a.click();a.remove();
}
function importBackup(event) {
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const imp=JSON.parse(e.target.result);
      if(typeof imp!=='object')throw new Error('invalid');
      Object.keys(imp).forEach(k=>{if(!db[k])db[k]=imp[k];});
      save();render();renderHistoryChart();
      alert(`✅ Importati ${Object.keys(imp).length} mesi.`);
    }catch{alert('❌ File non valido.');}
  };
  reader.readAsText(file);event.target.value='';
}
function resetData(){if(confirm("Cancellare tutto permanentemente?")){localStorage.clear();location.reload();}}

// ─── DELETE ──────────────────────────────────────────────────────────────────
function deleteItem(id,type,k){
  if(type==='inc')db[k].income=db[k].income.filter(i=>i.id!==id);
  else db[k].expenses=db[k].expenses.filter(i=>i.id!==id);
  save();render();
}

// ─── SWIPE ───────────────────────────────────────────────────────────────────
let swipeData={};
function swipeStart(e,id){swipeData[id]={startX:e.touches[0].clientX,dx:0};}
function swipeMove(e,id){
  if(!swipeData[id])return;
  const dx=e.touches[0].clientX-swipeData[id].startX;
  swipeData[id].dx=dx;if(dx>=0)return;
  const t=Math.min(Math.abs(dx),80);
  const inner=document.getElementById('inner_'+id);
  const bg=document.getElementById('delbg_'+id);
  if(inner)inner.style.transform=`translateX(-${t}px)`;
  if(bg)bg.style.transform=`translateX(${100-(t/80)*100}%)`;
}
function swipeEnd(e,id,type,k){
  if(!swipeData[id])return;
  const dx=swipeData[id].dx;
  if(dx<-60){
    const wrap=document.getElementById('wrap_'+id);
    if(wrap){wrap.style.opacity='0';wrap.style.transition='opacity .2s';}
    setTimeout(()=>deleteItem(id,type,k),200);
  }else{
    const inner=document.getElementById('inner_'+id);
    const bg=document.getElementById('delbg_'+id);
    if(inner)inner.style.transform='';if(bg)bg.style.transform='';
  }
  delete swipeData[id];
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function shakeEl(id){const el=document.getElementById(id);if(!el)return;el.classList.add('shake');setTimeout(()=>el.classList.remove('shake'),500);}
function fmt(n) {
  const abs = Math.abs(n);
  // Mostra decimali solo se ci sono centesimi significativi
  const hasDecimals = (abs % 1) >= 0.005;
  const formatted = hasDecimals ? abs.toFixed(2) : abs.toFixed(0);
  return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtAmt(n) {
  // Per importi nelle liste: mostra sempre 2 decimali se non intero
  const abs = Math.abs(n);
  const hasDecimals = (abs % 1) >= 0.005;
  return hasDecimals ? abs.toFixed(2) : abs.toFixed(0);
}

function emptyState(msg) {
  return `<div class="empty-state-box">
    <div class="empty-icon">○</div>
    <div class="empty-msg">${msg}</div>
  </div>`;
}

function formatTxDate(ts){
  if(!ts)return'';
  const d=new Date(ts),today=new Date(),yesterday=new Date(today);
  yesterday.setDate(today.getDate()-1);
  if(d.toDateString()===today.toDateString())return'Oggi';
  if(d.toDateString()===yesterday.toDateString())return'Ieri';
  return`${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function groupByDate(items){
  const groups={};
  items.forEach(item=>{
    const ts=item.ts||item.id,d=new Date(ts);
    const dk=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if(!groups[dk])groups[dk]={label:formatTxDate(ts),items:[],ts};
    groups[dk].items.push(item);
  });
  return Object.values(groups).sort((a,b)=>b.ts-a.ts);
}

function renderRow(item,type,k){
  const id    = item.id;
  const color = item.color || '#8E8E93';
  // Show category name if nome == cat (no custom name), else show custom name
  const label = (item.nome && item.nome !== item.cat) ? item.nome : item.cat;
  return `<div class="tx-swipe-wrap" id="wrap_${id}">
    <div class="tx-delete-bg" id="delbg_${id}">Elimina</div>
    <div class="tx-row-inner"
      ontouchstart="swipeStart(event,${id})"
      ontouchmove="swipeMove(event,${id})"
      ontouchend="swipeEnd(event,${id},'${type}','${k}')"
      id="inner_${id}">
      <div class="tx-emoji" style="background:linear-gradient(135deg,${color}30 0%,${color}18 100%);">${item.emoji||'💸'}</div>
      <div class="tx-info">
        <span class="tx-cat">${label}</span>
        <span class="tx-sub" style="color:${color}cc;">${item.cat}</span>
      </div>
      <div class="tx-right">
        <span class="tx-amt" style="color:${type==='usc'?'var(--red)':'var(--green)'}">
          ${type==='usc'?'−':'+'} €${fmtAmt(item.imp)}
        </span>
      </div>
    </div>
  </div>`;
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function render(){
  let dateStr='',totInc=0,totUsc=0,net=0,pagaH=0;
  let allIncome=[],allExpenses=[],currentK='';

  if(viewMode==='day'){
    const y=currentView.getFullYear(),m=currentView.getMonth(),d=currentView.getDate();
    const dayNow=new Date(),isToday=y===dayNow.getFullYear()&&m===dayNow.getMonth()&&d===dayNow.getDate();
    dateStr=isToday?`Oggi, ${d} ${MONTH_NAMES[m]}`:`${DAY_FULL[currentView.getDay()]} ${d} ${MONTH_NAMES[m]} ${y}`;
    currentK=monthKey(y,m);initMonthKey(currentK);
    const data=db[currentK];
    pagaH=getPagaHForMonth(currentK);
    const tsS=new Date(y,m,d,0,0,0).getTime(),tsE=new Date(y,m,d,23,59,59).getTime();
    allIncome=(data.income||[]).filter(i=>{const ts=i.ts||i.id;return ts>=tsS&&ts<=tsE;}).map(i=>({...i,monthKey:currentK}));
    allExpenses=(data.expenses||[]).filter(e=>{const ts=e.ts||e.id;return ts>=tsS&&ts<=tsE;}).map(e=>({...e,monthKey:currentK}));
    totInc=allIncome.reduce((a,b)=>a+b.imp,0);
    totUsc=allExpenses.reduce((a,b)=>a+b.imp,0);
    net=totInc-totUsc;
    const wp=getWorkParams(currentK),rs=wp.restDays||[0,6];
    const isWork=isWorkDay(currentView,rs);
    const dayCard=document.getElementById('dayWorkedCard');
    if(dayCard){
      dayCard.style.display='block';
      if(isWork&&pagaH>0){
        dayCard.className='day-worked-card day-work';
        document.getElementById('dayWorkedText').textContent=`💼 Giorno lavorativo · Guadagnato €${(wp.oreGiorno*pagaH).toFixed(0)} oggi`;
      }else{
        dayCard.className='day-worked-card day-rest';
        document.getElementById('dayWorkedText').textContent='😴 Giorno di riposo';
      }
    }

  }else if(viewMode==='month'){
    currentK=curMonthKey();initMonthKey(currentK);
    const data=db[currentK];
    dateStr=`${MONTH_FULL[currentView.getMonth()]} ${currentView.getFullYear()}`;
    const salary=getSalaryForMonth(currentK);
    pagaH=getPagaHForMonth(currentK);
    const wp=getWorkParams(currentK);
    totInc=salary+(data.income||[]).reduce((a,b)=>a+b.imp,0);
    totUsc=(data.expenses||[]).reduce((a,b)=>a+b.imp,0);
    net=totInc-totUsc;
    allIncome=(data.income||[]).map(i=>({...i,monthKey:currentK}));
    allExpenses=(data.expenses||[]).map(e=>({...e,monthKey:currentK}));
    document.getElementById('dayWorkedCard').style.display='none';
    const sl=document.getElementById('settingsMonthLabel');
    if(sl)sl.textContent=`${MONTH_NAMES[currentView.getMonth()]} ${currentView.getFullYear()}`;
    const sir=document.getElementById('salaryInfoRow');
    if(sir){
      const prevM=currentView.getMonth()===0?11:currentView.getMonth()-1;
      const prevYr=currentView.getMonth()===0?currentView.getFullYear()-1:currentView.getFullYear();
      sir.innerHTML=`📅 Stipendio per il lavoro di <strong>${MONTH_NAMES[prevM]} ${prevYr}</strong> · pagaH calcolato su quel mese.`;
      sir.style.display='block';
    }
    const setStip=document.getElementById('set_stip');
    const setOre=document.getElementById('set_ore');
    if(setStip)setStip.value=salary>0?salary:'';
    if(setOre)setOre.value=wp.oreGiorno||'';
    if(wp.oreExtra>0){
      const extF=document.getElementById('set_extra');
      if(extF)extF.value=wp.oreExtra;
      document.getElementById('overtimeField').style.display='block';
      document.getElementById('overtimeChevron').textContent='−';
    }
    liveCalcPreview();
    const banner=document.getElementById('recurringApplyBanner');
    if(banner&&recurring.length){
      const notApplied=recurring.filter(r=>!(data.appliedRec||[]).includes(r.id));
      if(notApplied.length){
        document.getElementById('recurringApplyText').textContent=`${notApplied.length} spese fisse non applicate`;
        banner.style.display='flex';
      }else banner.style.display='none';
    }else if(banner)banner.style.display='none';

  }else{ // year
    const year=currentView.getFullYear().toString();
    dateStr=`Anno ${year}`;
    document.getElementById('dayWorkedCard').style.display='none';
    Object.keys(db).forEach(k=>{
      if(!k.startsWith(year))return;
      const d=db[k];
      totInc+=getSalaryForMonth(k)+(d.income||[]).reduce((a,b)=>a+b.imp,0);
      totUsc+=(d.expenses||[]).reduce((a,b)=>a+b.imp,0);
      (d.income||[]).forEach(i=>allIncome.push({...i,monthKey:k}));
      (d.expenses||[]).forEach(e=>allExpenses.push({...e,monthKey:k}));
    });
    net=totInc-totUsc;
  }

  // Header
  document.getElementById('dateLabel').textContent=dateStr;
  const vb=document.getElementById('viewBadge');
  if(vb){
    if(viewMode==='day'){
      vb.textContent='GIORNO · ↑ MESE';
    } else if(viewMode==='year'){
      vb.textContent='ANNO · ↑ MESE';
    } else {
      vb.textContent='MESE · ↑ ANNO';
    }
    vb.title='Tocca per cambiare vista';
  }
  // Mostra pulsante calendario solo se siamo in vista giorno o mese
  // Cal picker button: visible in MESE and GIORNO view
  const calBtn = document.getElementById('calPickerBtn');
  if (calBtn) {
    const showCal = (viewMode === 'day' || viewMode === 'month');
    calBtn.style.display  = showCal ? 'flex' : 'none';
    calBtn.style.opacity  = showCal ? '1' : '0';
    calBtn.style.pointerEvents = showCal ? 'auto' : 'none';
  }

  // Hero
  document.getElementById('heroAmount').textContent=`${net<0?'−':''}€${fmt(net)}`;
  document.getElementById('heroAmount').style.color=net>=0?'var(--green)':'var(--red)';
  document.getElementById('heroLabel').textContent=viewMode==='day'?'Saldo del Giorno':'Flusso Netto';
  const heroSub=document.getElementById('heroSub');
  if(pagaH>0&&viewMode!=='year'){heroSub.textContent=`€${pagaH.toFixed(2)} / ora`;heroSub.style.display='block';}
  else heroSub.style.display='none';
  const heroTrend=document.getElementById('heroTrend');
  if(heroTrend&&viewMode==='month'){
    const prevData=getMonthData(prevKey(currentK));
    if(prevData.totInc>0||prevData.uscite>0){
      const diff=net-prevData.net,arrow=diff>=0?'↑':'↓',col=diff>=0?'var(--green)':'var(--red)';
      const prevK2=prevKey(currentK);
      heroTrend.innerHTML=`<span style="color:${col}">${arrow} €${fmt(Math.abs(diff))}</span> <span style="opacity:.6;font-size:11px;">vs ${MONTH_NAMES[parseInt(prevK2.split('-')[1])]}</span>`;
      heroTrend.style.display='block';
    }else heroTrend.style.display='none';
  }else if(heroTrend)heroTrend.style.display='none';

  let perc=totInc>0?Math.min(100,totUsc/totInc*100):0;
  document.getElementById('heroBar').style.width=perc+'%';
  document.getElementById('heroBar').style.background=perc>80?'var(--red)':perc>50?'var(--orange)':'var(--green)';
  document.getElementById('heroBarLabel').textContent=`${perc.toFixed(0)}% speso`;

  // Stats
  document.getElementById('statIn').textContent=`€${fmt(totInc)}`;
  document.getElementById('statOut').textContent=`€${fmt(totUsc)}`;
  const chipOra=document.getElementById('chipOra');
  if(pagaH>0&&viewMode!=='year'){document.getElementById('statOra').textContent=`€${pagaH.toFixed(2)}`;chipOra.style.display='flex';}
  else chipOra.style.display='none';

  // Safe-to-spend predittivo (brief #3)
  const ssCard=document.getElementById('safeSpendCard');
  if(ssCard&&viewMode==='month'){
    const today=new Date();
    const isCurMon=today.getMonth()===currentView.getMonth()&&today.getFullYear()===currentView.getFullYear();
    if(isCurMon&&totInc>0){
      const totFixed=recurring.reduce((a,r)=>a+r.imp,0);
      const k=curMonthKey();
      const appliedFixed=(db[k]?.appliedRec||[]).length>0?recurring.filter(r=>(db[k].appliedRec||[]).includes(r.id)).reduce((a,r)=>a+r.imp,0):0;
      const remainingFixed=totFixed-appliedFixed;
      const realAvailable=net-remainingFixed;
      ssCard.style.display='block';
      document.getElementById('safeSpendAmt').textContent=`€${fmt(Math.max(0,realAvailable))}`;
      document.getElementById('safeSpendAmt').style.color=realAvailable<0?'var(--red)':'var(--blue)';
      const daysLeft=new Date(today.getFullYear(),today.getMonth()+1,0).getDate()-today.getDate()+1;
      const perDay=realAvailable>0?realAvailable/daysLeft:0;
      let sub=`Flusso €${fmt(net)}`;
      if(remainingFixed>0)sub+=` − €${fmt(remainingFixed)} spese fisse rimaste`;
      if(perDay>0)sub+=` · €${perDay.toFixed(0)}/giorno`;
      document.getElementById('safeSpendSub').textContent=sub;
    }else ssCard.style.display='none';
  }else if(ssCard)ssCard.style.display='none';

  // Positive feedback
  const pb=document.getElementById('positiveBanner');
  if(pb){
    const sp=totInc>0?(net/totInc)*100:0;
    if(sp>=20&&viewMode!=='day'){
      const msgs=[`🎉 Ottimo! Stai risparmiando il ${sp.toFixed(0)}% delle entrate.`,`💪 Ogni euro risparmiato è un passo verso la libertà finanziaria.`,`✨ Sei in positivo del ${sp.toFixed(0)}%. Continua così!`];
      pb.style.display='block';pb.textContent=msgs[new Date().getDate()%msgs.length];
    }else pb.style.display='none';
  }

  // Badge impostazioni
  const badge=document.getElementById('settingsBadge');
  if(badge&&viewMode==='month'){
    const k=curMonthKey();initMonthKey(k);
    const n=recurring.filter(r=>!(db[k].appliedRec||[]).includes(r.id)).length;
    badge.style.display=n?'block':'none';badge.textContent=n||'';
  }

  // Recent list
  const recent=[...allExpenses.map(e=>({...e,_type:'usc'})),...allIncome.map(i=>({...i,_type:'inc'}))]
    .sort((a,b)=>(b.ts||b.id)-(a.ts||a.id)).slice(0,6);
  const rtEl=document.getElementById('recentTitle');
  if(rtEl)rtEl.textContent=viewMode==='day'?'Movimenti del giorno':'Recenti';
  const rl=document.getElementById('recentList');
  if(rl){
    rl.innerHTML=recent.length
      ?recent.map(e=>renderRow(e,e._type,e.monthKey)).join('')
      :emptyState('Ancora nessun movimento.<br>Premi <strong>+</strong> per aggiungerne uno.');
  }

  // Movimenti page
  if(document.getElementById('page-movimenti').classList.contains('active')){
    const mKey=currentK||curMonthKey();
    const makeGrouped=(items,type)=>{
      if(!items.length)return emptyState(type==='inc'?'Nessuna entrata registrata':'Nessuna uscita registrata');
      return groupByDate(items.map(i=>({...i,_type:type}))).map(g=>
        `<div class="date-separator">${g.label}</div>${g.items.map(i=>renderRow(i,type,mKey)).join('')}`
      ).join('');
    };
    document.getElementById('incomeList').innerHTML=makeGrouped(allIncome,'inc');
    document.getElementById('expenseList').innerHTML=makeGrouped(allExpenses,'usc');
    const mil=document.getElementById('movIncLabel');
    const mol=document.getElementById('movOutLabel');
    if(mil)mil.textContent=`€${fmt(totInc)}`;
    if(mol)mol.textContent=`€${fmt(totUsc)}`;
    renderPie(allExpenses);
  }

  // Analisi page
  if(document.getElementById('page-analisi')?.classList.contains('active')){
    renderHistoryChart();renderAvgBox();
  }
}
