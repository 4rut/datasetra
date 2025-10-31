
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
  chart: {
    fileId: null,
    allRows: null,
    numericColumns: [],
    instance: null,
    selected: { type: 'line', x: null, y: [] },
    requestId: 0,
  },
};

const CHART_MAX_ROWS = 2000;
const CHART_MAX_POINTS = 800;

const chartUI = {
  initialized: false,
  card: null,
  empty: null,
  emptyText: null,
  defaultEmptyText: 'Upload a CSV file to explore charts.',
  loading: null,
  content: null,
  typeSelect: null,
  xSelect: null,
  yOptions: null,
  canvas: null,
};

const CHART_COLOR_PALETTE = [
  '#00c2ff',
  '#7f5cff',
  '#75e1ff',
  '#5cf29d',
  '#f7b955',
  '#ff8ccf',
  '#4dd2ff',
];

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

function initCharts(){
  chartUI.card = $('#chartsCard');
  if(!chartUI.card) return;
  chartUI.empty = $('#chartsEmpty');
  chartUI.loading = $('#chartsLoading');
  chartUI.content = $('#chartsContent');
  chartUI.typeSelect = $('#chartTypeSelect');
  chartUI.xSelect = $('#chartXSelect');
  chartUI.yOptions = $('#chartYOptions');
  chartUI.canvas = $('#chartCanvas');
  chartUI.emptyText = chartUI.empty ? chartUI.empty.querySelector('p') : null;
  if(chartUI.emptyText){
    const text = chartUI.emptyText.textContent ? chartUI.emptyText.textContent.trim() : '';
    if(text){
      chartUI.defaultEmptyText = text;
    }
  }
  if(chartUI.typeSelect){
    chartUI.typeSelect.addEventListener('change', () => {
      state.chart.selected.type = chartUI.typeSelect.value || 'line';
      if(state.chart.selected.type === 'scatter' && chartUI.xSelect){
        const currentX = chartUI.xSelect.value || null;
        if(currentX && !state.chart.numericColumns.includes(currentX)){
          const fallback = state.chart.numericColumns.find(col => state.columns.includes(col));
          if(fallback){
            chartUI.xSelect.value = fallback;
            state.chart.selected.x = fallback;
          }
        }
      }
      renderChartFromState();
    });
  }
  if(chartUI.xSelect){
    chartUI.xSelect.addEventListener('change', () => {
      state.chart.selected.x = chartUI.xSelect.value || null;
      renderChartFromState();
    });
  }
  if(window.Chart){
    Chart.defaults.color = '#e6eefc';
    Chart.defaults.borderColor = 'rgba(255,255,255,.08)';
    Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, "Helvetica Neue", Arial, "Noto Sans"';
    Chart.defaults.plugins.legend.labels.color = '#e6eefc';
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(4,10,20,.85)';
    Chart.defaults.plugins.tooltip.titleColor = '#e6eefc';
    Chart.defaults.plugins.tooltip.bodyColor = '#e6eefc';
  }
  chartUI.initialized = true;
  resetChartState();
}

function setChartState(mode, message){
  if(!chartUI.initialized) return;
  if(chartUI.empty){
    if(mode === 'empty'){
      chartUI.empty.hidden = false;
      if(chartUI.emptyText){
        chartUI.emptyText.textContent = message || chartUI.defaultEmptyText;
      }
    }else{
      chartUI.empty.hidden = true;
      if(chartUI.emptyText){
        chartUI.emptyText.textContent = chartUI.defaultEmptyText;
      }
    }
  }
  if(chartUI.loading){
    chartUI.loading.hidden = mode !== 'loading';
  }
  if(chartUI.content){
    chartUI.content.hidden = mode !== 'content';
  }
}

function destroyChart(){
  if(state.chart.instance && typeof state.chart.instance.destroy === 'function'){
    state.chart.instance.destroy();
  }
  state.chart.instance = null;
}

function clearChartControls(){
  if(chartUI.xSelect){
    chartUI.xSelect.innerHTML = '';
    chartUI.xSelect.disabled = true;
  }
  if(chartUI.yOptions){
    chartUI.yOptions.innerHTML = '';
    chartUI.yOptions.classList.add('empty');
  }
}

function resetChartState(){
  if(!chartUI.initialized) return;
  destroyChart();
  state.chart.fileId = null;
  state.chart.allRows = null;
  state.chart.numericColumns = [];
  state.chart.selected = { type: 'line', x: null, y: [] };
  if(chartUI.typeSelect){
    chartUI.typeSelect.value = 'line';
  }
  clearChartControls();
  setChartState('empty');
}

function populateChartControls(){
  if(!chartUI.initialized) return false;
  if(chartUI.typeSelect){
    const desiredType = state.chart.selected.type || chartUI.typeSelect.value || 'line';
    chartUI.typeSelect.value = desiredType;
    state.chart.selected.type = chartUI.typeSelect.value || 'line';
  }

  if(!Array.isArray(state.chart.selected.y)){
    state.chart.selected.y = state.chart.selected.y ? [state.chart.selected.y] : [];
  }
  const numericSet = new Set(state.chart.numericColumns);
  state.chart.selected.y = state.chart.selected.y.filter(col => numericSet.has(col));

  if(state.chart.selected.x && !state.columns.includes(state.chart.selected.x)){
    state.chart.selected.x = null;
  }

  fillSelectOptions(chartUI.xSelect, state.columns, state.chart.selected.x);

  if(chartUI.xSelect){
    chartUI.xSelect.disabled = !state.columns.length;
    if(!chartUI.xSelect.disabled){
      if(!chartUI.xSelect.value && state.columns.length){
        chartUI.xSelect.value = state.columns[0];
      }
      state.chart.selected.x = chartUI.xSelect.value || null;
      if(state.chart.selected.type === 'scatter' && state.chart.selected.x && !state.chart.numericColumns.includes(state.chart.selected.x)){
        const fallback = state.chart.numericColumns.find(col => state.columns.includes(col));
        if(fallback){
          chartUI.xSelect.value = fallback;
          state.chart.selected.x = fallback;
        }
      }else if(state.chart.selected.type !== 'scatter' && !state.chart.selected.x){
        state.chart.selected.x = chartUI.xSelect.value || null;
      }
    }else{
      state.chart.selected.x = null;
    }
  }

  return renderYOptions();
}

function fillSelectOptions(selectEl, options, preferred){
  if(!selectEl) return;
  const previous = preferred ?? selectEl.value ?? null;
  selectEl.innerHTML = '';
  options.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    selectEl.appendChild(opt);
  });
  const target = previous && options.includes(previous) ? previous : (options[0] ?? '');
  selectEl.value = target;
  selectEl.disabled = !options.length;
}

function renderYOptions(){
  if(!chartUI.yOptions) return false;
  chartUI.yOptions.innerHTML = '';
  chartUI.yOptions.classList.toggle('empty', !state.chart.numericColumns.length);
  if(!state.chart.numericColumns.length){
    const empty = document.createElement('div');
    empty.className = 'charts-options-empty';
    empty.textContent = 'No numeric columns detected';
    chartUI.yOptions.appendChild(empty);
    state.chart.selected.y = [];
    return false;
  }

  const selection = new Set(state.chart.selected.y.filter(col => state.chart.numericColumns.includes(col)));
  if(!selection.size && state.chart.numericColumns.length){
    selection.add(state.chart.numericColumns[0]);
  }
  state.chart.selected.y = state.chart.numericColumns.filter(col => selection.has(col));

  state.chart.numericColumns.forEach((column, idx) => {
    const option = document.createElement('label');
    option.className = 'charts-option';
    option.dataset.column = column;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = column;
    checkbox.checked = selection.has(column);

    checkbox.addEventListener('change', () => handleYToggle(column, checkbox.checked, checkbox));
    if(checkbox.checked){
      option.classList.add('active');
    }

    const swatch = document.createElement('span');
    swatch.className = 'charts-option-swatch';
    swatch.style.backgroundColor = getSeriesColor(idx);

    const label = document.createElement('span');
    label.textContent = column;

    option.append(checkbox, swatch, label);
    chartUI.yOptions.appendChild(option);
  });

  updateYOptionActiveStates();
  return state.chart.selected.y.length > 0;
}

function handleYToggle(column, checked, checkbox){
  const next = new Set(state.chart.selected.y);
  if(checked){
    next.add(column);
  }else{
    next.delete(column);
  }

  if(!next.size){
    next.add(column);
    if(checkbox) checkbox.checked = true;
    updateYOptionActiveStates();
    toast('At least one Y column must stay selected');
    return;
  }

  state.chart.selected.y = state.chart.numericColumns.filter(col => next.has(col));

  updateYOptionActiveStates();
  renderChartFromState();
}

function updateYOptionActiveStates(){
  if(!chartUI.yOptions) return;
  chartUI.yOptions.querySelectorAll('.charts-option').forEach(option => {
    const input = option.querySelector('input[type="checkbox"]');
    option.classList.toggle('active', Boolean(input && input.checked));
  });
}

function getSeriesColor(index){
  return CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length];
}

function hexToRgba(hex, alpha){
  if(typeof hex !== 'string'){
    return `rgba(0,0,0,${alpha})`;
  }
  let normalized = hex.replace('#', '').trim();
  if(normalized.length === 3){
    normalized = normalized.split('').map(ch => ch + ch).join('');
  }
  if(normalized.length !== 6){
    return `rgba(0,0,0,${alpha})`;
  }
  const num = Number.parseInt(normalized, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseNumeric(value){
  if(value === null || value === undefined) return null;
  if(typeof value === 'number'){
    return Number.isFinite(value) ? value : null;
  }
  if(typeof value !== 'string') return null;
  const trimmed = value.trim();
  if(!trimmed) return null;
  const compact = trimmed.replace(/\u00a0/g, '').replace(/\s+/g, '');
  const euroPattern = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/;
  const usPattern = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
  let normalized = compact;
  if(euroPattern.test(compact)){
    normalized = compact.replace(/\./g, '').replace(',', '.');
  }else if(usPattern.test(compact)){
    normalized = compact.replace(/,/g, '');
  }else if(compact.includes(',') && !compact.includes('.')){
    normalized = compact.replace(/,/g, '.');
  }else{
    normalized = compact.replace(/,/g, '');
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function detectNumericColumns(rows){
  const columns = state.columns || [];
  if(!rows || !rows.length || !columns.length) return [];
  const sampleSize = Math.min(rows.length, 500);
  const numericCols = [];
  columns.forEach(column => {
    let valueCount = 0;
    let numericCount = 0;
    for(let i = 0; i < sampleSize; i++){
      const raw = rows[i]?.[column];
      if(raw === undefined || raw === null) continue;
      const str = typeof raw === 'string' ? raw.trim() : String(raw).trim();
      if(!str.length) continue;
      valueCount += 1;
      if(parseNumeric(raw) !== null){
        numericCount += 1;
      }
    }
    if(!valueCount){
      return;
    }
    const threshold = valueCount < 5 ? valueCount : Math.ceil(valueCount * 0.6);
    if(numericCount >= Math.max(1, threshold)){
      numericCols.push(column);
    }
  });
  return numericCols;
}

async function fetchAllRowsForCharts(requestId){
  const rows = [];
  let offset = 0;
  const limit = 1000;
  let total = null;
  while(rows.length < CHART_MAX_ROWS){
    if(state.chart.requestId !== requestId) return null;
    const remaining = CHART_MAX_ROWS - rows.length;
    const payload = {
      file_id: state.fileId,
      query: null,
      columns: null,
      sort_by: state.sortBy,
      sort_dir: state.sortDir,
      limit: Math.min(limit, Math.max(1, remaining)),
      offset
    };
    const resp = await fetch('/api/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(state.chart.requestId !== requestId) return null;
    if(!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const batch = Array.isArray(data.rows) ? data.rows : [];
    rows.push(...batch);
    offset += batch.length;
    if(typeof data.total === 'number'){
      total = data.total;
    }
    if(batch.length < payload.limit){
      break;
    }
    if(total !== null && offset >= total){
      break;
    }
  }
  return rows;
}

async function refreshCharts(options={}){
  if(!chartUI.initialized) return;
  if(!state.fileId){
    resetChartState();
    return;
  }
  const { force = false } = options;
  const hasCached = !force && state.chart.fileId === state.fileId && Array.isArray(state.chart.allRows);
  if(hasCached){
    populateChartControls();
    renderChartFromState();
    return;
  }
  const previousSelection = {
    type: state.chart.selected?.type || 'line',
    x: state.chart.selected?.x ?? null,
    y: Array.isArray(state.chart.selected?.y)
      ? [...state.chart.selected.y]
      : (state.chart.selected?.y ? [state.chart.selected.y] : [])
  };
  clearChartControls();
  setChartState('loading');
  const requestId = ++state.chart.requestId;
  try{
    const rows = await fetchAllRowsForCharts(requestId);
    if(rows === null || state.chart.requestId !== requestId){
      return;
    }
    if(!rows.length){
      state.chart.fileId = state.fileId;
      state.chart.allRows = [];
      state.chart.numericColumns = [];
      state.chart.selected = previousSelection;
      clearChartControls();
      destroyChart();
      setChartState('empty', 'No rows available for charting.');
      return;
    }
    state.chart.fileId = state.fileId;
    state.chart.allRows = rows;
    state.chart.numericColumns = detectNumericColumns(rows);
    state.chart.selected = {
      type: previousSelection.type || (chartUI.typeSelect ? chartUI.typeSelect.value || 'line' : 'line'),
      x: previousSelection.x,
      y: [...previousSelection.y]
    };
    const hasNumeric = populateChartControls();
    if(!hasNumeric){
      destroyChart();
      setChartState('empty', 'Charts require at least one numeric column.');
      return;
    }
    renderChartFromState();
  }catch(err){
    if(state.chart.requestId !== requestId){
      return;
    }
    console.error(err);
    destroyChart();
    setChartState('empty', 'Failed to load chart data.');
  }
}

function prepareChartDatasets(type, xColumn, yColumns){
  const rows = state.chart.allRows || [];
  if(!rows.length || !Array.isArray(yColumns) || !yColumns.length){
    return null;
  }
  if(type === 'scatter'){
    const datasets = yColumns.map(column => {
      const points = [];
      for(let i = 0; i < rows.length && points.length < CHART_MAX_POINTS; i++){
        const row = rows[i] || {};
        const yVal = parseNumeric(row[column]);
        if(yVal === null) continue;
        let xVal;
        if(xColumn){
          xVal = parseNumeric(row[xColumn]);
          if(xVal === null) continue;
        }else{
          xVal = i + 1;
        }
        points.push({ x: xVal, y: yVal });
      }
      return points;
    });
    if(!datasets.some(points => points.length)){
      return null;
    }
    return { scatter: datasets };
  }
  const labels = [];
  const series = yColumns.map(() => []);
  let accepted = 0;
  for(let i = 0; i < rows.length && accepted < CHART_MAX_POINTS; i++){
    const row = rows[i] || {};
    const values = yColumns.map(column => parseNumeric(row[column]));
    if(values.every(v => v === null)){
      continue;
    }
    let label;
    if(xColumn){
      const rawX = row[xColumn];
      const str = rawX !== undefined && rawX !== null ? String(rawX).trim() : '';
      label = str.length ? str : `Row ${i + 1}`;
    }else{
      label = `Row ${i + 1}`;
    }
    labels.push(label);
    values.forEach((value, idx) => {
      series[idx].push(value);
    });
    accepted += 1;
  }
  if(!series.some(arr => arr.some(value => value !== null))){
    return null;
  }
  return { labels, series };
}

function buildChartConfig(type, prepared, xLabel, yColumns){
  const axisLabelX = xLabel || 'Row #';
  const axisLabelY = yColumns.length === 1 ? yColumns[0] : 'Values';
  const axisColor = '#9fb0cc';
  const gridColor = 'rgba(255,255,255,.06)';
  if(type === 'scatter'){
    const datasets = yColumns
      .map((column, idx) => {
        const points = prepared.scatter?.[idx] || [];
        if(!points.length) return null;
        const color = getSeriesColor(idx);
        return {
          label: column,
          data: points,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.35),
          pointRadius: points.length > 150 ? 2 : 4,
          pointHoverRadius: 6,
        };
      })
      .filter(Boolean);
    return {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { labels: { color: '#e6eefc' } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const { x, y } = ctx.parsed || {};
                const name = ctx.dataset?.label ? `${ctx.dataset.label}: ` : '';
                return `${name}(${x}, ${y})`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: axisLabelX, color: axisColor },
            ticks: { color: axisColor },
            grid: { color: gridColor }
          },
          y: {
            title: { display: true, text: axisLabelY, color: axisColor },
            ticks: { color: axisColor },
            grid: { color: gridColor }
          }
        }
      }
    };
  }
  const isBar = type === 'bar';
  const datasets = yColumns.map((column, idx) => {
    const data = prepared.series?.[idx] || [];
    const color = getSeriesColor(idx);
    return {
      label: column,
      data,
      borderColor: color,
      backgroundColor: isBar ? hexToRgba(color, 0.5) : hexToRgba(color, 0.28),
      pointBackgroundColor: color,
      pointBorderColor: '#0b1220',
      pointRadius: data.length > 150 ? 0 : 3,
      pointHoverRadius: 5,
      spanGaps: true,
      borderWidth: 2,
      tension: isBar ? 0 : 0.25,
      fill: false,
    };
  });
  if(isBar){
    datasets.forEach(ds => {
      ds.borderWidth = 1.5;
      ds.borderRadius = 6;
      ds.maxBarThickness = 36;
    });
  }
  return {
    type: isBar ? 'bar' : 'line',
    data: {
      labels: prepared.labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#e6eefc' } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const label = ctx.dataset?.label || axisLabelY;
              const val = ctx.parsed?.y ?? ctx.parsed;
              return `${label}: ${val}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: axisLabelX, color: axisColor },
          ticks: { color: axisColor, maxRotation: 45, minRotation: 0, autoSkip: true },
          grid: { color: gridColor }
        },
        y: {
          title: { display: true, text: axisLabelY, color: axisColor },
          ticks: { color: axisColor },
          grid: { color: gridColor }
        }
      }
    }
  };
}

function renderChartFromState(){
  if(!chartUI.initialized) return;
  if(!state.fileId){
    resetChartState();
    return;
  }
  if(!state.chart.allRows || !state.chart.allRows.length){
    destroyChart();
    setChartState('empty', 'No data available for charting.');
    return;
  }
  if(typeof Chart === 'undefined'){
    console.error('Chart.js library is not available; cannot render chart.');
    destroyChart();
    setChartState('empty', 'Charting library failed to load.');
    return;
  }
  const type = (chartUI.typeSelect && chartUI.typeSelect.value) || state.chart.selected.type || 'line';
  const xColumnRaw = chartUI.xSelect ? chartUI.xSelect.value : state.chart.selected.x;
  const xColumn = xColumnRaw ? xColumnRaw : null;
  const currentY = Array.isArray(state.chart.selected.y) ? state.chart.selected.y : [];
  let yColumns = currentY.filter(col => state.chart.numericColumns.includes(col));
  if(yColumns.length !== currentY.length){
    state.chart.selected.y = yColumns;
    renderYOptions();
    yColumns = Array.isArray(state.chart.selected.y) ? [...state.chart.selected.y] : [];
  }
  if(!yColumns.length && state.chart.numericColumns.length){
    state.chart.selected.y = [state.chart.numericColumns[0]];
    renderYOptions();
    yColumns = [...state.chart.selected.y];
  }
  state.chart.selected = { type, x: xColumn, y: yColumns };
  if(!yColumns.length){
    destroyChart();
    setChartState('empty', 'Select one or more numeric columns for the Y axis.');
    return;
  }
  const prepared = prepareChartDatasets(type, xColumn, yColumns);
  if(!prepared){
    destroyChart();
    const needsNumeric = type === 'scatter' && xColumn && !state.chart.numericColumns.includes(xColumn);
    const message = needsNumeric
      ? 'Scatter plots require numeric data on both axes.'
      : 'Not enough numeric data for the selected columns.';
    setChartState('empty', message);
    return;
  }
  const ctx = chartUI.canvas ? chartUI.canvas.getContext('2d') : null;
  if(!ctx){
    return;
  }
  destroyChart();
  const config = buildChartConfig(type, prepared, xColumn, yColumns);
  if(!config?.data?.datasets?.length){
    setChartState('empty', 'Not enough numeric data for the selected columns.');
    return;
  }
  state.chart.instance = new Chart(ctx, config);
  setChartState('content');
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
    if(chartUI.initialized){
      const preservedType = chartUI.typeSelect ? (chartUI.typeSelect.value || state.chart.selected.type || 'line') : (state.chart.selected.type || 'line');
      state.chart.fileId = null;
      state.chart.allRows = null;
      state.chart.numericColumns = [];
      state.chart.selected = { type: preservedType, x: null, y: [] };
      clearChartControls();
      setChartState('loading');
    }
    renderColumnMenu();
    updateColumnToggleLabel();
    updateMetaChip();
    ensureTableVisible();
    renderTable();
    await loadPage(0, { showSpinner: false });
    if(chartUI.initialized){
      refreshCharts({ force: true }).catch(err => console.error(err));
    }
    toast('CSV uploaded');
  }catch(err){
    console.error(err);
    toast('Upload failed');
    resetChartState();
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
  toast(`${kind.toUpperCase()} export will be available soon`);
}

function initImport(){
  const hiddenInput = $('#fileInput');
  $('#menuImport [data-import="csv"]').addEventListener('click', () => hiddenInput.click());
  hiddenInput.addEventListener('change', () => uploadCSV(hiddenInput.files[0]));

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
  initCharts();
  initImport();
  initColumnsMenu();
  initExport();
  initAccount();
  initYear();
  ensureTableVisible();
  renderColumnMenu();
  updateColumnToggleLabel();
  updateMetaChip();
});
