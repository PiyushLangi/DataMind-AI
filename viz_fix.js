// ===== DM FIX: FIELD DETECTION & FIELDS TAB =====
window.DM_TYPES = {};
window.chartInstances = window.chartInstances || {};
window.activeVisualId = null;

(function() {
  const PALETTE = ['#8B5CF6','#3B82F6','#06B6D4','#10B981','#F59E0B'];

  // ── Override detectFields to use proper 20-row sampling & empty state ──
  window.detectFields = function() {
    const cols = JSON.parse(localStorage.getItem('dm_columns') || '[]');
    const data = JSON.parse(localStorage.getItem('dm_dataset') || '[]');
    window.DM_TYPES = {};
    numericFields = []; catFields = []; dateFields = [];

    if (!cols.length || !data.length) {
      renderFieldsTabEmpty();
      return;
    }

    cols.forEach(col => {
      const sample = data.slice(0, 20).map(r => r[col]).filter(v => v != null && v !== '');
      if (!sample.length) { catFields.push(col); window.DM_TYPES[col] = 'categorical'; return; }
      const numCount = sample.filter(v => !isNaN(parseFloat(v)) && isFinite(v)).length;
      if (numCount / sample.length > 0.7) {
        numericFields.push(col); window.DM_TYPES[col] = 'numeric';
      } else {
        const dateCount = sample.filter(v => { const d = new Date(v); return !isNaN(d.getTime()) && isNaN(parseFloat(v)); }).length;
        if (dateCount / sample.length > 0.5) { dateFields.push(col); window.DM_TYPES[col] = 'date'; }
        else { catFields.push(col); window.DM_TYPES[col] = 'categorical'; }
      }
    });

    renderFieldsTab();
  };

  function renderFieldsTabEmpty() {
    ['numericFieldsList','catFieldsList','dateFieldsList'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    const container = document.getElementById('numericFieldsList');
    if (container) {
      container.innerHTML = `<div style="padding:16px 8px;text-align:center;">
        <p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:8px;">No dataset loaded. Please upload data first.</p>
        <a href="upload.html" style="font-size:11px;color:#8B5CF6;text-decoration:underline;">Upload Data →</a>
      </div>`;
    }
  }

  // ── Override renderFieldsTab to add proper drag events & click-assign ──
  window.renderFieldsTab = function() {
    const sections = [
      { el: 'numericFieldsList', fields: numericFields, color: '#8B5CF6', lbl: 'Numeric', type: 'numeric' },
      { el: 'catFieldsList',     fields: catFields,     color: '#3B82F6', lbl: 'Categorical', type: 'categorical' },
      { el: 'dateFieldsList',    fields: dateFields,    color: '#06B6D4', lbl: 'Date', type: 'date' }
    ];
    sections.forEach(({ el, fields, color, lbl, type }) => {
      const container = document.getElementById(el);
      if (!container) return;
      container.innerHTML = `<div class="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">${lbl}</div>`;
      fields.forEach(f => {
        const d = document.createElement('div');
        d.className = 'field-item';
        d.draggable = true;
        d.dataset.field = f;
        d.dataset.type = type;
        d.innerHTML = `<span class="field-dot" style="background:${color};flex-shrink:0;width:7px;height:7px;border-radius:50%;display:inline-block;"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;">${f}</span>`;
        d.addEventListener('dragstart', e => {
          e.dataTransfer.setData('field', f);
          e.dataTransfer.setData('type', type);
          e.dataTransfer.setData('text/plain', f);
          e.dataTransfer.setData('fieldType', type);
          draggingField = f;
        });
        d.addEventListener('click', () => dmAutoAssign(f, type));
        container.appendChild(d);
      });
    });
  };

  // ── Auto-assign field to best well on click ──
  function dmAutoAssign(field, type) {
    if (!selectedVisuals.length) { showToast('Select a visual first', 'blue'); return; }
    const v = getVisual(selectedVisuals[0]); if (!v) return;
    const wells = WELL_CONFIG[v.type] || ['Values'];
    let targetWell = null;

    const xWell = wells.find(w => w === 'X Axis' || w === 'Category' || w === 'Field');
    const yWell = wells.find(w => w === 'Y Axis' || w === 'Values');

    if ((type === 'categorical' || type === 'date') && xWell) {
      targetWell = xWell;
    } else if (type === 'numeric' && yWell) {
      targetWell = yWell;
    } else {
      // Find first empty or any well
      targetWell = wells.find(w => !(v.fieldConfig[w] && v.fieldConfig[w].length)) || wells[0];
    }

    if (!targetWell) return;
    v.fieldConfig[targetWell] = v.fieldConfig[targetWell] || [];
    if (!v.fieldConfig[targetWell].includes(field)) {
      v.fieldConfig[targetWell].push(field);
      pushHistory();
      updateFieldWells();
      dmRenderActiveChart();
      showToast(`Assigned "${field}" → ${targetWell}`, 'green');
    }
  }

  // ── Override updateFieldWells to add proper drag/drop & chips ──
  window.updateFieldWells = function() {
    const section = document.getElementById('fieldWellsSection');
    const wellsDiv = document.getElementById('fieldWells');
    if (!selectedVisuals.length) { section.classList.add('hidden'); return; }
    const v = getVisual(selectedVisuals[0]);
    if (!v) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const wells = WELL_CONFIG[v.type] || ['Values'];
    wellsDiv.innerHTML = '';

    wells.forEach(wName => {
      const wr = document.createElement('div');
      wr.innerHTML = `<div style="font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:3px;">${wName}</div>`;
      const zone = document.createElement('div');
      zone.className = 'well-zone';
      zone.dataset.well = wName;
      zone.dataset.vid = v.id;

      // Populate existing chips
      const fields = v.fieldConfig[wName] || [];
      if (fields.length) {
        fields.forEach(f => dmAddChipToZone(zone, f, wName, v));
      } else {
        zone.textContent = 'Drop fields here';
      }

      // Drop events
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('drag-over');
        const field = e.dataTransfer.getData('field') || e.dataTransfer.getData('text/plain');
        const ftype = e.dataTransfer.getData('type') || e.dataTransfer.getData('fieldType') || (window.DM_TYPES[field] || 'categorical');
        if (!field) return;
        v.fieldConfig[wName] = v.fieldConfig[wName] || [];
        if (!v.fieldConfig[wName].includes(field)) {
          v.fieldConfig[wName].push(field);
          pushHistory();
          updateFieldWells();
          dmRenderActiveChart();
        }
      });

      wr.appendChild(zone);
      wellsDiv.appendChild(wr);
    });

    // Also highlight selected chart type
    if (v.type) {
      document.querySelectorAll('.visual-icon-btn').forEach(b => b.classList.remove('sel-type'));
      const btn = document.getElementById('vbtn-' + v.type);
      if (btn) btn.classList.add('sel-type');
    }
  };

  function dmAddChipToZone(zone, fieldName, wellName, v) {
    // Remove placeholder text
    if (zone.textContent === 'Drop fields here') zone.textContent = '';

    const ftype = window.DM_TYPES[fieldName] || 'categorical';
    const aggCycles = ['Sum', 'Avg', 'Count', 'Min', 'Max'];
    const aggKey = v.id + '_' + wellName + '_' + fieldName;
    if (!window._dmAggState) window._dmAggState = {};
    if (!window._dmAggState[aggKey]) window._dmAggState[aggKey] = ftype === 'numeric' ? 'Sum' : 'None';

    const chip = document.createElement('div');
    chip.className = 'field-chip';
    chip.dataset.field = fieldName;

    const aggSpan = document.createElement('span');
    aggSpan.className = 'chip-agg';
    aggSpan.dataset.field = fieldName;
    if (ftype === 'numeric') {
      aggSpan.textContent = window._dmAggState[aggKey];
      aggSpan.style.cssText = 'cursor:pointer;color:rgba(139,92,246,.8);font-size:9px;font-weight:700;margin-right:2px;';
      aggSpan.title = 'Click to change aggregation';
      aggSpan.addEventListener('click', e => {
        e.stopPropagation();
        const cur = aggCycles.indexOf(window._dmAggState[aggKey]);
        window._dmAggState[aggKey] = aggCycles[(cur + 1) % aggCycles.length];
        aggSpan.textContent = window._dmAggState[aggKey];
        dmRenderActiveChart();
      });
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'chip-name';
    nameSpan.textContent = fieldName;
    nameSpan.style.fontSize = '10px';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'chip-remove';
    removeBtn.textContent = '×';
    removeBtn.style.cssText = 'margin-left:4px;color:rgba(255,255,255,.4);background:none;border:none;cursor:pointer;font-size:12px;line-height:1;padding:0;';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      v.fieldConfig[wellName] = (v.fieldConfig[wellName] || []).filter(f => f !== fieldName);
      delete window._dmAggState[aggKey];
      pushHistory();
      updateFieldWells();
      dmRenderActiveChart();
    });

    if (ftype === 'numeric') chip.appendChild(aggSpan);
    chip.appendChild(nameSpan);
    chip.appendChild(removeBtn);
    zone.appendChild(chip);
  }

  // ── Core render function using well assignments ──
  window.dmRenderActiveChart = function() {
    if (!selectedVisuals.length) return;
    const vid = selectedVisuals[0];
    window.activeVisualId = vid;
    const v = getVisual(vid); if (!v) return;
    const body = document.getElementById('body-' + vid); if (!body) return;

    // Skip non-chart types
    if (['card','multi-card','table','matrix','slicer','gauge'].includes(v.type)) {
      renderVisualContent(v); return;
    }

    const wells = WELL_CONFIG[v.type] || [];
    const xWellName = wells.find(w => w === 'X Axis' || w === 'Category' || w === 'Field') || wells[0];
    const yWellName = wells.find(w => w === 'Y Axis' || w === 'Values') || wells[1] || wells[0];
    const legendWellName = 'Legend';

    const xField = (v.fieldConfig[xWellName] || [])[0];
    const yFields = v.fieldConfig[yWellName] || [];
    const legendField = (v.fieldConfig[legendWellName] || [])[0];

    // Show placeholder if wells empty
    if (!xField || !yFields.length) {
      body.innerHTML = '';
      const ph = document.createElement('div');
      ph.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;';
      ph.innerHTML = `<p style="font-size:11px;color:rgba(255,255,255,.25);text-align:center;padding:8px;">Add fields to<br><b style="color:rgba(255,255,255,.4);">${xWellName}</b> and <b style="color:rgba(255,255,255,.4);">${yWellName}</b><br>to render chart</p>`;
      body.appendChild(ph);
      // Destroy old chart if any
      if (window.chartInstances[vid]) { window.chartInstances[vid].destroy(); delete window.chartInstances[vid]; }
      return;
    }

    const rows = JSON.parse(localStorage.getItem('dm_dataset') || '[]');
    const color = v.formatConfig?.color || '#8B5CF6';
    const showLegend = v.formatConfig?.legend !== false;
    const fc = v.formatConfig || {};
    const yField = yFields[0];
    const aggKey0 = v.id + '_' + yWellName + '_' + yField;
    if (!window._dmAggState) window._dmAggState = {};
    const aggMethod = (window._dmAggState[aggKey0] || 'Sum').toUpperCase();

    // Build chart config
    let cfg = null;
    const vtype = v.type;

    if (vtype === 'scatter' || vtype === 'bubble') {
      const pts = rows.map(r => ({ x: parseFloat(r[xField]), y: parseFloat(r[yField]), r: 4 })).filter(p => !isNaN(p.x) && !isNaN(p.y)).slice(0, 300);
      cfg = {
        type: 'bubble',
        data: { datasets: [{ label: xField + ' vs ' + yField, data: pts, backgroundColor: color + '99', borderColor: color }] },
        options: dmBaseOpts(fc, showLegend, {})
      };
    } else if (['pie','donut'].includes(vtype)) {
      const lgF = (v.fieldConfig['Legend'] || [])[0] || xField;
      const vF = yField;
      const freq = {};
      if (lgF) rows.forEach(r => { const k = String(r[lgF] || 'Other'); freq[k] = (freq[k] || 0) + (vF ? parseFloat(r[vF]) || 1 : 1); });
      const entries = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 10);
      cfg = {
        type: 'doughnut',
        data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: PALETTE.concat(['#22C55E','#EF4444','#EC4899']), borderWidth: 0, hoverOffset: 8 }] },
        options: { ...dmBaseOpts(fc, showLegend, {}), cutout: vtype === 'donut' ? '65%' : '0%', scales: {} }
      };
    } else {
      // Grouped bar/line/area/etc.
      let labels = [], datasets = [];

      if (legendField) {
        const xVals = [...new Set(rows.map(r => String(r[xField] ?? '')))].filter(Boolean).slice(0, 30);
        const lVals = [...new Set(rows.map(r => String(r[legendField] ?? '')))].filter(Boolean).slice(0, 8);
        labels = xVals;
        datasets = lVals.map((lv, i) => ({
          label: lv,
          data: xVals.map(xv => {
            const subset = rows.filter(r => String(r[xField]) === xv && String(r[legendField]) === lv);
            return dmAggregate(subset, yField, aggMethod);
          }),
          backgroundColor: PALETTE[i % PALETTE.length] + 'CC',
          borderColor: PALETTE[i % PALETTE.length],
          borderWidth: fc.barBorder ? 2 : 1, borderRadius: 4,
          fill: ['area','stacked-area'].includes(vtype), tension: 0.4
        }));
      } else if (yFields.length > 1) {
        // Multiple Y fields
        const grouped = {};
        rows.forEach(r => { const k = String(r[xField] ?? 'Unknown'); if (!grouped[k]) grouped[k] = []; grouped[k].push(r); });
        labels = Object.keys(grouped).slice(0, 30);
        datasets = yFields.map((yf, i) => {
          const aggKeyI = v.id + '_' + yWellName + '_' + yf;
          const aggI = (window._dmAggState[aggKeyI] || 'Sum').toUpperCase();
          return {
            label: yf,
            data: labels.map(lbl => dmAggregate(grouped[lbl] || [], yf, aggI)),
            backgroundColor: PALETTE[i % PALETTE.length] + 'CC',
            borderColor: PALETTE[i % PALETTE.length],
            borderWidth: 1, borderRadius: 4,
            fill: ['area','stacked-area'].includes(vtype), tension: 0.4
          };
        });
      } else {
        const grouped = {};
        rows.forEach(r => { const k = String(r[xField] ?? 'Unknown'); if (!grouped[k]) grouped[k] = []; grouped[k].push(r); });
        let entries = Object.entries(grouped);
        // Apply sort
        if (fc.sortType === 'val') entries.sort((a,b) => { const av = dmAggregate(a[1],yField,aggMethod), bv = dmAggregate(b[1],yField,aggMethod); return fc.sortDir === 'asc' ? av-bv : bv-av; });
        else if (fc.sortType === 'lbl') entries.sort((a,b) => fc.sortDir === 'desc' ? String(b[0]).localeCompare(String(a[0])) : String(a[0]).localeCompare(String(b[0])));
        else entries.sort((a,b) => dmAggregate(b[1],yField,aggMethod) - dmAggregate(a[1],yField,aggMethod));
        entries = entries.slice(0, 20);
        labels = entries.map(e => e[0]);
        datasets = [{
          label: yField,
          data: entries.map(e => dmAggregate(e[1], yField, aggMethod)),
          backgroundColor: color + 'BB', borderColor: color,
          borderWidth: fc.barBorder ? 2 : 1, borderRadius: 4,
          fill: ['area','stacked-area'].includes(vtype), tension: 0.4,
          barPercentage: fc.barPad !== undefined ? (1 - fc.barPad) : 0.8
        }];
      }

      const isHoriz = ['clustered-bar','stacked-bar','100-bar'].includes(vtype);
      const isStacked = ['stacked-bar','stacked-col','stacked-area','100-bar'].includes(vtype);
      const chartType = ['line','area','stacked-area'].includes(vtype) ? 'line' : 'bar';
      const opts = dmBaseOpts(fc, showLegend, {});
      if (opts.scales) {
        opts.scales.x.stacked = isStacked;
        opts.scales.y.stacked = isStacked;
        if (fc.xTitle) { opts.scales.x.title = { display: true, text: fc.xTitle, color: '#9CA3AF', font: { size: 10 } }; }
        if (fc.yTitle) { opts.scales.y.title = { display: true, text: fc.yTitle, color: '#9CA3AF', font: { size: 10 } }; }
        opts.scales.x.display = fc.xAxis !== false;
        opts.scales.y.display = fc.yAxis !== false;
      }
      if (isHoriz) opts.indexAxis = 'y';

      cfg = { type: chartType, data: { labels, datasets }, options: { ...opts, onClick: (evt,els,chart) => handleChartClick(evt,els,chart,v,xField) } };
    }

    if (!cfg) return;

    // Destroy old instance & create new
    body.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-canvas-' + vid;
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    body.appendChild(canvas);
    if (window.chartInstances[vid]) { window.chartInstances[vid].destroy(); delete window.chartInstances[vid]; }
    Chart.defaults.color = '#9CA3AF'; Chart.defaults.font.family = 'Inter';
    window.chartInstances[vid] = new Chart(canvas.getContext('2d'), cfg);
  };

  function dmAggregate(rows, field, method) {
    const nums = rows.map(r => parseFloat(r[field])).filter(n => !isNaN(n));
    switch ((method || 'SUM')) {
      case 'SUM': return nums.reduce((a,b) => a+b, 0);
      case 'AVG': case 'AVERAGE': return nums.length ? nums.reduce((a,b) => a+b, 0)/nums.length : 0;
      case 'COUNT': return rows.length;
      case 'MIN': return nums.length ? Math.min(...nums) : 0;
      case 'MAX': return nums.length ? Math.max(...nums) : 0;
      default: return nums.reduce((a,b) => a+b, 0);
    }
  }

  function dmBaseOpts(fc, showLegend, extra) {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      plugins: {
        legend: {
          display: fc.legend !== false && showLegend,
          position: (fc.legendPos || 'bottom').toLowerCase(),
          labels: { color: '#9CA3AF', boxWidth: 10, padding: 10, font: { size: 10 } }
        }
      },
      scales: {
        x: { grid: { color: fc.xGrid !== false ? 'rgba(255,255,255,.04)' : 'transparent', display: fc.xGrid !== false }, ticks: { color: '#6B7280', font: { size: 9 } }, display: fc.xAxis !== false },
        y: { beginAtZero: true, reverse: !!fc.yInvert, grid: { color: fc.yGrid !== false ? 'rgba(255,255,255,.04)' : 'transparent', display: fc.yGrid !== false }, ticks: { color: '#6B7280', font: { size: 9 } }, display: fc.yAxis !== false }
      },
      ...extra
    };
  }

  // ── Patch renderVisualContent to call dmRenderActiveChart for selected visual ──
  const _dmOrigRVC = window.renderVisualContent;
  window.renderVisualContent = function(v) {
    if (!v) return;
    // For chart-type visuals that are selected, use dm engine exclusively
    if (selectedVisuals[0] === v.id && !['card','multi-card','table','matrix','slicer','gauge'].includes(v.type)) {
      window.activeVisualId = v.id;
      dmRenderActiveChart();
    } else {
      _dmOrigRVC.call(this, v);
    }
  };

  // ── Patch selectVisual to update activeVisualId and re-render ──
  const _dmOrigSelect = window.selectVisual;
  window.selectVisual = function(id) {
    _dmOrigSelect.call(this, id);
    window.activeVisualId = id;
    // Re-render the newly selected visual with dm engine
    const v = getVisual(id);
    if (v && !['card','multi-card','table','matrix','slicer','gauge'].includes(v.type)) {
      setTimeout(() => dmRenderActiveChart(), 50);
    }
  };

  // ── Wire chart type switching on already-selected visual ──
  const _dmOrigSVT = window.selectVisualType;
  window.selectVisualType = function(id) {
    const wasSelected = selectedVisuals[0];
    _dmOrigSVT.call(this, id);
    // If a visual is already selected, change its type instead of entering placement mode
    if (wasSelected && selectedVisuals.includes(wasSelected)) {
      const v = getVisual(wasSelected); if (!v) return;
      if (window.chartInstances[wasSelected]) { window.chartInstances[wasSelected].destroy(); delete window.chartInstances[wasSelected]; }
      v.type = id;
      v.title = VISUAL_TYPES.find(t => t.id === id)?.label || v.title;
      const titleEl = document.getElementById('title-' + wasSelected);
      if (titleEl) titleEl.textContent = v.title;
      clearSelectedType();
      updateFieldWells();
      dmRenderActiveChart();
      pushHistory();
      showToast('Changed chart type to ' + id, 'blue');
    }
  };

  // ── Patch setFc to also re-render chart via dmRenderActiveChart ──
  const _dmOrigSetFc = window.setFc;
  window.setFc = function(key, val) {
    if (!selectedVisuals.length) return;
    const v = getVisual(selectedVisuals[0]); if (!v) return;
    v.formatConfig = v.formatConfig || {}; v.formatConfig[key] = val;
    clearTimeout(window._dmFmtDebounce);
    window._dmFmtDebounce = setTimeout(() => {
      renderVisualContent(v);
      pushHistory();
    }, 120);
  };

  // ── Initialize on DOMContentLoaded ──
  document.addEventListener('DOMContentLoaded', () => {
    window._dmAggState = {};
    // Re-run detectFields with new logic
    detectFields();
  });

})();
