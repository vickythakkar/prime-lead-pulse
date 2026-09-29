import re

with open('extension/scripts/content.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Update showPanel signature
old_showPanel = '''function showPanel(record, subject, to, sentDate) {
  removePanel();
  if (!record) return;
  panelEmailId = record.id;

  const panel = document.createElement('div');
  panel.id = 'plp-panel';
  panel.className = 'plp-panel';'''

new_showPanel = '''function showPanel(record, subject, to, sentDate, isHover = false) {
  removePanel();
  if (!record) return;
  panelEmailId = record.id;

  const panel = document.createElement('div');
  panel.id = 'plp-panel';
  panel.className = 'plp-panel';
  panel.dataset.pinned = isHover ? 'false' : 'true';'''

content = content.replace(old_showPanel, new_showPanel)

# Update triggerPanel
old_trigger = '''      const triggerPanel = (e) => {
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
        
        showPanel(record || { recipient: recipientEmail, subject, status: 'Untracked', opens: 0, clicks: 0, events: [] }, subject, to, sentDate);
      };

      badge.style.cursor = 'pointer';
      badge.onclick = triggerPanel;
      badge.onmouseenter = triggerPanel;'''

new_trigger = '''      const triggerPanel = (e, isHover) => {
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
      };'''

content = content.replace(old_trigger, new_trigger)

with open('extension/scripts/content.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied mouseleave modifications to content.js")
