// ============================================================
// Prime Lead Pulse — Gmail Content Script (v3)
// Fixes:
//  - Duplicate button injection (check DOM, not dataset)
//  - Reduced polling (15s instead of 3s)
//  - Removed redundant CHECK_NOTIFICATIONS (background alarm handles it)
// ============================================================

const PRIME_STYLE_ID = 'prime-lead-pulse-styles';

// ------ Inject global CSS once ------
if (!document.getElementById(PRIME_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = PRIME_STYLE_ID;
  style.textContent = `
    .plp-badge {
      display: inline-flex !important;
      align-items: center !important;
      padding: 2px 8px !important;
      border-radius: 999px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      margin-right: 6px !important;
      white-space: nowrap !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .plp-badge-untracked { background: #f3f4f6 !important; color: #6b7280 !important; border: 1px solid #d1d5db !important; }
    .plp-badge-opened { background: #d1fae5 !important; color: #065f46 !important; border: 1px solid #6ee7b7 !important; }
    .plp-badge-clicked { background: #c7d2fe !important; color: #3730a3 !important; border: 1px solid #a5b4fc !important; }
    .plp-badge-unopened { background: #fef08a !important; color: #854d0e !important; border: 1px solid #fde047 !important; }

    .plp-panel {
      position: fixed;
      top: 60px;
      right: 0;
      width: 320px;
      height: calc(100vh - 60px);
      background: #fff;
      border-left: 1px solid #e5e7eb;
      box-shadow: -4px 0 16px rgba(0,0,0,0.08);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      font-family: 'Google Sans', Arial, sans-serif;
      font-size: 13px;
    }
    .plp-panel-header {
      padding: 14px 16px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .plp-panel-title { font-weight: 600; color: #111827; font-size: 14px; }
    .plp-panel-close {
      cursor: pointer;
      color: #9ca3af;
      font-size: 18px;
      line-height: 1;
      border: none;
      background: none;
      padding: 0 2px;
    }
    .plp-panel-close:hover { color: #374151; }
    .plp-panel-meta { padding: 12px 16px; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 12px; }
    .plp-panel-stats {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid #f3f4f6;
    }
    .plp-stat-box {
      background: #f9fafb;
      border-radius: 10px;
      padding: 10px 8px;
      text-align: center;
    }
    .plp-stat-num { font-size: 22px; font-weight: 700; color: #111827; }
    .plp-stat-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
    .plp-status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .plp-status-opened { background: #d1fae5; color: #065f46; }
    .plp-status-clicked { background: #c7d2fe; color: #3730a3; }
    .plp-status-untracked { background: #f3f4f6; color: #6b7280; }
    .plp-timeline-title {
      padding: 12px 16px 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
    }
    .plp-timeline-scroll { overflow-y: auto; flex: 1; padding: 0 16px 16px; }
    .plp-timeline-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid #f9fafb;
    }
    .plp-event-icon {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 13px;
    }
    .plp-event-open { background: #eff6ff; }
    .plp-event-click { background: #f0fdf4; }
    .plp-event-text { flex: 1; }
    .plp-event-label { font-weight: 500; color: #374151; }
    .plp-event-time { font-size: 11px; color: #9ca3af; margin-top: 1px; }
    .plp-event-url { font-size: 11px; color: #6366f1; margin-top: 3px; word-break: break-all; }
    .plp-view-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      border-radius: 999px;
      background: #eff6ff;
      color: #3b82f6;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      margin-left: 8px;
    }
    .plp-view-btn:hover { background: #dbeafe; }
  `;
  document.head.appendChild(style);
}

// ------ State ------
let emailCache = []; // [{id, subject, recipient, sender_email, opens, clicks, status, events}]
let panelEmailId = null;
let hasFetchedOnce = false; // Prevents premature "Untracked" badges before first data load

// ------ Helpers ------
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

function formatEventTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function getActiveSenderEmail() {
  const accountBtn = document.querySelector('a[aria-label*="@"]');
  if (accountBtn) {
    const match = accountBtn.getAttribute('aria-label').match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
    if (match) return match[1];
  }
  const titleMatch = document.title.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
  return titleMatch ? titleMatch[1] : null;
}

// ARCHITECTURE: Subject is the PRIMARY matching criterion (proven reliable in detail view).
// Recipient is ONLY used as a tiebreaker when multiple emails share the same subject.
// When duplicates exist, prefer the record with MORE tracking events (the pixel is linked to ONE record).
function findEmail(subject, recipientEmailOrArray) {
  if (!subject || emailCache.length === 0) return null;

  const cleanPrefixes = s => (s || '').replace(/^((Re|Fwd|Fw|Aw|Wg|Tr|Rv|Sv|Vs|Vl|Res|Enc):\s*)+/ig, '').trim();
  const strip = s => cleanPrefixes(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const uiSubj = strip(subject);
  if (uiSubj.length === 0) return null;

  const subjectMatches = [];
  for (const e of emailCache) {
    try {
      const dbSubj = strip(e.subject);
      if (dbSubj.length === 0) continue;
      if (uiSubj.includes(dbSubj) || dbSubj.includes(uiSubj)) {
        subjectMatches.push(e);
      }
    } catch (_) { /* skip */ }
  }

  if (subjectMatches.length === 0) return null;
  if (subjectMatches.length === 1) return subjectMatches[0];

  let candidates = subjectMatches;
  if (recipientEmailOrArray) {
    const recips = Array.isArray(recipientEmailOrArray) ? recipientEmailOrArray : [recipientEmailOrArray];
    const cleanRecips = recips.map(r => r.replace(/^To:\s*/i, '').trim().toLowerCase()).filter(Boolean);
    
    if (cleanRecips.length > 0) {
      const recipMatches = subjectMatches.filter(e => {
        const dbRecip = (e.recipient || '').toLowerCase();
        return cleanRecips.some(cr => dbRecip.includes(cr) || cr.includes(dbRecip));
      });
      if (recipMatches.length > 0) candidates = recipMatches;
    }
  }

  // Sort by created_at descending (newest email first) rather than activity.
  // Activity sorting causes OLD emails with opens to hijack NEW emails without opens!
  candidates.sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return candidates[0];
}

// ------ API Calls via background ------
let statsError = null;

async function fetchEmailStats() {
  const senderEmail = getActiveSenderEmail();
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'GET_STATS', senderEmail }, response => {
      if (response && response.success) {
        statsError = null;
        emailCache = response.data.emails.map(email => {
          const opens = (email.tracking_events || []).filter(e => e.event_type === 'open');
          const clicks = (email.tracking_events || []).filter(e => e.event_type === 'click');
          let status = 'Unopened'; // In the DB = tracked. Default to Unopened, not Untracked.
          if (clicks.length > 0) status = 'Clicked';
          else if (opens.length > 0) status = 'Opened';
          return { ...email, opens: opens.length, clicks: clicks.length, status, events: email.tracking_events || [] };
        });
        console.log(`Prime Lead Pulse: Cache loaded with ${emailCache.length} tracked emails.`);
        // Force a UI refresh now that we have new data
        setTimeout(() => {
          injectSentBadges();
          injectEmailViewFeatures();
        }, 100);
      } else {
        statsError = response?.error || 'Failed to connect';
        console.error('Prime Lead Pulse: Failed to fetch stats.', statsError);
      }
      hasFetchedOnce = true;
      resolve();
    });
  });
}

/// ------ Sent Folder Badge Injection ------
function injectSentBadges() {
  // CRITICAL: Don't inject any badges until we have actual data from the server.
  // Otherwise the MutationObserver stamps "Untracked" on everything before the cache loads.
  if (!hasFetchedOnce) return;

  const hash = window.location.hash.toLowerCase();
  if (hash.includes('#draft') || hash.includes('in%3adraft') || hash.includes('in:draft')) {
    return; // Don't show tracking badges in drafts view
  }

  const emailRows = document.querySelectorAll('tr.zA');
  if (emailRows.length > 0 && !window.hasLoggedBadgeAttempt) {
    console.log(`Prime Lead Pulse: Found ${emailRows.length} email rows, cache has ${emailCache.length} tracked emails.`);
    window.hasLoggedBadgeAttempt = true;
  }

  emailRows.forEach(row => {
    try {
      // Prioritize [email] attribute which contains the raw email address
      const recipientSpan = row.querySelector('[email]') || row.querySelector('.yP, .zF, span[name]');
      if (!recipientSpan) return;
      const recipientEmail = recipientSpan.getAttribute('email') || recipientSpan.textContent || '';

      const subjectEl = row.querySelector('span[data-thread-id], span.bqe, .bog, .y6');
      if (!subjectEl) return;

      let subject = subjectEl.textContent.trim();
      const record = findEmail(subject, recipientEmail);

      let badge = row.querySelector('.plp-badge');
      const isNew = !badge;

      if (!badge) {
        badge = document.createElement('span');
        badge.dataset.plpBadge = 'true';
      }
      
      badge.className = 'plp-badge';
  
      if (statsError) {
        badge.className += ' plp-badge-untracked';
        badge.textContent = 'Auth Error';
        badge.title = statsError;
      } else if (!record) {
        badge.className += ' plp-badge-untracked';
        badge.textContent = 'Untracked';
        badge.title = '';
      } else if (record.clicks > 0) {
        badge.className += ' plp-badge-clicked';
        badge.textContent = `Clicked ${record.clicks}x`;
        const clickedUrls = [...new Set((record.events || []).filter(e => e.event_type === 'click' && e.url).map(e => e.url))];
        badge.title = clickedUrls.length > 0 ? 'Clicked Links:\n' + clickedUrls.map(u => '🔗 ' + u).join('\n') : '';
      } else if (record.opens > 0) {
        badge.className += ' plp-badge-opened';
        badge.textContent = `Opened ${record.opens}x`;
        badge.title = '';
      } else {
        badge.className += ' plp-badge-unopened';
        badge.textContent = 'Unopened';
        badge.title = '';
      }
  
      if (isNew) {
        const senderEl = row.querySelector('.yW');
        if (senderEl) {
          senderEl.insertBefore(badge, senderEl.firstChild);
        } else {
          // Absolute fallback if .yW is missing
          const titleCell = row.querySelector('td.xY.a4W');
          if (titleCell) {
            titleCell.insertBefore(badge, titleCell.firstChild);
          } else {
            subjectEl.parentElement.insertBefore(badge, subjectEl);
          }
        }
      }

      const triggerPanel = (e, isHover) => {
        e.stopPropagation();
        let to = 'Unknown';
        const senderEl = row.querySelector('.yW');
        if (senderEl) {
          const clone = senderEl.cloneNode(true);
          const b = clone.querySelector('.plp-badge');
          if (b) b.remove();
          to = clone.textContent.trim();
        }
        
        const dateEl = row.querySelector('.xW.xY span');
        const sentDate = dateEl ? dateEl.getAttribute('title') || dateEl.textContent : '';
        
        showPanel(record || { recipient: recipientEmail, subject, status: 'Untracked', opens: 0, clicks: 0, events: [] }, subject, to, sentDate, isHover);
      };

      badge.style.cursor = 'pointer';
      badge.onclick = (e) => triggerPanel(e, false);
      badge.onmouseenter = (e) => triggerPanel(e, true);
      badge.onmouseleave = (e) => {
        const panel = document.getElementById('plp-panel');
        if (panel && panel.dataset.pinned === 'false') {
          removePanel();
        }
      };
    } catch (err) {
      console.error('Prime Lead Pulse: Error injecting badge for row', err);
    }
  });
}

// ------ Right-Side Activity Panel ------
function removePanel() {
  const existing = document.getElementById('plp-panel');
  if (existing) existing.remove();
  panelEmailId = null;
}

function showPanel(record, subject, to, sentDate, isHover = false) {
  removePanel();
  if (!record) return;
  panelEmailId = record.id;

  const panel = document.createElement('div');
  panel.id = 'plp-panel';
  panel.className = 'plp-panel';
  panel.dataset.pinned = isHover ? 'false' : 'true';

  const statusClass = record.status === 'Clicked' ? 'plp-status-clicked'
    : record.status === 'Opened' ? 'plp-status-opened' : 'plp-status-untracked';

  const eventsHtml = [...record.events]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(ev => {
      const isOpen = ev.event_type === 'open';
      return `
        <div class="plp-timeline-item">
          <div class="plp-event-icon ${isOpen ? 'plp-event-open' : 'plp-event-click'}">
            ${isOpen ? '👁️' : '🔗'}
          </div>
          <div class="plp-event-text">
            <div class="plp-event-label">${isOpen ? 'Opened email' : 'Clicked link'}</div>
            <div class="plp-event-time">${formatEventTime(ev.created_at)}</div>
            ${!isOpen && ev.url ? `<div class="plp-event-url">${escapeHtml(ev.url)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

  panel.innerHTML = `
    <div class="plp-panel-header">
      <span class="plp-panel-title">${escapeHtml(subject || 'Email Details')}</span>
      <button class="plp-panel-close" id="plp-close-btn">✕</button>
    </div>
    <div class="plp-panel-meta">
      <div>To: ${escapeHtml(to || record.recipient || '')}</div>
      ${sentDate ? `<div>Sent: ${escapeHtml(sentDate)}</div>` : ''}
    </div>
    <div class="plp-panel-stats">
      <div class="plp-stat-box">
        <div class="plp-stat-num">${record.opens}</div>
        <div class="plp-stat-label">Opens</div>
      </div>
      <div class="plp-stat-box">
        <div class="plp-stat-num">${record.clicks}</div>
        <div class="plp-stat-label">Clicks</div>
      </div>
      <div class="plp-stat-box" style="display:flex;align-items:center;justify-content:center;">
        <span class="plp-status-badge ${statusClass}">${record.status}</span>
      </div>
    </div>
    <div class="plp-timeline-title">Activity Timeline</div>
    <div class="plp-timeline-scroll">${eventsHtml || '<div style="color:#9ca3af;padding:16px 0;text-align:center;">No activity yet</div>'}</div>
  `;

  document.body.appendChild(panel);
  document.getElementById('plp-close-btn').addEventListener('click', removePanel);
}

// ------ Detect open email and inject View Activity button ------
function injectEmailViewFeatures() {
  // Check if we're viewing a single email
  const subjectEl = document.querySelector('h2.hP');
  if (!subjectEl) return;

  const subject = subjectEl.textContent.trim();
  const allEmailsInView = Array.from(document.querySelectorAll('[email]')).map(el => el.getAttribute('email')).filter(Boolean);
  const record = findEmail(subject, allEmailsInView);

  // We NO LONGER auto-open the panel here. The user must click the Pill or the "View Activity" button.
  if (!record) {
    removePanel();
  }

  // Inject "View Activity (N)" button in thread view
  const dateRows = document.querySelectorAll('.g3');
  dateRows.forEach(dateEl => {
    if (dateEl.dataset.plpBtn) return;
    if (!record) return;
    const total = record.opens + record.clicks;
    const btn = document.createElement('button');
    btn.className = 'plp-view-btn';
    btn.textContent = `View Activity (${total})`;
    btn.onclick = (e) => {
      e.stopPropagation();
      const to = document.querySelector('.gD')?.getAttribute('email') || '';
      showPanel(record, subject, to, '');
    };
    dateEl.parentElement.insertBefore(btn, dateEl.nextSibling);
    dateEl.dataset.plpBtn = 'true';
  });
}

// ------ Compose Window Injection ------
function injectComposeTool(composeWindow) {
  if (composeWindow.querySelector('.plp-compose-toolbar')) return;

  const sendBtn = composeWindow.querySelector('.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3');
  if (!sendBtn) return; 

  const bottomToolbarWrapper = sendBtn.closest('.gU.Up') || sendBtn.closest('table');
  if (!bottomToolbarWrapper) return;

  // Create a completely separate row (div) for our tools
  const container = document.createElement('div');
  container.className = 'plp-compose-toolbar'; // Used for duplicate detection
  container.style.cssText = 'display:flex;align-items:center;padding:8px 12px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;gap:16px;margin-bottom:4px;border-radius:4px;';

  // "Use Template" Button
  const tplBtn = document.createElement('div');
  tplBtn.style.position = 'relative';
  tplBtn.innerHTML = `<button type="button" style="display:inline-flex;align-items:center;gap:6px;background:white;border:1px solid #cbd5e1;color:#334155;font-size:12px;font-weight:600;cursor:pointer;padding:6px 12px;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
    Use Template
  </button>`;
  
  const dropdown = document.createElement('div');
  dropdown.style.cssText = 'display:none;position:absolute;bottom:100%;left:0;margin-bottom:8px;background:white;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);width:250px;max-height:300px;overflow-y:auto;z-index:999;';
  tplBtn.appendChild(dropdown);

  tplBtn.querySelector('button').onclick = () => {
    if (dropdown.style.display === 'block') {
      dropdown.style.display = 'none';
      return;
    }
    dropdown.innerHTML = '<div style="padding:12px;text-align:center;color:#64748b;font-size:12px;">Loading templates...</div>';
    dropdown.style.display = 'block';
    
    const senderEmail = getActiveSenderEmail();
    chrome.runtime.sendMessage({ action: 'GET_TEMPLATES', senderEmail }, response => {
      if (!response || !response.success) {
        dropdown.innerHTML = '<div style="padding:12px;color:#ef4444;font-size:12px;">Error loading templates</div>';
        return;
      }
      if (response.data.templates.length === 0) {
        dropdown.innerHTML = '<div style="padding:12px;text-align:center;color:#64748b;font-size:12px;">No templates found. Create one in the dashboard.</div>';
        return;
      }
      dropdown.innerHTML = '';
      response.data.templates.forEach(tpl => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:13px;color:#0f172a;';
        item.textContent = tpl.name;
        item.onmouseover = () => item.style.background = '#f8fafc';
        item.onmouseout = () => item.style.background = 'white';
        item.onclick = () => {
          const subjInput = composeWindow.querySelector('input[name="subjectbox"]');
          if (subjInput) subjInput.value = tpl.subject || '';
          const bodyDiv = composeWindow.querySelector('div[contenteditable="true"]');
          if (bodyDiv) bodyDiv.innerHTML = escapeHtml(tpl.body || '').replace(/\n/g, '<br/>') + '<br/><br/>' + bodyDiv.innerHTML;
          dropdown.style.display = 'none';
        };
        dropdown.appendChild(item);
      });
    });
  };

  document.addEventListener('click', (e) => {
    if (!tplBtn.contains(e.target)) dropdown.style.display = 'none';
  });

  // "Best Time" Button
  const timeBtn = document.createElement('div');
  timeBtn.innerHTML = `<button type="button" style="display:inline-flex;align-items:center;gap:6px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:600;cursor:pointer;padding:6px 12px;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.background='#fde68a'" onmouseout="this.style.background='#fef3c7'">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    Best Time
  </button>`;
  timeBtn.onclick = () => window.open('https://prime-lead-pulse.vercel.app/dashboard/calendar', '_blank', 'width=800,height=600');

  // Track Checkbox (styled like a toggle)
  const trackWrapper = document.createElement('div');
  trackWrapper.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#dcfce7;border:1px solid #bbf7d0;padding:6px 12px;border-radius:16px;cursor:pointer;';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'prime-track-checkbox';
  checkbox.checked = true;
  checkbox.id = `plp-chk-${Date.now()}`;
  checkbox.style.cssText = 'cursor:pointer;accent-color:#16a34a;';
  const label = document.createElement('label');
  label.htmlFor = checkbox.id;
  label.innerHTML = '<span style="color:#16a34a;font-weight:bold;margin-right:4px;">●</span>Track Opens';
  label.style.cssText = 'font-size:12px;color:#166534;font-weight:600;cursor:pointer;user-select:none;';
  trackWrapper.onclick = (e) => {
    if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
  };
  trackWrapper.appendChild(checkbox);
  trackWrapper.appendChild(label);

  container.appendChild(tplBtn);
  container.appendChild(timeBtn);
  container.appendChild(trackWrapper);
  
  // Insert our new row precisely above the bottom formatting table
  bottomToolbarWrapper.parentElement.insertBefore(container, bottomToolbarWrapper);
}

// ------ Send Interception ------
// Catch Ctrl+Enter / Cmd+Enter keyboard shortcuts AND focused Enter/Space
document.addEventListener('keydown', (e) => {
  const isCtrlEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
  
  const activeEl = document.activeElement;
  const isSendBtnFocused = activeEl && (
    activeEl.matches('div[aria-label^="Send"], .T-I.J-J5-Ji.aoO.v7.T-I-atl.L3') || 
    activeEl.closest('div[aria-label^="Send"], .T-I.J-J5-Ji.aoO.v7.T-I-atl.L3')
  );
  const isFocusedEnter = isSendBtnFocused && (e.key === 'Enter' || e.key === ' ');

  if (isCtrlEnter || isFocusedEnter) {
    const compose = e.target.closest('div[role="dialog"], .M9');
    if (!compose) return;
    
    const checkbox = compose.querySelector('.prime-track-checkbox');
    if (!checkbox || !checkbox.checked) return;
    
    const sendBtn = compose.querySelector('div[aria-label^="Send"], .T-I.J-J5-Ji.aoO.v7.T-I-atl.L3');
    if (sendBtn) {
      // Prevent Gmail from sending immediately via keyboard
      e.preventDefault();
      e.stopPropagation();
      // Simulate a click on the Send button so our click interceptor handles it
      sendBtn.click();
    }
  }
}, true);

document.addEventListener('click', async (e) => {
  const isSend = e.target.closest('div[aria-label^="Send"]') ||
    e.target.closest('.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3');
  if (!isSend) return;

  const compose = e.target.closest('div[role="dialog"], .M9');
  if (!compose) return;

  const checkbox = compose.querySelector('.prime-track-checkbox');
  if (!checkbox || !checkbox.checked) return;

  // Prevent duplicate CREATE_EMAIL if user double-clicks Send
  if (compose.dataset.plpSending === 'true') {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  compose.dataset.plpSending = 'true';

  e.preventDefault();
  e.stopPropagation();

  const btn = isSend.closest('[role="button"]') || isSend;
  btn.style.opacity = '0.5';
  btn.style.pointerEvents = 'none';

  const senderEmail = getActiveSenderEmail() || 'unknown';
  const chipElements = Array.from(compose.querySelectorAll('[data-hovercard-id]'));
  let recipientList = [...new Set(chipElements.map(el => el.getAttribute('data-hovercard-id')).filter(Boolean))];
  let recipient = recipientList.join(', ');
  
  if (!recipient) {
    const legacyChips = Array.from(compose.querySelectorAll('div[email]'));
    let legacyList = [...new Set(legacyChips.map(c => c.getAttribute('email')).filter(Boolean))];
    recipient = legacyList.join(', ');
  }
  if (!recipient) {
    recipient = compose.querySelector('input[name="to"]')?.value || 'Unknown Recipient';
  }
  const subject = compose.querySelector('input[name="subjectbox"]')?.value ?? 'No Subject';

  // Generate a UUID locally so we don't have to wait for the Vercel server response
  const emailId = crypto.randomUUID();
  
  // Safety net: If chrome.storage fails (extension reloaded, context invalidated),
  // send the email without tracking instead of freezing forever.
  let storageCallbackFired = false;
  const safetyTimeout = setTimeout(() => {
    if (storageCallbackFired) return;
    storageCallbackFired = true;
    console.warn('Prime Lead Pulse: Storage callback timed out. Sending email without tracking. Please refresh Gmail.');
    checkbox.checked = false;
    btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
    delete compose.dataset.plpSending;
    btn.click();
  }, 3000);

  try {
    chrome.storage.local.get(['apiUrl'], ({ apiUrl }) => {
      if (storageCallbackFired) return; // Safety timeout already fired
      storageCallbackFired = true;
      clearTimeout(safetyTimeout);

      if (false) {
        console.warn('Prime Lead Pulse: Cannot track email because API URL is not set. Please log in.');
        checkbox.checked = false;
        btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
        delete compose.dataset.plpSending;
        btn.click();
        return;
      }
      const base = "https://prime-lead-pulse-sigma.vercel.app";
      const body = compose.querySelector('div[aria-label="Message Body"]');
      if (body) {
        const pixel = document.createElement('img');
        pixel.src = `${base}/api/track/pixel/${emailId}`;
        pixel.width = 1; pixel.height = 1; pixel.style.display = 'none';
        body.appendChild(pixel);

        body.querySelectorAll('a').forEach(a => {
          const skipProtocols = ['mailto:', 'tel:', 'javascript:', '#'];
          if (skipProtocols.some(p => a.href.startsWith(p)) || !a.href) return;
          
          a.href = `${base}/api/track/link/${emailId}?url=${encodeURIComponent(a.href)}`;
        });
      }
      
      // 2. Dispatch the real click to Gmail instantly (UI is completely unblocked)
      checkbox.checked = false;
      btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
      delete compose.dataset.plpSending;
      btn.click();
      
      // OPTIMISTIC CACHE UPDATE:
      // Instantly add to local cache so if the user jumps to the Sent folder,
      // it says "Unopened" instead of flashing "Untracked" while waiting for the server/poll.
      const newEmail = { id: emailId, sender_email: senderEmail, recipient: recipient, subject: subject, created_at: new Date().toISOString(), status: 'Unopened', opens: 0, clicks: 0, events: [] }; emailCache.push(newEmail); chrome.storage.local.get(['cached_emails_' + senderEmail], (data) => { const cache = data['cached_emails_' + senderEmail] || []; cache.push(newEmail); chrome.storage.local.set({ ['cached_emails_' + senderEmail]: cache }); });
      
      // Force UI refresh of sent badges
      setTimeout(injectSentBadges, 100);

      // 3. Fire the tracking call to the backend asynchronously over the wall
      chrome.runtime.sendMessage({
        action: 'CREATE_EMAIL',
        payload: { id: emailId, sender_email: senderEmail, recipient, subject }
      }, response => {
        if (!response || !response.success) {
          console.error("Prime Lead Pulse background tracking failed:", response?.error || response?.data?.error);
        }
      });
    });
  } catch (e) {
    // Extension context invalidated — just send the email
    clearTimeout(safetyTimeout);
    if (!storageCallbackFired) {
      storageCallbackFired = true;
      console.warn('Prime Lead Pulse: Extension context error. Sending without tracking.', e);
      checkbox.checked = false;
      btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
      delete compose.dataset.plpSending;
      btn.click();
    }
  }
}, true);

// ------ Master MutationObserver ------
let statsTimeout = null;
const observer = new MutationObserver(() => {
  // 1. Compose windows (popouts and inline replies) need instant injection
  document.querySelectorAll('div[role="dialog"], .M9').forEach(injectComposeTool);

  // 2. Refresh the UI instantly using current cache
  clearTimeout(statsTimeout);
  statsTimeout = setTimeout(() => {
    injectSentBadges();
    injectEmailViewFeatures();
  }, 150); // fast UI refresh
});

observer.observe(document.body, { childList: true, subtree: true });

// ------ Storage Listener (No Polling) ------
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const currentEmail = getActiveSenderEmail();
    if (currentEmail && changes[`cached_emails_${currentEmail}`]) {
      fetchEmailStats().then(() => {
        injectSentBadges();
        injectEmailViewFeatures();
      });
    }
  }
});

// Initial load and persistent background polling trigger
function triggerPoll() {
  chrome.runtime.sendMessage({ action: 'FORCE_POLL' });
}

triggerPoll();
setInterval(triggerPoll, 10000); // Trigger background poll every 10 seconds

// Actually load the UI from local storage
fetchEmailStats().then(() => {
  injectSentBadges();
  injectEmailViewFeatures();
});

console.log('Prime Lead Pulse: Content script v3 loaded.');
