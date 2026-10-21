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
    .plp-icon-btn {
      width: 28px !important;
      height: 28px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      border: none !important;
      background: transparent !important;
      padding: 0 !important;
      margin: 0 2px !important;
      transition: background-color 0.15s ease, transform 0.1s ease !important;
      user-select: none !important;
      vertical-align: middle !important;
    }
    .plp-icon-btn:hover { background-color: rgba(128, 128, 128, 0.25) !important; }
    .plp-icon-btn:active { transform: scale(0.92) !important; }
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
let knownUserEmails = new Set();

function updateKnownUserEmails() {
  chrome.storage.local.get(['session', 'sessions'], data => {
    if (data.session?.user?.email) knownUserEmails.add(data.session.user.email.toLowerCase());
    if (data.sessions) {
      Object.keys(data.sessions).forEach(em => knownUserEmails.add(em.toLowerCase()));
      Object.values(data.sessions).forEach(s => {
        if (s.user?.email) knownUserEmails.add(s.user.email.toLowerCase());
      });
    }
  });
}
updateKnownUserEmails();

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

function getActiveSenderEmail(composeWindow) {
  // 1. If compose window has an explicit "from" dropdown input (multi-send-as identities)
  if (composeWindow) {
    const fromInput = composeWindow.querySelector('input[name="from"], select[name="from"]');
    if (fromInput && fromInput.value) {
      const match = fromInput.value.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
      if (match) return match[1].toLowerCase();
    }
  }

  // 2. Active Gmail user account profile button (top-right of screen)
  const accountBtn = document.querySelector('a[aria-label*="@"], button[aria-label*="@"], [aria-label*="Google Account" i]');
  if (accountBtn) {
    const label = accountBtn.getAttribute('aria-label') || '';
    const match = label.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
    if (match) return match[1].toLowerCase();
  }

  // 3. Document title (e.g. "Sent Mail - vicky@diyflatfee.com - Gmail")
  const titleMatch = document.title.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
  if (titleMatch) return titleMatch[1].toLowerCase();

  // 4. Fallback to known user sessions in extension storage
  if (knownUserEmails && knownUserEmails.size > 0) {
    return Array.from(knownUserEmails)[0].toLowerCase();
  }

  return 'unknown';
}

function recipientMatchesThread(eRecipient, participantEmails, participantNames, senderText) {
  if (!eRecipient) return false;
  const cleanDbRecip = eRecipient.toLowerCase();

  // 1. Direct email match
  for (const pEmail of participantEmails) {
    if (pEmail && (cleanDbRecip.includes(pEmail) || pEmail.includes(cleanDbRecip))) {
      return true;
    }
  }

  // 2. Direct name match (ignore 'me', only names >= 3 chars)
  for (const pName of participantNames) {
    if (pName && pName !== 'me' && pName.length >= 3) {
      if (cleanDbRecip.includes(pName) || pName.includes(cleanDbRecip)) {
        return true;
      }
    }
  }

  // 3. Sender text match
  // Extract tokens from dbRecip, e.g. "John Doe <john@gmail.com>" -> "john", "doe"
  const tokens = cleanDbRecip.replace(/<[^>]+>/g, '').split(/[^a-z0-9]+/i).filter(t => t.length >= 3 && t !== 'com' && t !== 'gmail' && t !== 'yahoo' && t !== 'outlook');
  for (const tok of tokens) {
    if (senderText.includes(tok)) {
      return true;
    }
  }

  return false;
}

function findEmailForThread(subject, participantEmails, participantNames, senderText, isSentView) {
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
      if (uiSubj === dbSubj) {
        subjectMatches.push(e);
      }
    } catch (_) { /* skip */ }
  }

  // Fallback for truncated titles (Gmail often truncates long subjects in list view)
  if (subjectMatches.length === 0 && uiSubj.length >= 12) {
    for (const e of emailCache) {
      const dbSubj = strip(e.subject);
      if (dbSubj.length >= 12 && (uiSubj.startsWith(dbSubj) || dbSubj.startsWith(uiSubj))) {
        subjectMatches.push(e);
      }
    }
  }

  if (subjectMatches.length === 0) return null;

  // Filter by recipient matching
  const recipMatches = subjectMatches.filter(e => {
    return recipientMatchesThread(e.recipient, participantEmails, participantNames, senderText);
  });

  let candidates = recipMatches;
  // If recipient extraction was ambiguous or multi-party thread in Inbox/Sent, fall back to subject matches
  if (candidates.length === 0 && subjectMatches.length > 0) {
    candidates = subjectMatches;
  }

  if (candidates.length === 0) return null;

  // Sort by created_at descending (newest reply/email first)
  candidates.sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return candidates[0];
}

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
      // Exact normalized match
      if (uiSubj === dbSubj) {
        subjectMatches.push(e);
      }
    } catch (_) { /* skip */ }
  }

  // Fallback for truncated titles (Gmail often truncates long subjects in list view)
  if (subjectMatches.length === 0 && uiSubj.length >= 12) {
    for (const e of emailCache) {
      const dbSubj = strip(e.subject);
      if (dbSubj.length >= 12 && (uiSubj.startsWith(dbSubj) || dbSubj.startsWith(uiSubj))) {
        subjectMatches.push(e);
      }
    }
  }

  if (subjectMatches.length === 0) return null;
  if (subjectMatches.length === 1 && !recipientEmailOrArray) return subjectMatches[0];

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

  // Sort by created_at descending (newest email first)
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
  let senderEmail = getActiveSenderEmail(); if (senderEmail) senderEmail = senderEmail.toLowerCase();
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

// ------ Sent & Inbox Replied Conversation Badge Injection ------
function injectSentBadges() {
  if (!hasFetchedOnce) return;

  const hash = (window.location.hash || '').toLowerCase();
  const isSentView = hash.startsWith('#sent') || hash.includes('/sent') || hash.includes('label/sent');
  const isDraftsOrSpamOrTrash = hash.startsWith('#drafts') || hash.startsWith('#spam') || hash.startsWith('#trash');

  if (isDraftsOrSpamOrTrash) {
    document.querySelectorAll('tr.zA .plp-badge').forEach(b => b.remove());
    return;
  }

  const emailRows = document.querySelectorAll('tr.zA');
  if (emailRows.length === 0) return;

  emailRows.forEach(row => {
    try {
      const subjectEl = row.querySelector('.bog') || row.querySelector('span.bqe') || row.querySelector('span[data-thread-id]');
      if (!subjectEl) return;
      const clone = subjectEl.cloneNode(true);
      clone.querySelectorAll('.y2').forEach(el => el.remove());
      let subject = clone.textContent.trim();

      const senderCell = row.querySelector('.yW');
      const senderText = (senderCell ? senderCell.textContent : '').toLowerCase();

      // Collect all participant emails and names in this thread row
      const participantEls = row.querySelectorAll('.yW [email], .yW .yP, .yW .zF, .yW span[name], td.yX [email]');
      const participantEmails = [];
      const participantNames = [];
      participantEls.forEach(el => {
        const em = el.getAttribute('email');
        if (em) participantEmails.push(em.toLowerCase().trim());
        const nm = el.getAttribute('name') || el.textContent;
        if (nm) participantNames.push(nm.toLowerCase().trim());
      });

      const currentUser = (getActiveSenderEmail() || '').toLowerCase();
      if (currentUser) knownUserEmails.add(currentUser);

      const isCurrentUserParticipant = (currentUser && participantEmails.includes(currentUser)) ||
                                       participantEmails.some(em => knownUserEmails.has(em));

      // In Inbox / non-sent views: A conversation only belongs to the user if they sent/replied ("me" in participant cell or matches user accounts)
      const hasMe = isSentView || 
                    /\bme\b/.test(senderText) || 
                    senderText.startsWith('me,') || 
                    senderText.includes(', me') || 
                    isCurrentUserParticipant;

      // If the user has NEVER sent/replied in this thread, skip it! No ghost badges on incoming emails.
      if (!hasMe) {
        const existingBadge = row.querySelector('.plp-badge');
        if (existingBadge) existingBadge.remove();
        return;
      }

      // Match against sent email cache
      const record = findEmailForThread(subject, participantEmails, participantNames, senderText, isSentView);

      let badge = row.querySelector('.plp-badge');
      const isNew = !badge;

      if (!badge) {
        badge = document.createElement('span');
        badge.dataset.plpBadge = 'true';
      }
      
      badge.className = 'plp-badge';
  
      if (!record) {
        badge.className += ' plp-badge-untracked';
        badge.textContent = 'Untracked';
        badge.title = 'This conversation was sent without tracking';
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
        badge.title = 'Recipient has not opened this email yet';
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
        let to = record ? record.recipient : (participantNames[0] || 'Unknown');
        const senderEl = row.querySelector('.yW');
        if (senderEl) {
          const clone = senderEl.cloneNode(true);
          const b = clone.querySelector('.plp-badge');
          if (b) b.remove();
          to = clone.textContent.trim() || to;
        }
        
        const dateEl = row.querySelector('.xW.xY span');
        const sentDate = dateEl ? dateEl.getAttribute('title') || dateEl.textContent : '';
        
        showPanel(record || { recipient: to, subject, status: 'Untracked', opens: 0, clicks: 0, events: [] }, subject, to, sentDate, isHover);
      };

      badge.style.cursor = 'pointer';
      badge.onclick = (e) => triggerPanel(e, false);
      badge.onmouseenter = (e) => triggerPanel(e, true);
      badge.onmouseleave = (e) => {
        setTimeout(() => {
          const panel = document.getElementById('plp-panel');
          if (panel && panel.dataset.pinned === 'false' && !panel.matches(':hover')) {
            removePanel();
          }
        }, 200);
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

  panel.onmouseleave = () => {
    if (panel.dataset.pinned === 'false') {
      removePanel();
    }
  };

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

    const emailCard = dateEl.closest('.adn');
    if (emailCard) {
      const senderEl = emailCard.querySelector('.gD');
      const senderEmail = senderEl ? senderEl.getAttribute('email') : null;
      const currentEmail = getActiveSenderEmail();
      if (senderEmail && currentEmail && senderEmail.toLowerCase() !== currentEmail.toLowerCase()) {
        return;
      }
    }

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

  // Locate the right-side toolbar area containing More options (3 vertical dots) or Discard draft (trash can)
  const moreBtn = composeWindow.querySelector('div[aria-label*="More options"], div[data-tooltip*="More options"]');
  const trashBtn = composeWindow.querySelector('div[aria-label*="Discard"], div[aria-label*="discard"], div[data-tooltip*="Discard"], div[data-tooltip*="discard"]');
  const anchor = moreBtn || trashBtn;

  let targetParent = null;
  let insertBeforeEl = null;

  if (anchor) {
    const anchorWrapper = (anchor.parentElement && anchor.parentElement.tagName !== 'TR' && anchor.parentElement.tagName !== 'TABLE' && anchor.parentElement !== composeWindow) ? anchor.parentElement : anchor;
    if (anchorWrapper.parentElement) {
      targetParent = anchorWrapper.parentElement;
      insertBeforeEl = anchorWrapper;
    }
  }

  // Fallback: If anchor not ready, find the bottom table's right cell
  if (!targetParent) {
    const sendBtn = composeWindow.querySelector('.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3') || composeWindow.querySelector('div[aria-label^="Send"]');
    if (sendBtn) {
      const bottomTable = sendBtn.closest('table');
      const rightCell = bottomTable?.querySelector('tr > td:last-child');
      if (rightCell) {
        targetParent = rightCell;
        insertBeforeEl = rightCell.firstChild;
      }
    }
  }

  if (!targetParent) return; // Wait for compose toolbar to finish rendering

  // Create compact inline container for PLP icon tools
  const container = document.createElement('div');
  container.className = 'plp-compose-toolbar'; // Used for duplicate detection
  container.style.cssText = 'display:inline-flex;align-items:center;vertical-align:middle;margin-right:8px;gap:4px;user-select:none;';

  // 1. "Track Opens" Icon Toggle
  const trackBtn = document.createElement('button');
  trackBtn.type = 'button';
  trackBtn.className = 'plp-icon-btn';
  trackBtn.style.cssText = 'width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;border:none;background:transparent;padding:0;margin:0 2px;transition:background-color 0.15s ease;vertical-align:middle;';
  trackBtn.onmouseenter = () => { trackBtn.style.backgroundColor = 'rgba(128, 128, 128, 0.25)'; };
  trackBtn.onmouseleave = () => { trackBtn.style.backgroundColor = 'transparent'; };

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'prime-track-checkbox';
  checkbox.checked = true;
  checkbox.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;margin:0;';

  function updateTrackState() {
    if (statsError) {
      trackBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><line x1="1" y1="1" x2="23" y2="23"/><circle cx="12" cy="12" r="3" fill="#f59e0b"/></svg>';
      trackBtn.title = 'Prime Lead Pulse: Click to sign in and activate tracking';
      trackBtn.setAttribute('aria-label', 'Prime Lead Pulse: Click to sign in and activate tracking');
      trackBtn.style.opacity = '1';
    } else if (checkbox.checked) {
      trackBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3" fill="#16a34a"/></svg>';
      trackBtn.title = 'Prime Lead Pulse: Email tracking is ON (Click to disable)';
      trackBtn.setAttribute('aria-label', 'Prime Lead Pulse: Email tracking is ON (Click to disable)');
      trackBtn.style.opacity = '1';
    } else {
      trackBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
      trackBtn.title = 'Prime Lead Pulse: Email tracking is OFF (Click to enable)';
      trackBtn.setAttribute('aria-label', 'Prime Lead Pulse: Email tracking is OFF (Click to enable)');
      trackBtn.style.opacity = '0.6';
    }
    trackBtn.appendChild(checkbox);
  }

  trackBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (statsError) {
      window.open('https://prime-lead-pulse-sigma.vercel.app', '_blank', 'width=800,height=600');
      return;
    }
    checkbox.checked = !checkbox.checked;
    updateTrackState();
  };

  updateTrackState();

  // 2. "Best Time" Icon Button
  const timeBtn = document.createElement('button');
  timeBtn.type = 'button';
  timeBtn.className = 'plp-icon-btn';
  timeBtn.title = 'Prime Lead Pulse: Best Time to Send (Open Analytics)';
  timeBtn.setAttribute('aria-label', 'Prime Lead Pulse: Best Time to Send (Open Analytics)');
  timeBtn.style.cssText = 'width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;border:none;background:transparent;padding:0;margin:0 2px;transition:background-color 0.15s ease;vertical-align:middle;';
  timeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  timeBtn.onmouseenter = () => { timeBtn.style.backgroundColor = 'rgba(128, 128, 128, 0.25)'; };
  timeBtn.onmouseleave = () => { timeBtn.style.backgroundColor = 'transparent'; };
  timeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open('https://prime-lead-pulse-sigma.vercel.app/dashboard/calendar', '_blank', 'width=800,height=600');
  };

  container.appendChild(trackBtn);
  container.appendChild(timeBtn);

  if (insertBeforeEl && targetParent.contains(insertBeforeEl)) {
    targetParent.insertBefore(container, insertBeforeEl);
  } else {
    targetParent.appendChild(container);
  }
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
  let isSend = e.target.closest('div[aria-label^="Send"]') || e.target.closest('.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3');
  
  if (!isSend) {
    const btn = e.target.closest('[role="button"]');
    if (btn) {
      const txt = (btn.innerText || '').trim();
      const aria = btn.getAttribute('aria-label') || '';
      const tooltip = btn.getAttribute('data-tooltip') || '';
      if (txt === 'Send' || txt === 'Send & Archive' || aria.includes('Send') || tooltip.includes('Send')) {
        isSend = btn;
      }
    }
  }

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
  const senderEmail = getActiveSenderEmail(compose) || 'unknown';
  const chipElements = Array.from(compose.querySelectorAll('.vR, [data-hovercard-id], div[email]'));
  const emailMap = new Map();
  const contactUpdates = {};

  chipElements.forEach(chip => {
    const em = (chip.getAttribute('data-hovercard-id') || 
                chip.getAttribute('email') || 
                chip.querySelector('[data-hovercard-id]')?.getAttribute('data-hovercard-id') ||
                chip.querySelector('[email]')?.getAttribute('email') || '').trim();
    if (!em || !em.includes('@')) return;
    const cleanEm = em.toLowerCase();

    let nm = chip.getAttribute('name') || 
             chip.querySelector('[name]')?.getAttribute('name') || '';
    
    if (!nm) {
      const clone = chip.cloneNode(true);
      clone.querySelectorAll('[role="button"], [aria-label*="Delete" i], [aria-label*="Remove" i], .vM').forEach(el => el.remove());
      const txt = clone.textContent.trim();
      if (txt && !txt.includes('@') && txt.length >= 2) {
        nm = txt.replace(/\s*\([^)]*@?[^)]*\)/g, '').trim();
      }
    }

    if (!emailMap.has(cleanEm) || (!emailMap.get(cleanEm).name && nm)) {
      emailMap.set(cleanEm, { name: nm, rawEmail: em });
      if (nm) contactUpdates[cleanEm] = nm;
    }
  });

  const formattedRecipients = [];
  for (const [em, info] of emailMap.entries()) {
    if (info.name) {
      formattedRecipients.push(`${info.name} <${info.rawEmail}>`);
    } else {
      formattedRecipients.push(info.rawEmail);
    }
  }

  let recipient = formattedRecipients.join(', ');
  if (!recipient) {
    recipient = compose.querySelector('input[name="to"]')?.value || 'Unknown Recipient';
  }

  // Safety guard: The sender cannot be one of the recipients!
  // If senderEmail accidentally matched a recipient, force fallback to active Gmail user
  if (senderEmail && emailMap.has(senderEmail.toLowerCase())) {
    const fallbackEmail = getActiveSenderEmail(null);
    if (fallbackEmail && !emailMap.has(fallbackEmail.toLowerCase())) {
      senderEmail = fallbackEmail;
    }
  }

  if (Object.keys(contactUpdates).length > 0) {
    chrome.storage.local.get(['contactNames'], (data) => {
      const names = data.contactNames || {};
      Object.assign(names, contactUpdates);
      chrome.storage.local.set({ contactNames: names });
    });
  }
  const subject = compose.querySelector('input[name="subjectbox"]')?.value ?? 'No Subject';

  // Generate a UUID locally
  const emailId = crypto.randomUUID();
  const base = "https://prime-lead-pulse-sigma.vercel.app";

  try {
    const body = compose.querySelector('div[aria-label="Message Body"], div[contenteditable="true"], .Am.Al.editable');
    if (body) {
      // Prevent data distortion in replies by removing old tracking pixels
      const oldPixels = body.querySelectorAll('img[src*="/api/track/pixel/"]');
      oldPixels.forEach(img => img.remove());

      // Prevent double-wrapping of links in quoted text by restoring their original URLs first
      body.querySelectorAll('a').forEach(a => {
        if (a.href && a.href.includes('/api/track/link/')) {
          try {
            const urlParam = new URL(a.href).searchParams.get('url');
            if (urlParam) a.href = decodeURIComponent(urlParam);
          } catch (e) {}
        }
      });

      // Auto-convert plain text URLs to <a> tags so they can be tracked
      const treeWalker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
      const nodesToReplace = [];
      const urlRegex = /(https?:\/\/[^\s<]+)/g;
      while (treeWalker.nextNode()) {
        const node = treeWalker.currentNode;
        if (node.parentNode && (node.parentNode.tagName === 'A' || node.parentNode.closest('a'))) continue;
        if (node.textContent && node.textContent.includes('/api/track/link/')) continue;
        if (urlRegex.test(node.textContent)) nodesToReplace.push(node);
      }
      nodesToReplace.forEach(node => {
        const span = document.createElement('span');
        span.innerHTML = node.textContent.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        node.parentNode.replaceChild(span, node);
      });

      // Wrap all <a> links with our tracking endpoint
      body.querySelectorAll('a').forEach(a => {
        const rawHref = a.getAttribute('href') || a.href;
        if (!rawHref) return;
        const skipProtocols = ['mailto:', 'tel:', 'javascript:', '#'];
        if (skipProtocols.some(p => rawHref.startsWith(p))) return;
        if (rawHref.includes('/api/track/link/')) return;
        
        a.href = `${base}/api/track/link/${emailId}?url=${encodeURIComponent(rawHref)}`;
      });

      const pixel = document.createElement('img');
      pixel.src = `${base}/api/track/pixel/${emailId}`;
      pixel.setAttribute('width', '1');
      pixel.setAttribute('height', '1');
      pixel.setAttribute('alt', '');
      pixel.style.cssText = 'width:1px!important;height:1px!important;min-width:1px!important;min-height:1px!important;opacity:0!important;border:none!important;margin:0!important;padding:0!important;position:absolute;left:-9999px;';
      body.appendChild(pixel);
    }
  } catch (err) {
    console.error('Prime Lead Pulse: Error injecting pixel/links', err);
  }

  // OPTIMISTIC CACHE UPDATE:
  // Instantly add to local memory cache so Sent folder displays "Unopened" with zero delay
  const newEmail = {
    id: emailId,
    sender_email: senderEmail,
    recipient: recipient,
    subject: subject,
    created_at: new Date().toISOString(),
    status: 'Unopened',
    opens: 0,
    clicks: 0,
    events: [],
    tracking_events: []
  };
  emailCache.unshift(newEmail);

  // Uncheck tracking so the synthetic click doesn't re-trigger our interceptor
  checkbox.checked = false;
  btn.style.opacity = '1';
  btn.style.pointerEvents = 'auto';
  delete compose.dataset.plpSending;

  // Let Gmail send natively with the tracking pixel embedded!
  btn.click();

  // Save to persistent storage cache in background
  try {
    const targetKey = 'cached_emails_' + (senderEmail ? senderEmail.toLowerCase() : 'unknown');
    chrome.storage.local.get([targetKey], (data) => {
      const cache = data[targetKey] || [];
      if (!cache.some(e => e.id === emailId)) {
        cache.unshift(newEmail);
        chrome.storage.local.set({ [targetKey]: cache });
      }
    });
  } catch (e) {}

  // Force instant UI refresh of sent badges
  setTimeout(injectSentBadges, 100);

  // Send CREATE_EMAIL to background service worker
  try {
    chrome.runtime.sendMessage({
      action: 'CREATE_EMAIL',
      payload: { id: emailId, sender_email: senderEmail, recipient, subject }
    }, response => {
      if (!response || !response.success) {
        console.error("Prime Lead Pulse background tracking failed:", response?.error || response?.data?.error);
      }
    });
  } catch (err) {
    console.warn("Prime Lead Pulse: Could not message background worker:", err);
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
    if (changes.session || changes.sessions) {
      updateKnownUserEmails();
    }
    const currentEmail = getActiveSenderEmail();
    if (changes.session || changes.sessions || (currentEmail && changes[`cached_emails_${currentEmail.toLowerCase()}`])) {
      statsError = null;
      fetchEmailStats().then(() => {
        injectSentBadges();
        injectEmailViewFeatures();
        document.querySelectorAll('div[role="dialog"], .M9').forEach(w => {
          const oldToolbar = w.querySelector('.plp-compose-toolbar');
          if (oldToolbar) oldToolbar.remove();
          injectComposeTool(w);
        });
      });
    }
  }
});

// Listen for instant Realtime WebSocket events from background service worker
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'REALTIME_EVENT' && request.payload) {
    const p = request.payload;
    const target = emailCache.find(e => e.id === p.email_id);
    if (target) {
      target.tracking_events = target.tracking_events || [];
      if (!target.tracking_events.some(ev => ev.id === p.id)) {
        target.tracking_events.unshift(p);
        if (p.event_type === 'open') target.opens = (target.opens || 0) + 1;
        if (p.event_type === 'click') target.clicks = (target.clicks || 0) + 1;
        if (target.clicks > 0) target.status = 'Clicked';
        else if (target.opens > 0) target.status = 'Opened';
      }
      injectSentBadges();
      injectEmailViewFeatures();
    } else {
      // If not currently in local memory, re-fetch fresh stats
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
setInterval(triggerPoll, 30000); // Trigger background poll every 30 seconds

// Keep service worker connected while user has Gmail open
let keepAlivePort = null;
function maintainKeepAlive() {
  try {
    keepAlivePort = chrome.runtime.connect({ name: 'gmail-active' });
    if (keepAlivePort) {
      keepAlivePort.onDisconnect.addListener(() => {
        setTimeout(maintainKeepAlive, 3000);
      });
    }
  } catch (e) {}
}
maintainKeepAlive();

// Actually load the UI from local storage
fetchEmailStats().then(() => {
  injectSentBadges();
  injectEmailViewFeatures();
});

console.log('Prime Lead Pulse: Content script v3 loaded.');
