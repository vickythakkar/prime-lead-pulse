import re

with open('extension/scripts/content.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update cleanPrefixes regex
content = re.sub(
    r'replace\(\/\^\(\(Re\|Fwd\):\\\\s\*\)\+\/ig',
    r'replace(/^((Re|Fwd|Fw|Aw|Wg|Tr|Rv|Sv|Vs|Vl|Res|Enc):\\\\s*)+/ig',
    content
)

# 2. Update getActiveSenderEmail
new_email_func = r'''function getActiveSenderEmail() {
  const accountBtn = document.querySelector('a[aria-label*="@"]');
  if (accountBtn) {
    const match = accountBtn.getAttribute('aria-label').match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
    if (match) return match[1];
  }
  const titleMatch = document.title.match(/- ([^\s]+@[^\s]+\.[^\s]+) - Gmail/);
  return titleMatch ? titleMatch[1] : null;
}'''

content = re.sub(
    r'function getActiveSenderEmail\(\) \{.*?\n\}',
    new_email_func,
    content,
    flags=re.DOTALL
)

# 3. Update dataset.plpSending block
old_sending_block = '''  if (compose.dataset.plpSending === 'true') return;
  compose.dataset.plpSending = 'true';'''
new_sending_block = '''  if (compose.dataset.plpSending === 'true') {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  compose.dataset.plpSending = 'true';'''
content = content.replace(old_sending_block, new_sending_block)

# 4. Update the error block for plpSending
old_error_block = '''    } else {
      const err = response?.data?.error || response?.error || 'Unknown Error';
      alert(Prime Lead Pulse: Failed to track.\\nError details: );
      btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
    }'''
new_error_block = '''    } else {
      const err = response?.data?.error || response?.error || 'Unknown Error';
      alert(Prime Lead Pulse: Failed to track.\\nError details: );
      btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
      compose.dataset.plpSending = 'false';
    }'''
content = content.replace(old_error_block, new_error_block)

# 5. Update send button selector
content = content.replace(
    '''const sendBtn = composeWindow.querySelector('div[aria-label^="Send"]');''',
    '''const sendBtn = composeWindow.querySelector('.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3');'''
)

# 6. Remove polling and add storage listener
old_polling = '''// ------ Stats Polling ------
// Background.js alarm handles notifications independently, so we only need to refresh badge UI here.
// ONLY poll when the tab is actively visible to save massive API bandwidth and prevent Vercel limits.
setInterval(() => {
  if (document.visibilityState === 'visible') {
    fetchEmailStats().then(() => {
      injectSentBadges();
      injectEmailViewFeatures();
    });
  }
}, 30000); // 30 seconds

// Instantly refresh when the user switches back to this Gmail tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    fetchEmailStats().then(() => {
      injectSentBadges();
      injectEmailViewFeatures();
    });
  }
});'''
new_polling = '''// ------ Storage Listener (No Polling) ------
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const currentEmail = getActiveSenderEmail();
    if (currentEmail && changes[cached_emails_]) {
      // Re-use fetchEmailStats to parse events
      fetchEmailStats().then(() => {
        injectSentBadges();
        injectEmailViewFeatures();
      });
    }
  }
});'''
content = content.replace(old_polling, new_polling)

# 7. Modify fetchEmailStats to prevent it from hitting background if not needed?
# To save time, just reading from storage is best, but since it hits GET_STATS which hits API,
# let's just rewrite GET_STATS in background to use cache if we want, or rewrite fetchEmailStats here.
# Let's rewrite fetchEmailStats to just fetch from background and let background handle it. It's fine for now, we removed the polling loop so it only hits once per tab load or when storage changes (which background updates).

with open('extension/scripts/content.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied modifications to content.js")
