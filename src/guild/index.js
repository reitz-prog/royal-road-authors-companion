// Writers Guild Content Script
// Runs on rrwritersguild.com/shoutouts/dashboard
console.log('[RR Companion] Guild script loaded on:', window.location.href);

const isInIframe = window.parent !== window;

function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

async function extractShoutouts() {
  const entries = [];

  // Find all shoutout cards
  const cards = document.querySelectorAll('.rounded-lg.border');
  console.log('[RR Companion] Found cards:', cards.length);

  for (const card of cards) {
    // Find date - font-mono with YYYY-MM-DD format
    const dateEls = card.querySelectorAll('.font-mono');
    let date = null;

    for (const el of dateEls) {
      const text = el.textContent?.trim();
      if (text && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
        date = text;
        break;
      }
    }

    if (!date) continue;

    // Find and click the "Copy Code" button to get the code
    const copyBtn = card.querySelector('button');
    if (copyBtn && copyBtn.textContent.includes('Copy')) {
      try {
        // Click the copy button
        copyBtn.click();

        // Wait a bit for clipboard
        await new Promise(r => setTimeout(r, 100));

        // Read from clipboard
        const code = await navigator.clipboard.readText();

        if (code && code.includes('<')) {
          entries.push({ date, code });
          console.log('[RR Companion] Got shoutout for date:', date);
        }
      } catch (err) {
        console.log('[RR Companion] Clipboard read failed, trying DOM extraction');

        // Fallback: read from DOM
        const codeEl = card.querySelector('.whitespace-pre-wrap, .overflow-y-auto');
        if (codeEl) {
          let code = codeEl.textContent?.trim();
          if (code && code.includes('<')) {
            if (code.includes('&lt;')) {
              code = decodeHtmlEntities(code);
            }
            entries.push({ date, code });
            console.log('[RR Companion] Got shoutout for date (fallback):', date);
          }
        }
      }
    } else {
      // No copy button, try DOM extraction
      const codeEl = card.querySelector('.whitespace-pre-wrap, .overflow-y-auto');
      if (codeEl) {
        let code = codeEl.textContent?.trim();
        if (code && code.includes('<')) {
          if (code.includes('&lt;')) {
            code = decodeHtmlEntities(code);
          }
          entries.push({ date, code });
          console.log('[RR Companion] Got shoutout for date (DOM):', date);
        }
      }
    }
  }

  console.log('[RR Companion] Total entries found:', entries.length);
  return entries;
}

async function doImport() {
  const entries = await extractShoutouts();

  if (entries.length === 0) {
    chrome.runtime.sendMessage({
      type: 'guildImportResult',
      success: false,
      error: 'No shoutouts found. Make sure you are logged in.'
    });
    return;
  }

  // Send to background script
  chrome.runtime.sendMessage({
    type: 'importGuildShoutouts',
    entries
  }, (response) => {
    chrome.runtime.sendMessage({
      type: 'guildImportResult',
      success: response?.success || false,
      count: response?.count || 0,
      error: response?.error
    });
  });
}

// If in hidden iframe, auto-import after page loads
if (isInIframe) {
  console.log('[RR Companion] Running in iframe, will auto-import');

  let attempts = 0;
  const maxAttempts = 20;

  const checkAndImport = () => {
    attempts++;
    const cards = document.querySelectorAll('.rounded-lg.border');

    if (cards.length > 0) {
      console.log('[RR Companion] Content ready, importing...');
      setTimeout(doImport, 500);
    } else if (attempts < maxAttempts) {
      setTimeout(checkAndImport, 500);
    } else {
      console.log('[RR Companion] No content found after waiting');
      chrome.runtime.sendMessage({
        type: 'guildImportResult',
        success: false,
        error: 'Page did not load. Make sure you are logged into Writers Guild.'
      });
    }
  };

  setTimeout(checkAndImport, 1000);

} else {
  // Standalone - add import button
  console.log('[RR Companion] Running standalone, adding import button');

  function createImportButton() {
    if (document.getElementById('rr-companion-import-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'rr-companion-import-btn';
    btn.textContent = 'Import to Author\'s Companion';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      font-size: 14px;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Importing...';

      const entries = await extractShoutouts();

      if (entries.length === 0) {
        alert('No shoutouts found on this page.');
        btn.textContent = 'Import to Author\'s Companion';
        btn.disabled = false;
        return;
      }

      chrome.runtime.sendMessage({
        type: 'importGuildShoutouts',
        entries
      }, (response) => {
        if (response?.success) {
          btn.textContent = `Imported ${response.count}!`;
          btn.style.background = '#10b981';
          setTimeout(() => {
            btn.textContent = 'Import to Author\'s Companion';
            btn.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
            btn.disabled = false;
          }, 3000);
        } else {
          alert('Import failed: ' + (response?.error || 'Unknown error'));
          btn.textContent = 'Import to Author\'s Companion';
          btn.disabled = false;
        }
      });
    };

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(createImportButton, 1000));
  } else {
    setTimeout(createImportButton, 1000);
  }
}
