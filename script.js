// ─── COSTANTI ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"];
const MONTH_FULL  = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

const CATS_USC = [
  { id:'cibo',       label:'Cibo',        emoji:'🛒', color:'#FF9F0A' },
  { id:'casa',       label:'Casa',        emoji:'🏠', color:'#0A84FF' },
  { id:'trasporti',  label:'Trasporti',   emoji:'🚗', color:'#30D158' },
  { id:'svago',      label:'Svago',       emoji:'🎬', color:'#BF5AF2' },
  { id:'salute',     label:'Salute',      emoji:'❤️', color:'#FF453A' },
  { id:'abbonamenti',label:'Abbonamenti', emoji:'📦', color:'#64D2FF' },
  { id:'altro',      label:'Altro',       emoji:'💸', color:'#8E8E93' },
];
const CATS_INC = [
  { id:'stipendio',   label:'Stipendio',   emoji:'💼', color:'#32D74B' },
  { id:'extra',       label:'Extra',       emoji:'💰', color:'#FFD60A' },
  { id:'investimenti',label:'Investimenti',emoji:'📈', color:'#30D158' },
  { id:'regalo',      label:'Regalo',      emoji:'🎁', color:'#FF6B6B' },
];

// ─── STATO ────────────────────────────────────────────────────────────────
let db          = JSON.parse(localStorage.getItem('pt_db')) || {};
let gSettings   = JSON.parse(localStorage.getItem('pt_settings')) || { stip:0, ore:0, pagaH:0 };
let recurring   = JSON.parse(localStorage.getItem('pt_recurring')) || [];
let currentView = new Date();
let viewMode    = 'month'; // 'month' | 'year'
let modalType   = 'usc';
let selectedCat = CATS_USC[0];
let currentRecCat = { label:'Casa', svg:'', emoji:'🏠' };

// ─── BOOT ─────────────────────────────────────────────────────────────────
window.onload = () => {
  const hasSettings = gSettings.stip > 0 && gSettings.ore > 0;
  if (!hasSettings) {
    document.getElementById('onboarding').style.display = 'flex';
  } else {
    document.getElementById('app').style.display = 'block';
    render();
    renderRecurringList();
    renderHistoryChart();
    renderAvgBox();
  }
};

function completeOnboarding() {
  const stip = parseFloat(document.getElementById('ob_stip').value) || 0;
  const ore  = parseFloat(document.getElementById('ob_ore').value)  || 0;
  if (stip <= 0 || ore <= 0) { shakeEl('onboarding'); return; }
  const pagaH = stip / Math.round(ore * 52 / 12);
  gSettings = { stip, ore, pagaH };
  localStorage.setItem('pt_settings', JSON.stringify(gSettings));
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  render();
  renderRecurringList();
  renderHistoryChart();
  renderAvgBox();
}

// ─── NAVIGAZIONE ──────────────────────────────────────────────────────────
function showPage(pageId, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  render();
  if (pageId === 'page-settings') { renderRecurringList(); }
  if (pageId === 'page-analisi')  { renderHistoryChart(); renderAvgBox(); }
}

function toggleViewMode() {
  viewMode = viewMode === 'month' ? 'year' : 'month';
  render();
}

function changeDate(dir) {
  currentView.setDate(1);
  if (viewMode === 'month') currentView.setMonth(currentView.getMonth() + dir);
  else currentView.setFullYear(currentView.getFullYear() + dir);
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
function selectRecCat(label, svg) {
  const emojiMap = {Casa:'🏠',Abbonamenti:'📦',Trasporti:'🚗',Salute:'❤️',Cibo:'🛒'};
  currentRecCat = { label, svg, emoji: emojiMap[label] || '💸' };
  document.getElementById('rec_label').textContent = label;
  document.getElementById('rec_icon').innerHTML = svg;
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
}

// ─── DATA HELPERS ─────────────────────────────────────────────────────────
function key(y, m) { return `${y}-${m}`; }
function curKey() { return key(currentView.getFullYear(), currentView.getMonth()); }
function initKey(k) {
  if (!db[k]) db[k] = { settings: null, income: [], expenses: [], appliedRec: [] };
  if (!db[k].appliedRec) db[k].appliedRec = [];
}
function save() { localStorage.setItem('pt_db', JSON.stringify(db)); }

function getAvgSettings() {
  const months = Object.values(db).filter(m => m.settings && m.settings.stip > 0);
  if (!months.length) return gSettings;
  return {
    stip:  months.reduce((a,m) => a + m.settings.stip,  0) / months.length,
    pagaH: months.reduce((a,m) => a + m.settings.pagaH, 0) / months.length,
    count: months.length
  };
}

function getMonthData(k) {
  const d = db[k] || { settings: null, income: [], expenses: [], appliedRec: [] };
  const settings  = d.settings || gSettings;
  const stip      = settings.stip || 0;
  const extraInc  = d.income.reduce((a,b) => a + b.imp, 0);
  const uscite    = d.expenses.reduce((a,b) => a + b.imp, 0);
  const totInc    = stip + extraInc;
  const net       = totInc - uscite;
  const pagaH     = settings.pagaH || 0;
  return { stip, extraInc, totInc, uscite, net, pagaH, income: d.income, expenses: d.expenses };
}

// ─── MODAL ────────────────────────────────────────────────────────────────
function openModal() {
  buildCatGrid();
  document.getElementById('modal_amount').value = '';
  document.getElementById('modalBackdrop').classList.add('active');
  document.getElementById('modalSheet').classList.add('active');
  setTimeout(() => document.getElementById('modal_amount').focus(), 350);
}
function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('active');
  document.getElementById('modalSheet').classList.remove('active');
}
function setModalType(type) {
  modalType = type;
  document.getElementById('typeBtnUsc').classList.toggle('active', type === 'usc');
  document.getElementById('typeBtnInc').classList.toggle('active', type === 'inc');
  document.getElementById('modalConfirmBtn').textContent = type === 'usc' ? 'Aggiungi Uscita' : 'Aggiungi Entrata';
  document.getElementById('modalConfirmBtn').className = `btn-primary modal-confirm-btn ${type === 'inc' ? 'btn-green' : ''}`;
  selectedCat = type === 'usc' ? CATS_USC[0] : CATS_INC[0];
  buildCatGrid();
}
function buildCatGrid() {
  const cats = modalType === 'usc' ? CATS_USC : CATS_INC;
  const grid = document.getElementById('catGrid');
  grid.innerHTML = cats.map(c => `
    <button class="cat-pill ${c.id === selectedCat.id ? 'active' : ''}"
      style="--cat-color:${c.color}"
      onclick="selectModalCat('${c.id}')">
      <span class="cat-pill-emoji">${c.emoji}</span>
      <span>${c.label}</span>
    </button>`).join('');
}
function selectModalCat(id) {
  const cats = modalType === 'usc' ? CATS_USC : CATS_INC;
  selectedCat = cats.find(c => c.id === id) || cats[0];
  buildCatGrid();
}
function confirmEntry() {
  const imp = parseFloat(document.getElementById('modal_amount').value);
  if (!imp || imp <= 0) { shakeEl('modal_amount'); return; }
  if (viewMode === 'year') { closeModal(); alert("Seleziona un mese specifico per aggiungere movimenti."); return; }
  const k = curKey();
  initKey(k);
  const entry = { id: Date.now(), imp, cat: selectedCat.label, emoji: selectedCat.emoji, color: selectedCat.color };
  if (modalType === 'usc') db[k].expenses.push(entry);
  else db[k].income.push(entry);
  save();
  closeModal();
  render();
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────
function toggleOvertime() {
  const f = document.getElementById('overtimeField');
  const c = document.getElementById('overtimeChevron');
  const open = f.style.display !== 'none';
  f.style.display = open ? 'none' : 'block';
  c.textContent = open ? '+' : '−';
}

function saveSettings() {
  if (viewMode === 'year') { alert("Passa alla vista mensile."); return; }
  const stip  = parseFloat(document.getElementById('set_stip').value) || 0;
  const oreSett = parseFloat(document.getElementById('set_ore').value) || 0;
  const oreExtra = parseFloat(document.getElementById('set_extra').value) || 0;
  if (stip <= 0 || oreSett <= 0) { shakeEl('settingsCard'); return; }
  const oreMese = Math.round(oreSett * 52 / 12 + oreExtra);
  const pagaH   = stip / oreMese;
  const k = curKey();
  initKey(k);
  db[k].settings = { stip, ore: oreMese, oreSett, oreExtra, pagaH };
  if (gSettings.stip === 0) { gSettings = { stip, ore: oreMese, pagaH }; localStorage.setItem('pt_settings', JSON.stringify(gSettings)); }
  save();
  updateCalcPreview(stip, oreMese, pagaH);
  render();
  renderAvgBox();
}

function updateCalcPreview(stip, ore, pagaH) {
  const el = document.getElementById('calcPreview');
  if (stip > 0 && ore > 0) {
    el.innerHTML = `≈ <strong>${ore}h</strong> mensili &nbsp;·&nbsp; <strong>€${pagaH.toFixed(2)}/h</strong>`;
    el.style.display = 'block';
  } else { el.style.display = 'none'; }
}

// ─── RECURRING ────────────────────────────────────────────────────────────
function saveRecurring() {
  const imp  = parseFloat(document.getElementById('rec_imp').value) || 0;
  const nota = document.getElementById('rec_nota').value.trim();
  if (imp <= 0) return;
  recurring.push({ id: Date.now(), nome: nota || currentRecCat.label, imp, cat: currentRecCat.label, emoji: currentRecCat.emoji });
  localStorage.setItem('pt_recurring', JSON.stringify(recurring));
  document.getElementById('rec_imp').value = '';
  document.getElementById('rec_nota').value = '';
  renderRecurringList();
  render();
}
function deleteRecurring(id) {
  recurring = recurring.filter(r => r.id !== id);
  localStorage.setItem('pt_recurring', JSON.stringify(recurring));
  renderRecurringList();
  render();
}
function applyRecurring() {
  if (viewMode === 'year') return;
  const k = curKey(); initKey(k);
  let added = 0;
  recurring.forEach(r => {
    if (!db[k].appliedRec.includes(r.id)) {
      db[k].expenses.push({ id: Date.now() + Math.random(), imp: r.imp, cat: r.cat, emoji: r.emoji || '📌', color: '#8E8E93', isRec: true, nome: r.nome });
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
  const el = document.getElementById('avgInfoBox');
  if (!el) return;
  const avg = getAvgSettings();
  if (avg.count > 0) {
    el.innerHTML = `📊 Basato sulla media di <strong>${avg.count} ${avg.count===1?'mese':'mesi'}</strong> — stipendio medio <strong>€${avg.stip.toFixed(0)}</strong> · <strong>€${avg.pagaH.toFixed(2)}/h</strong>`;
    el.style.display = 'block';
  } else if (gSettings.stip > 0) {
    el.innerHTML = `📊 Stipendio impostato: <strong>€${gSettings.stip.toFixed(0)}</strong> · <strong>€${gSettings.pagaH.toFixed(2)}/h</strong>`;
    el.style.display = 'block';
  } else {
    el.innerHTML = `⚠️ Nessuno stipendio impostato. Configura i parametri qui sopra.`;
    el.style.display = 'block';
  }
}

function validaAcquisto() {
  const prezzo = parseFloat(document.getElementById('det_prezzo').value);
  const out = document.getElementById('detOut');
  if (!prezzo || prezzo <= 0) { shakeEl('det_prezzo'); return; }
  const avg = getAvgSettings();
  if (!avg.pagaH) { out.style.display='block'; out.innerHTML='Configura prima i parametri mensili.'; return; }
  const ore = prezzo / avg.pagaH;
  const perc = (prezzo / avg.stip * 100).toFixed(1);
  out.style.display='block';
  out.innerHTML = `<strong>${ore.toFixed(1)} ore</strong> di lavoro<br><span style="font-size:13px;opacity:0.8;">${perc}% del tuo stipendio medio mensile</span>`;
}

function calcolaSostenibilita() {
  const target = parseFloat(document.getElementById('obj_target').value);
  const anni   = parseFloat(document.getElementById('obj_anni').value);
  const out = document.getElementById('objOut');
  if (!target || !anni) { return; }
  const mensile = target / (anni * 12);
  const avg = getAvgSettings();
  let perc = avg.stip > 0 ? ` — <span style="opacity:0.75;font-size:13px;">${(mensile/avg.stip*100).toFixed(1)}% del tuo stipendio medio</span>` : '';
  out.style.display='block';
  out.innerHTML = `<strong>€${mensile.toFixed(0)}/mese</strong> per ${anni} ${anni===1?'anno':'anni'}${perc}`;
}

// ─── STORICO ──────────────────────────────────────────────────────────────
function renderHistoryChart() {
  const el = document.getElementById('historyChart');
  const leg = document.getElementById('historyLegend');
  if (!el) return;

  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = key(d.getFullYear(), d.getMonth());
    const m = getMonthData(k);
    months.push({ label: MONTH_NAMES[d.getMonth()], net: m.totInc > 0 || m.uscite > 0 ? m.net : null, uscite: m.totInc > 0 || m.uscite > 0 ? m.uscite : null });
  }

  const valid = months.filter(m => m.net !== null);
  if (!valid.length) {
    el.innerHTML = '<div class="empty-state">I dati appariranno man mano che aggiungi mesi.</div>';
    if (leg) leg.innerHTML = '';
    return;
  }

  const allVals = valid.flatMap(m => [Math.abs(m.net), m.uscite]).filter(v => v > 0);
  const maxV = Math.max(...allVals) * 1.2 || 1;
  const W = 300, H = 120, bPad = 20, tPad = 6, cH = H - bPad - tPad;
  const gW = W / 12, bW = Math.floor(gW * 0.3), gap = 2;
  let svg = '';

  svg += `<line x1="0" y1="${H-bPad}" x2="${W}" y2="${H-bPad}" stroke="var(--border)" stroke-width="1"/>`;
  months.forEach((m, i) => {
    const cx = gW * i + gW / 2;
    svg += `<text x="${cx}" y="${H-5}" text-anchor="middle" fill="var(--sub)" font-size="7" font-family="-apple-system,sans-serif" opacity="${m.net!==null?1:0.3}">${m.label}</text>`;
    if (m.net === null) return;
    const uH = Math.max(2, m.uscite / maxV * cH);
    const nH = Math.max(2, Math.abs(m.net) / maxV * cH);
    const nColor = m.net >= 0 ? '#32D74B' : '#FF453A';
    const base = H - bPad;
    svg += `<rect x="${(cx-bW-gap/2).toFixed(1)}" y="${(base-uH).toFixed(1)}" width="${bW}" height="${uH.toFixed(1)}" rx="2" fill="#0A84FF" opacity="0.7"/>`;
    svg += `<rect x="${(cx+gap/2).toFixed(1)}" y="${(base-nH).toFixed(1)}" width="${bW}" height="${nH.toFixed(1)}" rx="2" fill="${nColor}" opacity="0.85"/>`;
  });
  el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible;">${svg}</svg>`;

  if (leg) leg.innerHTML = `
    <div class="chart-legend">
      <div class="legend-item"><div class="legend-dot" style="background:#0A84FF;"></div><span>Uscite</span></div>
      <div class="legend-item"><div class="legend-dot" style="background:#32D74B;"></div><span>Flusso +</span></div>
      <div class="legend-item"><div class="legend-dot" style="background:#FF453A;"></div><span>Flusso −</span></div>
    </div>`;
}

// ─── PIE CHART ────────────────────────────────────────────────────────────
function renderPie(expenses) {
  const section = document.getElementById('pieSection');
  const svg = document.getElementById('pieChart');
  const legend = document.getElementById('pieLegend');
  if (!section || !expenses.length) { if(section) section.style.display='none'; return; }

  const totals = {};
  expenses.forEach(e => { totals[e.cat] = (totals[e.cat] || { val:0, color: e.color }); totals[e.cat].val += e.imp; });
  const total = Object.values(totals).reduce((a,b) => a + b.val, 0);
  const entries = Object.entries(totals).sort((a,b) => b[1].val - a[1].val);
  const cx=60, cy=60, r=52, ir=26;
  let angle = -Math.PI/2, slices = '';
  entries.forEach(([cat, {val, color}]) => {
    const a = val/total * Math.PI * 2;
    if (a < 0.01) return;
    const ea = angle + a;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(ea),   y2=cy+r*Math.sin(ea);
    slices += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${a>Math.PI?1:0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${color}" opacity="0.9"/>`;
    angle = ea;
  });
  slices += `<circle cx="${cx}" cy="${cy}" r="${ir}" fill="var(--card-bg)"/>`;
  slices += `<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="var(--text)" font-size="9" font-weight="700" font-family="-apple-system,sans-serif">€${total.toFixed(0)}</text>`;
  svg.innerHTML = slices;
  legend.innerHTML = entries.map(([cat,{val,color}]) =>
    `<div class="pie-leg-row"><span class="pie-dot" style="background:${color}"></span><span class="pie-cat">${cat}</span><span class="pie-pct">${(val/total*100).toFixed(0)}%</span></div>`
  ).join('');
  section.style.display = 'block';
}

// ─── EXPORT / IMPORT ──────────────────────────────────────────────────────
function exportBackup() {
  const a = Object.assign(document.createElement('a'), { href: "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem('pt_db')), download: `ProfitTrack_${new Date().toISOString().slice(0,10)}.json` });
  document.body.appendChild(a); a.click(); a.remove();
}
function exportCSV() {
  let csv = "Anno-Mese,Tipo,Categoria,Importo\n";
  Object.keys(db).forEach(k => {
    db[k].income.forEach(i => { csv += `${k},Entrata,"${i.cat}",${i.imp}\n`; });
    db[k].expenses.forEach(e => { csv += `${k},Uscita,"${e.cat}",${e.imp}\n`; });
  });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})), download: 'ProfitTrack.csv' });
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
  reader.readAsText(file);
  event.target.value = '';
}
function resetData() {
  if (confirm("Cancellare tutto permanentemente?")) { localStorage.clear(); location.reload(); }
}

// ─── ELIMINA ──────────────────────────────────────────────────────────────
function deleteItem(id, type, k) {
  if (type === 'inc') db[k].income = db[k].income.filter(i => i.id !== id);
  else db[k].expenses = db[k].expenses.filter(i => i.id !== id);
  save(); render();
}

// ─── UTILS ────────────────────────────────────────────────────────────────
function shakeEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}
function fmt(n) { return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

// ─── RENDER PRINCIPALE ────────────────────────────────────────────────────
function render() {
  let dateStr = '', totInc = 0, totUsc = 0, net = 0, pagaH = 0;
  let allIncome = [], allExpenses = [];

  if (viewMode === 'month') {
    const k = curKey();
    initKey(k);
    const data = db[k];
    const s = data.settings;
    dateStr = `${MONTH_FULL[currentView.getMonth()]} ${currentView.getFullYear()}`;

    if (s) {
      totInc  = s.stip + data.income.reduce((a,b) => a+b.imp, 0);
      pagaH   = s.pagaH;
      document.getElementById('set_stip').value = s.stip;
      document.getElementById('set_ore').value  = s.oreSett || '';
      document.getElementById('set_extra').value = s.oreExtra > 0 ? s.oreExtra : '';
      updateCalcPreview(s.stip, s.ore, s.pagaH);
    } else {
      totInc = data.income.reduce((a,b) => a+b.imp, 0);
      document.getElementById('set_stip').value = '';
      document.getElementById('set_ore').value  = '';
    }
    totUsc = data.expenses.reduce((a,b) => a+b.imp, 0);
    net    = totInc - totUsc;
    allIncome   = data.income.map(i  => ({...i,  monthKey: k}));
    allExpenses = data.expenses.map(e => ({...e, monthKey: k}));

    // Settings card month label
    const sl = document.getElementById('settingsMonthLabel');
    if (sl) sl.textContent = `${MONTH_NAMES[currentView.getMonth()]} ${currentView.getFullYear()}`;

    // Recurring banner
    const banner = document.getElementById('recurringApplyBanner');
    if (banner && recurring.length) {
      const notApplied = recurring.filter(r => !data.appliedRec.includes(r.id));
      if (notApplied.length) {
        document.getElementById('recurringApplyText').textContent = `${notApplied.length} spese fisse non applicate`;
        banner.style.display = 'flex';
      } else {
        banner.style.display = 'none';
      }
    } else if (banner) banner.style.display = 'none';

  } else {
    const year = currentView.getFullYear().toString();
    dateStr = `Anno ${year}`;
    Object.keys(db).forEach(k => {
      if (!k.startsWith(year)) return;
      const d = db[k];
      const stip = d.settings ? d.settings.stip : 0;
      const inc  = d.income.reduce((a,b) => a+b.imp, 0);
      totInc += stip + inc;
      totUsc += d.expenses.reduce((a,b) => a+b.imp, 0);
      d.income.forEach(i   => allIncome.push({...i,  monthKey:k}));
      d.expenses.forEach(e => allExpenses.push({...e, monthKey:k}));
    });
    net = totInc - totUsc;
  }

  // ── Header
  document.getElementById('dateLabel').textContent = dateStr;
  document.getElementById('viewBadge').textContent = viewMode === 'year' ? 'ANNO' : 'MESE';

  // ── Hero card
  document.getElementById('heroAmount').textContent = `€${fmt(net)}`;
  document.getElementById('heroAmount').style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('heroLabel').textContent = 'Flusso Netto';

  const heroSub = document.getElementById('heroSub');
  if (pagaH > 0 && viewMode === 'month') {
    heroSub.textContent = `€${pagaH.toFixed(2)} / ora`;
    heroSub.style.display = 'block';
  } else heroSub.style.display = 'none';

  let perc = totInc > 0 ? Math.min(100, totUsc / totInc * 100) : 0;
  document.getElementById('heroBar').style.width  = perc + '%';
  document.getElementById('heroBar').style.background = perc > 80 ? 'var(--red)' : perc > 50 ? 'var(--orange)' : 'var(--green)';
  document.getElementById('heroBarLabel').textContent = `${perc.toFixed(0)}% speso`;

  // ── Stats chips
  document.getElementById('statIn').textContent  = `€${fmt(totInc)}`;
  document.getElementById('statOut').textContent = `€${fmt(totUsc)}`;
  const chipOra = document.getElementById('chipOra');
  if (pagaH > 0 && viewMode === 'month') {
    document.getElementById('statOra').textContent = `€${pagaH.toFixed(2)}`;
    chipOra.style.display = 'flex';
  } else chipOra.style.display = 'none';

  // ── Recent list (home) — ultimi 5
  const recent = [...allExpenses.map(e => ({...e, _type:'usc'})), ...allIncome.map(i => ({...i, _type:'inc'}))]
    .sort((a,b) => b.id - a.id).slice(0,5);
  const rl = document.getElementById('recentList');
  if (rl) {
    rl.innerHTML = recent.length ? recent.map(e => renderRow(e, e._type)).join('') :
      '<div class="empty-state">Ancora nessun movimento.<br>Premi + per aggiungerne uno.</div>';
  }

  // ── Movimenti page
  if (document.getElementById('page-movimenti').classList.contains('active')) {
    document.getElementById('incomeList').innerHTML  = allIncome.length  ? allIncome.map(i  => renderRow(i, 'inc')).join('') : '<div class="empty-state">Nessuna entrata</div>';
    document.getElementById('expenseList').innerHTML = allExpenses.length ? allExpenses.map(e => renderRow(e, 'usc')).join('') : '<div class="empty-state">Nessuna uscita</div>';
    const movIncLabel = document.getElementById('movIncLabel');
    const movOutLabel = document.getElementById('movOutLabel');
    if (movIncLabel) movIncLabel.textContent = `€${fmt(totInc)}`;
    if (movOutLabel) movOutLabel.textContent = `€${fmt(totUsc)}`;
    renderPie(allExpenses);
  }

  // ── Analisi page
  if (document.getElementById('page-analisi') && document.getElementById('page-analisi').classList.contains('active')) {
    renderHistoryChart();
    renderAvgBox();
  }
}

function renderRow(item, type) {
  return `<div class="tx-row">
    <div class="tx-emoji" style="background:${item.color}22;">${item.emoji || (type==='usc'?'💸':'💰')}</div>
    <div class="tx-info">
      <span class="tx-cat">${item.nome || item.cat}</span>
      <span class="tx-sub">${item.cat}</span>
    </div>
    <div class="tx-right">
      <span class="tx-amt" style="color:${type==='usc'?'var(--red)':'var(--green)'}">
        ${type==='usc'?'−':'+'} €${item.imp.toFixed(0)}
      </span>
      <button class="del-btn-sm" onclick="deleteItem(${item.id},'${type}','${item.monthKey}')">✕</button>
    </div>
  </div>`;
}
