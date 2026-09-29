import re

with open('src/components/ActivityModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Lucide icons
content = content.replace(
    '''import { Eye, MousePointerClick, X } from 'lucide-react';''',
    '''import { Eye, MousePointerClick, X, Monitor, Smartphone, Globe } from 'lucide-react';'''
)

# Add parseDevice function
parse_func = '''
function parseDevice(ua: string | null) {
  if (!ua) return { device: 'Unknown Device', icon: Globe };
  if (ua.includes('GoogleImageProxy')) return { device: 'Gmail App/Web', icon: Globe };
  
  let os = '';
  let icon = Monitor;
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'Mac OS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) { os = 'Android'; icon = Smartphone; }
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) { os = 'iOS'; icon = Smartphone; }

  let browser = '';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  
  if (!os && !browser) return { device: 'Unknown Device', icon: Globe };
  if (os && browser) return { device: ${os} · , icon };
  return { device: os || browser, icon };
}
'''

content = content.replace(
    '''export default function ActivityModal({ email, onClose }: { email: ProcessedEmail; onClose: () => void }) {''',
    parse_func + '''\nexport default function ActivityModal({ email, onClose }: { email: ProcessedEmail; onClose: () => void }) {'''
)

# Render device info
old_render = '''                    <span className="text-xs text-gray-400">{formatDate(ev.created_at)}</span>
                  </div>
                  {ev.event_type === 'click' && ev.url && ('''

new_render = '''                    <span className="text-xs text-gray-400">{formatDate(ev.created_at)}</span>
                  </div>
                  
                  {/* Device Info */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    {(() => {
                      const { device, icon: DeviceIcon } = parseDevice(ev.user_agent);
                      return (
                        <>
                          <DeviceIcon size={12} className="text-slate-400" />
                          <span>{device}</span>
                          {ev.ip_address && !ev.user_agent?.includes('GoogleImageProxy') && (
                            <span className="text-slate-300 ml-1">({ev.ip_address})</span>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {ev.event_type === 'click' && ev.url && ('''

content = content.replace(old_render, new_render)

with open('src/components/ActivityModal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated ActivityModal with Device Parsing")
