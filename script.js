const R = 0.07;
const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

let db = JSON.parse(localStorage.getItem('pt_v10_db')) || {};
let globalSettings = JSON.parse(localStorage.getItem('pt_v10_settings')) || { stip: 0, ore: 1, pagaH: 0 }; 
let currentView = new Date();
let viewMode = 'month'; // 'month' o 'year'

let currentEntCat = { label: 'Extra', svg: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>' };
let currentUscCat = { label: 'Cibo', svg: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>' };

window.onload = function() { render(); };

// NAVIGAZIONE E VISTA
function showPage(pageId, element) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  element.classList.add('active');
  window.scrollTo(0, 0);
  render();
}

function toggleViewMode() {
  viewMode = viewMode === 'month' ? 'year' : 'month';
  render();
}

function changeDate(dir) {
  if (viewMode === 'month') {
    currentView.setDate(1); currentView.setMonth(currentView.getMonth() + dir);
  } else {
    currentView.setFullYear(currentView.getFullYear() + dir);
  }
  render();
}

// DROPDOWN CUSTOM
function toggleDropdown(id) {
  const drop = document.getElementById(id);
  const isAct = drop.classList.contains('active');
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
  if (!isAct) drop.classList.add('active');
}

function selectCategory(type, label, svgPath) {
  if (type === 'ent') {
    currentEntCat = { label, svg: svgPath };
    document.getElementById('ent_label_display').innerText = label;
    document.getElementById('ent_icon_display').innerHTML = svgPath;
  } else {
    currentUscCat = { label, svg: svgPath };
    document.getElementById('usc_label_display').innerText = label;
    document.getElementById('usc_icon_display').innerHTML = svgPath;
  }
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
}

window.onclick = function(event) {
  if (!event.target.closest('.custom-select-container')) {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
  }
}

// LOGICA DATI
function getMonthlyDataKey() { return `${currentView.getFullYear()}-${currentView.getMonth()}`; }

function initMonthData(key) {
  if(!db[key]) db[key] = { monthlySettings: null, expenses: [], income: [] };
}

function saveMonthlySalary() {
  if(viewMode === 'year') return alert("Passa alla vista Mensile per salvare lo stipendio.");
  const stipVal = parseFloat(document.getElementById("set_stip_mese").value) || 0;
  const oreVal = parseFloat(document.getElementById("set_ore_mese").value) || 0;
  if(stipVal <= 0 || oreVal <= 0) return alert("Inserisci stipendio e ore validi per questo mese.");
  
  const key = getMonthlyDataKey();
  initMonthData(key);
  db[key].monthlySettings = { stip: stipVal, ore: oreVal, pagaH: stipVal/oreVal };
  
  if(globalSettings.stip === 0) {
      globalSettings = { stip: stipVal, ore: oreVal, pagaH: stipVal/oreVal };
      localStorage.setItem('pt_v10_settings', JSON.stringify(globalSettings));
  }
  localStorage.setItem('pt_v10_db', JSON.stringify(db));
  render();
}

function addIncome() {
  if(viewMode === 'year') return alert("Passa alla vista Mensile per aggiungere movimenti.");
  const nome = document.getElementById("in_nome_ent").value;
  const imp = parseFloat(document.getElementById("in_importo_ent").value);
  if(!nome || !imp) return;

  const key = getMonthlyDataKey();
  initMonthData(key);
  db[key].income.push({ id: Date.now(), nome, imp, cat: currentEntCat.label, svg: currentEntCat.svg });
  localStorage.setItem('pt_v10_db', JSON.stringify(db));
  
  document.getElementById("in_nome_ent").value = "";
  document.getElementById("in_importo_ent").value = "";
  render();
}

function addExpense() {
  if(viewMode === 'year') return alert("Passa alla vista Mensile per aggiungere movimenti.");
  const nome = document.getElementById("in_nome_usc").value;
  const imp = parseFloat(document.getElementById("in_importo_usc").value);
  if(!nome || !imp) return;

  const key = getMonthlyDataKey();
  initMonthData(key);
  db[key].expenses.push({ id: Date.now(), nome, imp, cat: currentUscCat.label, svg: currentUscCat.svg });
  localStorage.setItem('pt_v10_db', JSON.stringify(db));
  
  document.getElementById("in_nome_usc").value = "";
  document.getElementById("in_importo_usc").value = "";
  render();
}

function deleteItem(id, type, monthKey) {
  if(type === 'inc') db[monthKey].income = db[monthKey].income.filter(i => i.id !== id);
  else db[monthKey].expenses = db[monthKey].expenses.filter(i => i.id !== id);
  localStorage.setItem('pt_v10_db', JSON.stringify(db));
  render();
}

// STRUMENTI E EXPORT
function exportBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem('pt_v10_db'));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `ProfitTrack_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
}
function exportCSV() {
    let csv = "Anno-Mese,Tipo,Nome,Categoria,Importo\n";
    Object.keys(db).forEach(key => {
        db[key].income.forEach(i => { csv += `${key},Entrata,"${i.nome}","${i.cat}",${i.imp}\n`; });
        db[key].expenses.forEach(e => { csv += `${key},Uscita,"${e.nome}","${e.cat}",${e.imp}\n`; });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `ProfitTrack_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function resetData() { if(confirm("Cancellare tutto lo storico permanentemente?")) { localStorage.clear(); location.reload(); } }

function validaAcquisto() {
  const prezzo = parseFloat(document.getElementById('det_prezzo').value);
  const out = document.getElementById('detOut');

  if (!prezzo || prezzo <= 0) {
    out.style.display = 'block';
    out.innerHTML = "Inserisci un prezzo valido.";
    return;
  }

  const pagaH = globalSettings.pagaH;
  const stip = globalSettings.stip;

  if (!pagaH || pagaH <= 0 || !stip || stip <= 0) {
    out.style.display = 'block';
    out.innerHTML = "Imposta prima i parametri dello stipendio nella schermata Riepilogo.";
    return;
  }

  const oreLavoro = prezzo / pagaH;
  const percStipendio = (prezzo / stip) * 100;

  out.style.display = 'block';
  out.innerHTML = `Questo acquisto ti costa <strong>${oreLavoro.toFixed(1)} ore</strong> di lavoro.<br>Assorbe il <strong>${percStipendio.toFixed(1)}%</strong> del tuo stipendio base mensile.`;
}

function calcolaSostenibilita() {
  const target = parseFloat(document.getElementById('obj_target').value);
  const anni = parseFloat(document.getElementById('obj_anni').value);
  const out = document.getElementById('objOut');

  if (!target || !anni || target <= 0 || anni <= 0) {
    out.innerHTML = "<div style='color:var(--red); font-size:14px; text-align:center;'>Inserisci valori validi per obiettivo e anni.</div>";
    return;
  }

  const mesiTotali = anni * 12;
  const risparmioMensile = target / mesiTotali;
  const stip = globalSettings.stip;

  let extraText = "";
  if (stip && stip > 0) {
    const perc = (risparmioMensile / stip) * 100;
    extraText = `<br><br>Pari al <strong>${perc.toFixed(1)}%</strong> del tuo stipendio base.`;
  }

  out.innerHTML = `<div style='padding:15px; background:rgba(50,215,75,0.1); border:1px solid rgba(50,215,75,0.3); border-radius:14px; text-align:center; color:var(--green); line-height:1.4; font-size:14px;'>Devi mettere da parte <strong>€${risparmioMensile.toFixed(0)}</strong> al mese.${extraText}</div>`;
}

// RENDER GLOBALE
function render() {
  let dateStr = "";
  let baseSet = false;
  let totEntrateBase = 0;
  let totEntrateExtra = 0;
  let totUscite = 0;
  let currentPagaH = globalSettings.pagaH;
  
  let combinedIncome = [];
  let combinedExpenses = [];

  if (viewMode === 'month') {
    const key = getMonthlyDataKey();
    initMonthData(key);
    const data = db[key];
    dateStr = `${monthNames[currentView.getMonth()]} ${currentView.getFullYear()}`;
    
    if (data.monthlySettings) {
      baseSet = true;
      totEntrateBase = data.monthlySettings.stip;
      currentPagaH = data.monthlySettings.pagaH;
      document.getElementById("set_stip_mese").value = data.monthlySettings.stip;
      document.getElementById("set_ore_mese").value = data.monthlySettings.ore;
    } else {
      document.getElementById("set_stip_mese").value = '';
      document.getElementById("set_ore_mese").value = '';
    }
    
    combinedIncome = data.income.map(i => ({...i, monthKey: key}));
    combinedExpenses = data.expenses.map(e => ({...e, monthKey: key}));
    totEntrateExtra = data.income.reduce((a, b) => a + b.imp, 0);
    totUscite = data.expenses.reduce((a, b) => a + b.imp, 0);
    
    document.getElementById("settingsCard").style.display = "block";
    
  } else {
    const year = currentView.getFullYear().toString();
    dateStr = `ANNO ${year}`;
    baseSet = true;
    document.getElementById("settingsCard").style.display = "none";
    
    Object.keys(db).forEach(key => {
      if (key.startsWith(year)) {
        if(db[key].monthlySettings) totEntrateBase += db[key].monthlySettings.stip;
        db[key].income.forEach(i => { combinedIncome.push({...i, monthKey: key}); totEntrateExtra += i.imp; });
        db[key].expenses.forEach(e => { combinedExpenses.push({...e, monthKey: key}); totUscite += e.imp; });
      }
    });
  }

  document.getElementById("dateHeader").innerHTML = `${dateStr}<small>${viewMode === 'year' ? 'VISTA ANNUALE' : (baseSet ? '✅ Paga Base Impostata' : '⚠️ Paga Base Non Impostata')}</small>`;
  document.getElementById("setupDateLabel").innerText = dateStr;
  document.getElementById("listDateLabelEnt").innerText = dateStr;
  document.getElementById("listDateLabelUsc").innerText = dateStr;

  const totEntrateEffettive = totEntrateBase + totEntrateExtra;
  const flussoNetto = totEntrateEffettive - totUscite;
  const oreLavoroUscite = currentPagaH > 0 ? totUscite / currentPagaH : 0;

  if(currentPagaH > 0 && viewMode === 'month') {
    document.getElementById("boxPaga").style.display = "block";
    document.getElementById("valoreOra").innerText = `€${currentPagaH.toFixed(2)}`;
  } else {
    document.getElementById("boxPaga").style.display = "none";
  }
  
  document.getElementById("monthInVal").innerText = `€${totEntrateEffettive.toFixed(0)}`;
  document.getElementById("monthOutVal").innerText = `€${totUscite.toFixed(0)}`;
  document.getElementById("monthHoursVal").innerText = `${oreLavoroUscite.toFixed(1)}h`;
  
  const netEl = document.getElementById("monthNetVal");
  netEl.innerText = `€${flussoNetto.toFixed(0)}`;
  netEl.style.color = flussoNetto >= 0 ? 'var(--green)' : 'var(--red)';

  let percSpesa = totEntrateEffettive > 0 ? (totUscite / totEntrateEffettive) * 100 : 0;
  if(percSpesa > 100) percSpesa = 100;
  document.getElementById("budgetPerc").innerText = `${percSpesa.toFixed(1)}%`;
  document.getElementById("budgetBar").style.width = `${percSpesa}%`;
  document.getElementById("budgetBar").style.background = percSpesa > 80 ? 'var(--red)' : (percSpesa > 50 ? 'var(--orange)' : 'var(--green)');

  if(document.getElementById("page-list").classList.contains('active')) {
      const renderRow = (i, type) => `
        <div class="item-row">
          <div style="display:flex; align-items:center; flex-grow:1;">
            <div class="item-icon"><svg class="cat-svg" viewBox="0 0 24 24">${i.svg || ''}</svg></div>
            <div class="item-info">
              <span class="item-name">${i.nome}</span>
              <span class="item-meta">${i.cat}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center;">
            <span class="item-price" style="color:var(--${type==='usc'?'red':'green'})">€${i.imp.toFixed(0)}</span>
            <button class="del-btn" onclick="deleteItem(${i.id}, '${type==='usc'?'exp':'inc'}', '${i.monthKey}')">✕</button>
          </div>
        </div>`;

      document.getElementById("incomeList").innerHTML = combinedIncome.length ? combinedIncome.map(i=>renderRow(i,'inc')).join('') : "<small style='color:var(--sub)'>Nessuna entrata.</small>";
      document.getElementById("expenseList").innerHTML = combinedExpenses.length ? combinedExpenses.map(i=>renderRow(i,'usc')).join('') : "<small style='color:var(--sub)'>Nessuna uscita.</small>";
      document.getElementById("topSpesaContainer").innerHTML = "";
      document.getElementById("resFisso").innerText = "";
  }
}
