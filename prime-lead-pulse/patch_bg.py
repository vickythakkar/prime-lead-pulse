import re

with open('extension/background.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add URL to grouped object
content = content.replace(
    '''grouped[key] = { email, eventType: ev.event_type, count: 0 };''',
    '''grouped[key] = { email, eventType: ev.event_type, count: 0, url: ev.url };'''
)

# 2. Extract url in the loop
content = content.replace(
    '''const { email, eventType, count } = grouped[key];''',
    '''const { email, eventType, count, url } = grouped[key];'''
)

# 3. Add url to message
old_msg = '''      if (count > 1) {
        message +=  (and  other recent s);
      }'''

new_msg = '''      if (count > 1) {
        message +=  (and  other recent s);
      }

      if (isClick && url) {
        const shortUrl = url.length > 35 ? url.substring(0, 32) + '...' : url;
        message += \\n🔗 ;
      }'''

content = content.replace(old_msg, new_msg)

with open('extension/background.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied modifications to background.js")
