import re

with open('extension/scripts/content.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_click = '''  pill.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dateEl = listRow.querySelector('.xW.xY span');
    const sentDate = dateEl ? dateEl.getAttribute('title') || dateEl.textContent : '';
    showPanel(record || { recipient: recipientEmail, subject, status: 'Untracked', opens: 0, clicks: 0, events: [] }, subject, to, sentDate);
  };'''

new_click = '''  const triggerPanel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dateEl = listRow.querySelector('.xW.xY span');
    const sentDate = dateEl ? dateEl.getAttribute('title') || dateEl.textContent : '';
    showPanel(record || { recipient: recipientEmail, subject, status: 'Untracked', opens: 0, clicks: 0, events: [] }, subject, to, sentDate);
  };

  pill.onclick = triggerPanel;
  pill.onmouseenter = triggerPanel;
  
  // Close the panel if the mouse leaves the pill (unless they want to keep it open by clicking)
  // Actually, keeping it simple: just open on hover. They can click X to close, or hover another pill to replace it.
'''

content = content.replace(old_click, new_click)

with open('extension/scripts/content.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied modifications to content.js")
