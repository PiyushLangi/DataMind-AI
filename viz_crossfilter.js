// ===== DM CROSS-FILTER ENGINE =====
// Integrates with viz_fix.js — patches dmRenderActiveChart post-render
// to wire up Chart.js onClick callbacks, manage filter state, and refresh all visuals.

window.DM_CROSSFILTER = { active: {} };
window.visualConfigs = {};

// ── Types that participate in cross-filtering (as source AND target) ──
const CF_TYPES = new Set([
  'clustered-bar', 'stacked-bar', '100-bar', 'clustered-col', 'stacked-col',
  'line', 'area', 'stacked-area', 'combo', 'waterfall', 'funnel',
  'pie', 'donut'
]);

// ── Local aggregation helper (mirrors dmAggregate in viz_fix.js) ──
function cfAggregate(rows, field, method) {
  const nums = rows.map(r => parseFloat(r[field])).filter(n => !isNaN(n));
  switch ((method || 'SUM').toUpperCase()) {
    case 'SUM': return nums.reduce((a, b) => a + b, 0);
    case 'AVG':
    case 'AVERAGE': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case 'COUNT': return rows.length;
    case 'MIN': return nums.length ? Math.min(...nums) : 0;
    case 'MAX': return nums.length ? Math.max(...nums) : 0;
    default: return nums.reduce((a, b) => a + b, 0);
  }
}

// ── Get filtered rows, skipping any filter sourced from excludeVisualId ──
function getFilteredRows(excludeVisualId) {
  let rows = JSON.parse(localStorage.getItem('dm_dataset') || '[]');
  Object.entries(window.DM_CROSSFILTER.active).forEach(([vid, filter]) => {
    if (vid === excludeVisualId) return;           // a visual never filters itself
    rows = rows.filter(r => {
      const rv = String(r[filter.field] ?? '').trim();
      const fv = String(filter.value ?? '').trim();
      return rv === fv;
    });
  });
  return rows;
}

// ── Update the cross-filter indicator bar ──
function updateCrossFilterBar() {
  const bar = document.getElementById('crossFilterBar');
  const text = document.getElementById('crossFilterText');
  if (!bar || !text) return;
  const entries = Object.values(window.DM_CROSSFILTER.active);
  if (!entries.length) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  text.textContent = 'Filtered by: ' +
    entries.map(f => `${f.field} = ${f.label}`).join(' · ');
}

// ── Refresh every chart on the active page using filtered data ──
function refreshAllVisuals() {
  updateCrossFilterBar();
  const hasFilters = Object.keys(window.DM_CROSSFILTER.active).length > 0;
  const visuals = (typeof currentPage === 'function') ? currentPage().visuals : [];

  visuals.forEach(v => {
    const chart = window.chartInstances?.[v.id];
    if (!chart) {
      // No chart instance yet — do a full re-render (uses patched applyFilters → getFilteredRows)
      if (!['slicer','card','multi-card','table','matrix','gauge'].includes(v.type)) {
        const fullV = (typeof getVisual === 'function') ? getVisual(v.id) : null;
        if (fullV && typeof renderVisualContent === 'function') renderVisualContent(fullV);
      }
      return;
    }
    const cfg = window.visualConfigs[v.id];
    if (!cfg || !cfg.xField) return;               // chart not yet configured

    const rows = getFilteredRows(v.id);
    const xField = cfg.xField;
    const yField = cfg.yFields[0];
    const aggMethod = cfg.aggregation || 'SUM';
    const baseColor = v.formatConfig?.color || '#8B5CF6';

    // ── Pie / Donut ──
    if (['pie', 'donut'].includes(v.type)) {
      const lgF = cfg.legendField || xField;
      const freq = {};
      rows.forEach(r => {
        const k = String(r[lgF] || 'Other');
        freq[k] = (freq[k] || 0) + (yField ? parseFloat(r[yField]) || 1 : 1);
      });
      const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
      chart.data.labels = entries.map(e => e[0]);
      chart.data.datasets[0].data = entries.map(e => e[1]);
      chart.update('active');

      // Dim tile if another visual is filtering a field this pie uses
      _applyTileDim(v.id, hasFilters);
      return;
    }

    // ── Bar / Line / Area / etc. ──
    const grouped = {};
    rows.forEach(r => {
      const k = String(r[xField] ?? 'Unknown');
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(r);
    });

    let entries = Object.entries(grouped);
    const fc = v.formatConfig || {};
    if (fc.sortType === 'val')
      entries.sort((a, b) => { const av = cfAggregate(a[1], yField, aggMethod), bv = cfAggregate(b[1], yField, aggMethod); return fc.sortDir === 'asc' ? av - bv : bv - av; });
    else if (fc.sortType === 'lbl')
      entries.sort((a, b) => fc.sortDir === 'desc' ? String(b[0]).localeCompare(String(a[0])) : String(a[0]).localeCompare(String(b[0])));
    else
      entries.sort((a, b) => cfAggregate(b[1], yField, aggMethod) - cfAggregate(a[1], yField, aggMethod));
    entries = entries.slice(0, 20);

    const newLabels = entries.map(e => e[0]);
    const newValues = entries.map(e => cfAggregate(e[1], yField, aggMethod));

    // ── Compute per-bar colors with dimming ──
    let bgColors;
    if (hasFilters) {
      // Filters from OTHER visuals that share the same xField → dim non-matching bars
      const relevantFilters = Object.entries(window.DM_CROSSFILTER.active)
        .filter(([fvid]) => fvid !== v.id)
        .filter(([, f]) => f.field === xField);

      if (relevantFilters.length > 0) {
        const matchSet = new Set(relevantFilters.map(([, f]) => String(f.label).trim()));
        bgColors = newLabels.map(lbl =>
          matchSet.has(String(lbl).trim()) ? baseColor + 'EE' : baseColor + '22'
        );
      } else {
        // Filters exist but on different fields — show data normally (already row-filtered)
        bgColors = newLabels.map(() => baseColor + 'BB');
      }
    } else {
      bgColors = newLabels.map(() => baseColor + 'BB');
    }

    // Update chart in-place
    chart.data.labels = newLabels;
    if (chart.data.datasets[0]) {
      chart.data.datasets[0].data = newValues;
      chart.data.datasets[0].backgroundColor = bgColors;
      chart.data.datasets[0].borderColor = hasFilters
        ? newLabels.map(lbl => {
          const isMatch = Object.entries(window.DM_CROSSFILTER.active)
            .filter(([fvid]) => fvid !== v.id)
            .some(([, f]) => f.field === xField && String(f.label).trim() === String(lbl).trim());
          return isMatch ? baseColor : baseColor + '44';
        })
        : baseColor;
    }

    // Multiple datasets (multi-series / legend split)
    if (chart.data.datasets.length > 1) {
      chart.data.datasets.forEach((ds, i) => {
        const PALETTE = ['#8B5CF6', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B'];
        const c = PALETTE[i % PALETTE.length];
        ds.backgroundColor = hasFilters ? newLabels.map(() => c + '99') : c + 'CC';
        ds.borderColor = c;
      });
    }

    chart.update('active');
    _applyTileDim(v.id, hasFilters);
  });
}

// Dim tile border if a cross-filter is sourced from it
function _applyTileDim(vid, hasFilters) {
  const tile = document.getElementById('tile-' + vid);
  if (!tile) return;
  const isSource = !!window.DM_CROSSFILTER.active[vid];
  if (isSource) {
    tile.style.boxShadow = '0 0 0 2px #8B5CF6, 0 0 16px rgba(139,92,246,.4)';
  } else if (hasFilters) {
    // Keep existing selected style but no glow
    tile.style.boxShadow = tile.classList.contains('selected')
      ? '0 0 0 2px rgba(59,130,246,.3)' : '';
  } else {
    tile.style.boxShadow = tile.classList.contains('selected')
      ? '0 0 0 2px rgba(59,130,246,.3)' : '';
  }
}

// ── Inject crossFilterBar below the canvas toolbar ──
function injectCrossFilterBar() {
  if (document.getElementById('crossFilterBar')) return;
  const canvasWrapper = document.getElementById('canvasWrapper');
  if (!canvasWrapper) return;

  const bar = document.createElement('div');
  bar.id = 'crossFilterBar';
  bar.className = 'hidden';
  bar.style.cssText = [
    'display:flex', 'align-items:center', 'gap:10px',
    'padding:6px 14px', 'margin:0 8px 6px',
    'background:rgba(139,92,246,.07)',
    'border:1px solid rgba(139,92,246,.25)',
    'border-radius:10px', 'font-size:12px',
    'flex-shrink:0', 'position:relative', 'z-index:10'
  ].join(';');
  bar.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      style="flex-shrink:0">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
    <span id="crossFilterText" style="color:rgba(255,255,255,.7);flex:1;">
      Filtered by:
    </span>
    <button id="clearAllFilters" style="
      font-size:11px;font-weight:700;color:#8B5CF6;
      background:none;border:none;cursor:pointer;padding:2px 6px;
      border:1px solid rgba(139,92,246,.3);border-radius:6px;
      transition:background .15s;white-space:nowrap;
    " onmouseover="this.style.background='rgba(139,92,246,.15)'"
       onmouseout="this.style.background='none'">
      Clear all filters
    </button>`;

  // Insert between toolbar div and canvasWrapper
  canvasWrapper.parentElement.insertBefore(bar, canvasWrapper);

  document.getElementById('clearAllFilters').addEventListener('click', () => {
    window.DM_CROSSFILTER.active = {};
    refreshAllVisuals();
    updateCrossFilterBar();
  });
}

// ── Patch dmRenderActiveChart to register visualConfigs and wire onClick ──
(function patchRenderForCrossFilter() {
  // Wait until dmRenderActiveChart is defined by viz_fix.js
  function doPatch() {
    if (typeof window.dmRenderActiveChart !== 'function') {
      setTimeout(doPatch, 80);
      return;
    }

    const _orig = window.dmRenderActiveChart;
    window.dmRenderActiveChart = function () {
      _orig.call(this);

      const vid = window.activeVisualId;
      if (!vid) return;
      const v = (typeof getVisual === 'function') ? getVisual(vid) : null;
      if (!v) return;

      // Only wire cross-filter for participating chart types
      if (!CF_TYPES.has(v.type)) return;

      const chart = window.chartInstances?.[vid];
      if (!chart) return;

      // Store visual field config
      const wells = (typeof WELL_CONFIG !== 'undefined' ? WELL_CONFIG[v.type] : null) || [];
      const xWN = wells.find(w => w === 'X Axis' || w === 'Category' || w === 'Field') || wells[0] || '';
      const yWN = wells.find(w => w === 'Y Axis' || w === 'Values') || wells[1] || wells[0] || '';
      const xField = (v.fieldConfig?.[xWN] || [])[0] || '';
      const yFields = v.fieldConfig?.[yWN] || [];
      const aggKey = vid + '_' + yWN + '_' + (yFields[0] || '');
      const agg = (window._dmAggState?.[aggKey] || 'Sum').toUpperCase();

      window.visualConfigs[vid] = {
        xField,
        yFields,
        legendField: (v.fieldConfig?.['Legend'] || [])[0] || '',
        chartType: v.type,
        aggregation: agg
      };

      if (!xField) return;   // can't cross-filter without an xField

      // Wire Chart.js onClick
      chart.options.onClick = function (event, elements) {
        if (!elements || !elements.length) {
          // Click on empty canvas area → clear this visual's own filter
          if (window.DM_CROSSFILTER.active[vid]) {
            delete window.DM_CROSSFILTER.active[vid];
            refreshAllVisuals();
          }
          return;
        }
        const idx = elements[0].index;
        const label = chart.data.labels?.[idx];
        if (label === undefined || label === null) return;

        const field = window.visualConfigs[vid]?.xField;

        // Toggle: same label clicked again → deselect
        if (window.DM_CROSSFILTER.active[vid]?.label === String(label)) {
          delete window.DM_CROSSFILTER.active[vid];
        } else {
          window.DM_CROSSFILTER.active[vid] = {
            field,
            value: String(label),
            label: String(label)
          };
        }
        refreshAllVisuals();
      };

      // Apply without animation so onClick is live immediately
      chart.update('none');
    };
  }

  doPatch();
})();

// ── Boot on DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {
  injectCrossFilterBar();

  // If page switches, clear cross-filters (new page = fresh state)
  const _origSwitchPage = window.switchPage;
  if (typeof _origSwitchPage === 'function') {
    window.switchPage = function (i) {
      window.DM_CROSSFILTER.active = {};
      _origSwitchPage.call(this, i);
      updateCrossFilterBar();
    };
  }
});

// ── Patch applyFilters so ALL renders (including original renderVisualContent path)
//    respect DM_SLICERS, DM_PAGEFILTERS, and DM_CROSSFILTER via getFilteredRows ──
document.addEventListener('DOMContentLoaded', function () {
  if (typeof window.applyFilters === 'function') {
    window.applyFilters = function (data, excludeId) {
      return getFilteredRows(excludeId);
    };
  }
});

// ── Patch window.renderSlicer (defined by viz_filters.js) to sync slicer state
//    into DM_CROSSFILTER.active so the cross-filter indicator bar shows slicer filters ──
(function patchSlicerCF() {
  function doPatch() {
    if (typeof window.renderSlicer !== 'function') { setTimeout(doPatch, 120); return; }
    var _origRS = window.renderSlicer;
    window.renderSlicer = function (v, body, data) {
      _origRS.call(this, v, body, data);
      var vid = v.id;

      function syncCF() {
        var sf = window.DM_SLICERS && window.DM_SLICERS[vid];
        if (!sf || !sf.field) { delete window.DM_CROSSFILTER.active[vid]; updateCrossFilterBar(); return; }

        if (sf.type === 'categorical') {
          if (sf.selectedValues && sf.selectedValues.length) {
            window.DM_CROSSFILTER.active[vid] = {
              field: sf.field,
              value: sf.selectedValues[0],
              label: sf.field + ': ' + (sf.selectedValues.length === 1
                ? sf.selectedValues[0]
                : sf.selectedValues.slice(0, 2).join(', ') + (sf.selectedValues.length > 2 ? ' +' + (sf.selectedValues.length - 2) : ''))
            };
          } else {
            delete window.DM_CROSSFILTER.active[vid];
          }
        } else if (sf.type === 'numeric') {
          if (sf.min !== '' && sf.max !== '') {
            window.DM_CROSSFILTER.active[vid] = {
              field: sf.field, value: sf.min + '~' + sf.max,
              label: sf.field + ': ' + sf.min + ' – ' + sf.max
            };
          } else { delete window.DM_CROSSFILTER.active[vid]; }
        } else if (sf.type === 'date') {
          if (sf.from || sf.to) {
            window.DM_CROSSFILTER.active[vid] = {
              field: sf.field, value: (sf.from || '') + '~' + (sf.to || ''),
              label: sf.field + ': ' + (sf.from || '…') + ' → ' + (sf.to || '…')
            };
          } else { delete window.DM_CROSSFILTER.active[vid]; }
        } else {
          delete window.DM_CROSSFILTER.active[vid];
        }
        updateCrossFilterBar();
      }

      // Observe all user interaction inside the slicer tile body
      body.addEventListener('click',  function () { setTimeout(syncCF, 260); });
      body.addEventListener('change', function () { setTimeout(syncCF, 260); });
      body.addEventListener('input',  function () { setTimeout(syncCF, 260); });
    };
  }
  doPatch();
})();
