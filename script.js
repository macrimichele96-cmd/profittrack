'use strict';
// ─── CATEGORIE (15 voci iOS-palette) ────────────────────────────────────────
const CATS_USC = [
  { id:'cibo',        label:'Cibo',        emoji:'🛒', color:'#FF9F0A' },
  { id:'affitto',     label:'Affitto',     emoji:'🏡', color:'#0A84FF' },
  { id:'trasporti',   label:'Trasporti',   emoji:'🚗', color:'#30D158' },
  { id:'personale',   label:'Personale',   emoji:'👤', color:'#BF5AF2' },
  { id:'abbonamenti', label:'Abbonamenti', emoji:'📦', color:'#64D2FF' },
  { id:'telefono',    label:'Telefono',    emoji:'📱', color:'#5E5CE6' },
  { id:'utenze',      label:'Utenze',      emoji:'💡', color:'#FFD60A' },
  { id:'viaggi',      label:'Viaggi',      emoji:'✈️',  color:'#32ADE6' },
  { id:'svago',       label:'Svago',       emoji:'🎬', color:'#FF375F' },
  { id:'famiglia',    label:'Famiglia',    emoji:'👨‍👩‍👧', color:'#FF6B6B' },
  { id:'debito',      label:'Debito',      emoji:'📉', color:'#FF453A' },
  { id:'salute',      label:'Salute',      emoji:'❤️',  color:'#FF2D55' },
  { id:'tecnologia',  label:'Tecnologia',  emoji:'💻', color:'#636366' },
  { id:'istruzione',  label:'Istruzione',  emoji:'📚', color:'#34C759' },
  { id:'bellezza',    label:'Bellezza',    emoji:'💄', color:'#FF6AB0' },
];
const CATS_INC = [
  { id:'stipendio',    label:'Stipendio',    emoji:'💼', color:'#32D74B' },
  { id:'extra',        label:'Extra',        emoji:'💰', color:'#FFD60A' },
  { id:'investimenti', label:'Investimenti', emoji:'📈', color:'#30D158' },
  { id:'regalo',       label:'Regalo',       emoji:'🎁', color:'#FF6B6B' },
  { id:'rimborso',     label:'Rimborso',     emoji:'🔄', color:'#64D2FF' },
];

const MONTH_NAMES = ["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"];
const MONTH_FULL  = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const DAY_NAMES   = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
const DAY_FULL    = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];

// ─── STATO ───────────────────────────────────────────────────────────────────
let db          = {};
let gSettings   = { stip:0, oreGiorno:8, pagaH:0, restDays:[0,6], salaryAccountId:'main' };
let recurring   = [];
let accounts    = [{ id:'main', name:'Principale', emoji:'🏦' }];
let selectedAccountId = 'main';
let filterAccountId   = 'all';

let currentView   = new Date();
let viewMode      = 'month';
let modalType     = 'usc';
let selectedCat   = CATS_USC[0];
let currentRecCat = CATS_USC[0];
let calendarOpen  = false;
let swRegistration = null;

let accountPickerContext = 'modal';
let datePickerContext = 'entry';
let transferDate = new Date();
let transferFromAccountId = 'main';
let transferToAccountId = null;
let onbSalaryAccountId = 'main';
let accountInitTargetId = null;

let editContext = null;
let transferEditContext = null;
let swipeJustHappened = false;

let numpadValue = '0';
let numpadHasDecimal = false;
let modalDate = new Date();

// ─── INDEXEDDB ───────────────────────────────────────────────────────────────
let idb = null;
const IDB_NAME    = 'profittrack_v1';
const IDB_VERSION = 1;

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('kv')) {
        d.createObjectStore('kv');
      }
    };
    req.onsuccess = e => { idb = e.target.result; resolve(idb); };
    req.onerror   = e => reject(e.target.error);
  });
}

function idbGet(key) {
  return new Promise((resolve) => {
    try {
      if (!idb) return resolve(null);
      const tx = idb.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch (e) {
      console.warn('IDB read failed', e);
      resolve(null);
    }
  });
}

function idbSet(key, value) {
  return new Promise((resolve) => {
    try {
      if (!idb) return resolve(false);
      const tx = idb.transaction('kv', 'readwrite');
      const req = tx.objectStore('kv').put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        showSaveErrorToast('Salvataggio dati fallito.');
        resolve(false);
      };
      tx.onerror = () => {
        showSaveErrorToast('Salvataggio dati fallito.');
        resolve(false);
      };
      tx.onabort = () => {
        showSaveErrorToast('Salvataggio dati fallito.');
        resolve(false);
      };
    } catch (e) {
      console.warn('IDB write failed', e);
      showSaveErrorToast('Salvataggio dati fallito.');
      resolve(false);
    }
  });
}

async function save() {
  await idbSet('pt_db', db);
}
async function saveSettings() {
  await idbSet('pt_settings', gSettings);
}
async function saveRecurringIDB() {
  await idbSet('pt_recurring', recurring);
}
async function saveAccountsIDB() {
  await idbSet('pt_accounts', accounts);
}

// ─── SALDI CONTI (calcolo su tutti i mesi) ──────────────────────────────────
function computeAccountBalances() {
  const balances = {};
  accounts.forEach(acc => { balances[acc.id] = 0; });

  for (const k in db) {
    const month = db[k];
    (month.income || []).forEach(inc => {
      const accId = inc.accountId || 'main';
      if (balances[accId] !== undefined) balances[accId] += inc.imp;
    });
    (month.expenses || []).forEach(exp => {
      const accId = exp.accountId || 'main';
      if (balances[accId] !== undefined) balances[accId] -= exp.imp;
    });
    (month.transfers || []).forEach(tr => {
      if (balances[tr.fromAccountId] !== undefined) balances[tr.fromAccountId] -= tr.imp;
      if (balances[tr.toAccountId] !== undefined)   balances[tr.toAccountId] += tr.imp;
    });
  }
  return balances;
}

function getAccountBalance(accountId) {
  const balances = computeAccountBalances();
  return balances[accountId] || 0;
}

// ─── SICUREZZA INPUT ─────────────────────────────────────────────────────────
function sanitizeAmount(val) {
  if (typeof val === 'number') return isNaN(val)||val<0 ? 0 : Math.round(val*100)/100;
  let s = String(val).trim();
  s = s.replace(/\s+/g,'');
  s = s.replace(/€|EUR/gi,'');
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g,'').replace(',', '.');
  } else {
    s = s.replace(/\.(?=\d{3}(?:\D|$))/g,'');
    if (s.includes(',')) s = s.replace(',', '.');
  }
  s = s.replace(/[^0-9.]/g,'');
  const n = parseFloat(s);
  return isNaN(n)||n<0 ? 0 : Math.round(n*100)/100;
}

function getAccountById(id) {
  return accounts.find(a => a.id === id) || accounts[0] || { id:'main', name:'Principale', emoji:'🏦' };
}

function getSalaryAccountForMonth(k) {
  return db[k]?.salaryAccountId || gSettings.salaryAccountId || 'main';
}

function getSalaryTsForMonth(k) {
  if (db[k]?.salaryTs) return db[k].salaryTs;
  const [y, m] = k.split('-').map(Number);
  const d = new Date(y, m, 1, 12, 0, 0);
  return d.getTime();
}

function getSalaryItemForMonth(k) {
  const salary = getSalaryForMonth(k);
  if (!salary) return null;
  const salaryAcc = getSalaryAccountForMonth(k);
  const salaryTs = getSalaryTsForMonth(k);
  const cat = CATS_INC[0];
  return {
    id: salaryTs,
    ts: salaryTs,
    imp: salary,
    cat: cat.label,
    emoji: cat.emoji,
    color: cat.color,
    accountId: salaryAcc,
    _salaryK: k
  };
}

function getEntryAmountValue() {
  const el = document.getElementById('amountInput');
  if (!el) return 0;
  return sanitizeAmount(el.value);
}

function resetEntryAmountInput() {
  const el = document.getElementById('amountInput');
  if (!el) return;
  el.value = '';
}

function formatThousandItalian(intDigits) {
  const s = String(intDigits || '0').replace(/^0+/, '') || '0';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += '.';
  }
  return out;
}

function parseAmountInput(raw) {
  let s = String(raw ?? '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/€|EUR/gi, '');
  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return { intDigits: '', decDigits: '', trailingSep: false };

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let decimalIndex = -1;
  let decimalSep = null;
  if (lastComma === -1 && lastDot === -1) {
    decimalSep = null;
  } else if (lastComma > lastDot) {
    decimalIndex = lastComma;
    decimalSep = ',';
  } else {
    decimalIndex = lastDot;
    decimalSep = '.';
  }

  let intPart = s;
  let decPart = '';
  let trailingSep = false;

  if (decimalSep) {
    intPart = s.slice(0, decimalIndex);
    decPart = s.slice(decimalIndex + 1);
    trailingSep = decPart.length === 0;
  }

  const intDigits = (intPart || '').replace(/[^0-9]/g, '');
  let decDigits = (decPart || '').replace(/[^0-9]/g, '');
  if (decDigits.length > 2) decDigits = decDigits.slice(0, 2);

  let normalizedInt = intDigits;
  if (normalizedInt) normalizedInt = normalizedInt.replace(/^0+(?=\d)/, '');
  if (!normalizedInt) normalizedInt = '0';

  return { intDigits: normalizedInt, decDigits, trailingSep: Boolean(trailingSep) };
}

function formatAmountInputEl(inputEl) {
  if (!inputEl) return;
  const raw = inputEl.value;
  const parsed = parseAmountInput(raw);
  if (!raw) return;

  const hasDecimal = parsed.decDigits.length > 0 || parsed.trailingSep;
  const formattedInt = formatThousandItalian(parsed.intDigits);
  const formatted = hasDecimal
    ? `${formattedInt},${parsed.decDigits || ''}`
    : formattedInt;

  if (inputEl.value !== formatted) inputEl.value = formatted;
}

function onEntryAmountInputChange() {
  try {
    formatAmountInputEl(document.getElementById('amountInput'));
  } catch {}
  updateTimeDeterrent();
}

function getTransferAmountValue() {
  const el = document.getElementById('transferAmountInput');
  if (!el) return 0;
  return sanitizeAmount(el.value);
}

function resetTransferAmountInput() {
  const el = document.getElementById('transferAmountInput');
  if (!el) return;
  el.value = '';
}

function onTransferAmountInputChange() {
  try {
    formatAmountInputEl(document.getElementById('transferAmountInput'));
  } catch {}
}

// ─── FORMATTAZIONE NUMERICA SU TUTTI GLI INPUT ─────────────────────────────
function initNumberFormatting() {
  const numericInputs = [
    'ob_stip', 'ob_ore', 'set_stip', 'set_ore', 'set_extra',
    'newAccountInit', 'accountInitAmount', 'det_prezzo', 'obj_target', 'obj_anni'
  ];
  numericInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', function() {
        formatAmountInputEl(this);
      });
    }
  });
}

let kbTrack = { active:false, handler:null, vvHandler:null };
function setKeyboardOffset() {
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  const diff = Math.max(0, window.innerHeight - vv.height);
  document.documentElement.style.setProperty('--kb-offset', `${diff}px`);

  if (diff > 30) {
    const entrySheet = document.getElementById('modalSheet');
    if (entrySheet && entrySheet.classList.contains('active')) {
      requestAnimationFrame(() => { entrySheet.scrollTop = entrySheet.scrollHeight; });
    }
    const trSheet = document.getElementById('transferModalSheet');
    if (trSheet && trSheet.classList.contains('active')) {
      requestAnimationFrame(() => { trSheet.scrollTop = trSheet.scrollHeight; });
    }
  }
}
function startKeyboardTracking() {
  if (kbTrack.active) return;
  kbTrack.active = true;
  kbTrack.handler = () => setKeyboardOffset();
  kbTrack.vvHandler = () => setKeyboardOffset();
  window.addEventListener('resize', kbTrack.handler);
  window.visualViewport?.addEventListener('resize', kbTrack.vvHandler);
  setKeyboardOffset();
}
function stopKeyboardTracking() {
  if (!kbTrack.active) return;
  kbTrack.active = false;
  window.removeEventListener('resize', kbTrack.handler);
  window.visualViewport?.removeEventListener('resize', kbTrack.vvHandler);
  document.documentElement.style.setProperty('--kb-offset', `0px`);
}

function focusInputAndScrollConfirm(inputId, confirmId) {
  setTimeout(() => {
    const input = document.getElementById(inputId);
    input?.focus?.();
    const btn = document.getElementById(confirmId);
    btn?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, 80);
}

function tapToEditMovement(event, type, k, id) {
  if (swipeJustHappened) return;
  event?.preventDefault?.();
  openEditEntry(type, k, id);
}
function tapToEditTransfer(event, k, id) {
  if (swipeJustHappened) return;
  event?.preventDefault?.();
  openEditTransfer(k, id);
}

function showDebugToast(msg) {
  try {
    const el = document.getElementById('debugToast');
    if (!el) return;
    el.textContent = msg ? String(msg) : '';
    el.style.display = 'block';
    clearTimeout(showDebugToast._t);
    showDebugToast._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
  } catch {}
}

function showSaveErrorToast(msg) {
  try {
    const el = document.getElementById('saveErrorToast');
    if (!el) return;
    const text = msg ? String(msg) : 'Salvataggio fallito.';
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(showSaveErrorToast._t);
    showSaveErrorToast._t = setTimeout(() => { el.style.display = 'none'; }, 3200);
  } catch {}
}

window.addEventListener('error', (e) => {
  showDebugToast(e?.message || 'Errore JS');
});
window.addEventListener('unhandledrejection', (e) => {
  showDebugToast(e?.reason?.message || 'Errore promise');
});

function renderNetworkIndicator() {
  const el = document.getElementById('netIndicator');
  if (!el) return;
  if (navigator.onLine) {
    el.classList.remove('offline');
    el.textContent = '';
    el.style.display = 'none';
  } else {
    el.classList.add('offline');
    el.textContent = 'Offline';
    el.style.display = 'inline-flex';
  }
}
window.addEventListener('online', renderNetworkIndicator);
window.addEventListener('offline', renderNetworkIndicator);

// ─── SERVICE WORKER ──────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    swRegistration = reg;
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => {
        if (w.state==='installed' && navigator.serviceWorker.controller) {
          document.getElementById('updateBanner').style.display='flex';
        }
      });
    });
  }).catch(()=>{});
}
async function applyUpdate() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const waiting = swRegistration?.waiting || reg?.waiting;

    if (waiting) {
      waiting.postMessage({type:'SKIP_WAITING'});

      await new Promise(resolve => {
        const t = setTimeout(resolve, 3000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          clearTimeout(t);
          resolve();
        }, { once: true });
      });
    }
  } catch (e) {
    console.warn('applyUpdate failed', e);
  }

  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.onload = async () => {
  renderNetworkIndicator();
  try {
    await openIDB();
  } catch (e) {
    console.warn('IDB init failed', e);
    showSaveErrorToast('Salvataggio offline non disponibile (IndexedDB).');
  }
  const [dbData, sets, rec, acc] = await Promise.all([
    idbGet('pt_db'), idbGet('pt_settings'), idbGet('pt_recurring'), idbGet('pt_accounts')
  ]);
  if (dbData)   db        = dbData;
  if (sets)     gSettings = sets;
  if (!gSettings.salaryAccountId) gSettings.salaryAccountId = 'main';
  if (rec)      recurring  = rec;
  if (acc)      accounts   = acc;

  if (!dbData && localStorage.getItem('pt_db')) {
    try { db = JSON.parse(localStorage.getItem('pt_db')||'{}'); await save(); } catch{}
  }
  if (!sets && localStorage.getItem('pt_settings')) {
    try { gSettings = JSON.parse(localStorage.getItem('pt_settings')); await idbSet('pt_settings',gSettings); } catch{}
  }

  if (!gSettings.stip || gSettings.stip===0) {
    document.getElementById('onboarding').style.display='flex';
    initOnboardingDayPicker();
    renderOnboardingSalaryAccounts();
  } else {
    bootApp();
  }
};

function initOnboardingDayPicker() {
  const restDays = gSettings.restDays||[0,6];
  document.querySelectorAll('#ob_days .day-btn').forEach(btn => {
    btn.classList.toggle('active', restDays.includes(parseInt(btn.dataset.day)));
    btn.onclick = () => btn.classList.toggle('active');
  });
}

function renderOnboardingSalaryAccounts() {
  const wrap = document.getElementById('onbAccPicker');
  if (!wrap) return;
  const desired = gSettings.salaryAccountId || accounts[0]?.id || 'main';
  onbSalaryAccountId = desired;
  wrap.innerHTML = accounts.map(a => `
    <button type="button" class="onb-acc-btn${a.id === onbSalaryAccountId ? ' active' : ''}" data-accid="${a.id}" onclick="selectOnbSalaryAccount('${a.id}')">
      ${a.emoji} ${a.name}
    </button>
  `).join('');
}

function selectOnbSalaryAccount(id) {
  onbSalaryAccountId = id;
  const wrap = document.getElementById('onbAccPicker');
  if (!wrap) return;
  wrap.querySelectorAll('.onb-acc-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accid === id);
  });
}

function bootApp() {
  document.getElementById('onboarding').style.display='none';
  document.getElementById('app').style.display='block';
  populateSettingsDayPicker();
  renderAccountBar();
  renderAccountsList();
  renderRecCatGrid();
  resetEntryAmountInput();
  setDefaultModalDate();
  render();
  renderRecurringList();
  renderHistoryChart();
  renderAvgBox();
  renderDonutChart();
  initNumberFormatting(); // <-- applica formattazione numerica
  const p = new URLSearchParams(window.location.search);
  if (p.get('action')==='expense') { openModal(); setModalType('usc'); }
  if (p.get('action')==='income')  { openModal(); setModalType('inc'); }
}

async function completeOnboarding() {
  const stip      = sanitizeAmount(document.getElementById('ob_stip').value);
  const oreGiorno = sanitizeAmount(document.getElementById('ob_ore').value);
  if (stip<=0||oreGiorno<=0) { shakeEl('onboarding-card'); return; }
  const restDays=[];
  document.querySelectorAll('#ob_days .day-btn.active').forEach(b=>restDays.push(parseInt(b.dataset.day)));
  const now=new Date(), k=monthKey(now.getFullYear(),now.getMonth());
  if (!db[k]) db[k]={settings:null,income:[],expenses:[],transfers:[],appliedRec:[]};
  const ore=calcOreMese(oreGiorno,restDays,now.getFullYear(),now.getMonth(),0);
  const pagaH=ore>0?stip/ore:0;
  db[k].workParams={oreGiorno,restDays,oreExtra:0};
  db[k].salary=stip;
  db[k].salaryAccountId = onbSalaryAccountId || 'main';
  db[k].settings={stip,oreGiorno,restDays,ore,oreExtra:0,pagaH,_fromGlobal:false};
  gSettings={stip,oreGiorno,pagaH,restDays,salaryAccountId:(onbSalaryAccountId || 'main')};
  await Promise.all([save(), idbSet('pt_settings',gSettings)]);
  bootApp();
}

// ─── CALCOLO ORE ─────────────────────────────────────────────────────────────
function countWorkDays(year,month,restDays) {
  const days=new Date(year,month+1,0).getDate();
  let c=0;
  for(let d=1;d<=days;d++) if(!restDays.includes(new Date(year,month,d).getDay())) c++;
  return c;
}
function calcOreMese(oreG,restDays,year,month,extra) {
  return Math.round(countWorkDays(year,month,restDays)*oreG+(extra||0));
}
function isWorkDay(date,restDays) { return !restDays.includes(date.getDay()); }

// ─── ACCOUNTS ────────────────────────────────────────────────────────────────
function renderAccountBar() {
  const scroll = document.getElementById('accountScroll');
  if (!scroll) return;
  scroll.innerHTML = [
    `<button class="acc-chip${filterAccountId==='all'?' active':''}" onclick="setFilterAccount('all')">Tutti</button>`,
    ...accounts.map(a =>
      `<button class="acc-chip${filterAccountId===a.id?' active':''}" onclick="setFilterAccount('${a.id}')">${a.emoji} ${a.name}</button>`
    )
  ].join('');
}
function renderAccountsList() {
  const el = document.getElementById('accountsList'); if(!el) return;
  if(!accounts.length) { el.innerHTML='<div class="empty-state-box"><div class="empty-msg">Nessun conto</div></div>'; return; }
  el.innerHTML = accounts.map(a =>
    `<div class="acc-row">
      <span class="acc-emoji">${a.emoji}</span>
      <span class="acc-name">${a.name}</span>
      <button class="init-btn-sm" onclick="openAccountInitSheet('${a.id}')">€</button>
      ${a.id!=='main'?`<button class="del-btn-sm" onclick="deleteAccount('${a.id}')">✕</button>`:''}
    </div>`
  ).join('');
}
function setFilterAccount(id) {
  filterAccountId=id; renderAccountBar(); render();
}
function deleteAccount(id) {
  accounts=accounts.filter(a=>a.id!==id);
  if(filterAccountId===id) filterAccountId='all';
  saveAccountsIDB(); renderAccountBar(); renderAccountsList(); render();
}
let selectedAccountEmoji = '🏦';
function openAccountSheet() {
  document.getElementById('accountSheetBackdrop').classList.add('active');
  document.getElementById('accountSheet').classList.add('active');
  document.getElementById('newAccountName').value='';
  const initEl = document.getElementById('newAccountInit');
  if (initEl) initEl.value = '';
  selectedAccountEmoji='🏦';
  document.querySelectorAll('.ae-btn').forEach(b=>b.classList.toggle('active',b.dataset.emoji==='🏦'));
}
function closeAccountSheet() {
  document.getElementById('accountSheetBackdrop').classList.remove('active');
  document.getElementById('accountSheet').classList.remove('active');
}
function selectAccountEmoji(btn) {
  selectedAccountEmoji=btn.dataset.emoji;
  document.querySelectorAll('.ae-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
async function saveNewAccount() {
  const name=document.getElementById('newAccountName').value.trim();
  if(!name) { shakeEl('newAccountName'); return; }
  const initVal = sanitizeAmount(document.getElementById('newAccountInit')?.value);
  const acc={id:'acc_'+Date.now(), name, emoji:selectedAccountEmoji};

  const k = curMonthKey();
  initMonthKey(k);

  if(initVal > 0) {
    const entryId = Date.now() + Math.random();
    const initTs = Date.now();
    db[k].income.push({
      id: entryId,
      ts: initTs,
      imp: initVal,
      cat: 'Saldo iniziale',
      emoji: '💰',
      color: '#32D74B',
      accountId: acc.id,
      isInit: true,
      initEntryId: entryId,
    });
    acc.initAmount = initVal;
    acc.initK = k;
    acc.initEntryId = entryId;
    acc.initTs = initTs;
  }

  accounts.push(acc);
  await Promise.all([save(), saveAccountsIDB()]);
  closeAccountSheet();
  renderAccountBar(); renderAccountsList(); render();
}

// ─── Account initial amount sheet ─────────────────────────────────────
function openAccountInitSheet(accountId) {
  accountInitTargetId = accountId;
  const acc = accounts.find(a => a.id === accountId) || accounts[0];
  const lab = document.getElementById('accountInitLabel');
  if (lab) lab.textContent = `${acc.emoji} ${acc.name}`;
  const amtEl = document.getElementById('accountInitAmount');
  const initVal = sanitizeAmount(acc.initAmount ?? acc.initVal ?? 0);
  if (amtEl) amtEl.value = initVal > 0 ? String(initVal) : '';
  document.getElementById('accountInitBackdrop').classList.add('active');
  document.getElementById('accountInitSheet').classList.add('active');
}

function closeAccountInitSheet() {
  document.getElementById('accountInitBackdrop').classList.remove('active');
  document.getElementById('accountInitSheet').classList.remove('active');
  accountInitTargetId = null;
}

async function saveAccountInitial() {
  if (!accountInitTargetId) return;
  const acc = accounts.find(a => a.id === accountInitTargetId);
  if (!acc) return;

  const amount = sanitizeAmount(document.getElementById('accountInitAmount')?.value);
  const nowTs = Date.now();

  const prevK = acc.initK || curMonthKey();
  initMonthKey(prevK);

  if (acc.initEntryId != null) {
    db[prevK].income = (db[prevK].income || []).filter(i => i.id !== acc.initEntryId);
    acc.initEntryId = null;
    acc.initK = null;
    acc.initAmount = null;
    acc.initTs = null;
  }

  if (amount > 0) {
    const entryId = Date.now() + Math.random();
    const entryTs = nowTs;
    db[prevK].income.push({
      id: entryId,
      ts: entryTs,
      imp: amount,
      cat: 'Saldo iniziale',
      emoji: '💰',
      color: '#32D74B',
      accountId: acc.id,
      isInit: true,
      initEntryId: entryId,
    });
    acc.initAmount = amount;
    acc.initK = prevK;
    acc.initEntryId = entryId;
    acc.initTs = entryTs;
  }

  await Promise.all([save(), saveAccountsIDB()]);
  closeAccountInitSheet();
  renderAccountBar();
  renderAccountsList();
  render();
}

// Account picker (riutilizzato per modal: entry/salary/transfer)
function openAccountPicker(context='modal') {
  accountPickerContext = context || 'modal';
  const current = (accountPickerContext==='modal') ? selectedAccountId
    : (accountPickerContext==='salary') ? (gSettings.salaryAccountId || 'main')
    : (accountPickerContext==='transferFrom') ? transferFromAccountId
    : (accountPickerContext==='transferTo') ? transferToAccountId
    : selectedAccountId;
  const list=document.getElementById('accountPickerList');
  list.innerHTML=accounts.map(a=>
    `<div class="acc-row" onclick="selectAccountFromPicker('${a.id}')">
      <span class="acc-emoji">${a.emoji}</span>
      <span class="acc-name">${a.name}</span>
      ${current===a.id?'<span style="color:var(--blue);">✓</span>':''}
    </div>`
  ).join('');
  document.getElementById('accountPickerBackdrop').classList.add('active');
  document.getElementById('accountPickerSheet').classList.add('active');
}
function closeAccountPicker() {
  document.getElementById('accountPickerBackdrop').classList.remove('active');
  document.getElementById('accountPickerSheet').classList.remove('active');
}
function selectAccountFromPicker(id) {
  if (accountPickerContext === 'modal') {
    selectedAccountId = id;
    const acc = getAccountById(id);
    document.getElementById('accountSelectorLabel').textContent = `${acc.emoji} ${acc.name}`;
  } else if (accountPickerContext === 'salary') {
    gSettings.salaryAccountId = id;
    const acc = getAccountById(id);
    const lab = document.getElementById('salaryAccountSelectorLabel');
    if (lab) lab.textContent = `${acc.emoji} ${acc.name}`;
    if (viewMode === 'month') {
      const k = curMonthKey();
      initMonthKey(k);
      db[k].salaryAccountId = id;
    }
    idbSet('pt_settings', gSettings).catch(()=>{});
    render();
  } else if (accountPickerContext === 'transferFrom') {
    transferFromAccountId = id;
    const acc = getAccountById(id);
    const balance = getAccountBalance(id);
    document.getElementById('transferFromSelectorLabel').innerHTML = `${acc.emoji} ${acc.name} <span style="font-size:12px;opacity:0.7;">(€${fmt(balance)})</span>`;
  } else if (accountPickerContext === 'transferTo') {
    transferToAccountId = id;
    const acc = getAccountById(id);
    const balance = getAccountBalance(id);
    document.getElementById('transferToSelectorLabel').innerHTML = `${acc.emoji} ${acc.name} <span style="font-size:12px;opacity:0.7;">(€${fmt(balance)})</span>`;
  }
  closeAccountPicker();
}

// ─── NUOVO SELEZIONE CONTI PER TRASFERIMENTO (CARD CON SALDO) ────────────────
function openTransferAccountPicker(direction) {
  accountPickerContext = direction === 'from' ? 'transferFrom' : 'transferTo';
  const balances = computeAccountBalances();
  const container = document.getElementById('transferAccountPickerList');
  if (!container) return;

  container.innerHTML = accounts.map(acc => {
    const balance = balances[acc.id] || 0;
    const balanceStr = balance >= 0 ? `€${fmt(balance)}` : `-€${fmt(Math.abs(balance))}`;
    const isSelected = (direction === 'from' && transferFromAccountId === acc.id) ||
                       (direction === 'to' && transferToAccountId === acc.id);
    return `
      <div class="transfer-acc-card ${isSelected ? 'active' : ''}" data-accid="${acc.id}" onclick="selectTransferAccount('${direction}', '${acc.id}')">
        <div class="transfer-acc-emoji">${acc.emoji}</div>
        <div class="transfer-acc-info">
          <div class="transfer-acc-name">${acc.name}</div>
          <div class="transfer-acc-balance">${balanceStr}</div>
        </div>
        ${isSelected ? '<div class="checkmark">✓</div>' : ''}
      </div>
    `;
  }).join('');

  document.getElementById('transferAccountPickerBackdrop').classList.add('active');
  document.getElementById('transferAccountPickerSheet').classList.add('active');
}

function selectTransferAccount(direction, accountId) {
  if (direction === 'from') {
    transferFromAccountId = accountId;
    const acc = getAccountById(accountId);
    const balance = getAccountBalance(accountId);
    document.getElementById('transferFromSelectorLabel').innerHTML = `${acc.emoji} ${acc.name} <span style="font-size:12px;opacity:0.7;">(€${fmt(balance)})</span>`;
  } else {
    transferToAccountId = accountId;
    const acc = getAccountById(accountId);
    const balance = getAccountBalance(accountId);
    document.getElementById('transferToSelectorLabel').innerHTML = `${acc.emoji} ${acc.name} <span style="font-size:12px;opacity:0.7;">(€${fmt(balance)})</span>`;
  }
  closeTransferAccountPicker();
}

function closeTransferAccountPicker() {
  document.getElementById('transferAccountPickerBackdrop').classList.remove('active');
  document.getElementById('transferAccountPickerSheet').classList.remove('active');
}

// ─── DATE PICKER (modal) ─────────────────────────────────────────────────────
function setDefaultModalDate() {
  modalDate=new Date();
  updateDateSelectorLabel();
}
function updateDateSelectorLabel() {
  const today=new Date();
  const isToday=modalDate.toDateString()===today.toDateString();
  const el=document.getElementById('dateSelectorLabel');
  if(el) el.textContent=isToday?'Oggi':`${modalDate.getDate()} ${MONTH_NAMES[modalDate.getMonth()]} ${modalDate.getFullYear()}`;
}
function updateTransferDateSelectorLabel() {
  const today=new Date();
  const isToday=transferDate.toDateString()===today.toDateString();
  const el=document.getElementById('transferDateSelectorLabel');
  if(el) el.textContent=isToday?'Oggi':`${transferDate.getDate()} ${MONTH_NAMES[transferDate.getMonth()]} ${transferDate.getFullYear()}`;
}
function openDatePicker() {
  datePickerContext = 'entry';
  const y=modalDate.getFullYear();
  const m=String(modalDate.getMonth()+1).padStart(2,'0');
  const d=String(modalDate.getDate()).padStart(2,'0');
  document.getElementById('datePickerInput').value=`${y}-${m}-${d}`;
  document.getElementById('datePickerBackdrop').classList.add('active');
  document.getElementById('datePickerSheet').classList.add('active');
}
function openTransferDatePicker() {
  datePickerContext = 'transfer';
  const y=transferDate.getFullYear();
  const m=String(transferDate.getMonth()+1).padStart(2,'0');
  const d=String(transferDate.getDate()).padStart(2,'0');
  document.getElementById('datePickerInput').value=`${y}-${m}-${d}`;
  document.getElementById('datePickerBackdrop').classList.add('active');
  document.getElementById('datePickerSheet').classList.add('active');
}
function closeDatePicker() {
  document.getElementById('datePickerBackdrop').classList.remove('active');
  document.getElementById('datePickerSheet').classList.remove('active');
}
function confirmDatePick() {
  const val=document.getElementById('datePickerInput').value;
  if(val) {
    const [y,m,d]=val.split('-').map(Number);
    const picked = new Date(y,m-1,d);
    if(datePickerContext === 'transfer') {
      transferDate = picked;
      updateTransferDateSelectorLabel();
    } else {
      modalDate = picked;
      updateDateSelectorLabel();
    }
  }
  closeDatePicker();
}

// ─── NAVIGAZIONE ─────────────────────────────────────────────────────────────
function showPage(pageId, el) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  window.scrollTo(0,0);
  render();
  if(pageId==='page-settings') { renderRecurringList(); liveCalcPreview(); renderAccountsList(); }
  if(pageId==='page-analisi')  { renderHistoryChart(); renderAvgBox(); renderDonutChart(); }
}

function handleDatePillTap() {
  if(viewMode==='day')   { viewMode='month'; currentView.setDate(1); closeCalendar(); render(); }
  else if(viewMode==='month') { viewMode='year'; currentView.setDate(1); render(); }
  else { viewMode='month'; currentView=new Date(); currentView.setDate(1); render(); }
}

function changeDate(dir) {
  if(viewMode==='day') currentView.setDate(currentView.getDate()+dir*7);
  else if(viewMode==='month') { currentView.setDate(1); currentView.setMonth(currentView.getMonth()+dir); }
  else currentView.setFullYear(currentView.getFullYear()+dir);
  render();
}

// ─── CALENDARIO ──────────────────────────────────────────────────────────────
function toggleCalendar() { calendarOpen?closeCalendar():openCalendar(); }
function openCalendar() {
  calendarOpen=true; buildCalendar();
  const cal=document.getElementById('dayCalendar'), bd=document.getElementById('calBackdrop');
  cal.style.display='block'; bd.style.display='block';
  requestAnimationFrame(()=>requestAnimationFrame(()=>cal.classList.add('open')));
}
function closeCalendar() {
  calendarOpen=false;
  const cal=document.getElementById('dayCalendar'), bd=document.getElementById('calBackdrop');
  cal.classList.remove('open'); bd.style.display='none';
  setTimeout(()=>cal.style.display='none',220);
}
function buildCalendar() {
  const y=currentView.getFullYear(), m=currentView.getMonth();
  const today=new Date(), firstDay=new Date(y,m,1).getDay(), daysInM=new Date(y,m+1,0).getDate();
  const restDays=gSettings.restDays||[0,6], k=monthKey(y,m);
  let html=`<div class="cal-header-actions">
    <button class="cal-view-btn" onclick="switchToMonthView()">Mese</button>
    <button class="cal-view-btn" onclick="switchToYearView()">Anno</button>
    <button class="cal-close-btn" onclick="closeCalendar()">✕</button>
  </div>
  <div class="cal-nav">
    <button onclick="calShiftMonth(-1)">‹</button>
    <span>${MONTH_FULL[m]} ${y}</span>
    <button onclick="calShiftMonth(1)">›</button>
  </div><div class="cal-grid">`;
  ['D','L','M','M','G','V','S'].forEach(d=>{html+=`<div class="cal-head">${d}</div>`;});
  for(let i=0;i<firstDay;i++) html+='<div class="cal-cell"></div>';
  for(let d=1;d<=daysInM;d++) {
    const wd=new Date(y,m,d).getDay();
    const isToday=y===today.getFullYear()&&m===today.getMonth()&&d===today.getDate();
    const isCurr=viewMode==='day'&&y===currentView.getFullYear()&&m===currentView.getMonth()&&d===currentView.getDate();
    const isRest=restDays.includes(wd);
    const hasData=db[k]&&((db[k].expenses||[]).some(e=>{const dt=new Date(e.ts||e.id);return dt.getDate()===d&&dt.getMonth()===m&&dt.getFullYear()===y;})||(db[k].income||[]).some(i=>{const dt=new Date(i.ts||i.id);return dt.getDate()===d&&dt.getMonth()===m&&dt.getFullYear()===y;}));
    let cls='cal-cell cal-day';
    if(isRest) cls+=' cal-rest'; if(isToday) cls+=' cal-today'; if(isCurr) cls+=' cal-current';
    html+=`<div class="${cls}" onclick="selectCalDay(${y},${m},${d})">${d}${hasData&&!isCurr?'<span class="cal-dot"></span>':''}</div>`;
  }
  html+='</div>';
  document.getElementById('dayCalendar').innerHTML=html;
}
function calShiftMonth(dir) {
  const tmp=new Date(currentView.getFullYear(),currentView.getMonth()+dir,1);
  currentView.setFullYear(tmp.getFullYear()); currentView.setMonth(tmp.getMonth()); currentView.setDate(1);
  buildCalendar();
}
function selectCalDay(y,m,d) { currentView=new Date(y,m,d); viewMode='day'; closeCalendar(); render(); }
function switchToMonthView() { const y=currentView.getFullYear(),m=currentView.getMonth(); closeCalendar(); viewMode='month'; currentView=new Date(y,m,1); render(); }
function switchToYearView()  { const y=currentView.getFullYear(); closeCalendar(); viewMode='year'; currentView=new Date(y,0,1); render(); }
function openDayPicker()     { viewMode='day'; currentView=new Date(); render(); setTimeout(()=>openCalendar(),60); }

// ─── DAY PICKER SETTINGS ─────────────────────────────────────────────────────
function toggleDayBtn(btn) { btn.classList.toggle('active'); liveCalcPreview(); }
function populateSettingsDayPicker() {
  const restDays=gSettings.restDays||[0,6];
  document.querySelectorAll('#set_days .day-btn').forEach(btn=>btn.classList.toggle('active',restDays.includes(parseInt(btn.dataset.day))));
}
function getSelectedRestDays(id) {
  const days=[];
  document.querySelectorAll(`#${id} .day-btn.active`).forEach(b=>days.push(parseInt(b.dataset.day)));
  return days;
}
function toggleOvertime() {
  const f=document.getElementById('overtimeField'), c=document.getElementById('overtimeChevron');
  const open=f.style.display!=='none';
  f.style.display=open?'none':'block'; c.textContent=open?'+':'−';
}
function liveCalcPreview() {
  const oreG=sanitizeAmount(document.getElementById('set_ore')?.value);
  const stip=sanitizeAmount(document.getElementById('set_stip')?.value);
  const oreExtra=sanitizeAmount(document.getElementById('set_extra')?.value);
  const restDays=getSelectedRestDays('set_days');
  const el=document.getElementById('calcPreview');
  if(!el||oreG<=0) { if(el)el.style.display='none'; return; }
  const vY=currentView.getFullYear(), vM=currentView.getMonth();
  const oreC=calcOreMese(oreG,restDays,vY,vM,oreExtra);
  const wdC=countWorkDays(vY,vM,restDays);
  const prevY=vM===0?vY-1:vY, prevM=vM===0?11:vM-1;
  const oreP=calcOreMese(oreG,restDays,prevY,prevM,0);
  let html=`<strong>${wdC}</strong> giorni lav. · <strong>${oreC}h</strong>`;
  if(stip>0&&oreP>0) html+=`<br>€${stip.toFixed(0)} ÷ ${oreP}h (${MONTH_NAMES[prevM]}) = <strong>€${(stip/oreP).toFixed(2)}/h</strong>`;
  el.innerHTML=html; el.style.display='block';
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function openModal() {
  editContext = null;
  const tt = document.querySelector('.type-toggle');
  if (tt) tt.style.display = '';
  const ch = document.getElementById('catHScroll');
  if (ch) ch.style.display = '';

  resetEntryAmountInput();
  setDefaultModalDate();
  buildCatGrid();
  document.getElementById('modalBackdrop').classList.add('active');
  document.getElementById('modalSheet').classList.add('active');
  startKeyboardTracking();
  focusInputAndScrollConfirm('amountInput', 'modalConfirmBtn');
  const desiredAccountId = (filterAccountId !== 'all' && accounts.some(a => a.id === filterAccountId))
    ? filterAccountId
    : (accounts[0]?.id||'main');
  selectedAccountId = desiredAccountId;
  const acc = accounts.find(a => a.id === selectedAccountId) || accounts[0] || {emoji:'🏦',name:'Principale'};
  document.getElementById('accountSelectorLabel').textContent=`${acc.emoji} ${acc.name}`;
  document.getElementById('timeDeterrent').style.display='none';
  syncModalConfirmButton();
}
function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('active');
  document.getElementById('modalSheet').classList.remove('active');
  stopKeyboardTracking();
  editContext = null;
  const tt = document.querySelector('.type-toggle');
  if (tt) tt.style.display = '';
  const ch = document.getElementById('catHScroll');
  if (ch) ch.style.display = '';
}

// ─── TRANSFER MODAL ─────────────────────────────────────────────────────
function openTransferModal(edit=false, k=null, id=null) {
  if (accounts.length < 2) {
    alert('Aggiungi almeno 2 conti per poter trasferire.');
    return;
  }

  if (edit && k) {
    transferEditContext = { k, id };
    const t = (db[k]?.transfers || []).find(x => x.id === id);
    if (!t) return;
    transferDate = new Date(t.ts);
    transferFromAccountId = t.fromAccountId;
    transferToAccountId = t.toAccountId;
    resetTransferAmountInput();
    const impEl = document.getElementById('transferAmountInput');
    if (impEl) impEl.value = String(t.imp);
  } else {
    transferEditContext = null;
    transferDate = new Date();
    const from = (filterAccountId !== 'all' && accounts.some(a => a.id === filterAccountId))
      ? filterAccountId
      : selectedAccountId;
    transferFromAccountId = from || accounts[0].id;
    const to = accounts.find(a => a.id !== transferFromAccountId)?.id;
    transferToAccountId = to || transferFromAccountId;
    resetTransferAmountInput();
  }

  const fromAcc = getAccountById(transferFromAccountId);
  const toAcc = getAccountById(transferToAccountId);
  const fromBalance = getAccountBalance(transferFromAccountId);
  const toBalance = getAccountBalance(transferToAccountId);
  document.getElementById('transferFromSelectorLabel').innerHTML = `${fromAcc.emoji} ${fromAcc.name} <span style="font-size:12px;opacity:0.7;">(€${fmt(fromBalance)})</span>`;
  document.getElementById('transferToSelectorLabel').innerHTML = `${toAcc.emoji} ${toAcc.name} <span style="font-size:12px;opacity:0.7;">(€${fmt(toBalance)})</span>`;
  updateTransferDateSelectorLabel();

  document.getElementById('transferModalBackdrop').classList.add('active');
  document.getElementById('transferModalSheet').classList.add('active');
  startKeyboardTracking();
  focusInputAndScrollConfirm('transferAmountInput', 'transferConfirmBtn');
}

function closeTransferModal() {
  document.getElementById('transferModalBackdrop').classList.remove('active');
  document.getElementById('transferModalSheet').classList.remove('active');
  stopKeyboardTracking();
  transferEditContext = null;
  resetTransferAmountInput();
}

function openEditTransfer(k, id) {
  openTransferModal(true, k, id);
}

// ─── CONFERMA TRASFERIMENTO (LOGICA CORRETTA) ───────────────────────────
async function confirmTransfer() {
  try {
    const imp = getTransferAmountValue();
    if (!imp || imp <= 0) { shakeEl('transferAmountInput'); return; }
    if (transferFromAccountId === transferToAccountId) {
      shakeEl('transferToSelectorBtn');
      showSaveErrorToast('Il conto di origine e destinazione devono essere diversi.');
      return;
    }
    if (viewMode === 'year') { closeTransferModal(); return; }

    const ts = transferDate.getTime();
    const k = monthKey(transferDate.getFullYear(), transferDate.getMonth());
    initMonthKey(k);
    if (!db[k].transfers) db[k].transfers = [];

    // Rimuovi vecchio trasferimento se in modifica
    if (transferEditContext?.k && transferEditContext?.id != null) {
      const prevK = transferEditContext.k;
      const prevArr = db[prevK]?.transfers || [];
      const idx = prevArr.findIndex(t => t.id === transferEditContext.id);
      if (idx >= 0) {
        const oldTr = prevArr[idx];
        // Rimuovi le vecchie voci contabili
        if (db[prevK].expenses) {
          db[prevK].expenses = db[prevK].expenses.filter(e => !(e.isTransfer && e.transferId === oldTr.id));
        }
        if (db[prevK].income) {
          db[prevK].income = db[prevK].income.filter(i => !(i.isTransfer && i.transferId === oldTr.id));
        }
        prevArr.splice(idx, 1);
      }
    }

    // Crea nuovo trasferimento
    const transferId = transferEditContext?.id ?? Date.now();
    const transfer = {
      id: transferId,
      ts,
      imp,
      fromAccountId: transferFromAccountId,
      toAccountId: transferToAccountId,
    };
    db[k].transfers.push(transfer);

    // Registra le due voci contabili
    const expenseEntry = {
      id: Date.now() + Math.random(),
      ts,
      imp,
      cat: 'Trasferimento',
      emoji: '🔄',
      color: '#BF5AF2',
      accountId: transferFromAccountId,
      isTransfer: true,
      transferId: transferId,
      isExpenseTransfer: true
    };
    const incomeEntry = {
      id: Date.now() + Math.random(),
      ts,
      imp,
      cat: 'Trasferimento',
      emoji: '🔄',
      color: '#32D74B',
      accountId: transferToAccountId,
      isTransfer: true,
      transferId: transferId,
      isIncomeTransfer: true
    };
    if (!db[k].expenses) db[k].expenses = [];
    if (!db[k].income) db[k].income = [];
    db[k].expenses.push(expenseEntry);
    db[k].income.push(incomeEntry);

    transferEditContext = null;
    await save();
    closeTransferModal();
    render();
  } catch (e) {
    showDebugToast(e?.message || String(e));
    throw e;
  }
}

// ─── ENTRY EDITING (entrate/uscite + stipendio sintetico) ──────────────
function openEditEntry(type, k, id) {
  if (type === 'inc') {
    const salaryTs = getSalaryTsForMonth(k);
    if (id === salaryTs && getSalaryForMonth(k) > 0) {
      openEditSalary(k);
      return;
    }
  }

  const arr = type === 'inc' ? (db[k]?.income || []) : (db[k]?.expenses || []);
  const item = arr.find(x => x.id === id);
  if (!item) return;

  modalType = type;
  selectedCat = (type === 'inc' ? CATS_INC : CATS_USC).find(c => c.label === item.cat)
    || (type === 'inc' ? CATS_INC[0] : CATS_USC[0]);

  openModal();
  document.getElementById('typeBtnUsc').classList.toggle('active', type === 'usc');
  document.getElementById('typeBtnInc').classList.toggle('active', type === 'inc');

  modalDate = new Date(item.ts || item.id);
  updateDateSelectorLabel();

  selectedAccountId = item.accountId || 'main';
  const acc = getAccountById(selectedAccountId);
  document.getElementById('accountSelectorLabel').textContent = `${acc.emoji} ${acc.name}`;

  const impEl = document.getElementById('amountInput');
  if (impEl) impEl.value = String(item.imp ?? 0);
  updateTimeDeterrent();

  selectedCat = (type === 'usc' ? CATS_USC : CATS_INC).find(c => c.label === item.cat) || selectedCat;
  buildCatGrid();

  editContext = { kind:'entry', prevK:k, id, prevType:type };
}

function openEditSalary(k) {
  const salary = getSalaryForMonth(k);
  if (!salary) return;
  const salaryTs = getSalaryTsForMonth(k);
  const salaryAcc = getSalaryAccountForMonth(k);

  modalType = 'inc';
  selectedCat = CATS_INC[0];

  openModal();
  const tt = document.querySelector('.type-toggle');
  if (tt) tt.style.display = 'none';
  const ch = document.getElementById('catHScroll');
  if (ch) ch.style.display = 'none';

  modalDate = new Date(salaryTs);
  updateDateSelectorLabel();

  selectedAccountId = salaryAcc;
  const acc = getAccountById(selectedAccountId);
  document.getElementById('accountSelectorLabel').textContent = `${acc.emoji} ${acc.name}`;

  const impEl = document.getElementById('amountInput');
  if (impEl) impEl.value = String(salary);
  updateTimeDeterrent();

  editContext = { kind:'salary', prevK:k, id:salaryTs };
}


function syncModalConfirmButton() {
  const btn = document.getElementById('modalConfirmBtn');
  if (!btn) return;
  btn.textContent = 'Fatto';
  btn.classList.remove('btn-green', 'btn-red');
  btn.classList.add(modalType === 'inc' ? 'btn-green' : 'btn-red');
}
function setModalType(type) {
  modalType=type;
  document.getElementById('typeBtnUsc').classList.toggle('active',type==='usc');
  document.getElementById('typeBtnInc').classList.toggle('active',type==='inc');
  selectedCat=type==='usc'?CATS_USC[0]:CATS_INC[0];
  buildCatGrid();
  const keepAmount = editContext?.kind === 'entry';
  if (!keepAmount) resetEntryAmountInput();
  document.getElementById('timeDeterrent').style.display='none';
  syncModalConfirmButton();
  if (keepAmount) updateTimeDeterrent();
}
function buildCatGrid() {
  const cats = modalType === 'usc' ? CATS_USC : CATS_INC;
  const container = document.getElementById('catGrid');
  container.innerHTML = cats.map(c => `
    <button class="cat-card${c.id === selectedCat.id ? ' active' : ''}"
            style="--cat-color:${c.color}"
            onclick="selectModalCat('${c.id}')">
      <span class="cat-card-emoji">${c.emoji}</span>
      <span class="cat-card-label">${c.label}</span>
    </button>`).join('');
  requestAnimationFrame(() => {
    const active = container.querySelector('.cat-card.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
}
function selectModalCat(id) {
  selectedCat=(modalType==='usc'?CATS_USC:CATS_INC).find(c=>c.id===id)||CATS_USC[0];
  buildCatGrid();
}

// ─── TIME DETERRENT ──────────────────────────────────────────────────────────
function updateTimeDeterrent() {
  const td=document.getElementById('timeDeterrent');
  if(modalType!=='usc') { td.style.display='none'; return; }
  const imp=getEntryAmountValue();
  if(!imp||imp<=0) { td.style.display='none'; return; }
  const k=curMonthKey(), pagaH=getPagaHForMonth(k)||gSettings.pagaH||0;
  if(!pagaH) { td.style.display='none'; return; }
  const ore=imp/pagaH;
  let cls='time-deterrent';
  if(ore>40) cls+=' td-red'; else if(ore>8) cls+=' td-orange';
  td.className=cls; td.style.display='block';
  td.textContent=`⏱ ${ore.toFixed(1)} ore di lavoro`;
}

async function confirmEntry() {
  try {
    const imp=getEntryAmountValue();
    if(!imp||imp<=0) { shakeEl('amountInput'); return; }
    if(viewMode==='year') { closeModal(); return; }
    const ts=modalDate.getTime();
    const k=monthKey(modalDate.getFullYear(),modalDate.getMonth());
    initMonthKey(k);

    if(editContext?.kind === 'salary') {
      const prevK = editContext.prevK;
      db[k].salary = imp;
      db[k].salaryTs = ts;
      db[k].salaryAccountId = selectedAccountId;
      if(prevK && prevK !== k && db[prevK]?.salary != null) {
        delete db[prevK].salary;
        delete db[prevK].salaryTs;
        delete db[prevK].salaryAccountId;
      }
      const curK = curMonthKey();
      if(k === curK) {
        gSettings.stip = imp;
        gSettings.salaryAccountId = selectedAccountId;
        await Promise.all([save(), idbSet('pt_settings', gSettings)]);
      } else {
        await save();
      }
      closeModal(); render();
      return;
    }

    if(editContext?.kind === 'entry') {
      const prevK = editContext.prevK;
      const prevType = editContext.prevType;
      const prevArr = prevType === 'inc' ? (db[prevK]?.income || []) : (db[prevK]?.expenses || []);
      const idx = prevArr.findIndex(i => i.id === editContext.id);
      if(idx >= 0) prevArr.splice(idx, 1);

      const entry = { id: editContext.id, ts, imp, cat:selectedCat.label, emoji:selectedCat.emoji, color:selectedCat.color, accountId:selectedAccountId };
      if(modalType==='usc') db[k].expenses.push(entry);
      else db[k].income.push(entry);

      editContext = null;
      await save(); closeModal(); render();
      return;
    }

    const entry={id:Date.now(),ts,imp,cat:selectedCat.label,emoji:selectedCat.emoji,color:selectedCat.color,accountId:selectedAccountId};
    if(modalType==='usc') db[k].expenses.push(entry);
    else                   db[k].income.push(entry);
    await save(); closeModal(); render();
  } catch (e) {
    showDebugToast(e?.message || String(e));
    throw e;
  }
}

// ─── RECURRING CAT GRID ──────────────────────────────────────────────────────
function renderRecCatGrid() {
  const grid=document.getElementById('recCatGrid'); if(!grid) return;
  grid.innerHTML=CATS_USC.map(c=>`
    <button class="rec-cat-option" onclick="selectRecCat('${c.label}','${c.emoji}')">
      ${c.emoji}<span>${c.label}</span>
    </button>`).join('');
}
function openRecCatSheet() {
  document.getElementById('recCatBackdrop').classList.add('active');
  document.getElementById('recCatSheet').classList.add('active');
}
function closeRecCatSheet() {
  document.getElementById('recCatBackdrop').classList.remove('active');
  document.getElementById('recCatSheet').classList.remove('active');
}
function selectRecCat(label, emoji) {
  currentRecCat={label,emoji};
  document.getElementById('rec_label').textContent=label;
  document.getElementById('rec_emoji').textContent=emoji;
  closeRecCatSheet();
}

// ─── DATA HELPERS ────────────────────────────────────────────────────────────
function monthKey(y,m) { return `${y}-${m}`; }
function curMonthKey()  { return monthKey(currentView.getFullYear(),currentView.getMonth()); }
function initMonthKey(k) {
  if(!db[k]) db[k]={settings:null,income:[],expenses:[],transfers:[],appliedRec:[]};
  if(!db[k].income) db[k].income=[];
  if(!db[k].expenses) db[k].expenses=[];
  if(!db[k].transfers) db[k].transfers=[];
  if(!db[k].appliedRec) db[k].appliedRec=[];
}
function prevKey(k) { const [y,m]=k.split('-').map(Number); return m===0?`${y-1}-11`:`${y}-${m-1}`; }
function getWorkParams(k) {
  if(db[k]?.workParams) return db[k].workParams;
  const [ky,km]=k.split('-').map(Number);
  const sorted=Object.keys(db).filter(x=>db[x].workParams).filter(x=>{const[xy,xm]=x.split('-').map(Number);return xy<ky||(xy===ky&&xm<km);}).sort((a,b)=>{const[ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number);return(by*12+bm)-(ay*12+am);});
  if(sorted.length) return db[sorted[0]].workParams;
  return {oreGiorno:gSettings.oreGiorno||8,restDays:gSettings.restDays||[0,6],oreExtra:0};
}
function getSalaryForMonth(k) {
  if(db[k]?.salary!=null) return db[k].salary;
  if(db[k]?.settings?.stip&&!db[k].settings._fromGlobal) return db[k].settings.stip;
  return 0;
}
function getOreForMonth(k) {
  const wp=getWorkParams(k); const [y,m]=k.split('-').map(Number);
  return calcOreMese(wp.oreGiorno,wp.restDays,y,m,wp.oreExtra||0);
}
function getPagaHForMonth(k) {
  const stip=getSalaryForMonth(k), orePrec=getOreForMonth(prevKey(k));
  if(orePrec<=0||stip<=0) return 0;
  return stip/orePrec;
}
function getEffectiveSettings(k) {
  const stip=getSalaryForMonth(k), wp=getWorkParams(k), [y,m]=k.split('-').map(Number);
  const ore=calcOreMese(wp.oreGiorno,wp.restDays,y,m,wp.oreExtra||0);
  return {stip,oreGiorno:wp.oreGiorno,restDays:wp.restDays,ore,oreExtra:wp.oreExtra||0,pagaH:getPagaHForMonth(k)};
}
function getAvgSettings() {
  const keys=Object.keys(db).filter(k=>db[k]?.salary!=null&&db[k].salary>0);
  if(!keys.length) return {stip:gSettings.stip||0,pagaH:gSettings.pagaH||0,oreGiorno:gSettings.oreGiorno||8,count:0};
  const stips=keys.map(k=>getSalaryForMonth(k));
  const pagaHs=keys.map(k=>getPagaHForMonth(k)).filter(p=>p>0);
  const oreGs=keys.map(k=>getWorkParams(k).oreGiorno||8);
  return {stip:stips.reduce((a,b)=>a+b,0)/stips.length,pagaH:pagaHs.length?pagaHs.reduce((a,b)=>a+b,0)/pagaHs.length:0,oreGiorno:oreGs.reduce((a,b)=>a+b,0)/oreGs.length,count:keys.length};
}
function getMonthData(k) {
  const d=db[k]||{settings:null,income:[],expenses:[],appliedRec:[]};
  const s=getEffectiveSettings(k);
  const income=filterByAccount(d.income||[]);
  const expenses=filterByAccount(d.expenses||[]);
  const extraInc=income.reduce((a,b)=>a+b.imp,0);
  const uscite=expenses.reduce((a,b)=>a+b.imp,0);
  return {stip:s.stip,extraInc,totInc:s.stip+extraInc,uscite,net:s.stip+extraInc-uscite,pagaH:s.pagaH,income,expenses};
}

function filterByAccount(items) {
  if(filterAccountId==='all') return items;
  return items.filter(i=>(i.accountId||'main')===filterAccountId);
}

function isRecurringItemAppliedForFilter(k, r) {
  const exps = db[k]?.expenses || [];
  const scoped = filterByAccount(exps);
  return scoped.some(e => {
    if (!e?.isRec) return false;
    if (e.recurringId != null) return e.recurringId === r.id;
    return e.nome === r.nome && e.cat === r.cat;
  });
}

// ─── SETTINGS SAVE ───────────────────────────────────────────────────────────
async function saveSettings() {
  if(viewMode==='year') { alert("Passa alla vista mensile."); return; }
  const stip=sanitizeAmount(document.getElementById('set_stip').value);
  const oreG=sanitizeAmount(document.getElementById('set_ore').value);
  const oreExtra=sanitizeAmount(document.getElementById('set_extra')?.value);
  const restDays=getSelectedRestDays('set_days');
  if(oreG<=0) { shakeEl('settingsCard'); return; }
  const k=curMonthKey(); initMonthKey(k);
  db[k].workParams={oreGiorno:oreG,restDays,oreExtra};
  if(stip>0) db[k].salary=stip;
  if(stip>0) db[k].salaryAccountId = gSettings.salaryAccountId || 'main';
  gSettings={stip:stip||gSettings.stip,oreGiorno:oreG,restDays,pagaH:getPagaHForMonth(k),salaryAccountId:(gSettings.salaryAccountId || 'main')};
  db[k].settings={stip:getSalaryForMonth(k),oreGiorno:oreG,restDays,ore:getOreForMonth(k),oreExtra,pagaH:getPagaHForMonth(k)};
  await Promise.all([save(), idbSet('pt_settings',gSettings)]);
  liveCalcPreview(); render(); renderAvgBox();
}

// ─── RECURRING ───────────────────────────────────────────────────────────────
async function saveRecurring() {
  const imp=sanitizeAmount(document.getElementById('rec_imp').value);
  const nota=document.getElementById('rec_nota').value.trim();
  if(imp<=0) return;
  recurring.push({id:Date.now(),nome:nota||currentRecCat.label,imp,cat:currentRecCat.label,emoji:currentRecCat.emoji});
  await saveRecurringIDB();
  document.getElementById('rec_imp').value=''; document.getElementById('rec_nota').value='';
  renderRecurringList(); render();
}
async function deleteRecurring(id) {
  recurring=recurring.filter(r=>r.id!==id); await saveRecurringIDB(); renderRecurringList(); render();
}
async function applyRecurring() {
  if(viewMode==='year') return;
  const k=curMonthKey(); initMonthKey(k);
  const targetAccountId = (filterAccountId !== 'all' && accounts.some(a => a.id === filterAccountId))
    ? filterAccountId
    : selectedAccountId;
  selectedAccountId = targetAccountId;

  let added=0;
  recurring.forEach(r=>{
    const already = (db[k].expenses||[]).some(e => {
      if(!e?.isRec) return false;
      if ((e.accountId||'main') !== targetAccountId) return false;
      if(e.recurringId != null) return e.recurringId === r.id;
      return e.nome === r.nome && e.cat === r.cat;
    });
    if(already) return;

    db[k].expenses.push({
      id:Date.now()+Math.random(),
      ts:Date.now(),
      imp:r.imp,
      cat:r.cat,
      emoji:r.emoji||'📌',
      color:'#8E8E93',
      isRec:true,
      nome:r.nome,
      accountId:targetAccountId,
      recurringId:r.id,
    });

    if(Array.isArray(db[k].appliedRec) && !db[k].appliedRec.includes(r.id)) db[k].appliedRec.push(r.id);
    added++;
  });
  if(!added) return;
  await save(); render();
}
function renderRecurringList() {
  const el=document.getElementById('recurringList'); if(!el) return;
  if(!recurring.length) {
    el.innerHTML=`
      <div class="empty-state-box">
        <div class="empty-icon" style="opacity:.25;">＋</div>
        <div class="empty-title">Aggiungi una spesa fissa</div>
        <div class="empty-msg">Creala qui sotto: verrà applicata automaticamente ogni mese.</div>
        <button class="btn-primary empty-add-btn" onclick="document.getElementById('rec_nota')?.focus()">Aggiungi ora</button>
      </div>
    `;
    return;
  }
  const tot=recurring.reduce((a,r)=>a+r.imp,0);
  el.innerHTML=recurring.map(r=>`
    <div class="rec-row">
      <span class="rec-emoji">${r.emoji||'📌'}</span>
      <span class="rec-name">${r.nome}</span>
      <span class="rec-amt">€${fmtAmt(r.imp)}</span>
      <button class="del-btn-sm" onclick="deleteRecurring(${r.id})">✕</button>
    </div>`).join('')+`<div class="rec-total">Totale fisso €${fmtAmt(tot)}/mese</div>`;
}

// ─── ANALISI ─────────────────────────────────────────────────────────────────
function renderAvgBox() {
  const el=document.getElementById('avgInfoBox'); if(!el) return;
  const avg=getAvgSettings();
  if(avg.stip>0) {
    const base=avg.count>0?`media ${avg.count} ${avg.count===1?'mese':'mesi'}`:'dati attuali';
    el.innerHTML=`📊 <strong>${base}</strong> — Stipendio <strong>€${avg.stip.toFixed(0)}</strong> · <strong>€${avg.pagaH.toFixed(2)}/h</strong> · <strong>${avg.oreGiorno}h/gg</strong>`;
    el.style.display='block';
  } else { el.innerHTML='⚠️ Nessuno stipendio impostato.'; el.style.display='block'; }
}
function validaAcquisto() {
  const prezzo=sanitizeAmount(document.getElementById('det_prezzo').value);
  const out=document.getElementById('detOut');
  if(!prezzo) { shakeEl('det_prezzo'); return; }
  const avg=getAvgSettings();
  if(!avg.pagaH) { out.style.display='block'; out.innerHTML='Configura prima i parametri mensili.'; return; }
  const ore=prezzo/avg.pagaH, perc=(prezzo/avg.stip*100).toFixed(1), giorni=(ore/(avg.oreGiorno||8)).toFixed(1);
  out.style.display='block';
  out.innerHTML=`<strong>${ore.toFixed(1)} ore</strong> di lavoro (${giorni} giornate)<br><span style="font-size:13px;opacity:.8;">${perc}% del tuo stipendio medio</span>`;
}
function calcolaSostenibilita() {
  const target=sanitizeAmount(document.getElementById('obj_target').value);
  const anni=sanitizeAmount(document.getElementById('obj_anni').value);
  const out=document.getElementById('objOut');
  if(!target||!anni) return;
  const mensile=target/(anni*12);
  const avg=getAvgSettings();
  const extra=avg.stip>0?`<br><span style="font-size:13px;opacity:.75;">${(mensile/avg.stip*100).toFixed(1)}% dello stipendio medio</span>`:'';
  out.style.display='block';
  out.innerHTML=`<strong>€${mensile.toFixed(0)}/mese</strong> per ${anni} ${anni===1?'anno':'anni'}${extra}`;
}

// ─── DONUT CHART (SVG nativo) ─────────────────────────────────────────────────
function renderDonutChart() {
  const k=curMonthKey();
  const expenses=filterByAccount(db[k]?.expenses||[]);
  const svgEl=document.getElementById('donutSvg');
  const legend=document.getElementById('donutLegend');
  if(!svgEl||!legend) return;

  const totals={};
  expenses.forEach(e=>{
    if(!totals[e.cat]) totals[e.cat]={val:0,color:e.color,emoji:e.emoji};
    totals[e.cat].val+=e.imp;
  });
  const entries=Object.entries(totals).sort((a,b)=>b[1].val-a[1].val);
  const total=entries.reduce((a,[,v])=>a+v.val,0);

  if(!entries.length||total===0) {
    svgEl.innerHTML='<text x="100" y="108" text-anchor="middle" fill="var(--sub)" font-size="12" font-family="-apple-system,sans-serif">Nessuna uscita</text>';
    legend.innerHTML=''; return;
  }

  const cx=100, cy=100, R=80, r=52;
  let angle=-Math.PI/2, paths='';

  entries.forEach(([cat,{val,color}])=>{
    const a=val/total*Math.PI*2;
    if(a<0.005) return;
    const ea=angle+a;
    const x1=cx+R*Math.cos(angle), y1=cy+R*Math.sin(angle);
    const x2=cx+R*Math.cos(ea),   y2=cy+R*Math.sin(ea);
    const x3=cx+r*Math.cos(ea),   y3=cy+r*Math.sin(ea);
    const x4=cx+r*Math.cos(angle),y4=cy+r*Math.sin(angle);
    const large=a>Math.PI?1:0;
    paths+=`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)} A${r} ${r} 0 ${large} 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z" fill="${color}" opacity="0.92"/>`;
    angle=ea;
  });

  paths+=`<text x="${cx}" y="${cy-6}" text-anchor="middle" fill="var(--sub)" font-size="10" font-family="-apple-system,sans-serif" font-weight="600">USCITE</text>`;
  paths+=`<text x="${cx}" y="${cy+10}" text-anchor="middle" fill="var(--text)" font-size="13" font-family="-apple-system,sans-serif" font-weight="700">€${fmt(total)}</text>`;

  svgEl.innerHTML=paths;

  legend.innerHTML=entries.slice(0,6).map(([cat,{val,color,emoji}])=>`
    <div class="donut-leg-row">
      <span class="donut-dot" style="background:${color}"></span>
      <span class="donut-emoji">${emoji}</span>
      <span class="donut-cat">${cat}</span>
      <span class="donut-pct">${(val/total*100).toFixed(0)}%</span>
    </div>`).join('');
}

// ─── STORICO ─────────────────────────────────────────────────────────────────
function renderHistoryChart() {
  const el=document.getElementById('historyChart'), leg=document.getElementById('historyLegend');
  if(!el) return;
  const months=[], now=new Date();
  for(let i=11;i>=0;i--) {
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const k=monthKey(d.getFullYear(),d.getMonth());
    const m=getMonthData(k);
    const has=m.totInc>0||m.uscite>0;
    months.push({label:MONTH_NAMES[d.getMonth()],net:has?m.net:null,uscite:has?m.uscite:null});
  }
  const valid=months.filter(m=>m.net!==null);
  if(!valid.length) { el.innerHTML=emptyStateNoMoves('I dati appariranno man mano che aggiungi mesi.'); if(leg)leg.innerHTML=''; return; }
  const allV=valid.flatMap(m=>[Math.abs(m.net),m.uscite]).filter(v=>v>0);
  const maxV=Math.max(...allV)*1.2||1;
  const W=300,H=120,bP=20,cH=H-bP-6,gW=W/12,bW=Math.floor(gW*.3),gap=2;
  let svg=`<line x1="0" y1="${H-bP}" x2="${W}" y2="${H-bP}" stroke="var(--border)" stroke-width="1"/>`;
  months.forEach((m,i)=>{
    const cx=gW*i+gW/2;
    svg+=`<text x="${cx}" y="${H-5}" text-anchor="middle" fill="var(--sub)" font-size="7" font-family="-apple-system,sans-serif" opacity="${m.net!==null?1:.3}">${m.label}</text>`;
    if(m.net===null) return;
    const uH=Math.max(2,m.uscite/maxV*cH), nH=Math.max(2,Math.abs(m.net)/maxV*cH);
    const nC=m.net>=0?'#32D74B':'#FF453A', base=H-bP;
    svg+=`<rect x="${(cx-bW-gap/2).toFixed(1)}" y="${(base-uH).toFixed(1)}" width="${bW}" height="${uH.toFixed(1)}" rx="2" fill="#0A84FF" opacity=".7"/>`;
    svg+=`<rect x="${(cx+gap/2).toFixed(1)}" y="${(base-nH).toFixed(1)}" width="${bW}" height="${nH.toFixed(1)}" rx="2" fill="${nC}" opacity=".85"/>`;
  });
  el.innerHTML=`<svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible;">${svg}</svg>`;
  if(leg) leg.innerHTML=`<div class="chart-legend"><div class="legend-item"><div class="legend-dot" style="background:#0A84FF"></div><span>Uscite</span></div><div class="legend-item"><div class="legend-dot" style="background:#32D74B"></div><span>Flusso +</span></div><div class="legend-item"><div class="legend-dot" style="background:#FF453A"></div><span>Flusso −</span></div></div>`;
}

// ─── PIE (movimenti page) ────────────────────────────────────────────────────
function renderPie(expenses) {
  const section=document.getElementById('pieSection');
  const svgEl=document.getElementById('pieChart');
  const legend=document.getElementById('pieLegend');
  if(!section||!expenses.length) { if(section)section.style.display='none'; return; }
  const totals={};
  expenses.forEach(e=>{ if(!totals[e.cat])totals[e.cat]={val:0,color:e.color}; totals[e.cat].val+=e.imp; });
  const total=Object.values(totals).reduce((a,b)=>a+b.val,0);
  const entries=Object.entries(totals).sort((a,b)=>b[1].val-a[1].val);
  const cx=65,cy=65,r=56,ir=28;
  let angle=-Math.PI/2, slices='';
  entries.forEach(([cat,{val,color}])=>{
    const a=val/total*Math.PI*2; if(a<.01) return;
    const ea=angle+a;
    slices+=`<path d="M${cx},${cy} L${(cx+r*Math.cos(angle)).toFixed(1)},${(cy+r*Math.sin(angle)).toFixed(1)} A${r},${r} 0 ${a>Math.PI?1:0},1 ${(cx+r*Math.cos(ea)).toFixed(1)},${(cy+r*Math.sin(ea)).toFixed(1)} Z" fill="${color}" opacity=".9"/>`;
    angle=ea;
  });
  slices+=`<circle cx="${cx}" cy="${cy}" r="${ir}" fill="var(--card-bg)"/>`;
  slices+=`<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="var(--text)" font-size="9" font-weight="700" font-family="-apple-system,sans-serif">€${fmt(total)}</text>`;
  svgEl.innerHTML=slices;
  legend.innerHTML=entries.map(([cat,{val,color}])=>`<div class="pie-leg-row"><span class="pie-dot" style="background:${color}"></span><span class="pie-cat">${cat}</span><span class="pie-pct">${(val/total*100).toFixed(0)}%</span></div>`).join('');
  section.style.display='block';
}

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
async function exportCSV() {
  let csv='Data,Tipo,Categoria,Importo,Conto\n';
  const data=await idbGet('pt_db')||db;
  Object.keys(data).forEach(k=>{
    (data[k].income||[]).forEach(i=>{
      const d=i.ts?new Date(i.ts).toLocaleDateString('it-IT'):k;
      const acc=accounts.find(a=>a.id===(i.accountId||'main'))||{name:'Principale'};
      csv+=`${d},Entrata,"${i.cat}",${i.imp},"${acc.name}"\n`;
    });
    (data[k].expenses||[]).forEach(e=>{
      const d=e.ts?new Date(e.ts).toLocaleDateString('it-IT'):k;
      const acc=accounts.find(a=>a.id===(e.accountId||'main'))||{name:'Principale'};
      csv+=`${d},Uscita,"${e.cat}",${e.imp},"${acc.name}"\n`;
    });
  });
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`ProfitTrack_${new Date().toISOString().slice(0,10)}.csv`});
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function exportBackup() {
  const data={db:await idbGet('pt_db')||db,settings:gSettings,recurring,accounts};
  const a=Object.assign(document.createElement('a'),{
    href:"data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(data,null,2)),
    download:`ProfitTrack_Backup_${new Date().toISOString().slice(0,10)}.json`
  });
  document.body.appendChild(a); a.click(); a.remove();
}
function importBackup(event) {
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try {
      const imp=JSON.parse(e.target.result);
      if(imp.db)        { db=imp.db; await save(); }
      if(imp.settings)  { gSettings=imp.settings; await idbSet('pt_settings',gSettings); }
      if(imp.recurring) { recurring=imp.recurring; await saveRecurringIDB(); }
      if(imp.accounts)  { accounts=imp.accounts; await saveAccountsIDB(); }
      render(); renderHistoryChart();
      alert(`✅ Backup importato.`);
    } catch { alert('❌ File non valido.'); }
  };
  reader.readAsText(file); event.target.value='';
}
async function resetData() {
  if(confirm("Cancellare tutto permanentemente?")) {
    await Promise.all([idbSet('pt_db',{}),idbSet('pt_settings',null),idbSet('pt_recurring',[]),idbSet('pt_accounts',[{id:'main',name:'Principale',emoji:'🏦'}])]);
    location.reload();
  }
}

// ─── DELETE & SWIPE ──────────────────────────────────────────────────────────
async function deleteItem(id,type,k) {
  if(type==='inc') db[k].income=db[k].income.filter(i=>i.id!==id);
  else if(type==='usc') db[k].expenses=db[k].expenses.filter(i=>i.id!==id);
  else if(type==='tr') {
    if(!db[k].transfers) db[k].transfers = [];
    db[k].transfers = db[k].transfers.filter(t=>t.id!==id);
  }
  await save(); render();
}
let swipeData={};
function swipeStart(e,id) { swipeData[id]={startX:e.touches[0].clientX,dx:0}; }
function swipeMove(e,id) {
  if(!swipeData[id]) return;
  const dx=e.touches[0].clientX-swipeData[id].startX; swipeData[id].dx=dx; if(dx>=0) return;
  const t=Math.min(Math.abs(dx),80);
  const inner=document.getElementById('inner_'+id), bg=document.getElementById('delbg_'+id);
  if(inner) inner.style.transform=`translateX(-${t}px)`;
  if(bg)    bg.style.transform=`translateX(${100-(t/80)*100}%)`;
}
function swipeEnd(e,id,type,k) {
  if(!swipeData[id]) return;
  const dx=swipeData[id].dx;
  if(dx<-60) {
    const wrap=document.getElementById('wrap_'+id);
    if(wrap) { wrap.style.opacity='0'; wrap.style.transition='opacity .2s'; }
    setTimeout(()=>deleteItem(id,type,k),200);
  } else {
    const inner=document.getElementById('inner_'+id), bg=document.getElementById('delbg_'+id);
    if(inner) inner.style.transform=''; if(bg) bg.style.transform='';
  }
  if (Math.abs(dx) > 20) {
    swipeJustHappened = true;
    setTimeout(()=>{ swipeJustHappened = false; }, 260);
  }
  delete swipeData[id];
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function shakeEl(id) {
  const el=typeof id==='string'?document.getElementById(id):id; if(!el) return;
  el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),500);
}
function fmt(n) {
  const abs=Math.abs(n), has=(abs%1)>=0.005;
  return (has?abs.toFixed(2):abs.toFixed(0)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function fmtAmt(n) { const abs=Math.abs(n); return ((abs%1)>=0.005?abs.toFixed(2):abs.toFixed(0)); }
function emptyState(msg) { return `<div class="empty-state-box"><div class="empty-icon">○</div><div class="empty-msg">${msg}</div></div>`; }

function emptyStateMovement(type) {
  const isInc = type === 'inc';
  const title = isInc ? 'Nessuna entrata' : 'Nessuna uscita';
  const subtitle = 'Per questo conto, in questo periodo, non ci sono movimenti.';
  const modalTypeToSet = isInc ? 'inc' : 'usc';
  return `
    <div class="empty-state-box">
      <div class="empty-icon">○</div>
      <div class="empty-title">${title}</div>
      <div class="empty-msg">${subtitle}</div>
      <button class="btn-primary empty-add-btn" onclick="openModal(); setModalType('${modalTypeToSet}')">Aggiungi ora</button>
    </div>
  `;
}

function emptyStateTransfer() {
  return `
    <div class="empty-state-box">
      <div class="empty-icon">↔</div>
      <div class="empty-title">Nessun trasferimento</div>
      <div class="empty-msg">Sposta denaro tra i tuoi conti. Puoi modificare ogni trasferimento dal tap.</div>
      <button class="btn-primary empty-add-btn" onclick="openTransferModal(false)">Fai un trasferimento</button>
    </div>
  `;
}

function emptyStateNoMoves(subtitle) {
  const msg = subtitle || 'Ancora nessun movimento.';
  return `
    <div class="empty-state-box">
      <div class="empty-icon">○</div>
      <div class="empty-title">Nessun movimento</div>
      <div class="empty-msg">${msg}</div>
      <button class="btn-primary empty-add-btn" onclick="openModal()">Aggiungi ora</button>
    </div>
  `;
}
function formatTxDate(ts) {
  if(!ts) return '';
  const d=new Date(ts), today=new Date(), yesterday=new Date(today); yesterday.setDate(today.getDate()-1);
  if(d.toDateString()===today.toDateString()) return 'Oggi';
  if(d.toDateString()===yesterday.toDateString()) return 'Ieri';
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}
function groupByDate(items) {
  const groups={};
  items.forEach(item=>{
    const ts=item.ts||item.id, d=new Date(ts);
    const dk=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if(!groups[dk]) groups[dk]={label:formatTxDate(ts),items:[],ts};
    groups[dk].items.push(item);
  });
  return Object.values(groups).sort((a,b)=>b.ts-a.ts);
}
function renderRow(item,type,k) {
  const id=item.id, color=item.color||'#8E8E93';
  const label=(item.nome&&item.nome!==item.cat)?item.nome:item.cat;
  const acc=accounts.find(a=>a.id===(item.accountId||'main'));
  const accTag=acc&&accounts.length>1?`<span class="tx-acc-tag">${acc.emoji}</span>`:'';
  return `<div class="tx-swipe-wrap" id="wrap_${id}">
    <div class="tx-delete-bg" id="delbg_${id}">Elimina</div>
    <div class="tx-row-inner" onclick="tapToEditMovement(event,'${type}','${k}',${id})" ontouchstart="swipeStart(event,${id})" ontouchmove="swipeMove(event,${id})" ontouchend="swipeEnd(event,${id},'${type}','${k}')" id="inner_${id}">
      <div class="tx-emoji" style="background:linear-gradient(135deg,${color}30 0%,${color}18 100%);">${item.emoji||'💸'}</div>
      <div class="tx-info">
        <span class="tx-cat">${label}${accTag}</span>
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

function renderTransferRow(t, k) {
  const id=t.id;
  const fromAcc = getAccountById(t.fromAccountId);
  const toAcc = getAccountById(t.toAccountId);
  const label = `${fromAcc.emoji} ${fromAcc.name} → ${toAcc.emoji} ${toAcc.name}`;
  const color = 'var(--blue)';
  return `<div class="tx-swipe-wrap" id="wrap_${id}">
    <div class="tx-delete-bg" id="delbg_${id}">Elimina</div>
    <div class="tx-row-inner" onclick="tapToEditTransfer(event,'${k}',${id})" ontouchstart="swipeStart(event,${id})" ontouchmove="swipeMove(event,${id})" ontouchend="swipeEnd(event,${id},'tr','${k}')" id="inner_${id}">
      <div class="tx-emoji" style="background:linear-gradient(135deg,rgba(10,132,255,.25) 0%,rgba(10,132,255,.10) 100%);">🔄</div>
      <div class="tx-info">
        <span class="tx-cat">${label}</span>
        <span class="tx-sub" style="color:rgba(10,132,255,.9);">Trasferimento</span>
      </div>
      <div class="tx-right">
        <span class="tx-amt" style="color:${color};">€${fmtAmt(t.imp)}</span>
      </div>
    </div>
  </div>`;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  let dateStr='',totInc=0,totUsc=0,net=0,pagaH=0;
  let allIncome=[],allExpenses=[],currentK='';

  if(viewMode==='day') {
    const y=currentView.getFullYear(),m=currentView.getMonth(),d=currentView.getDate();
    const dayNow=new Date(),isToday=y===dayNow.getFullYear()&&m===dayNow.getMonth()&&d===dayNow.getDate();
    dateStr=isToday?`Oggi, ${d} ${MONTH_NAMES[m]}`:`${DAY_FULL[currentView.getDay()]} ${d} ${MONTH_NAMES[m]} ${y}`;
    currentK=monthKey(y,m); initMonthKey(currentK);
    pagaH=getPagaHForMonth(currentK);
    const tsS=new Date(y,m,d,0,0,0).getTime(), tsE=new Date(y,m,d,23,59,59).getTime();
    allIncome=filterByAccount((db[currentK].income||[]).filter(i=>{const ts=i.ts||i.id;return ts>=tsS&&ts<=tsE;})).map(i=>({...i,monthKey:currentK}));
    allExpenses=filterByAccount((db[currentK].expenses||[]).filter(e=>{const ts=e.ts||e.id;return ts>=tsS&&ts<=tsE;})).map(e=>({...e,monthKey:currentK}));
    totInc=allIncome.reduce((a,b)=>a+b.imp,0);
    totUsc=allExpenses.reduce((a,b)=>a+b.imp,0); net=totInc-totUsc;
    const wp=getWorkParams(currentK),rs=wp.restDays||[0,6],isWork=isWorkDay(currentView,rs);
    const dayCard=document.getElementById('dayWorkedCard');
    if(dayCard) {
      dayCard.style.display='block';
      if(isWork&&pagaH>0) { dayCard.className='day-worked-card day-work'; document.getElementById('dayWorkedText').textContent=`💼 Giorno lavorativo · Guadagnato €${(wp.oreGiorno*pagaH).toFixed(0)} oggi`; }
      else { dayCard.className='day-worked-card day-rest'; document.getElementById('dayWorkedText').textContent='😴 Giorno di riposo'; }
    }
  } else if(viewMode==='month') {
    currentK=curMonthKey(); initMonthKey(currentK);
    dateStr=`${MONTH_FULL[currentView.getMonth()]} ${currentView.getFullYear()}`;
    const salary=getSalaryForMonth(currentK); pagaH=getPagaHForMonth(currentK);
    const wp=getWorkParams(currentK);
    const salaryItem=getSalaryItemForMonth(currentK);
    allIncome=filterByAccount(db[currentK].income||[]).map(i=>({...i,monthKey:currentK}));
    if(salaryItem && (filterAccountId==='all' || salaryItem.accountId===filterAccountId)) {
      allIncome.push({...salaryItem, monthKey:currentK});
    }
    allExpenses=filterByAccount(db[currentK].expenses||[]).map(e=>({...e,monthKey:currentK}));
    totInc=allIncome.reduce((a,b)=>a+b.imp,0);
    totUsc=allExpenses.reduce((a,b)=>a+b.imp,0); net=totInc-totUsc;
    document.getElementById('dayWorkedCard').style.display='none';
    const sl=document.getElementById('settingsMonthLabel');
    if(sl) sl.textContent=`${MONTH_NAMES[currentView.getMonth()]} ${currentView.getFullYear()}`;
    const sir=document.getElementById('salaryInfoRow');
    if(sir) {
      const prevM=currentView.getMonth()===0?11:currentView.getMonth()-1;
      const prevYr=currentView.getMonth()===0?currentView.getFullYear()-1:currentView.getFullYear();
      sir.innerHTML=`📅 Stipendio per il lavoro di <strong>${MONTH_NAMES[prevM]} ${prevYr}</strong>`;
      sir.style.display='block';
    }
    document.getElementById('set_stip').value=salary>0?salary:'';
    document.getElementById('set_ore').value=wp.oreGiorno||'';
    const salaryAcc = getSalaryAccountForMonth(currentK);
    const salaryAccObj = getAccountById(salaryAcc);
    const salaryLabel = document.getElementById('salaryAccountSelectorLabel');
    if(salaryLabel) salaryLabel.textContent = `${salaryAccObj.emoji} ${salaryAccObj.name}`;
    if(wp.oreExtra>0) { const ef=document.getElementById('set_extra'); if(ef)ef.value=wp.oreExtra; document.getElementById('overtimeField').style.display='block'; document.getElementById('overtimeChevron').textContent='−'; }
    liveCalcPreview();
    const banner=document.getElementById('recurringApplyBanner');
    if(banner&&recurring.length) {
      const notApplied=recurring.filter(r=>!isRecurringItemAppliedForFilter(currentK,r));
      if(notApplied.length) { document.getElementById('recurringApplyText').textContent=`${notApplied.length} spese fisse non applicate`; banner.style.display='flex'; } else banner.style.display='none';
    } else if(banner) banner.style.display='none';
  } else {
    const year=currentView.getFullYear().toString();
    dateStr=`Anno ${year}`;
    document.getElementById('dayWorkedCard').style.display='none';
    Object.keys(db).forEach(k=>{
      if(!k.startsWith(year)) return;
      const inc=filterByAccount(db[k].income||[]),exp=filterByAccount(db[k].expenses||[]);
      const salary=getSalaryForMonth(k);
      const salaryAcc=getSalaryAccountForMonth(k);
      if(filterAccountId==='all' || salaryAcc===filterAccountId) totInc+=salary;
      totInc+=inc.reduce((a,b)=>a+b.imp,0);
      totUsc+=exp.reduce((a,b)=>a+b.imp,0);
      inc.forEach(i=>allIncome.push({...i,monthKey:k}));
      exp.forEach(e=>allExpenses.push({...e,monthKey:k}));
    });
    net=totInc-totUsc;
  }

  // Header
  document.getElementById('dateLabel').textContent=dateStr;
  const vb=document.getElementById('viewBadge');
  if(vb) vb.textContent=viewMode==='day'?'GIORNO':viewMode==='year'?'ANNO':'MESE';
  const calBtn=document.getElementById('calPickerBtn');
  if(calBtn) { calBtn.style.display=(viewMode==='day'||viewMode==='month')?'flex':'none'; }

  // Hero
  document.getElementById('heroAmount').textContent=`${net<0?'−':''}€${fmt(net)}`;
  document.getElementById('heroAmount').style.color=net>=0?'var(--green)':'var(--red)';
  document.getElementById('heroLabel').textContent=viewMode==='day'?'Saldo Giornaliero':'Flusso Netto';
  const heroSub=document.getElementById('heroSub');
  if(pagaH>0&&viewMode!=='year') { heroSub.textContent=`€${pagaH.toFixed(2)} / ora`; heroSub.style.display='block'; } else heroSub.style.display='none';
  const heroTrend=document.getElementById('heroTrend');
  if(heroTrend&&viewMode==='month'&&currentK) {
    const prevData=getMonthData(prevKey(currentK));
    if(prevData.totInc>0||prevData.uscite>0) {
      const diff=net-prevData.net, arrow=diff>=0?'↑':'↓', col=diff>=0?'var(--green)':'var(--red)';
      heroTrend.innerHTML=`<span style="color:${col}">${arrow} €${fmt(Math.abs(diff))}</span> <span style="opacity:.6;font-size:11px;">vs ${MONTH_NAMES[parseInt(prevKey(currentK).split('-')[1])]}</span>`;
      heroTrend.style.display='block';
    } else heroTrend.style.display='none';
  } else if(heroTrend) heroTrend.style.display='none';

  let perc=totInc>0?Math.min(100,totUsc/totInc*100):0;
  document.getElementById('heroBar').style.width=perc+'%';
  document.getElementById('heroBar').style.background=perc>80?'var(--red)':perc>50?'var(--orange)':'var(--green)';
  document.getElementById('heroBarLabel').textContent=`${perc.toFixed(0)}% speso`;

  document.getElementById('statIn').textContent=`€${fmt(totInc)}`;
  document.getElementById('statOut').textContent=`€${fmt(totUsc)}`;
  const chipOra=document.getElementById('chipOra');
  if(pagaH>0&&viewMode!=='year') { document.getElementById('statOra').textContent=`€${pagaH.toFixed(2)}`; chipOra.style.display='flex'; } else chipOra.style.display='none';

  // Safe-to-spend
  const ssCard=document.getElementById('safeSpendCard');
  if(ssCard&&viewMode==='month') {
    const today=new Date(), isCurMon=today.getMonth()===currentView.getMonth()&&today.getFullYear()===currentView.getFullYear();
    if(isCurMon&&totInc>0) {
      const totFixed=recurring.reduce((a,r)=>a+r.imp,0);
      const appliedFixed=filterByAccount((db[currentK].expenses||[]).filter(e=>e.isRec)).reduce((a,b)=>a+b.imp,0);
      const realAvailable=net-(totFixed-appliedFixed);
      ssCard.style.display='block';
      document.getElementById('safeSpendAmt').textContent=`€${fmt(Math.max(0,realAvailable))}`;
      document.getElementById('safeSpendAmt').style.color=realAvailable<0?'var(--red)':'var(--blue)';
      const daysLeft=new Date(today.getFullYear(),today.getMonth()+1,0).getDate()-today.getDate()+1;
      const perDay=realAvailable>0?realAvailable/daysLeft:0;
      let sub=`Flusso €${fmt(net)}`;
      if(totFixed-appliedFixed>0) sub+=` − €${fmt(totFixed-appliedFixed)} spese fisse`;
      if(perDay>0) sub+=` · €${perDay.toFixed(0)}/giorno`;
      document.getElementById('safeSpendSub').textContent=sub;
    } else ssCard.style.display='none';
  } else if(ssCard) ssCard.style.display='none';

  // Positive feedback
  const pb=document.getElementById('positiveBanner');
  if(pb) {
    const sp=totInc>0?(net/totInc)*100:0;
    if(sp>=20&&viewMode!=='day') {
      const msgs=[`🎉 Stai risparmiando il ${sp.toFixed(0)}% delle entrate.`,`💪 Ogni euro risparmiato conta.`,`✨ In positivo del ${sp.toFixed(0)}%. Continua così!`];
      pb.style.display='block'; pb.textContent=msgs[new Date().getDate()%msgs.length];
    } else pb.style.display='none';
  }

  // Badge impostazioni
  const badge=document.getElementById('settingsBadge');
  if(badge&&viewMode==='month'&&currentK) {
    const n=recurring.filter(r=>!isRecurringItemAppliedForFilter(currentK,r)).length;
    badge.style.display=n?'block':'none'; badge.textContent=n||'';
  }

  // Account bar
  renderAccountBar();

  // Recent list
  const recent=[...allExpenses.map(e=>({...e,_type:'usc'})),...allIncome.map(i=>({...i,_type:'inc'}))].sort((a,b)=>(b.ts||b.id)-(a.ts||a.id)).slice(0,6);
  const rtEl=document.getElementById('recentTitle');
  if(rtEl) rtEl.textContent=viewMode==='day'?'Movimenti del giorno':'Recenti';
  const rl=document.getElementById('recentList');
  if(rl) rl.innerHTML=recent.length?recent.map(e=>renderRow(e,e._type,e.monthKey)).join(''):emptyStateNoMoves('Ancora nessun movimento. Aggiungi ora la tua prima entrata o uscita.');

  // Movimenti
  if(document.getElementById('page-movimenti').classList.contains('active')) {
    const mKey=currentK||curMonthKey();
    const makeGrouped=(items,type)=>{
      if(!items.length) return emptyStateMovement(type);
      return groupByDate(items.map(i=>({...i,_type:type}))).map(g=>`<div class="date-separator">${g.label}</div>${g.items.map(i=>renderRow(i,type,mKey)).join('')}`).join('');
    };
    document.getElementById('incomeList').innerHTML=makeGrouped(allIncome,'inc');
    document.getElementById('expenseList').innerHTML=makeGrouped(allExpenses,'usc');
    const mil=document.getElementById('movIncLabel'), mol=document.getElementById('movOutLabel');
    if(mil) mil.textContent=`€${fmt(totInc)}`; if(mol) mol.textContent=`€${fmt(totUsc)}`;

    // Trasferimenti
    const allTransfers = db[mKey]?.transfers || [];
    const transfers = filterAccountId === 'all'
      ? allTransfers
      : allTransfers.filter(t => t.fromAccountId === filterAccountId || t.toAccountId === filterAccountId);
    const trEl = document.getElementById('transferList');
    if (trEl) {
      if (!transfers.length) trEl.innerHTML = emptyStateTransfer();
      else {
        trEl.innerHTML = groupByDate(transfers).map(g => `
          <div class="date-separator">${g.label}</div>
          ${g.items.map(t => renderTransferRow(t, mKey)).join('')}
        `).join('');
      }
    }
    const mtr = document.getElementById('movTrLabel');
    if (mtr) mtr.textContent = `€${fmt(transfers.reduce((a,t)=>a+t.imp,0))}`;

    renderPie(allExpenses);
  }

  // Analisi
  if(document.getElementById('page-analisi')?.classList.contains('active')) {
    renderHistoryChart(); renderAvgBox(); renderDonutChart();
  }
}