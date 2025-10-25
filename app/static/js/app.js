
// Minimal front logic focusing on header menus and basic CSV import/export.
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const state = {
  fileId: null,
  columns: [],
  hiddenColumns: new Set(),
  rows: [],
  rowsTotal: 0,
  delimiter: ',',
  sortBy: null,
  sortDir: 'asc',
  pageSize: 100,
  currentPage: 0,
  offset: 0,
};

function toast(msg, timeout=2400){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), timeout);
}

function getVisibleColumns(){
  return state.columns.filter(c => !state.hiddenColumns.has(c));
}

function updateColumnToggleLabel(){
  const label = $('#columnToggleLabel');
  if(!label) return;
  const visibleCount = getVisibleColumns().length;
  if(!state.columns.length){
    label.textContent = 'Columns';
    return;
  }
  label.textContent = `Columns (${visibleCount}/${state.columns.length})`;
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
    state.hiddenColumns = new Set();
    state.rows = data.preview || [];
    state.rowsTotal = data.total_rows || 0;
    state.delimiter = data.delimiter || ',';
    const previewCount = Array.isArray(data.preview) ? data.preview.length : 0;
    const totalRows = typeof data.total_rows === 'number' ? data.total_rows : 0;
    const baseSize = previewCount > 0 ? previewCount : (state.pageSize || 100);
    const cappedBase = totalRows > 0 ? Math.min(baseSize, totalRows) : baseSize;
    const candidateSize = cappedBase > 0 ? cappedBase : 100;
    state.pageSize = Math.max(1, Math.min(100, candidateSize));
    state.currentPage = 0;
    state.offset = 0;
    renderColumnMenu();
    updateColumnToggleLabel();
    updateMetaChip();
    ensureTableVisible();
    renderTable();
    await loadPage(0, { showSpinner: false });
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
  const visibleCount = getVisibleColumns().length;
  chip.textContent = `Columns: ${visibleCount}/${state.columns.length} • Rows: ${state.rowsTotal}`;
  chip.style.display = 'inline-flex';
}

function ensureTableVisible(){
  const uploadCard = $('#uploaderCard');
  const tableCard = $('#tableCard');
  if(!uploadCard || !tableCard) return;
  const showTable = Boolean(state.fileId);
  uploadCard.style.display = showTable ? 'none' : '';
  tableCard.style.display = showTable ? '' : 'none';
}

function renderColumnMenu(){
  const menu = $('#columnMenu');
  if(!menu) return;
  menu.innerHTML = '';

  if(!state.columns.length){
    const empty = document.createElement('div');
    empty.className = 'menu-empty';
    empty.textContent = 'No columns available';
    menu.appendChild(empty);
    return;
  }

  state.columns.forEach(column => {
    const visible = !state.hiddenColumns.has(column);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item column-option';
    btn.dataset.column = column;
    btn.setAttribute('role', 'menuitemcheckbox');
    btn.setAttribute('aria-checked', visible ? 'true' : 'false');

    const label = document.createElement('span');
    label.className = 'column-option-label';
    label.textContent = column;
    label.title = column;

    const check = document.createElement('span');
    check.className = 'column-option-check';
    check.textContent = '\u2713';

    btn.append(label, check);
    btn.addEventListener('click', () => toggleColumn(column));
    menu.appendChild(btn);
  });
}

async function toggleColumn(column){
  const isHidden = state.hiddenColumns.has(column);
  if(!isHidden && getVisibleColumns().length <= 1){
    toast('At least one column must stay visible');
    return;
  }
  if(isHidden){
    state.hiddenColumns.delete(column);
  }else{
    state.hiddenColumns.add(column);
  }
  renderColumnMenu();
  updateColumnToggleLabel();
  updateMetaChip();
  renderTable();
  await loadPage(state.currentPage);
}

function renderTable(){
  const header = $('#tableHeader');
  const body = $('#tableBody');
  const footer = $('#tableFooter');
  if(!header || !body || !footer) return;

  ensureTableVisible();
  header.innerHTML = '';
  body.innerHTML = '';
  footer.innerHTML = '';

  if(!state.fileId){
    return;
  }

  const visibleColumns = getVisibleColumns();
  const headerRow = document.createElement('div');
  headerRow.className = 'row';
  visibleColumns.forEach(c => {
    const cell = document.createElement('div');
    cell.className = 'cell header-cell';
    cell.textContent = c;
    cell.title = c;
    headerRow.appendChild(cell);
  });
  header.appendChild(headerRow);

  if(state.rows && state.rows.length){
    state.rows.forEach(r => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      visibleColumns.forEach(c => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const v = r[c] != null ? String(r[c]) : '';
        cell.title = v;
        cell.textContent = v;
        rowEl.appendChild(cell);
      });
      body.appendChild(rowEl);
    });
  }else{
    const empty = document.createElement('div');
    empty.className = 'table-empty';
    empty.textContent = state.rowsTotal ? 'No rows on this page' : 'No rows to display';
    body.appendChild(empty);
  }

  renderTableFooter(footer);
}

function renderTableFooter(footer){
  const total = state.rowsTotal || 0;
  const limit = state.pageSize || 1;
  const rowsShown = state.rows ? state.rows.length : 0;
  const totalPages = total ? Math.max(1, Math.ceil(total / Math.max(limit, 1))) : 1;
  const currentPage = total ? Math.min(state.currentPage, totalPages - 1) : 0;
  const startRow = total && rowsShown ? state.offset + 1 : 0;
  const endRow = total && rowsShown ? Math.min(state.offset + rowsShown, total) : 0;

  const controls = document.createElement('div');
  controls.className = 'footer-group';

  const pager = document.createElement('div');
  pager.className = 'pager';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.textContent = 'Prev';
  prevBtn.disabled = currentPage <= 0;
  prevBtn.addEventListener('click', () => loadPage(currentPage - 1));

  const pageIndicator = document.createElement('span');
  pageIndicator.textContent = total ? `Page ${currentPage + 1} / ${totalPages}` : 'Page 0 / 0';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'Next';
  nextBtn.disabled = currentPage >= totalPages - 1 || total === 0;
  nextBtn.addEventListener('click', () => loadPage(currentPage + 1));

  pager.append(prevBtn, pageIndicator, nextBtn);
  controls.appendChild(pager);

  const sizes = [25, 50, 100, 250, 500, 1000];
  if(!sizes.includes(state.pageSize)){
    sizes.push(state.pageSize);
    sizes.sort((a,b) => a - b);
  }

  const sizeWrap = document.createElement('label');
  sizeWrap.className = 'page-size';
  sizeWrap.textContent = 'Rows per page';
  const select = document.createElement('select');
  sizes.forEach(size => {
    const opt = document.createElement('option');
    opt.value = String(size);
    opt.textContent = size;
    if(size === state.pageSize) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    const nextSize = Number(select.value);
    if(Number.isNaN(nextSize) || nextSize <= 0) return;
    state.pageSize = nextSize;
    state.currentPage = 0;
    loadPage(0);
  });
  sizeWrap.appendChild(select);
  controls.appendChild(sizeWrap);

  footer.appendChild(controls);

  const info = document.createElement('div');
  info.className = 'table-footer-info';
  if(total && rowsShown){
    info.textContent = `Rows ${startRow}-${endRow} of ${total}`;
  }else if(total){
    info.textContent = `0 rows on this page • total ${total}`;
  }else{
    info.textContent = 'No rows to display';
  }
  footer.appendChild(info);
}

async function loadPage(pageIndex, options={}){
  if(!state.fileId) return;
  const { showSpinner = true } = options;
  const visibleColumns = getVisibleColumns();
  if(!visibleColumns.length){
    toast('No columns selected for display');
    state.hiddenColumns = new Set();
    renderColumnMenu();
    updateColumnToggleLabel();
    return;
  }

  const limit = Math.max(Number(state.pageSize) || 1, 1);
  const total = state.rowsTotal || 0;
  const totalPages = total ? Math.max(1, Math.ceil(total / limit)) : null;
  let targetPage = Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0;
  if(totalPages !== null){
    targetPage = Math.min(targetPage, totalPages - 1);
  }
  const offset = targetPage * limit;

  const payload = {
    file_id: state.fileId,
    query: null,
    columns: visibleColumns.length === state.columns.length ? null : visibleColumns,
    sort_by: state.sortBy,
    sort_dir: state.sortDir,
    limit,
    offset
  };

  if(showSpinner) setBusy(true);
  try{
    const resp = await fetch('/api/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    state.rows = data.rows || [];
    state.rowsTotal = typeof data.total === 'number' ? data.total : state.rowsTotal;
    state.offset = typeof data.offset === 'number' ? data.offset : offset;
    state.pageSize = typeof data.limit === 'number' ? data.limit : limit;
    state.currentPage = state.pageSize ? Math.floor(state.offset / state.pageSize) : 0;
    updateMetaChip();
    renderTable();
  }catch(err){
    console.error(err);
    toast('Failed to load table');
  }finally{
    if(showSpinner) setBusy(false);
  }
}

async function exportCSV(){
  if(!state.fileId){ toast('Nothing to export'); return; }
  const visibleColumns = getVisibleColumns();
  if(!visibleColumns.length){
    toast('No columns selected for export');
    return;
  }
  setBusy(true);
  try{
    const payload = {
      file_id: state.fileId,
      query: null,
      columns: visibleColumns.length === state.columns.length ? null : visibleColumns,
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

function initColumnsMenu(){
  const resetBtn = $('#menuColumns [data-action="show-all-columns"]');
  if(resetBtn){
    resetBtn.addEventListener('click', async () => {
      state.hiddenColumns = new Set();
      renderColumnMenu();
      updateColumnToggleLabel();
      await loadPage(0);
      const menu = $('#menuColumns');
      if(menu) toggleMenu(menu, false);
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
  initColumnsMenu();
  initExport();
  initAccount();
  initYear();
  ensureTableVisible();
  renderColumnMenu();
  updateColumnToggleLabel();
  updateMetaChip();
  // For demo convenience
  // fetch('/api/sample').then(r=>r.json()).then(d=>{ state.fileId=d.file_id; state.columns=d.columns; state.hiddenColumns=new Set(); state.rows=d.preview; state.rowsTotal=d.total_rows; ensureTableVisible(); renderColumnMenu(); updateColumnToggleLabel(); updateMetaChip(); renderTable(); });
});
