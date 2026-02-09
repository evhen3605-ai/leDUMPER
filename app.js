const API_URL = window.location.origin + '/api';

// State
let isProcessing = false;

// DOM Elements
const inputCode = document.getElementById('inputCode');
const outputCode = document.getElementById('outputCode');
const statusText = document.getElementById('statusText');
const statusLoader = document.getElementById('statusLoader');
const statsText = document.getElementById('statsText');
const deobfBtn = document.getElementById('deobfBtn');
const extractedData = document.getElementById('extractedData');

// Placeholder
inputCode.placeholder = `-- Paste your obfuscated Luau script here...
-- Supports: Luraph, Moonsec, IronBrew, PSU, Prometheus, etc.

-- Example:
-- local v1 = "\\" local v2 = string.char ...`;

// Main deobfuscation function
async function deobfuscate() {
    const code = inputCode.value.trim();
    
    if (!code) {
        showToast('Paste some code first!', 'error');
        return;
    }
    
    if (isProcessing) return;
    
    isProcessing = true;
    deobfBtn.disabled = true;
    statusLoader.classList.remove('hidden');
    statusText.textContent = 'Processing...';
    statusText.style.color = '#6C5CE7';
    outputCode.value = '';
    extractedData.style.display = 'none';
    
    const startTime = performance.now();
    
    try {
        const key = document.getElementById('scriptKey').value.trim();
        const placeId = document.getElementById('placeId').value.trim();
        const timeout = document.getElementById('timeout').value;
        
        const response = await fetch(`${API_URL}/deobfuscate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                key: key || null,
                placeId: placeId ? parseInt(placeId) : 123456789,
                timeout: parseInt(timeout)
            })
        });
        
        const data = await response.json();
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        
        if (data.success) {
            outputCode.value = data.output;
            statusText.textContent = `✅ Done in ${elapsed}s`;
            statusText.style.color = '#00b894';
            
            // Stats
            const stats = data.stats || {};
            statsText.textContent = `Lines: ${stats.total_lines || 0} | Remotes: ${stats.remote_calls || 0} | Strings: ${stats.suspicious_strings || 0}`;
            
            // Show extracted data
            if (data.urls?.length || data.remotes?.length || data.strings?.length) {
                showExtractedData(data);
            }
            
            showToast('Deobfuscation complete!', 'success');
        } else {
            statusText.textContent = `❌ Error: ${data.error}`;
            statusText.style.color = '#ff6b6b';
            outputCode.value = `-- Error: ${data.error}\n-- ${data.details || ''}`;
            showToast('Deobfuscation failed', 'error');
        }
    } catch (err) {
        statusText.textContent = '❌ Connection error';
        statusText.style.color = '#ff6b6b';
        outputCode.value = `-- Network error: ${err.message}\n-- Make sure the server is running.`;
        showToast('Server connection failed', 'error');
    } finally {
        isProcessing = false;
        deobfBtn.disabled = false;
        statusLoader.classList.add('hidden');
    }
}

// Show extracted data
function showExtractedData(data) {
    extractedData.style.display = 'block';
    
    const urlsList = document.getElementById('urlsList');
    const remotesList = document.getElementById('remotesList');
    const stringsList = document.getElementById('stringsList');
    
    urlsList.innerHTML = '';
    remotesList.innerHTML = '';
    stringsList.innerHTML = '';
    
    if (data.urls) {
        data.urls.forEach(url => {
            urlsList.innerHTML += `<div class="data-item url">${escapeHtml(url)}</div>`;
        });
    }
    
    if (data.remotes) {
        data.remotes.forEach(remote => {
            remotesList.innerHTML += `<div class="data-item remote">${escapeHtml(remote)}</div>`;
        });
    }
    
    if (data.strings) {
        data.strings.forEach(str => {
            stringsList.innerHTML += `<div class="data-item">${escapeHtml(str)}</div>`;
        });
    }
    
    if (!data.urls?.length) urlsList.innerHTML = '<div class="data-item">None found</div>';
    if (!data.remotes?.length) remotesList.innerHTML = '<div class="data-item">None found</div>';
    if (!data.strings?.length) stringsList.innerHTML = '<div class="data-item">None found</div>';
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

function loadFile() {
    document.getElementById('fileInput').click();
}

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        inputCode.value = e.target.result;
        showToast(`Loaded: ${file.name}`, 'success');
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function pasteClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        inputCode.value = text;
        showToast('Pasted from clipboard', 'success');
    } catch {
        showToast('Clipboard access denied', 'error');
    }
}

function clearInput() {
    inputCode.value = '';
    outputCode.value = '';
    extractedData.style.display = 'none';
    statusText.textContent = 'Ready';
    statusText.style.color = '#8888a0';
    statsText.textContent = '';
}

function copyOutput() {
    const text = outputCode.value;
    if (!text) {
        showToast('Nothing to copy', 'error');
        return;
    }
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success');
}

function downloadOutput() {
    const text = outputCode.value;
    if (!text) {
        showToast('Nothing to download', 'error');
        return;
    }
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deobfuscated_' + Date.now() + '.lua';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded!', 'success');
}

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        deobfuscate();
    }
});

// Tab support in textarea
inputCode.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = inputCode.selectionStart;
        const end = inputCode.selectionEnd;
        inputCode.value = inputCode.value.substring(0, start) + '    ' + inputCode.value.substring(end);
        inputCode.selectionStart = inputCode.selectionEnd = start + 4;
    }
});
