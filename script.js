// ─── COSTANTI ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"];
const MONTH_FULL  = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAY_NAMES   = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
const DAY_FULL    = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];

const CATS_USC = [
  { id:'cibo',        label:'Cibo',         emoji:'🛒', color:'#FF9F0A' },
  { id:'casa',        label:'Casa',         emoji:'🏠', color:'#0A84FF' },
  { id:'trasporti',   label:'Trasporti',    emoji:'🚗', color:'#30D158' },
  { id:'svago',       label:'Svago',        emoji:'🎬', color:'#BF5AF2' },
  { id:'salute',      label:'Salute',       emoji:'❤️',  color:'#FF453A' },
  { id:'abbonamenti', label:'Abbonamenti',  emoji:'📦', color:'#64D2FF' },
  { id:'altro',       label:'Altro',        emoji:'💸', color:'#8E8E93' },
];
const CATS_INC = [
  { id:'stipendio',    label:'Stipendio',    emoji:'💼', color:'#32D74B' },
  { id:'extra',        label:'Extra',        emoji:'💰', color:'#FFD60A' },
  { id:'investimenti', label:'Investimenti', emoji:'📈', color:'#30D158' },
  { id:'regalo',       label:'Regalo',       emoji:'🎁', color:'#FF6B6B' },
];

// ─── STATO ────────────────────────────────────────────────────────────────
let db        = JSON.parse(localStorage.getItem('pt_db'))        || {};
let gSettings = JSON.parse(localStorage.getItem('pt_settings'))  || { stip:0, oreGiorno:8, pagaH:0, restDays:[0,6] };
let recurring = JSON.parse(localStorage.getItem('pt_recurring')) || [];

// Normalizza vecchi dati (ore -> oreGiorno)
if (gSettings.ore && !gSettings.oreGiorno) gSettings.oreGiorno = gSettings.ore / 5;

let currentView = new Date();
let viewMode    = 'month'; // 'day' | 'month' | 'year'
let modalType   = 'usc';
let selectedCat = CATS_USC[0];
let currentRecCat = { label:'Casa', emoji:'🏠' };

// ─── CALCOLO ORE PRECISO ──────────────────────────────────────────────────
// Conta i giorni lavorativi in un mese escludendo i giorni di riposo
function countWorkDays(year, month, restDays) {
  const days = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const wd = new Date(year, month, d).getDay(); // 0=Dom,6=Sab
    if (!restDays.includes(wd)) count++;
  }
  return count;
}

// Calcola ore mensili precise
function calcOreMese(oreGiorno, restDays, year, month, oreExtra) {
  const wd = countWorkDays(year, month, restDays);
  return Math.round(wd * oreGiorno + (oreExtra || 0));
}

// Calcola pagaH basandosi su ore mensili precise per il mese corrente
function calcPagaH(stip, oreGiorno, restDays, year, month, oreExtra) {
  const ore = calcOreMese(oreGiorno, restDays, year, month, oreExtra);
  return ore > 0 ? stip / ore : 0;
}

// Controlla se un giorno (Date) è lavorativo
function isWorkDay(date, restDays) {
  return !restDays.includes(date.getDay());
}

// ─── BOOT ─────────────────────────────────────────────────────────────────
window.onload = () => {
  if (!gSettings.stip || gSettings.stip === 0) {
    document.getElementById('onboarding').style.display = 'flex';
    // Init day picker in onboarding from gSettings.restDays
    const restDays = gSettings.restDays || [0,6];
    document.querySelectorAll('#ob_days .day-btn').forEach(btn => {
      const d = parseInt(btn.dataset.day);
      btn.classList.toggle('active', restDays.includes(d));
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
  const params = new URLSearchParams(window.location.search);
  if (params.get('action') === 'expense') { openModal(); setModalType('usc'); }
  if (params.get('action') === 'income')  { openModal(); setModalType('inc'); }
}

function completeOnboarding() {
  const stip      = parseFloat(document.getElementById('ob_stip').value) || 0;
  const oreGiorno = parseFloat(document.getElementById('ob_ore').value)  || 0;
  if (stip <= 0 || oreGiorno <= 0) { shakeEl('onboarding'); return; }
  const restDays = [];
  document.querySelectorAll('#ob_days .day-btn.active').forEach(b => restDays.push(parseInt(b.dataset.day)));
  const now = new Date();
  const k = monthKey(now.getFullYear(), now.getMonth());
  // In onboarding salviamo tutto sul mese corrente come punto di partenza
  if (!db[k]) db[k] = { settings:null, income:[], expenses:[], appliedRec:[] };
  db[k].workParams = { oreGiorno, restDays, oreExtra: 0 };
  db[k].salary     = stip;
  // Compatibilità
  const ore   = calcOreMese(oreGiorno, restDays, now.getFullYear(), now.getMonth(), 0);
  const pagaH = ore > 0 ? stip / ore : 0;
  db[k].settings = { stip, oreGiorno, restDays, ore, oreExtra:0, pagaH, _fromGlobal:false };
  gSettings = { stip, oreGiorno, pagaH, restDays };
  localStorage.setItem('pt_settings', JSON.stringify(gSettings));
  save();
  bootApp();
}

// ─── DAY PICKER HELPERS ───────────────────────────────────────────────────
function toggleDayBtn(btn) {
  btn.classList.toggle('active');
  liveCalcPreview();
}

function populateSettingsDayPicker() {
  const restDays = gSettings.restDays || [0,6];
  document.querySelectorAll('#set_days .day-btn').forEach(btn => {
    btn.classList.toggle('active', restDays.includes(parseInt(btn.dataset.day)));
  });
}

function getSelectedRestDays(containerId) {
  const days = [];
  document.querySelectorAll(`#${containerId} .day-btn.active`).forEach(b => days.push(parseInt(b.dataset.day)));
  return days;
}

function liveCalcPreview() {
  const oreG     = parseFloat(document.getElementById('set_ore').value)    || 0;
  const stip     = parseFloat(document.getElementById('set_stip').value)   || 0;
  const oreExtra = parseFloat(document.getElementById('set_extra')?.value) || 0;
  const restDays = getSelectedRestDays('set_days');
  const el = document.getElementById('calcPreview');
  if (!el || oreG <= 0) { if(el) el.style.display='none'; return; }

  // Mese corrente = mese in cui si lavora
  const vY = currentView.getFullYear(), vM = currentView.getMonth();
  const oreCorrenti = calcOreMese(oreG, restDays, vY, vM, oreExtra);
  const wdCorrenti  = countWorkDays(vY, vM, restDays);

  // Il pagaH usa lo stipendio di QUESTO mese ÷ ore del MESE PRECEDENTE
  // (stipendio corrente = pagamento per lavoro del mese scorso)
  const prevY = vM === 0 ? vY-1 : vY, prevM = vM === 0 ? 11 : vM-1;
  const orePrec = calcOreMese(oreG, restDays, prevY, prevM, 0);
  const wdPrec  = countWorkDays(prevY, prevM, restDays);

  let html = `<strong>${wdCorrenti}</strong> giorni lav. questo mese · <strong>${oreCorrenti}h</strong>`;
  if (stip > 0 && orePrec > 0) {
    const pagaH = stip / orePrec;
    html += `<br>€${stip.toFixed(0)} ÷ ${orePrec}h (${MONTH_NAMES[prevM]}) = <strong>€${pagaH.toFixed(2)}/h</strong>`;
  }
  el.innerHTML = html;
  el.style.display = 'block';
}

// ─── NAVIGAZIONE ──────────────────────────────────────────────────────────
function showPage(pageId, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  render();
  if (pageId === 'page-settings') { renderRecurringList(); liveCalcPreview(); }
  if (pageId === 'page-analisi')  { renderHistoryChart(); renderAvgBox(); }
}

function cycleViewMode() {
  if      (viewMode === 'month') viewMode = 'year';
  else if (viewMode === 'year')  viewMode = 'day';
  else                           viewMode = 'month';
  if (viewMode === 'day') currentView = new Date();
  closeCalendar();
  render();
}

function changeDate(dir) {
  if (viewMode === 'day') {
    // Frecce saltano 7 giorni in vista giorno — per un giorno usa il calendario
    currentView.setDate(currentView.getDate() + dir * 7);
  } else if (viewMode === 'month') {
    currentView.setDate(1);
    currentView.setMonth(currentView.getMonth() + dir);
  } else {
    currentView.setFullYear(currentView.getFullYear() + dir);
  }
  render();
}

// ─── DROPDOWN ─────────────────────────────────────────────────────────────
function toggleDropdown(id) {
  const d = document.getElementById(id);
  const was = d.classList.contains('active');
  document.querySelectorAll('.custom-dropdown').forEach(x => x.classList.remove('active'));
  if (!was) d.classList.add('active');
}
window.onclick = e => {
  if (!e.target.closest('.mini-cat-sel') && !e.target.closest('.custom-dropdown'))
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
};
function selectRecCat(label, emoji) {
  currentRecCat = { label, emoji };
  document.getElementById('rec_label').textContent = label;
  document.getElementById('rec_emoji').textContent = emoji;
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
}

// ─── DATA HELPERS ─────────────────────────────────────────────────────────
function monthKey(y, m)  { return `${y}-${m}`; }
function curMonthKey()   { return monthKey(currentView.getFullYear(), currentView.getMonth()); }
function initMonthKey(k) {
  if (!db[k]) db[k] = { settings: null, income: [], expenses: [], appliedRec: [] };
  if (!db[k].appliedRec) db[k].appliedRec = [];
}
function save() { localStorage.setItem('pt_db', JSON.stringify(db)); }

// ─── MODELLO STIPENDIO SFASATO ─────────────────────────────────────────────
// workParams[k]  = { oreGiorno, restDays, oreExtra }  → mese in cui si LAVORA
// stip[k]        = valore stipendio                    → mese in cui si INCASSA
// pagaH[k]       = stip[k] / ore[k-1]                 → il pagamento di k ÷ ore del mese precedente
//
// Esempio: lavori Gennaio → prendi stipendio a Febbraio
//   workParams["2025-0"] = { oreGiorno:8, restDays:[0,6] }
//   stip["2025-1"]       = 1800   (incassato a Febbraio)
//   pagaH usato in Febbraio = 1800 / ore_di_Gennaio

function prevKey(k) {
  const [y, m] = k.split('-').map(Number);
  if (m === 0) return `${y-1}-11`;
  return `${y}-${m-1}`;
}

// Ritorna i parametri di lavoro (ore, giorni riposo) per il mese k
// I workParams (ore/giorno, giorni riposo) SI propagano come default
// perché non cambiano spesso — lo stipendio invece no
function getWorkParams(k) {
  if (db[k] && db[k].workParams) return db[k].workParams;
  // Cerca il mese più recente con workParams impostati
  const [ky, km] = k.split('-').map(Number);
  const keys = Object.keys(db)
    .filter(x => {
      if (!db[x].workParams) return false;
      const [xy, xm] = x.split('-').map(Number);
      return xy < ky || (xy === ky && xm < km);
    })
    .sort((a,b) => {
      const [ay,am] = a.split('-').map(Number);
      const [by,bm] = b.split('-').map(Number);
      return (by*12+bm) - (ay*12+am);
    });
  if (keys.length) return db[keys[0]].workParams;
  // Fallback a gSettings
  return { oreGiorno: gSettings.oreGiorno || 8, restDays: gSettings.restDays || [0,6], oreExtra: 0 };
}

// Ritorna lo stipendio incassato nel mese k
// IMPORTANTE: ritorna 0 se il mese non ha dati espliciti — no propagazione globale
function getSalaryForMonth(k) {
  if (db[k] && db[k].salary != null) return db[k].salary;
  // Compatibilità con vecchio campo settings (solo se quel mese aveva settings propri)
  if (db[k] && db[k].settings && db[k].settings.stip && !db[k].settings._fromGlobal) {
    return db[k].settings.stip;
  }
  return 0; // Mai propagare globalmente — ogni mese ha il suo stipendio
}

// Ore lavorate nel mese k (basate sui workParams di k)
function getOreForMonth(k) {
  const wp = getWorkParams(k);
  const [y, m] = k.split('-').map(Number);
  return calcOreMese(wp.oreGiorno, wp.restDays, y, m, wp.oreExtra || 0);
}

// PagaH per il mese k = stip_incassato_in_k / ore_lavorate_in_k-1
function getPagaHForMonth(k) {
  const stip = getSalaryForMonth(k);
  const prevK = prevKey(k);
  const orePrec = getOreForMonth(prevK);
  if (orePrec <= 0 || stip <= 0) return 0;
  return stip / orePrec;
}

// Compatibilità con il vecchio sistema
function getEffectiveSettings(k) {
  const stip  = getSalaryForMonth(k);
  const wp    = getWorkParams(k);
  const [y, m] = k.split('-').map(Number);
  const ore   = calcOreMese(wp.oreGiorno, wp.restDays, y, m, wp.oreExtra || 0);
  const pagaH = getPagaHForMonth(k);
  return { stip, oreGiorno: wp.oreGiorno, restDays: wp.restDays, ore, oreExtra: wp.oreExtra || 0, pagaH };
}

function getAvgSettings() {
  // Usa solo mesi con salary esplicito (non propagato)
  const keys = Object.keys(db).filter(k => db[k] && db[k].salary != null && db[k].salary > 0);
  if (!keys.length) {
    if (!gSettings.stip) return { stip:0, pagaH:0, oreGiorno:8, count:0 };
    return { stip: gSettings.stip, pagaH: gSettings.pagaH || 0, oreGiorno: gSettings.oreGiorno || 8, count: 0 };
  }
  const stips  = keys.map(k => getSalaryForMonth(k));
  const pagaHs = keys.map(k => getPagaHForMonth(k)).filter(p => p > 0);
  const oreGs  = keys.map(k => getWorkParams(k).oreGiorno || 8);
  return {
    stip:      stips.reduce((a,b) => a+b, 0) / stips.length,
    pagaH:     pagaHs.length ? pagaHs.reduce((a,b) => a+b, 0) / pagaHs.length : 0,
    oreGiorno: oreGs.reduce((a,b)  => a+b, 0) / oreGs.length,
    count:     keys.length
  };
}

function getMonthData(k) {
  const d   = db[k] || { settings: null, income: [], expenses: [], appliedRec: [] };
  const s   = getEffectiveSettings(k) || { stip:0, pagaH:0, ore:0 };
  const extraInc = d.income.reduce((a,b) => a + b.imp, 0);
  const uscite   = d.expenses.reduce((a,b) => a + b.imp, 0);
  const totInc   = s.stip + extraInc;
  return { stip: s.stip, extraInc, totInc, uscite, net: totInc - uscite, pagaH: s.pagaH, income: d.income, expenses: d.expenses };
}

// ─── MODAL ────────────────────────────────────────────────────────────────
function openModal() {
  buildCatGrid();
  document.getElementById('modal_amount').value = '';
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
  document.getElementById('typeBtnUsc').classList.toggle('active', type === 'usc');
  document.getElementById('typeBtnInc').classList.toggle('active', type === 'inc');
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = type === 'usc' ? 'Aggiungi Uscita' : 'Aggiungi Entrata';
  btn.className = `btn-primary modal-confirm-btn${type === 'inc' ? ' btn-green' : ''}`;
  selectedCat = type === 'usc' ? CATS_USC[0] : CATS_INC[0];
  buildCatGrid();
}
function buildCatGrid() {
  const cats = modalType === 'usc' ? CATS_USC : CATS_INC;
  document.getElementById('catGrid').innerHTML = cats.map(c => `
    <button class="cat-pill${c.id === selectedCat.id ? ' active' : ''}" style="--cat-color:${c.color}" onclick="selectModalCat('${c.id}')">
      <span class="cat-pill-emoji">${c.emoji}</span><span>${c.label}</span>
    </button>`).join('');
}
function selectModalCat(id) {
  selectedCat = (modalType === 'usc' ? CATS_USC : CATS_INC).find(c => c.id === id) || CATS_USC[0];
  buildCatGrid();
}
function confirmEntry() {
  const imp = parseFloat(document.getElementById('modal_amount').value);
  if (!imp || imp <= 0) { shakeEl('modal_amount'); return; }
  if (viewMode === 'year') { closeModal(); return; }

  // Usa la data corrente della vista per taggare la transazione
  const entryDate = viewMode === 'day'
    ? new Date(currentView.getFullYear(), currentView.getMonth(), currentView.getDate())
    : new Date();

  const k = monthKey(entryDate.getFullYear(), entryDate.getMonth());
  initMonthKey(k);
  const entry = {
    id:    Date.now(),
    ts:    entryDate.getTime(),  // timestamp preciso per ordinamento e filtraggio per giorno
    imp,
    cat:   selectedCat.label,
    emoji: selectedCat.emoji,
    color: selectedCat.color
  };
  if (modalType === 'usc') db[k].expenses.push(entry);
  else                     db[k].income.push(entry);
  save(); closeModal(); render();
}

// ─── IMPOSTAZIONI ─────────────────────────────────────────────────────────
function toggleOvertime() {
  const f = document.getElementById('overtimeField');
  const c = document.getElementById('overtimeChevron');
  const open = f.style.display !== 'none';
  f.style.display = open ? 'none' : 'block';
  c.textContent   = open ? '+' : '−';
}

function saveSettings() {
  if (viewMode === 'year') { alert("Passa alla vista mensile o giornaliera."); return; }
  const stip     = parseFloat(document.getElementById('set_stip').value)  || 0;
  const oreG     = parseFloat(document.getElementById('set_ore').value)   || 0;
  const oreExtra = parseFloat(document.getElementById('set_extra')?.value) || 0;
  const restDays = getSelectedRestDays('set_days');
  if (oreG <= 0) { shakeEl('settingsCard'); return; }

  const k = curMonthKey(); initMonthKey(k);

  // Salva i parametri di lavoro sul mese corrente (quando si lavora)
  db[k].workParams = { oreGiorno: oreG, restDays, oreExtra };

  // Lo stipendio appartiene al mese corrente (è il pagamento per il lavoro del mese precedente)
  // Salvalo solo se è stato inserito
  if (stip > 0) {
    db[k].salary = stip;
  }

  // Aggiorna gSettings come fallback globale
  gSettings = { stip: stip || gSettings.stip, oreGiorno: oreG, restDays, pagaH: getPagaHForMonth(k) };
  localStorage.setItem('pt_settings', JSON.stringify(gSettings));

  // Mantieni compatibilità con vecchio campo settings
  db[k].settings = {
    stip: getSalaryForMonth(k),
    oreGiorno: oreG, restDays, ore: getOreForMonth(k),
    oreExtra, pagaH: getPagaHForMonth(k)
  };

  save(); liveCalcPreview(); render(); renderAvgBox();
}

// ─── RECURRING ────────────────────────────────────────────────────────────
function saveRecurring() {
  const imp  = parseFloat(document.getElementById('rec_imp').value) || 0;
  const nota = document.getElementById('rec_nota').value.trim();
  if (imp <= 0) return;
  recurring.push({ id: Date.now(), nome: nota || currentRecCat.label, imp, cat: currentRecCat.label, emoji: currentRecCat.emoji });
  localStorage.setItem('pt_recurring', JSON.stringify(recurring));
  document.getElementById('rec_imp').value  = '';
  document.getElementById('rec_nota').value = '';
  renderRecurringList(); render();
}
function deleteRecurring(id) {
  recurring = recurring.filter(r => r.id !== id);
  localStorage.setItem('pt_recurring', JSON.stringify(recurring));
  renderRecurringList(); render();
}
function applyRecurring() {
  if (viewMode === 'year') return;
  const k = curMonthKey(); initMonthKey(k);
  let added = 0;
  recurring.forEach(r => {
    if (!db[k].appliedRec.includes(r.id)) {
      db[k].expenses.push({ id: Date.now() + Math.random(), ts: Date.now(), imp: r.imp, cat: r.cat, emoji: r.emoji || '📌', color: '#8E8E93', isRec: true, nome: r.nome });
      db[k].appliedRec.push(r.id);
      added++;
    }
  });
  if (!added) return;
  save(); render();
}
function renderRecurringList() {
  const el = document.getElementById('recurringList');
  if (!el) return;
  if (!recurring.length) { el.innerHTML = '<div class="empty-state" style="padding:8px 0;">Nessuna spesa fissa</div>'; return; }
  const tot = recurring.reduce((a,r) => a + r.imp, 0);
  el.innerHTML = recurring.map(r => `
    <div class="rec-row">
      <span class="rec-emoji">${r.emoji || '📌'}</span>
      <span class="rec-name">${r.nome}</span>
      <span class="rec-amt">€${r.imp.toFixed(0)}</span>
      <button class="del-btn-sm" onclick="deleteRecurring(${r.id})">✕</button>
    </div>`).join('') +
    `<div class="rec-total">Totale fisso €${tot.toFixed(0)}/mese</div>`;
}

// ─── ANALISI ──────────────────────────────────────────────────────────────
function renderAvgBox() {
  const el = document.getElementById('avgInfoBox'); if (!el) return;
  const avg = getAvgSettings();
  const hasData = avg.count > 0 || gSettings.stip > 0;
  if (hasData) {
    const pagaH = avg.pagaH || gSettings.pagaH || 0;
    const stip  = avg.stip  || gSettings.stip  || 0;
    const oreG  = avg.oreGiorno || gSettings.oreGiorno || 8;
    const base  = avg.count > 0 ? `media ${avg.count} ${avg.count===1?'mese':'mesi'}` : 'dati attuali';
    el.innerHTML = `📊 <strong>${base}</strong> — Stipendio <strong>€${stip.toFixed(0)}</strong> · <strong>€${pagaH.toFixed(2)}/h</strong> · <strong>${oreG}h/giorno</strong>`;
    el.style.display = 'block';
  } else {
    el.innerHTML = '⚠️ Nessuno stipendio impostato. Vai su Impostazioni per configurarlo.';
    el.style.display = 'block';
  }
}

function validaAcquisto() {
  const prezzo = parseFloat(document.getElementById('det_prezzo').value);
  const out = document.getElementById('detOut');
  if (!prezzo || prezzo <= 0) { shakeEl('det_prezzo'); return; }
  const avg = getAvgSettings();
  if (!avg.pagaH) { out.style.display='block'; out.innerHTML='Configura prima i parametri mensili.'; return; }
  const ore  = prezzo / avg.pagaH;
  const perc = (prezzo / avg.stip * 100).toFixed(1);
  const giorni = (ore / (avg.oreGiorno || 8)).toFixed(1);
  out.style.display = 'block';
  out.innerHTML = `<strong>${ore.toFixed(1)} ore</strong> di lavoro (${giorni} giornate)<br><span style="font-size:13px;opacity:0.8;">${perc}% del tuo stipendio medio mensile</span>`;
}

function calcolaSostenibilita() {
  const target = parseFloat(document.getElementById('obj_target').value);
  const anni   = parseFloat(document.getElementById('obj_anni').value);
  const out = document.getElementById('objOut');
  if (!target || !anni) return;
  const mensile = target / (anni * 12);
  const avg = getAvgSettings();
  let extra = '';
  if (avg.stip > 0) {
    const perc = (mensile / avg.stip * 100).toFixed(1);
    extra = `<br><span style="font-size:13px;opacity:0.75;">${perc}% del tuo stipendio medio</span>`;
  }
  out.style.display = 'block';
  out.innerHTML = `<strong>€${mensile.toFixed(0)}/mese</strong> per ${anni} ${anni===1?'anno':'anni'}${extra}`;
}

// ─── STORICO ──────────────────────────────────────────────────────────────
function renderHistoryChart() {
  const el  = document.getElementById('historyChart');
  const leg = document.getElementById('historyLegend');
  if (!el) return;
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = monthKey(d.getFullYear(), d.getMonth());
    const m = getMonthData(k);
    const hasData = m.totInc > 0 || m.uscite > 0;
    months.push({ label: MONTH_NAMES[d.getMonth()], net: hasData ? m.net : null, uscite: hasData ? m.uscite : null });
  }
  const valid = months.filter(m => m.net !== null);
  if (!valid.length) {
    el.innerHTML = '<div class="empty-state">I dati appariranno man mano che aggiungi mesi.</div>';
    if (leg) leg.innerHTML = ''; return;
  }
  const allVals = valid.flatMap(m => [Math.abs(m.net), m.uscite]).filter(v => v > 0);
  const maxV = Math.max(...allVals) * 1.2 || 1;
  const W=300, H=120, bPad=20, tPad=6, cH=H-bPad-tPad;
  const gW=W/12, bW=Math.floor(gW*0.3), gap=2;
  let svg = `<line x1="0" y1="${H-bPad}" x2="${W}" y2="${H-bPad}" stroke="var(--border)" stroke-width="1"/>`;
  months.forEach((m, i) => {
    const cx = gW*i + gW/2;
    svg += `<text x="${cx}" y="${H-5}" text-anchor="middle" fill="var(--sub)" font-size="7" font-family="-apple-system,sans-serif" opacity="${m.net!==null?1:0.3}">${m.label}</text>`;
    if (m.net === null) return;
    const uH = Math.max(2, m.uscite/maxV*cH), nH = Math.max(2, Math.abs(m.net)/maxV*cH);
    const nC = m.net >= 0 ? '#32D74B' : '#FF453A', base = H-bPad;
    svg += `<rect x="${(cx-bW-gap/2).toFixed(1)}" y="${(base-uH).toFixed(1)}" width="${bW}" height="${uH.toFixed(1)}" rx="2" fill="#0A84FF" opacity="0.7"/>`;
    svg += `<rect x="${(cx+gap/2).toFixed(1)}" y="${(base-nH).toFixed(1)}" width="${bW}" height="${nH.toFixed(1)}" rx="2" fill="${nC}" opacity="0.85"/>`;
  });
  el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible;">${svg}</svg>`;
  if (leg) leg.innerHTML = `<div class="chart-legend">
    <div class="legend-item"><div class="legend-dot" style="background:#0A84FF"></div><span>Uscite</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:#32D74B"></div><span>Flusso +</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:#FF453A"></div><span>Flusso −</span></div>
  </div>`;
}

// ─── PIE ──────────────────────────────────────────────────────────────────
function renderPie(expenses) {
  const section = document.getElementById('pieSection');
  const svgEl   = document.getElementById('pieChart');
  const legend  = document.getElementById('pieLegend');
  if (!section || !expenses.length) { if(section) section.style.display='none'; return; }
  const totals = {};
  expenses.forEach(e => {
    if (!totals[e.cat]) totals[e.cat] = { val:0, color: e.color };
    totals[e.cat].val += e.imp;
  });
  const total = Object.values(totals).reduce((a,b) => a+b.val, 0);
  const entries = Object.entries(totals).sort((a,b) => b[1].val-a[1].val);
  const cx=60, cy=60, r=52, ir=26;
  let angle = -Math.PI/2, slices = '';
  entries.forEach(([cat, {val,color}]) => {
    const a = val/total*Math.PI*2; if (a < 0.01) return;
    const ea = angle+a;
    slices += `<path d="M${cx},${cy} L${(cx+r*Math.cos(angle)).toFixed(1)},${(cy+r*Math.sin(angle)).toFixed(1)} A${r},${r} 0 ${a>Math.PI?1:0},1 ${(cx+r*Math.cos(ea)).toFixed(1)},${(cy+r*Math.sin(ea)).toFixed(1)} Z" fill="${color}" opacity="0.9"/>`;
    angle = ea;
  });
  slices += `<circle cx="${cx}" cy="${cy}" r="${ir}" fill="var(--card-bg)"/>`;
  slices += `<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="var(--text)" font-size="9" font-weight="700" font-family="-apple-system,sans-serif">€${total.toFixed(0)}</text>`;
  svgEl.innerHTML = slices;
  legend.innerHTML = entries.map(([cat,{val,color}]) =>
    `<div class="pie-leg-row"><span class="pie-dot" style="background:${color}"></span><span class="pie-cat">${cat}</span><span class="pie-pct">${(val/total*100).toFixed(0)}%</span></div>`
  ).join('');
  section.style.display = 'block';
}

// ─── EXPORT / IMPORT ──────────────────────────────────────────────────────
function exportBackup() {
  const a = Object.assign(document.createElement('a'), {
    href: "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem('pt_db')),
    download: `ProfitTrack_${new Date().toISOString().slice(0,10)}.json`
  });
  document.body.appendChild(a); a.click(); a.remove();
}
function exportCSV() {
  let csv = "Anno-Mese,Data,Tipo,Categoria,Importo\n";
  Object.keys(db).forEach(k => {
    db[k].income.forEach(i => {
      const d = i.ts ? new Date(i.ts).toLocaleDateString('it-IT') : k;
      csv += `${k},${d},Entrata,"${i.cat}",${i.imp}\n`;
    });
    db[k].expenses.forEach(e => {
      const d = e.ts ? new Date(e.ts).toLocaleDateString('it-IT') : k;
      csv += `${k},${d},Uscita,"${e.cat}",${e.imp}\n`;
    });
  });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})),
    download: 'ProfitTrack.csv'
  });
  document.body.appendChild(a); a.click(); a.remove();
}
function importBackup(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imp = JSON.parse(e.target.result);
      Object.keys(imp).forEach(k => { if (!db[k]) db[k] = imp[k]; });
      save(); render(); renderHistoryChart();
      alert(`✅ Importati ${Object.keys(imp).length} mesi.`);
    } catch { alert('❌ File non valido.'); }
  };
  reader.readAsText(file); event.target.value = '';
}
function resetData() {
  if (confirm("Cancellare tutto permanentemente?")) { localStorage.clear(); location.reload(); }
}

// ─── ELIMINA ──────────────────────────────────────────────────────────────
function deleteItem(id, type, k) {
  if (type === 'inc') db[k].income   = db[k].income.filter(i => i.id !== id);
  else                db[k].expenses = db[k].expenses.filter(i => i.id !== id);
  save(); render();
}

// ─── SWIPE ────────────────────────────────────────────────────────────────
let swipeData = {};
function swipeStart(e, id) { swipeData[id] = { startX: e.touches[0].clientX, dx: 0 }; }
function swipeMove(e, id) {
  if (!swipeData[id]) return;
  const dx = e.touches[0].clientX - swipeData[id].startX;
  swipeData[id].dx = dx;
  if (dx >= 0) return;
  const travel = Math.min(Math.abs(dx), 80);
  const inner = document.getElementById('inner_'+id);
  const bg    = document.getElementById('delbg_'+id);
  if (inner) inner.style.transform = `translateX(-${travel}px)`;
  if (bg)    bg.style.transform    = `translateX(${100-(travel/80)*100}%)`;
}
function swipeEnd(e, id, type, k) {
  if (!swipeData[id]) return;
  const dx = swipeData[id].dx;
  if (dx < -60) {
    const wrap = document.getElementById('wrap_'+id);
    if (wrap) { wrap.style.opacity='0'; wrap.style.transition='opacity .2s'; }
    setTimeout(() => deleteItem(id, type, k), 200);
  } else {
    const inner = document.getElementById('inner_'+id);
    const bg    = document.getElementById('delbg_'+id);
    if (inner) inner.style.transform = '';
    if (bg)    bg.style.transform    = '';
  }
  delete swipeData[id];
}

// ─── UTILS ────────────────────────────────────────────────────────────────
function shakeEl(id) {
  const el = document.getElementById(id); if (!el) return;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}
function fmt(n) { return Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function formatTxDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Oggi';
  if (d.toDateString() === yesterday.toDateString()) return 'Ieri';
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

// Raggruppa per data per la lista movimenti
function groupByDate(items) {
  const groups = {};
  items.forEach(item => {
    const ts = item.ts || item.id;
    const d = new Date(ts);
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!groups[dateKey]) groups[dateKey] = { label: formatTxDate(ts), items: [], ts };
    groups[dateKey].items.push(item);
  });
  return Object.values(groups).sort((a,b) => b.ts - a.ts);
}

function renderRow(item, type, k) {
  const id = item.id;
  return `<div class="tx-swipe-wrap" id="wrap_${id}">
    <div class="tx-delete-bg" id="delbg_${id}">Elimina</div>
    <div class="tx-row-inner"
      ontouchstart="swipeStart(event,${id})"
      ontouchmove="swipeMove(event,${id})"
      ontouchend="swipeEnd(event,${id},'${type}','${k}')"
      id="inner_${id}">
      <div class="tx-emoji" style="background:${item.color||'#8e8e93'}22;">${item.emoji||'💸'}</div>
      <div class="tx-info">
        <span class="tx-cat">${item.nome || item.cat}</span>
        <span class="tx-sub">${item.cat}</span>
      </div>
      <div class="tx-right">
        <span class="tx-amt" style="color:${type==='usc'?'var(--red)':'var(--green)'}">
          ${type==='usc'?'−':'+'} €${item.imp.toFixed(0)}
        </span>
      </div>
    </div>
  </div>`;
}

function renderGroupedList(income, expenses, k) {
  const all = [
    ...income.map(i   => ({...i, _type:'inc'})),
    ...expenses.map(e => ({...e, _type:'usc'}))
  ].sort((a,b) => (b.ts||b.id) - (a.ts||a.id));
  const groups = groupByDate(all);
  if (!groups.length) return '<div class="empty-state">Nessun movimento</div>';
  return groups.map(g => `
    <div class="date-separator">${g.label}</div>
    ${g.items.map(item => renderRow(item, item._type, k)).join('')}
  `).join('');
}



// ─── RECURRING CATEGORY SHEET ─────────────────────────────────────────────
function openRecCatSheet() {
  const backdrop = document.getElementById('recCatBackdrop');
  const sheet    = document.getElementById('recCatSheet');
  if (!backdrop || !sheet) return;
  backdrop.classList.add('active');
  sheet.classList.add('active');
}
function closeRecCatSheet() {
  const backdrop = document.getElementById('recCatBackdrop');
  const sheet    = document.getElementById('recCatSheet');
  if (!backdrop || !sheet) return;
  backdrop.classList.remove('active');
  sheet.classList.remove('active');
}
function selectRecCat(label, emoji) {
  currentRecCat = { label, emoji };
  document.getElementById('rec_label').textContent = label;
  document.getElementById('rec_emoji').textContent = emoji;
  closeRecCatSheet();
}

// ─── CALENDARIO GIORNALIERO ───────────────────────────────────────────────
let calendarOpen = false;

function toggleCalendar() {
  calendarOpen = !calendarOpen;
  const cal      = document.getElementById('dayCalendar');
  const backdrop = document.getElementById('calBackdrop');
  if (calendarOpen) {
    buildCalendar();
    cal.style.display      = 'block';
    backdrop.style.display = 'block';
    // Force reflow then animate
    cal.getBoundingClientRect();
    cal.style.opacity    = '1';
    cal.style.transform  = 'translateX(-50%) translateY(0)';
  } else {
    cal.style.opacity   = '0';
    cal.style.transform = 'translateX(-50%) translateY(-8px)';
    backdrop.style.display = 'none';
    setTimeout(() => { cal.style.display = 'none'; }, 200);
  }
}

function closeCalendar() {
  calendarOpen = false;
  const cal      = document.getElementById('dayCalendar');
  const backdrop = document.getElementById('calBackdrop');
  if (cal) {
    cal.style.opacity   = '0';
    cal.style.transform = 'translateX(-50%) translateY(-8px)';
    setTimeout(() => { cal.style.display = 'none'; }, 200);
  }
  if (backdrop) backdrop.style.display = 'none';
}

function buildCalendar() {
  const y = currentView.getFullYear(), m = currentView.getMonth();
  const today = new Date();
  const firstDay = new Date(y, m, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const restDays = gSettings.restDays || [0,6];

  let html = `<div class="cal-nav">
    <button onclick="calShiftMonth(-1)">‹</button>
    <span>${MONTH_FULL[m]} ${y}</span>
    <button onclick="calShiftMonth(1)">›</button>
  </div>`;
  html += '<div class="cal-grid">';
  // Headers Dom-Sab
  ['D','L','M','M','G','V','S'].forEach(d => {
    html += `<div class="cal-head">${d}</div>`;
  });
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell"></div>';
  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const wd = date.getDay();
    const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
    const isCurr  = y === currentView.getFullYear() && m === currentView.getMonth() && d === currentView.getDate();
    const isRest  = restDays.includes(wd);
    const k = monthKey(y, m);
    const hasData = db[k] && (
      (db[k].expenses||[]).some(e => new Date(e.ts||e.id).getDate() === d && new Date(e.ts||e.id).getMonth() === m) ||
      (db[k].income  ||[]).some(i => new Date(i.ts||i.id).getDate() === d && new Date(i.ts||i.id).getMonth() === m)
    );
    const cls = [
      'cal-cell cal-day',
      isRest  ? 'cal-rest'    : '',
      isToday ? 'cal-today'   : '',
      isCurr  ? 'cal-current' : '',
      hasData ? 'cal-has-data': '',
    ].join(' ').trim();
    html += `<div class="${cls}" onclick="selectCalDay(${d})">${d}${hasData && !isCurr ? '<span class="cal-dot"></span>' : ''}</div>`;
  }
  html += '</div>';
  document.getElementById('dayCalendar').innerHTML = html;
}

function calShiftMonth(dir) {
  currentView.setDate(1);
  currentView.setMonth(currentView.getMonth() + dir);
  buildCalendar();
}

function selectCalDay(d) {
  currentView.setDate(d);
  closeCalendar();
  render();
}

// ─── RENDER PRINCIPALE ────────────────────────────────────────────────────
function render() {
  let dateStr = '', totInc = 0, totUsc = 0, net = 0, pagaH = 0;
  let allIncome = [], allExpenses = [], currentK = '';

  // ════ VISTA GIORNO ════
  if (viewMode === 'day') {
    const y = currentView.getFullYear(), m = currentView.getMonth(), d = currentView.getDate();
    const wd = currentView.getDay();
    const dayNow = new Date();
    const isToday = y === dayNow.getFullYear() && m === dayNow.getMonth() && d === dayNow.getDate();

    dateStr = isToday ? `Oggi, ${d} ${MONTH_NAMES[m]}` : `${DAY_FULL[wd]} ${d} ${MONTH_NAMES[m]} ${y}`;
    currentK = monthKey(y, m);
    initMonthKey(currentK);
    const data = db[currentK];
    const s    = getEffectiveSettings(currentK);
    pagaH = getPagaHForMonth(currentK);

    // Filtra per giorno
    const tsStart = new Date(y, m, d, 0, 0, 0).getTime();
    const tsEnd   = new Date(y, m, d, 23, 59, 59).getTime();
    allIncome   = (data.income  || []).filter(i => { const ts = i.ts||i.id; return ts >= tsStart && ts <= tsEnd; }).map(i => ({...i, monthKey:currentK}));
    allExpenses = (data.expenses|| []).filter(e => { const ts = e.ts||e.id; return ts >= tsStart && ts <= tsEnd; }).map(e => ({...e, monthKey:currentK}));
    totInc = allIncome.reduce((a,b)   => a+b.imp, 0);
    totUsc = allExpenses.reduce((a,b) => a+b.imp, 0);
    net    = totInc - totUsc;

    // Indica se è giorno lavorativo
    const rs = s ? (s.restDays || gSettings.restDays || [0,6]) : (gSettings.restDays || [0,6]);
    const isWork = isWorkDay(currentView, rs);
    const dayCard = document.getElementById('dayWorkedCard');
    const dayText = document.getElementById('dayWorkedText');
    if (dayCard) {
      dayCard.style.display = 'block';
      if (isWork && pagaH > 0) {
        const oreG = s ? (s.oreGiorno || gSettings.oreGiorno || 8) : (gSettings.oreGiorno || 8);
        const guadagnatoOggi = oreG * pagaH;
        dayCard.className = 'day-worked-card day-work';
        dayText.textContent = `💼 Giorno lavorativo · Hai guadagnato €${guadagnatoOggi.toFixed(0)} oggi`;
      } else {
        dayCard.className = 'day-worked-card day-rest';
        dayText.textContent = '😴 Giorno di riposo';
      }
    }

  // ════ VISTA MESE ════
  } else if (viewMode === 'month') {
    currentK = curMonthKey(); initMonthKey(currentK);
    const data = db[currentK];
    const s    = getEffectiveSettings(currentK);
    dateStr    = `${MONTH_FULL[currentView.getMonth()]} ${currentView.getFullYear()}`;
    // Stipendio = quello incassato in questo mese (pagato per il lavoro del mese precedente)
    const salary = getSalaryForMonth(currentK);
    // PagaH = stipendio di questo mese / ore del mese precedente
    pagaH = getPagaHForMonth(currentK);
    const wp = getWorkParams(currentK);
    totInc = salary + (data.income||[]).reduce((a,b) => a+b.imp, 0);

    // Popola i campi impostazioni
    const setStip = document.getElementById('set_stip');
    const setOre  = document.getElementById('set_ore');
    if (setStip) setStip.value = salary > 0 ? salary : '';
    if (setOre)  setOre.value  = wp.oreGiorno || '';
    if (wp.oreExtra > 0) {
      const extF = document.getElementById('set_extra');
      if (extF) extF.value = wp.oreExtra;
      document.getElementById('overtimeField').style.display = 'block';
      document.getElementById('overtimeChevron').textContent = '−';
    }
    liveCalcPreview();
    totUsc = (data.expenses||[]).reduce((a,b) => a+b.imp, 0);
    net    = totInc - totUsc;
    allIncome   = (data.income  ||[]).map(i => ({...i, monthKey:currentK}));
    allExpenses = (data.expenses||[]).map(e => ({...e, monthKey:currentK}));

    // Nascondi dayWorkedCard
    const dw = document.getElementById('dayWorkedCard');
    if (dw) dw.style.display = 'none';

    // Settings label
    const sl = document.getElementById('settingsMonthLabel');
    if (sl) sl.textContent = `${MONTH_NAMES[currentView.getMonth()]} ${currentView.getFullYear()}`;

    // Salary info row — spiega il modello sfasato
    const sir = document.getElementById('salaryInfoRow');
    if (sir) {
      const prevM = currentView.getMonth() === 0 ? 11 : currentView.getMonth() - 1;
      const prevYr = currentView.getMonth() === 0 ? currentView.getFullYear()-1 : currentView.getFullYear();
      sir.innerHTML = `📅 Lo stipendio inserito qui è il pagamento per il lavoro di <strong>${MONTH_NAMES[prevM]} ${prevYr}</strong>. Il valore ora (€/h) si calcola automaticamente su quel mese.`;
      sir.style.display = 'block';
    }

    // Recurring banner
    const banner = document.getElementById('recurringApplyBanner');
    if (banner && recurring.length) {
      const notApplied = recurring.filter(r => !(data.appliedRec||[]).includes(r.id));
      if (notApplied.length) {
        document.getElementById('recurringApplyText').textContent = `${notApplied.length} spese fisse non applicate`;
        banner.style.display = 'flex';
      } else banner.style.display = 'none';
    } else if (banner) banner.style.display = 'none';

  // ════ VISTA ANNO ════
  } else {
    const year = currentView.getFullYear().toString();
    dateStr = `Anno ${year}`;
    const dw = document.getElementById('dayWorkedCard');
    if (dw) dw.style.display = 'none';
    Object.keys(db).forEach(k => {
      if (!k.startsWith(year)) return;
      const d = db[k];
      const salary = getSalaryForMonth(k); // Solo salary esplicito, no propagazione
      totInc += salary + (d.income||[]).reduce((a,b) => a+b.imp, 0);
      totUsc += (d.expenses||[]).reduce((a,b) => a+b.imp, 0);
      (d.income  ||[]).forEach(i => allIncome.push({...i,  monthKey:k}));
      (d.expenses||[]).forEach(e => allExpenses.push({...e, monthKey:k}));
    });
    net = totInc - totUsc;
  }

  // ── Header
  document.getElementById('dateLabel').textContent = dateStr;
  const vb = document.getElementById('viewBadge');
  if (viewMode === 'day') {
    vb.textContent = 'GIORNO';
  } else if (viewMode === 'year') {
    vb.textContent = 'ANNO';
  } else {
    vb.textContent = 'MESE';
  }
  // Mostra il pulsante calendario solo in vista giorno
  const calBtn = document.getElementById('calOpenBtn');
  if (calBtn) calBtn.style.display = viewMode === 'day' ? 'flex' : 'none';

  // ── Hero
  document.getElementById('heroAmount').textContent = `${net < 0 ? '−' : ''}€${fmt(net)}`;
  document.getElementById('heroAmount').style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('heroLabel').textContent  = viewMode === 'day' ? 'Saldo del Giorno' : 'Flusso Netto';

  const heroSub = document.getElementById('heroSub');
  if (pagaH > 0 && viewMode !== 'year') {
    heroSub.textContent = `€${pagaH.toFixed(2)} / ora`;
    heroSub.style.display = 'block';
  } else heroSub.style.display = 'none';

  // Trend vs mese precedente (solo vista mese)
  const heroTrend = document.getElementById('heroTrend');
  if (heroTrend && viewMode === 'month') {
    const prevK2 = prevKey(currentK || curMonthKey());
    const prevData = getMonthData(prevK2);
    if (prevData.totInc > 0 || prevData.uscite > 0) {
      const diff = net - prevData.net;
      const arrow = diff >= 0 ? '↑' : '↓';
      const color = diff >= 0 ? 'var(--green)' : 'var(--red)';
      heroTrend.innerHTML = `<span style="color:${color}">${arrow} €${fmt(Math.abs(diff))}</span> <span style="opacity:.6;font-size:11px;">vs ${MONTH_NAMES[new Date(prevK2.split('-')[0], prevK2.split('-')[1]).getMonth()]}</span>`;
      heroTrend.style.display = 'block';
    } else {
      heroTrend.style.display = 'none';
    }
  } else if (heroTrend) heroTrend.style.display = 'none';

  let perc = totInc > 0 ? Math.min(100, totUsc/totInc*100) : 0;
  document.getElementById('heroBar').style.width      = perc + '%';
  document.getElementById('heroBar').style.background = perc > 80 ? 'var(--red)' : perc > 50 ? 'var(--orange)' : 'var(--green)';
  document.getElementById('heroBarLabel').textContent  = `${perc.toFixed(0)}% speso`;

  // ── Stats chips
  document.getElementById('statIn').textContent  = `€${fmt(totInc)}`;
  document.getElementById('statOut').textContent = `€${fmt(totUsc)}`;
  const chipOra = document.getElementById('chipOra');
  if (pagaH > 0 && viewMode !== 'year') {
    document.getElementById('statOra').textContent   = `€${pagaH.toFixed(2)}`;
    document.getElementById('statOraLab').textContent = 'Tua Ora';
    chipOra.style.display = 'flex';
  } else chipOra.style.display = 'none';

  // ── Recent list (home)
  const recent = [...allExpenses.map(e=>({...e,_type:'usc'})), ...allIncome.map(i=>({...i,_type:'inc'}))]
    .sort((a,b) => (b.ts||b.id)-(a.ts||a.id)).slice(0,6);
  const recentTitle = document.getElementById('recentTitle');
  if (recentTitle) recentTitle.textContent = viewMode === 'day' ? 'Movimenti del giorno' : 'Recenti';
  const rl = document.getElementById('recentList');
  if (rl) {
    rl.innerHTML = recent.length
      ? recent.map(e => renderRow(e, e._type, e.monthKey)).join('')
      : '<div class="empty-state">Ancora nessun movimento.<br>Premi + per aggiungerne uno.</div>';
  }

  // ── Movimenti page
  if (document.getElementById('page-movimenti').classList.contains('active')) {
    const mKey = currentK || curMonthKey();
    // Raggruppa per data
    const incHtml = allIncome.length
      ? groupByDate(allIncome.map(i=>({...i,_type:'inc'}))).map(g =>
          `<div class="date-separator">${g.label}</div>${g.items.map(i=>renderRow(i,'inc',mKey)).join('')}`
        ).join('')
      : '<div class="empty-state">Nessuna entrata</div>';
    const uscHtml = allExpenses.length
      ? groupByDate(allExpenses.map(e=>({...e,_type:'usc'}))).map(g =>
          `<div class="date-separator">${g.label}</div>${g.items.map(e=>renderRow(e,'usc',mKey)).join('')}`
        ).join('')
      : '<div class="empty-state">Nessuna uscita</div>';
    document.getElementById('incomeList').innerHTML  = incHtml;
    document.getElementById('expenseList').innerHTML = uscHtml;
    const mil = document.getElementById('movIncLabel');
    const mol = document.getElementById('movOutLabel');
    if (mil) mil.textContent = `€${fmt(totInc)}`;
    if (mol) mol.textContent = `€${fmt(totUsc)}`;
    renderPie(allExpenses);
  }

  // ── Analisi page
  if (document.getElementById('page-analisi')?.classList.contains('active')) {
    renderHistoryChart(); renderAvgBox();
  }

  // ── Spend Today (mese e giorno)
  const stCard = document.getElementById('spendTodayCard');
  if (stCard) {
    if (viewMode === 'month' && net > 0) {
      const today = new Date();
      const isSameMonth = today.getMonth() === currentView.getMonth() && today.getFullYear() === currentView.getFullYear();
      if (isSameMonth) {
        const daysLeft = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate() - today.getDate() + 1;
        stCard.style.display = 'block';
        document.getElementById('spendTodayLabel').textContent = '💡 Puoi ancora spendere oggi';
        document.getElementById('spendTodayAmt').textContent   = `€${(net/daysLeft).toFixed(0)}`;
        document.getElementById('spendTodaySub').textContent   = `Flusso netto €${fmt(net)} · ${daysLeft} giorni rimasti`;
      } else stCard.style.display = 'none';
    } else stCard.style.display = 'none';
  }

  // ── Positive feedback
  const pb = document.getElementById('positiveBanner');
  if (pb) {
    const savingPerc = totInc > 0 ? (net/totInc)*100 : 0;
    if (savingPerc >= 20 && viewMode !== 'day') {
      const msgs = [
        `🎉 Ottimo! Stai risparmiando il ${savingPerc.toFixed(0)}% delle entrate.`,
        `💪 Ogni euro risparmiato è un passo verso la libertà finanziaria.`,
        `✨ Sei in positivo del ${savingPerc.toFixed(0)}%. Continua così!`,
      ];
      pb.style.display = 'block';
      pb.textContent   = msgs[new Date().getDate() % msgs.length];
    } else pb.style.display = 'none';
  }

  // ── Badge Impostazioni
  const badge = document.getElementById('settingsBadge');
  if (badge && viewMode === 'month') {
    const k = curMonthKey(); initMonthKey(k);
    const n = recurring.filter(r => !(db[k].appliedRec||[]).includes(r.id)).length;
    badge.style.display = n ? 'block' : 'none';
    badge.textContent   = n || '';
  }
}
