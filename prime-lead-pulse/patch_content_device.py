import re

with open('extension/scripts/content.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add parseDevice to content.js
parse_device_func = '''
function parseDevice(ua) {
  if (!ua) return 'Unknown Device';
  if (ua.includes('GoogleImageProxy')) return 'Gmail App/Web';
  
  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'Mac OS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  let browser = '';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  
  if (!os && !browser) return 'Unknown Device';
  if (os && browser) return `${os} · ${browser}`;
  return os || browser;
}
'''

content = content.replace(
    '''function formatDate(iso) {''',
    parse_device_func + '''\nfunction formatDate(iso) {'''
)

# Update the eventsHtml rendering
old_event = '''      return `
        <div class="plp-timeline-item">
          <div class="plp-timeline-icon plp-icon-${ev.event_type}">
            ${ev.event_type === 'open' ? '👁' : '🖱'}
          </div>
          <div class="plp-timeline-content">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="plp-timeline-action plp-action-${ev.event_type}">${ev.event_type === 'open' ? 'Opened email' : 'Clicked link'}</span>
              <span class="plp-timeline-time">${formatDate(ev.created_at)}</span>
            </div>
            ${ev.event_type === 'click' && ev.url ? `<a href="${ev.url}" target="_blank" class="plp-timeline-link">${ev.url}</a>` : ''}
          </div>
        </div>
      `;'''

new_event = '''      const device = parseDevice(ev.user_agent);
      const ip = ev.ip_address && !ev.user_agent?.includes('GoogleImageProxy') ? ` (${ev.ip_address})` : '';
      return `
        <div class="plp-timeline-item">
          <div class="plp-timeline-icon plp-icon-${ev.event_type}">
            ${ev.event_type === 'open' ? '👁' : '🖱'}
          </div>
          <div class="plp-timeline-content">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="plp-timeline-action plp-action-${ev.event_type}">${ev.event_type === 'open' ? 'Opened email' : 'Clicked link'}</span>
              <span class="plp-timeline-time">${formatDate(ev.created_at)}</span>
            </div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 4px; font-weight: 500;">
              📱 ${device}${ip}
            </div>
            ${ev.event_type === 'click' && ev.url ? `<a href="${ev.url}" target="_blank" class="plp-timeline-link">${ev.url}</a>` : ''}
          </div>
        </div>
      `;'''

content = content.replace(old_event, new_event)

with open('extension/scripts/content.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated content.js with Device Parsing")
