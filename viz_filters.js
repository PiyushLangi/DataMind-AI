// ===== DM FILTERS + SLICER ENGINE =====
window.DM_PAGEFILTERS = [];
window.DM_SLICERS = {};
let _fltDebounce = null;

// ── Patch getFilteredRows to also apply page filters + slicers ──
const _origGFR = window.getFilteredRows;
window.getFilteredRows = function(excludeVisualId) {
  let rows = typeof _origGFR === 'function'
    ? _origGFR(excludeVisualId)
    : JSON.parse(localStorage.getItem('dm_dataset') || '[]');

  window.DM_PAGEFILTERS.forEach(pf => { if (!pf._hidden) rows = _applyPF(rows, pf); });

  Object.entries(window.DM_SLICERS).forEach(([sid, sf]) => {
    if (sid === excludeVisualId || !sf.field) return;
    if (sf.type === 'categorical' && sf.selectedValues?.length)
      rows = rows.filter(r => sf.selectedValues.includes(String(r[sf.field] ?? '')));
    if (sf.type === 'numeric') {
      if (sf.min !== '' && sf.min !== null) rows = rows.filter(r => parseFloat(r[sf.field]) >= parseFloat(sf.min));
      if (sf.max !== '' && sf.max !== null) rows = rows.filter(r => parseFloat(r[sf.field]) <= parseFloat(sf.max));
    }
    if (sf.type === 'date') {
      if (sf.from) rows = rows.filter(r => new Date(r[sf.field]) >= new Date(sf.from));
      if (sf.to)   rows = rows.filter(r => new Date(r[sf.field]) <= new Date(sf.to));
    }
  });
  return rows;
};

function _applyPF(rows, pf) {
  if (!pf.field) return rows;
  if (pf.mode === 'advanced') {
    const c = pf.condition, val = pf.value;
    return rows.filter(r => {
      const rv = r[pf.field], nrv = parseFloat(rv), nval = parseFloat(val);
      if (c === 'is greater than') return nrv > nval;
      if (c === 'is less than') return nrv < nval;
      if (c === 'is greater than or equal to') return nrv >= nval;
      if (c === 'is less than or equal to') return nrv <= nval;
      if (c === 'is equal to') return String(rv).trim() === String(val).trim();
      if (c === 'is not equal to') return String(rv).trim() !== String(val).trim();
      if (c === 'contains') return String(rv).toLowerCase().includes(String(val).toLowerCase());
      if (c === 'does not contain') return !String(rv).toLowerCase().includes(String(val).toLowerCase());
      if (c === 'is blank') return rv === null || rv === undefined || rv === '';
      if (c === 'is not blank') return rv !== null && rv !== undefined && rv !== '';
      return true;
    });
  }
  if (pf.type === 'categorical') {
    if (!pf.values || !pf.values.length) return rows;
    const s = new Set(pf.values.map(String));
    return rows.filter(r => s.has(String(r[pf.field] ?? '')));
  }
  if (pf.type === 'numeric') {
    if (pf.min !== '' && pf.min !== null && pf.min !== undefined) rows = rows.filter(r => parseFloat(r[pf.field]) >= parseFloat(pf.min));
    if (pf.max !== '' && pf.max !== null && pf.max !== undefined) rows = rows.filter(r => parseFloat(r[pf.field]) <= parseFloat(pf.max));
    return rows;
  }
  if (pf.type === 'date') {
    if (pf.from) rows = rows.filter(r => new Date(r[pf.field]) >= new Date(pf.from));
    if (pf.to)   rows = rows.filter(r => new Date(r[pf.field]) <= new Date(pf.to));
    return rows;
  }
  return rows;
}

// ── Build a filter card and wire all its events ──
function buildFilterCard(fieldName, filterEntry, onDelete) {
  const data = JSON.parse(localStorage.getItem('dm_dataset') || '[]');
  const fieldType = filterEntry.type;
  const allVals = {};
  data.forEach(r => { const v = String(r[fieldName] ?? ''); allVals[v] = (allVals[v] || 0) + 1; });
  const uniqueVals = Object.keys(allVals).slice(0, 50);

  let numMin = 0, numMax = 100;
  if (fieldType === 'numeric') {
    const nums = data.map(r => parseFloat(r[fieldName])).filter(n => !isNaN(n));
    if (nums.length) { numMin = Math.min(...nums); numMax = Math.max(...nums); }
    filterEntry.min = numMin; filterEntry.max = numMax;
  }
  if (fieldType === 'categorical') filterEntry.values = [...uniqueVals];

  const CONDITIONS = ['is greater than','is less than','is greater than or equal to','is less than or equal to','is equal to','is not equal to','contains','does not contain','is blank','is not blank','top N'];

  function basicHTML() {
    if (fieldType === 'categorical') return `
      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <button class="flt-sel-all" style="font-size:10px;color:#8B5CF6;background:none;border:none;cursor:pointer;">Select all</button>
        <button class="flt-clr-all" style="font-size:10px;color:rgba(255,255,255,.4);background:none;border:none;cursor:pointer;">Clear</button>
      </div>
      <div class="flt-val-list" style="max-height:130px;overflow-y:auto;">
        ${uniqueVals.map(v => `<label style="display:flex;align-items:center;gap:6px;font-size:10px;padding:2px 4px;cursor:pointer;border-radius:4px;" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=''">
          <input type="checkbox" class="flt-chk accent-primary" value="${v.replace(/"/g,'&quot;')}" checked style="width:11px;height:11px;">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v}</span>
          <span style="font-size:9px;color:rgba(255,255,255,.25);">${allVals[v]}</span>
        </label>`).join('')}
      </div>`;
    if (fieldType === 'numeric') return `
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="number" class="flt-min fmt-input" value="${numMin}" style="font-size:11px;width:50%;padding:3px 6px;">
        <span style="color:rgba(255,255,255,.3);font-size:11px;">–</span>
        <input type="number" class="flt-max fmt-input" value="${numMax}" style="font-size:11px;width:50%;padding:3px 6px;">
      </div>`;
    if (fieldType === 'date') return `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <input type="date" class="flt-date-from fmt-input" style="font-size:11px;color-scheme:dark;padding:3px 6px;">
        <input type="date" class="flt-date-to fmt-input" style="font-size:11px;color-scheme:dark;padding:3px 6px;">
      </div>`;
    return '';
  }

  function advHTML() {
    return `<select class="flt-cond fmt-select" style="width:100%;margin-bottom:4px;font-size:10px;">
        ${CONDITIONS.map(c => `<option>${c}</option>`).join('')}
      </select>
      <input class="flt-adv-val fmt-input" placeholder="Enter value..." style="font-size:11px;width:100%;box-sizing:border-box;padding:3px 6px;">`;
  }

  const card = document.createElement('div');
  card.className = 'filter-card';
  card.dataset.field = fieldName;
  card.style.cssText = 'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;margin-bottom:6px;';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:11px;font-weight:700;color:#8B5CF6;">${fieldName}</span>
      <div style="display:flex;gap:4px;">
        <button class="flt-eye" title="Hide/show" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,.4);line-height:1;padding:2px;"><i data-lucide="eye" class="w-3 h-3"></i></button>
        <button class="flt-del" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,.4);line-height:1;padding:2px;"><i data-lucide="x" class="w-3 h-3"></i></button>
      </div>
    </div>
    <select class="flt-type fmt-select" style="width:100%;margin-bottom:6px;font-size:10px;">
      <option value="basic">Basic filtering</option>
      <option value="advanced">Advanced filtering</option>
    </select>
    <div class="flt-body">${basicHTML()}</div>`;

  function schedule() {
    clearTimeout(_fltDebounce);
    _fltDebounce = setTimeout(() => { if (typeof refreshAllVisuals === 'function') refreshAllVisuals(); }, 300);
  }

  function wireEvents() {
    card.querySelectorAll('.flt-chk').forEach(cb => cb.addEventListener('change', () => {
      filterEntry.values = [...card.querySelectorAll('.flt-chk:checked')].map(c => c.value);
      schedule();
    }));
    card.querySelector('.flt-sel-all')?.addEventListener('click', () => {
      card.querySelectorAll('.flt-chk').forEach(c => c.checked = true);
      filterEntry.values = uniqueVals.slice();
      schedule();
    });
    card.querySelector('.flt-clr-all')?.addEventListener('click', () => {
      card.querySelectorAll('.flt-chk').forEach(c => c.checked = false);
      filterEntry.values = [];
      schedule();
    });
    const mn = card.querySelector('.flt-min'); if (mn) mn.addEventListener('input', () => { filterEntry.min = mn.value; schedule(); });
    const mx = card.querySelector('.flt-max'); if (mx) mx.addEventListener('input', () => { filterEntry.max = mx.value; schedule(); });
    const df = card.querySelector('.flt-date-from'); if (df) df.addEventListener('change', () => { filterEntry.from = df.value; schedule(); });
    const dt = card.querySelector('.flt-date-to');   if (dt) dt.addEventListener('change', () => { filterEntry.to   = dt.value; schedule(); });
    const cond = card.querySelector('.flt-cond'); if (cond) cond.addEventListener('change', () => { filterEntry.condition = cond.value; schedule(); });
    const av = card.querySelector('.flt-adv-val');   if (av)  av.addEventListener('input',  () => { filterEntry.value = av.value;       schedule(); });
  }

  card.querySelector('.flt-type').addEventListener('change', function() {
    filterEntry.mode = this.value;
    card.querySelector('.flt-body').innerHTML = this.value === 'advanced' ? advHTML() : basicHTML();
    wireEvents();
    if (typeof refreshAllVisuals === 'function') refreshAllVisuals();
  });
  card.querySelector('.flt-del').addEventListener('click', () => {
    card.remove(); onDelete(filterEntry);
    if (typeof refreshAllVisuals === 'function') refreshAllVisuals();
  });
  let eyeHidden = false;
  card.querySelector('.flt-eye').addEventListener('click', () => {
    eyeHidden = !eyeHidden; filterEntry._hidden = eyeHidden;
    card.querySelector('.flt-body').style.display = eyeHidden ? 'none' : '';
    schedule();
  });

  wireEvents();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  return card;
}

// ── addPageFilter — called by drop or programmatically ──
function addPageFilter(fieldName, containerId, isVisual, visualId) {
  containerId = containerId || 'pageFilters';
  const container = document.getElementById(containerId);
  if (!container) return;
  if (container.querySelector(`.filter-card[data-field="${CSS.escape(fieldName)}"]`)) return;
  container.querySelectorAll('p').forEach(p => p.remove());

  const fieldType = window.DM_TYPES?.[fieldName] || 'categorical';
  const entry = { field: fieldName, type: fieldType, mode: 'basic', values: [], min: '', max: '', from: '', to: '', condition: 'is equal to', value: '', _hidden: false };

  if (!isVisual) {
    if (window.DM_PAGEFILTERS.find(f => f.field === fieldName)) return;
    window.DM_PAGEFILTERS.push(entry);
  } else if (visualId) {
    if (!window.visualConfigs[visualId]) window.visualConfigs[visualId] = {};
    window.visualConfigs[visualId].filters = window.visualConfigs[visualId].filters || [];
    if (window.visualConfigs[visualId].filters.find(f => f.field === fieldName)) return;
    window.visualConfigs[visualId].filters.push(entry);
  }

  const card = buildFilterCard(fieldName, entry, (fe) => {
    if (!isVisual) {
      const i = window.DM_PAGEFILTERS.indexOf(fe); if (i !== -1) window.DM_PAGEFILTERS.splice(i, 1);
    } else if (visualId && window.visualConfigs[visualId]?.filters) {
      const i = window.visualConfigs[visualId].filters.indexOf(fe); if (i !== -1) window.visualConfigs[visualId].filters.splice(i, 1);
    }
    if (!container.querySelector('.filter-card')) container.innerHTML = '<p class="text-[10px] text-gray-600">Drag fields here</p>';
  });
  container.appendChild(card);
}

// ── Override dropToPageFilter ──
window.dropToPageFilter = function(e) {
  e.preventDefault();
  const field = e.dataTransfer.getData('field') || e.dataTransfer.getData('text/plain');
  if (!field) return;
  addPageFilter(field, 'pageFilters', false, null);
  if (typeof showToast === 'function') showToast('Page filter: ' + field, 'green');
};

// ── Auto-populate "Filters on this visual" when visual selected ──
const _origUpdateRP_flt = window.updateRightPanel;
window.updateRightPanel = function() {
  if (typeof _origUpdateRP_flt === 'function') _origUpdateRP_flt.call(this);
  const vf = document.getElementById('visualFilters'); if (!vf) return;
  if (!selectedVisuals?.length) return;
  const v = (typeof getVisual === 'function') ? getVisual(selectedVisuals[0]) : null; if (!v) return;
  const wells = (typeof WELL_CONFIG !== 'undefined') ? (WELL_CONFIG[v.type] || []) : [];
  const allFields = [...new Set(wells.flatMap(w => v.fieldConfig?.[w] || []))];
  if (!allFields.length) { vf.innerHTML = '<p class="text-[10px] text-gray-600">Add fields to this visual first.</p>'; return; }
  vf.innerHTML = '';
  allFields.forEach(f => addPageFilter(f, 'visualFilters', true, v.id));
};

// ══════════════════ SLICER VISUAL ══════════════════

window.renderSlicer = function(v, body, data) {
  const field = (v.fieldConfig['Field'] || [])[0];
  if (!field) { body.innerHTML = '<p class="text-[10px] text-gray-600 p-2">Drop a field here</p>'; return; }

  const fieldType = window.DM_TYPES?.[field] || (
    (typeof numericFields !== 'undefined' && numericFields.includes(field)) ? 'numeric' : 'categorical'
  );
  const vid = v.id;

  if (!window.DM_SLICERS[vid]) window.DM_SLICERS[vid] = { field, type: fieldType, selectedValues: [], min: '', max: '', from: '', to: '' };
  const sf = window.DM_SLICERS[vid];
  sf.field = field; sf.type = fieldType;

  function schedSlicer() {
    clearTimeout(_fltDebounce);
    _fltDebounce = setTimeout(() => { if (typeof refreshAllVisuals === 'function') refreshAllVisuals(); }, 200);
  }

  if (fieldType === 'numeric') {
    const nums = data.map(r => parseFloat(r[field])).filter(n => !isNaN(n));
    const mn = nums.length ? Math.floor(Math.min(...nums)) : 0;
    const mx = nums.length ? Math.ceil(Math.max(...nums)) : 100;
    if (sf.min === '') sf.min = mn;
    if (sf.max === '') sf.max = mx;

    body.innerHTML = `<div style="padding:10px 12px;">
      <div style="font-size:10px;color:rgba(255,255,255,.5);margin-bottom:6px;">
        ${field}: <span id="slr-rng-${vid}">${sf.min} – ${sf.max}</span>
      </div>
      <div style="position:relative;height:20px;margin-bottom:4px;">
        <style>
          #slr-lo-${vid}, #slr-hi-${vid} {
            position:absolute;width:100%;height:4px;background:transparent;appearance:none;-webkit-appearance:none;outline:none;pointer-events:none;
          }
          #slr-lo-${vid}::-webkit-slider-thumb, #slr-hi-${vid}::-webkit-slider-thumb {
            appearance:none;-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#8B5CF6;cursor:pointer;pointer-events:all;border:2px solid #0a0a14;
          }
        </style>
        <div style="position:absolute;top:8px;left:0;right:0;height:4px;background:rgba(255,255,255,.1);border-radius:2px;" id="slr-track-${vid}"></div>
        <input type="range" id="slr-lo-${vid}" min="${mn}" max="${mx}" value="${sf.min}" style="top:0;">
        <input type="range" id="slr-hi-${vid}" min="${mn}" max="${mx}" value="${sf.max}" style="top:0;">
      </div>
    </div>`;

    const lo = document.getElementById('slr-lo-' + vid);
    const hi = document.getElementById('slr-hi-' + vid);
    const rngLbl = document.getElementById('slr-rng-' + vid);
    const track = document.getElementById('slr-track-' + vid);

    function updateTrack() {
      const range = mx - mn || 1;
      const loP = ((parseFloat(lo.value) - mn) / range) * 100;
      const hiP = ((parseFloat(hi.value) - mn) / range) * 100;
      track.style.background = `linear-gradient(to right, rgba(255,255,255,.1) ${loP}%, #8B5CF6 ${loP}%, #8B5CF6 ${hiP}%, rgba(255,255,255,.1) ${hiP}%)`;
    }

    lo.addEventListener('input', () => {
      if (parseFloat(lo.value) > parseFloat(hi.value)) lo.value = hi.value;
      sf.min = lo.value; rngLbl.textContent = lo.value + ' – ' + hi.value; updateTrack(); schedSlicer();
    });
    hi.addEventListener('input', () => {
      if (parseFloat(hi.value) < parseFloat(lo.value)) hi.value = lo.value;
      sf.max = hi.value; rngLbl.textContent = lo.value + ' – ' + hi.value; updateTrack(); schedSlicer();
    });
    updateTrack();
    return;
  }

  if (fieldType === 'date') {
    body.innerHTML = `<div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;">
      <div style="font-size:10px;color:rgba(255,255,255,.4);">From</div>
      <input type="date" id="slr-from-${vid}" class="fmt-input" style="font-size:11px;color-scheme:dark;padding:3px 6px;" value="${sf.from}">
      <div style="font-size:10px;color:rgba(255,255,255,.4);">To</div>
      <input type="date" id="slr-to-${vid}" class="fmt-input" style="font-size:11px;color-scheme:dark;padding:3px 6px;" value="${sf.to}">
    </div>`;
    document.getElementById('slr-from-' + vid)?.addEventListener('change', e => { sf.from = e.target.value; schedSlicer(); });
    document.getElementById('slr-to-' + vid)?.addEventListener('change',   e => { sf.to   = e.target.value; schedSlicer(); });
    return;
  }

  // Categorical slicer
  const vals = [...new Set(data.map(r => String(r[field] ?? '')).filter(Boolean))].slice(0, 100);
  if (!sf.selectedValues) sf.selectedValues = [];

  body.innerHTML = `<div style="padding:4px;overflow-y:auto;max-height:calc(100% - 4px);">
    <div style="display:flex;gap:6px;padding:2px 4px 6px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:4px;">
      <button id="slr-all-${vid}" style="font-size:10px;color:#8B5CF6;background:none;border:none;cursor:pointer;">All</button>
      <button id="slr-none-${vid}" style="font-size:10px;color:rgba(255,255,255,.3);background:none;border:none;cursor:pointer;">None</button>
    </div>
    ${vals.map(val => {
      const sel = sf.selectedValues.includes(val);
      return `<div class="slicer-item" data-val="${val.replace(/"/g,'&quot;')}" style="display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:11px;color:${sel?'#fff':'rgba(255,255,255,.6)'};background:${sel?'rgba(139,92,246,.12)':'transparent'};user-select:none;" onmouseover="if(!this.classList.contains('slicer-active'))this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background=this.classList.contains('slicer-active')?'rgba(139,92,246,.12)':'transparent'">
        <div class="slicer-check" style="width:12px;height:12px;border-radius:3px;border:1.5px solid ${sel?'#8B5CF6':'rgba(255,255,255,.2)'};background:${sel?'#8B5CF6':'transparent'};flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          ${sel?'<svg width="8" height="8" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" stroke="#fff" stroke-width="2" fill="none"/></svg>':''}
        </div>
        ${val}
      </div>`;
    }).join('')}
  </div>`;

  function updateSlicerItemStyle(el, active) {
    el.classList.toggle('slicer-active', active);
    el.style.background = active ? 'rgba(139,92,246,.12)' : 'transparent';
    el.style.color = active ? '#fff' : 'rgba(255,255,255,.6)';
    const chk = el.querySelector('.slicer-check');
    if (chk) {
      chk.style.borderColor = active ? '#8B5CF6' : 'rgba(255,255,255,.2)';
      chk.style.background  = active ? '#8B5CF6' : 'transparent';
      chk.innerHTML = active ? '<svg width="8" height="8" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" stroke="#fff" stroke-width="2" fill="none"/></svg>' : '';
    }
  }

  // Init active state
  body.querySelectorAll('.slicer-item').forEach(el => {
    if (sf.selectedValues.includes(el.dataset.val)) updateSlicerItemStyle(el, true);
  });

  body.querySelectorAll('.slicer-item').forEach(el => {
    el.addEventListener('click', e => {
      const val = el.dataset.val;
      if (e.ctrlKey || e.metaKey) {
        const idx = sf.selectedValues.indexOf(val);
        if (idx !== -1) { sf.selectedValues.splice(idx, 1); updateSlicerItemStyle(el, false); }
        else { sf.selectedValues.push(val); updateSlicerItemStyle(el, true); }
      } else {
        // Single-select: toggle if already sole selection, else select only this
        const alreadySole = sf.selectedValues.length === 1 && sf.selectedValues[0] === val;
        body.querySelectorAll('.slicer-item').forEach(i => updateSlicerItemStyle(i, false));
        sf.selectedValues = alreadySole ? [] : [val];
        if (!alreadySole) updateSlicerItemStyle(el, true);
      }
      schedSlicer();
    });
  });

  document.getElementById('slr-all-' + vid)?.addEventListener('click', () => {
    sf.selectedValues = [];
    body.querySelectorAll('.slicer-item').forEach(i => updateSlicerItemStyle(i, false));
    schedSlicer();
  });
  document.getElementById('slr-none-' + vid)?.addEventListener('click', () => {
    sf.selectedValues = [];
    body.querySelectorAll('.slicer-item').forEach(i => updateSlicerItemStyle(i, false));
    schedSlicer();
  });
};

// ── Clean up slicer state when visual is deleted ──
const _origDelViz = window.deleteSelectedVisual;
if (typeof _origDelViz === 'function') {
  window.deleteSelectedVisual = function() {
    (typeof selectedVisuals !== 'undefined' ? selectedVisuals : []).forEach(id => {
      delete window.DM_SLICERS[id];
    });
    _origDelViz.call(this);
  };
}
