// ===== DATA MANAGEMENT =====

function saveDataset(data, columns, filename, 
  rowcount, colcount, missing, filesize) {
  localStorage.setItem('dm_dataset', 
    JSON.stringify(data.slice(0, 500)));
  localStorage.setItem('dm_columns', 
    JSON.stringify(columns));
  localStorage.setItem('dm_filename', filename);
  localStorage.setItem('dm_rowcount', String(rowcount));
  localStorage.setItem('dm_colcount', String(colcount));
  localStorage.setItem('dm_missing', String(missing));
  localStorage.setItem('dm_filesize', String(filesize));
}

function getDataset() {
  try {
    return JSON.parse(localStorage.getItem('dm_dataset') 
      || '[]');
  } catch { return []; }
}

function getColumns() {
  try {
    return JSON.parse(localStorage.getItem('dm_columns') 
      || '[]');
  } catch { return []; }
}

function getMeta() {
  return {
    filename: localStorage.getItem('dm_filename') || '',
    rowcount: localStorage.getItem('dm_rowcount') || '0',
    colcount: localStorage.getItem('dm_colcount') || '0',
    missing: localStorage.getItem('dm_missing') || '0',
    filesize: localStorage.getItem('dm_filesize') || '0',
    targetColumn: localStorage.getItem('dm_target_column') || '',
    problemType: localStorage.getItem('dm_problem_type') || ''
  };
}

function hasDataset() {
  const data = localStorage.getItem('dm_dataset');
  return data && data !== '[]' && data !== 'null';
}

function clearAllData() {
  const keys = Object.keys(localStorage).filter(k => 
    k.startsWith('dm_'));
  keys.forEach(k => localStorage.removeItem(k));
}

function requireDataset(redirectUrl = 'upload.html') {
  if (!hasDataset()) {
    window.location.href = redirectUrl;
    return false;
  }
  return true;
}

// ===== TOAST NOTIFICATIONS =====

function showToast(message, type = 'info', duration = 3000) {
  const existing = document.getElementById('dm-toast');
  if (existing) existing.remove();
  
  const colors = {
    success: 'bg-green-500/20 border-green-500/30 text-green-400',
    error: 'bg-red-500/20 border-red-500/30 text-red-400',
    info: 'bg-primary/20 border-primary/30 text-primary',
    warning: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
  };
  const icons = {
    success: 'check-circle', error: 'x-circle', 
    info: 'info', warning: 'alert-triangle'
  };
  
  const toast = document.createElement('div');
  toast.id = 'dm-toast';
  toast.className = `fixed bottom-6 right-6 z-[9999] 
    flex items-center gap-3 px-5 py-4 rounded-2xl 
    border backdrop-blur-md shadow-2xl 
    transition-all duration-300 translate-y-2 opacity-0 
    ${colors[type] || colors.info}`;
  toast.style.cssText = 'max-width: 380px; min-width: 250px;';
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" 
       class="w-5 h-5 flex-shrink-0"></i>
    <span class="text-sm font-medium">${message}</span>
    <button onclick="this.parentElement.remove()" 
      class="ml-auto text-current opacity-60 
      hover:opacity-100 flex-shrink-0">✕</button>`;
  
  document.body.appendChild(toast);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);
  
  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== CONFIRMATION MODAL =====

function showConfirm(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-dark/80 backdrop-blur-sm animate-fade-in';
  overlay.innerHTML = `
    <div class="glass max-w-sm w-full p-8 rounded-[2rem] border border-white/10 text-center shadow-2xl">
      <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
        <i data-lucide="help-circle" class="w-10 h-10"></i>
      </div>
      <h2 class="text-2xl font-bold mb-2 font-['Outfit']">${title}</h2>
      <p class="text-gray-400 mb-8 text-sm">${message}</p>
      <div class="flex gap-4">
        <button id="confirmCancel" class="flex-1 px-6 py-3 rounded-xl border border-white/10 text-gray-400 font-bold hover:bg-white/5 transition-colors">Cancel</button>
        <button id="confirmOk" class="flex-1 btn-primary py-3 rounded-xl font-bold">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  overlay.querySelector('#confirmCancel').onclick = () => overlay.remove();
  overlay.querySelector('#confirmOk').onclick = () => {
    onConfirm();
    overlay.remove();
  };
}

// ===== BUTTON LOADING STATE =====

function setLoading(button, isLoading, loadingText = 'Loading...') {
  if (isLoading) {
    button.disabled = true;
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `
      <div class="flex items-center gap-2">
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" 
          fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" 
            stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" 
            stroke-opacity="0.75"/>
        </svg>
        <span>${loadingText}</span>
      </div>`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalHtml || 
      loadingText;
  }
}

// ===== DETECT COLUMN TYPE =====

function detectColumnType(columnName, dataset) {
  const values = dataset
    .map(row => row[columnName])
    .filter(v => v !== null && v !== undefined && v !== '');
  if (values.length === 0) return 'empty';
  const numericCount = values.filter(v => 
    !isNaN(parseFloat(v))).length;
  const ratio = numericCount / values.length;
  if (ratio > 0.7) return 'numeric';
  const uniqueValues = new Set(values);
  if (uniqueValues.size === 2) return 'binary';
  if (uniqueValues.size <= 15) return 'categorical';
  return 'text';
}

// ===== GEMINI API HELPER =====

async function callGemini(prompt, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{text: prompt}]
        }]
      })
    }
  );
  if (!response.ok) throw new Error('API call failed');
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
