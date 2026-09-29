import re

with open('extension/scripts/content.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Update pill title
old_title = '''  pill.title = 'Click to open Prime Lead Pulse Dashboard';'''
new_title = '''  // Build a rich tooltip for clicks
  let tooltipText = 'Click to open Prime Lead Pulse Dashboard';
  if (clicks > 0 && emailObj.events) {
    const clickedUrls = [...new Set(emailObj.events.filter(e => e.event_type === 'click' && e.url).map(e => e.url))];
    if (clickedUrls.length > 0) {
      tooltipText = 'Clicked Links:\\n' + clickedUrls.map(u => '🔗 ' + u).join('\\n') + '\\n\\n' + tooltipText;
    }
  }
  pill.title = tooltipText;'''

content = content.replace(old_title, new_title)

with open('extension/scripts/content.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied modifications to content.js")
