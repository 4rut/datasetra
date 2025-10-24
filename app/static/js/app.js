
// Minimal front logic focusing on header menus and basic CSV import/export.
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const state = {
  fileId: null,
  columns: [],
  rowsTotal: 0,
  delimiter: ',',
  sortBy: null,
  sortDir: 'asc',
};

function toast(msg, timeout=2400){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), timeout);
}

function setBusy(on){
  const b = $('#busy');
  b.classList.toggle('hidden', !on);
  b.setAttribute('aria-hidden', String(!on));
}

function toggleMenu(menuEl, force){
  const open = force ?? (menuEl.getAttribute('aria-expanded') !== 'true');
  menuEl.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeAllMenus(){
  $$('.menu[aria-expanded="true"]').forEach(m => m.setAttribute('aria-expanded', 'false'));
}

function initMenus(){
  $$('.menu > button').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const menu = btn.parentElement;
      const isOpen = menu.getAttribute('aria-expanded') === 'true';
      closeAllMenus();
      toggleMenu(menu, !isOpen);
    });
  });
  document.addEventListener('click', closeAllMenus);
}

async function uploadCSV(file){
  if(!file) return;
  setBusy(true);
  try{
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/upload', { method: 'POST', body: fd });
    if(!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    state.fileId = data.file_id;
    state.columns = data.columns || [];
    state.rowsTotal = data.total_rows || 0;
    state.delimiter = data.delimiter || ',';
    updateMetaChip();
    renderTablePreview(data.preview || []);
    toast('CSV uploaded');
  }catch(err){
    console.error(err);
    toast('Upload failed');
  }finally{
    setBusy(false);
  }
}

function updateMetaChip(){
  const chip = $('#fileMeta');
  if(!state.fileId){ chip.style.display = 'none'; return; }
  chip.textContent = `Columns: ${state.columns.length} • Rows: ${state.rowsTotal}`;
  chip.style.display = 'inline-flex';
}

function renderTablePreview(rows){
  if(!rows || !rows.length){ 
    $('#uploaderCard').style.display = '';
    $('#tableCard').style.display = 'none';
    return;
  }
  $('#uploaderCard').style.display = 'none';
  $('#tableCard').style.display = '';

  const header = $('#tableHeader');
  const body = $('#tableBody');
  const footer = $('#tableFooter');
  header.innerHTML = '';
  body.innerHTML = '';
  footer.innerHTML = '';

  const headerRow = document.createElement('div');
  headerRow.className = 'row';
  (state.columns || Object.keys(rows[0] || {})).forEach(c => {
    const cell = document.createElement('div');
    cell.className = 'cell header-cell';
    cell.textContent = c;
    headerRow.appendChild(cell);
  });
  header.appendChild(headerRow);

  rows.forEach(r => {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';
    (state.columns || Object.keys(r)).forEach(c => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const v = r[c] != null ? String(r[c]) : '';
      cell.title = v;
      cell.textContent = v;
      rowEl.appendChild(cell);
    });
    body.appendChild(rowEl);
  });

  const info = document.createElement('div');
  info.style.marginLeft = 'auto';
  info.textContent = `Preview • showing ${rows.length} of ${state.rowsTotal}`;
  footer.appendChild(info);
}

async function exportCSV(){
  if(!state.fileId){ toast('Nothing to export'); return; }
  setBusy(true);
  try{
    const payload = {
      file_id: state.fileId,
      query: null,
      columns: null,
      sort_by: state.sortBy,
      sort_dir: state.sortDir
    };
    const resp = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'datasetra_export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(err){
    console.error(err);
    toast('Export failed');
  }finally{
    setBusy(false);
  }
}

function exportPlaceholder(kind){
  // Placeholder until charts module is wired up.
  toast(`${kind.toUpperCase()} export will be available soon`);
}

function initImport(){
  const hiddenInput = $('#fileInput');
  $('#menuImport [data-import="csv"]').addEventListener('click', () => hiddenInput.click());
  hiddenInput.addEventListener('change', () => uploadCSV(hiddenInput.files[0]));

  // Drag & drop
  const drop = $('#uploaderCard');
  const browse = $('#dropBrowse');
  if(browse){
    browse.addEventListener('change', () => uploadCSV(browse.files[0]));
  }
  if(drop){
    ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', e => {
      const file = e.dataTransfer?.files?.[0];
      if(file) uploadCSV(file);
    });
  }
}

function initExport(){
  $('#menuExport [data-export="csv"]').addEventListener('click', exportCSV);
  $('#menuExport [data-export="png"]').addEventListener('click', () => exportPlaceholder('png'));
  $('#menuExport [data-export="svg"]').addEventListener('click', () => exportPlaceholder('svg'));
}

function initAccount(){
  $('#menuAccount [data-action="signin"]').addEventListener('click', () => toast('Sign-in coming soon'));
  $('#menuAccount [data-action="about"]').addEventListener('click', () => toast('Datasetra — CSV tool for data wrangling'));
}

function initYear(){
  const y = new Date().getFullYear();
  const el = document.getElementById('year');
  if(el) el.textContent = y;
}

window.addEventListener('DOMContentLoaded', () => {
  initMenus();
  initImport();
  initExport();
  initAccount();
  initYear();
  // For demo convenience
  // fetch('/api/sample').then(r=>r.json()).then(d=>{ state.fileId=d.file_id; state.columns=d.columns; state.rowsTotal=d.total_rows; renderTablePreview(d.preview); updateMetaChip(); });
});
