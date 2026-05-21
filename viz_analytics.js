// ===== DM ANALYTICS + READING VIEW + EXPORT =====

// ── Global tooltip defaults ──
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(3,3,5,0.92)';
Chart.defaults.plugins.tooltip.borderColor      = 'rgba(255,255,255,0.1)';
Chart.defaults.plugins.tooltip.borderWidth      = 1;
Chart.defaults.plugins.tooltip.cornerRadius     = 12;
Chart.defaults.plugins.tooltip.padding          = 12;
Chart.defaults.plugins.tooltip.titleColor       = '#ffffff';
Chart.defaults.plugins.tooltip.titleFont        = { family: 'Outfit', size: 13, weight: 'bold' };
Chart.defaults.plugins.tooltip.bodyColor        = 'rgba(255,255,255,0.7)';
Chart.defaults.plugins.tooltip.bodyFont         = { family: 'Inter', size: 12 };

// ── Analytics lines plugin ──
const analyticsPlugin = {
  id: 'analyticsLines',
  afterDraw(chart) {
    const vid = chart.canvas?.id?.replace('chart-canvas-', '');
    if (!vid) return;
    const config = window.visualConfigs?.[vid]?.analytics;
    if (!config) return;
    const ctx    = chart.ctx;
    const yScale = chart.scales?.y;
    const xScale = chart.scales?.x;
    if (!yScale || !xScale) return;

    const rawData   = chart.data.datasets?.[0]?.data || [];
    const numValues = rawData.map(v => typeof v === 'object' ? v.y : v).map(Number).filter(v => !isNaN(v));
    if (!numValues.length) return;

    function drawHLine(value, color, label, dash) {
      if (value === null || value === undefined || isNaN(value)) return;
      const y = yScale.getPixelForValue(value);
      if (y < yScale.top || y > yScale.bottom) return;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash(dash || [5, 3]);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.moveTo(xScale.left, y);
      ctx.lineTo(xScale.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle  = color;
      ctx.font       = 'bold 9px Inter';
      ctx.textAlign  = 'right';
      ctx.fillText(label + ': ' + value.toFixed(2), xScale.right - 4, y - 4);
      ctx.restore();
    }

    const sorted  = [...numValues].sort((a, b) => a - b);
    const avg     = numValues.reduce((a, b) => a + b, 0) / numValues.length;
    const mid     = sorted.length;
    const median  = mid % 2 === 0 ? (sorted[mid/2-1] + sorted[mid/2]) / 2 : sorted[Math.floor(mid/2)];

    if (config.avgLine?.enabled)    drawHLine(avg,         config.avgLine.color,    'Avg',    [5, 3]);
    if (config.medianLine?.enabled) drawHLine(median,      config.medianLine.color, 'Median', [8, 4]);
    if (config.minLine?.enabled)    drawHLine(sorted[0],   config.minLine.color,    'Min',    [3, 3]);
    if (config.maxLine?.enabled)    drawHLine(sorted[sorted.length-1], config.maxLine.color, 'Max', [3, 3]);

    if (config.percentileLine?.enabled) {
      const p   = (config.percentileLine.value || 75) / 100;
      const idx = Math.min(Math.floor(p * sorted.length), sorted.length - 1);
      drawHLine(sorted[idx], config.percentileLine.color, 'P' + config.percentileLine.value, [4, 2]);
    }

    (config.constantLines || []).forEach(cl => {
      drawHLine(parseFloat(cl.value), cl.color || '#8B5CF6', cl.label || 'Const', [6, 3]);
    });

    if (config.trendLine?.enabled && !['pie','doughnut'].includes(chart.config.type) && numValues.length >= 2) {
      const n    = numValues.length;
      const xs   = numValues.map((_, i) => i);
      const sumX = xs.reduce((a, b) => a + b, 0);
      const sumY = numValues.reduce((a, b) => a + b, 0);
      const sumXY = xs.reduce((s, x, i) => s + x * numValues[i], 0);
      const sumX2 = xs.reduce((s, x) => s + x * x, 0);
      const denom   = n * sumX2 - sumX * sumX || 1;
      const slope   = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      const x1 = xScale.left, x2 = xScale.right;
      const y1 = yScale.getPixelForValue(intercept);
      const y2 = yScale.getPixelForValue(slope * (n - 1) + intercept);
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([6, 3]);
      ctx.strokeStyle = config.trendLine.color;
      ctx.lineWidth   = 2;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle  = config.trendLine.color;
      ctx.font       = 'bold 9px Inter';
      ctx.textAlign  = 'right';
      ctx.fillText('Trend', x2 - 4, Math.min(y2 - 4, yScale.bottom - 4));
      ctx.restore();
    }
  }
};
Chart.register(analyticsPlugin);

// ── Default analytics config for a visual ──
function defaultAnalytics() {
  return {
    avgLine:      { enabled: false, color: '#8B5CF6' },
    medianLine:   { enabled: false, color: '#3B82F6' },
    minLine:      { enabled: false, color: '#06B6D4' },
    maxLine:      { enabled: false, color: '#10B981' },
    trendLine:    { enabled: false, color: '#F59E0B' },
    percentileLine: { enabled: false, value: 75, color: '#EF4444' },
    constantLines: []
  };
}

// ── Build analytics pane UI ──
function buildAnalyticsPaneForVisual(v) {
  const el = document.getElementById('analyticsContent');
  if (!el) return;

  const NO_ANALYTICS = ['pie','donut','table','matrix','card','multi-card','slicer','gauge','treemap'];
  if (NO_ANALYTICS.includes(v?.type)) {
    el.innerHTML = '<p class="text-[10px] text-gray-500 italic px-1">No analytics lines available for this visual type.</p>';
    return;
  }

  if (!window.visualConfigs) window.visualConfigs = {};
  if (!window.visualConfigs[v.id]) window.visualConfigs[v.id] = {};
  if (!window.visualConfigs[v.id].analytics) window.visualConfigs[v.id].analytics = defaultAnalytics();
  const cfg = window.visualConfigs[v.id].analytics;

  function toggleRow(key, label, cfg_obj) {
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);">
      <label style="position:relative;display:inline-block;width:28px;height:15px;flex-shrink:0;">
        <input type="checkbox" class="an-toggle" data-key="${key}" ${cfg_obj.enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;position:absolute;">
        <span class="an-slider" style="position:absolute;inset:0;border-radius:8px;background:${cfg_obj.enabled ? '#8B5CF6' : 'rgba(255,255,255,.1)'};cursor:pointer;transition:background .2s;">
          <span style="position:absolute;top:2px;left:${cfg_obj.enabled ? '14px' : '2px'};width:11px;height:11px;border-radius:50%;background:#fff;transition:left .2s;"></span>
        </span>
      </label>
      <span style="flex:1;font-size:11px;color:rgba(255,255,255,.7);">${label}</span>
      <input type="color" class="an-color" data-key="${key}" value="${cfg_obj.color}" style="width:20px;height:20px;border:none;border-radius:4px;cursor:pointer;background:transparent;padding:0;">
    </div>`;
  }

  el.innerHTML = `
    <div style="padding:2px 0;">
      ${toggleRow('avgLine',    'Average Line',  cfg.avgLine)}
      ${toggleRow('medianLine', 'Median Line',   cfg.medianLine)}
      ${toggleRow('minLine',    'Min Line',      cfg.minLine)}
      ${toggleRow('maxLine',    'Max Line',      cfg.maxLine)}
      ${toggleRow('trendLine',  'Trend Line',    cfg.trendLine)}
      <div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);">
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="position:relative;display:inline-block;width:28px;height:15px;flex-shrink:0;">
            <input type="checkbox" class="an-toggle" data-key="percentileLine" ${cfg.percentileLine.enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;position:absolute;">
            <span class="an-slider" style="position:absolute;inset:0;border-radius:8px;background:${cfg.percentileLine.enabled ? '#8B5CF6' : 'rgba(255,255,255,.1)'};cursor:pointer;transition:background .2s;">
              <span style="position:absolute;top:2px;left:${cfg.percentileLine.enabled ? '14px' : '2px'};width:11px;height:11px;border-radius:50%;background:#fff;transition:left .2s;"></span>
            </span>
          </label>
          <span style="flex:1;font-size:11px;color:rgba(255,255,255,.7);">Percentile Line</span>
          <input type="number" class="an-pct-val fmt-input" min="0" max="100" value="${cfg.percentileLine.value}" style="width:38px;font-size:10px;padding:2px 4px;text-align:center;">
          <input type="color" class="an-color" data-key="percentileLine" value="${cfg.percentileLine.color}" style="width:20px;height:20px;border:none;border-radius:4px;cursor:pointer;background:transparent;padding:0;">
        </div>
      </div>
      <div style="padding:6px 0 4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em;">Constant Lines</span>
          <button id="an-add-const" style="font-size:10px;color:#8B5CF6;background:none;border:1px solid rgba(139,92,246,.3);border-radius:5px;padding:1px 7px;cursor:pointer;">+ Add</button>
        </div>
        <div id="an-const-list"></div>
        <div id="an-const-form" style="display:none;background:rgba(255,255,255,.03);border-radius:6px;padding:6px;margin-top:4px;">
          <input type="number" id="an-cf-val"   class="fmt-input" placeholder="Value"  style="width:100%;font-size:11px;padding:2px 6px;margin-bottom:4px;box-sizing:border-box;">
          <input type="text"   id="an-cf-label" class="fmt-input" placeholder="Label"  style="width:100%;font-size:11px;padding:2px 6px;margin-bottom:4px;box-sizing:border-box;">
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="color" id="an-cf-color" value="#8B5CF6" style="width:24px;height:24px;border:none;border-radius:4px;cursor:pointer;background:transparent;padding:0;flex-shrink:0;">
            <button id="an-cf-ok" style="flex:1;font-size:10px;font-weight:700;color:#fff;background:#8B5CF6;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;">Add Line</button>
            <button id="an-cf-cancel" style="font-size:10px;color:rgba(255,255,255,.4);background:none;border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:3px 8px;cursor:pointer;">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;

  renderConstList(cfg, v.id);

  // Toggle switches
  el.querySelectorAll('.an-toggle').forEach(inp => {
    inp.addEventListener('change', function() {
      const key = this.dataset.key;
      if (cfg[key]) cfg[key].enabled = this.checked;
      const slider = this.nextElementSibling;
      if (slider) {
        slider.style.background = this.checked ? '#8B5CF6' : 'rgba(255,255,255,.1)';
        const knob = slider.querySelector('span');
        if (knob) knob.style.left = this.checked ? '14px' : '2px';
      }
      updateAnalyticsChart(v.id);
    });
  });

  // Color pickers
  el.querySelectorAll('.an-color').forEach(inp => {
    inp.addEventListener('input', function() {
      const key = this.dataset.key;
      if (cfg[key]) cfg[key].color = this.value;
      updateAnalyticsChart(v.id);
    });
  });

  // Percentile value
  el.querySelector('.an-pct-val')?.addEventListener('input', function() {
    cfg.percentileLine.value = parseInt(this.value) || 75;
    updateAnalyticsChart(v.id);
  });

  // Constant line add
  el.querySelector('#an-add-const').addEventListener('click', () => {
    el.querySelector('#an-const-form').style.display = '';
  });
  el.querySelector('#an-cf-cancel').addEventListener('click', () => {
    el.querySelector('#an-const-form').style.display = 'none';
  });
  el.querySelector('#an-cf-ok').addEventListener('click', () => {
    const val   = parseFloat(el.querySelector('#an-cf-val').value);
    const label = el.querySelector('#an-cf-label').value || 'Const';
    const color = el.querySelector('#an-cf-color').value;
    if (isNaN(val)) return;
    cfg.constantLines.push({ value: val, label, color });
    renderConstList(cfg, v.id);
    el.querySelector('#an-const-form').style.display = 'none';
    el.querySelector('#an-cf-val').value   = '';
    el.querySelector('#an-cf-label').value = '';
    updateAnalyticsChart(v.id);
  });
}

function renderConstList(cfg, vid) {
  const el = document.getElementById('an-const-list');
  if (!el) return;
  if (!cfg.constantLines.length) { el.innerHTML = '<p style="font-size:10px;color:rgba(255,255,255,.3);padding:2px 0;">No constant lines</p>'; return; }
  el.innerHTML = cfg.constantLines.map((cl, i) =>
    `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:10px;">
      <div style="width:10px;height:10px;border-radius:50%;background:${cl.color};flex-shrink:0;"></div>
      <span style="flex:1;color:rgba(255,255,255,.6);">${cl.label}: ${cl.value}</span>
      <button onclick="window._dmDeleteConst('${vid}',${i})" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,.3);font-size:12px;line-height:1;padding:0 2px;">×</button>
    </div>`
  ).join('');
}

window._dmDeleteConst = function(vid, idx) {
  const cfg = window.visualConfigs?.[vid]?.analytics;
  if (!cfg) return;
  cfg.constantLines.splice(idx, 1);
  renderConstList(cfg, vid);
  updateAnalyticsChart(vid);
};

function updateAnalyticsChart(vid) {
  const chart = window.chartInstances?.[vid];
  if (chart) chart.update();
}

// ── Patch updateRightPanel / analyticsTab click ──
document.addEventListener('DOMContentLoaded', () => {
  // Re-build analytics pane when analytics tab is clicked
  const aBtn = document.getElementById('analyticsTabBtn');
  if (aBtn) {
    aBtn.addEventListener('click', () => {
      if (!selectedVisuals?.length) return;
      const v = (typeof getVisual === 'function') ? getVisual(selectedVisuals[0]) : null;
      if (v) buildAnalyticsPaneForVisual(v);
    });
  }
});

// Patch selectVisual to also rebuild analytics pane if analytics tab is active
const _dmOrigSelAn = window.selectVisual;
window.selectVisual = function(id) {
  if (typeof _dmOrigSelAn === 'function') _dmOrigSelAn.call(this, id);
  const aTab = document.getElementById('analyticsTab');
  if (aTab && !aTab.classList.contains('hidden')) {
    const v = (typeof getVisual === 'function') ? getVisual(id) : null;
    if (v) buildAnalyticsPaneForVisual(v);
  }
};

// ══════════════════ READING VIEW ══════════════════
window.DM_READING_MODE = false;

// Floating exit button (injected once)
function ensureExitBtn() {
  if (document.getElementById('dm-exit-reading')) return;
  const btn = document.createElement('button');
  btn.id = 'dm-exit-reading';
  btn.textContent = '✎ Edit';
  btn.style.cssText = 'display:none;position:fixed;bottom:24px;right:24px;z-index:9999;background:#8B5CF6;color:#fff;border:none;border-radius:999px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 8px 32px rgba(139,92,246,.5);';
  btn.addEventListener('click', () => toggleReadingView());
  document.body.appendChild(btn);
}

const _origToggleRV_an = window.toggleReadingView;
window.toggleReadingView = function() {
  ensureExitBtn();
  window.DM_READING_MODE = !window.DM_READING_MODE;
  const entering = window.DM_READING_MODE;

  // Panels — select by position in flex layout
  const mainFlex = document.querySelector('.dashboard-container > main > div.flex');
  if (mainFlex) {
    const children = mainFlex.children;
    if (children[0]) children[0].style.display = entering ? 'none' : ''; // left panel
    if (children[2]) children[2].style.display = entering ? 'none' : ''; // right panel
  }

  // Canvas toolbar
  const toolbar = document.querySelector('#canvasWrapper')?.previousElementSibling;
  if (toolbar) toolbar.style.display = entering ? 'none' : '';

  // Cross-filter indicator bar
  const cfBar = document.getElementById('crossFilterBar');
  if (cfBar && entering) cfBar.style.display = 'none';
  else if (cfBar && !entering) cfBar.style.display = '';

  // Tile chrome
  document.querySelectorAll('.tile-header').forEach(h => {
    h.style.cursor = entering ? 'default' : 'move';
    h.querySelectorAll('button').forEach(b => b.style.display = entering ? 'none' : '');
  });
  document.querySelectorAll('.resize-handle').forEach(h => {
    h.style.display  = entering ? 'none' : '';
    h.style.pointerEvents = entering ? 'none' : '';
  });
  document.querySelectorAll('.visual-tile').forEach(t => {
    if (entering) t.classList.remove('selected');
  });

  // Button label
  const btn = document.getElementById('readingViewBtn');
  if (btn) {
    btn.innerHTML = entering
      ? '<i data-lucide="edit" class="w-3 h-3"></i>Edit'
      : '<i data-lucide="eye"  class="w-3 h-3"></i>Reading View';
    btn.style.borderColor = entering ? '#06B6D4' : '';
    btn.style.color       = entering ? '#06B6D4' : '';
  }

  document.getElementById('dm-exit-reading').style.display = entering ? '' : 'none';
  if (typeof lucide !== 'undefined') lucide.createIcons();
};

// ══════════════════ EXPORT CSV PER VISUAL ══════════════════
function exportVisualToCSV(vid) {
  const v = (typeof getVisual === 'function') ? getVisual(vid) : null;
  if (!v) return;
  const cfg    = window.visualConfigs?.[vid] || {};
  const xField = cfg.xField || '';
  const yFields = cfg.yFields || [];
  const fields  = [xField, ...yFields].filter(Boolean);

  if (!fields.length) {
    if (typeof showToast === 'function') showToast('No fields assigned to this visual', 'red');
    return;
  }

  const rows = (typeof getFilteredRows === 'function') ? getFilteredRows(vid) : JSON.parse(localStorage.getItem('dm_dataset') || '[]');
  const header = fields.map(f => JSON.stringify(f)).join(',');
  const body   = rows.map(r => fields.map(f => JSON.stringify(r[f] ?? '')).join(',')).join('\n');
  const csv    = header + '\n' + body;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = (v.title || 'visual') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('CSV exported: ' + a.download, 'green');
}

// Wire CSV export into the existing exportVisualCSV function
window.exportVisualCSV = function() {
  if (!selectedVisuals?.length) return;
  exportVisualToCSV(selectedVisuals[0]);
};

// Also expose globally for context menu calls
window.dmExportCSV = exportVisualToCSV;
