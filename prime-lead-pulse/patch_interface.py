import re

with open('src/hooks/useDashboardData.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_interface = '''  tracking_events: {
    id: string;
    event_type: string;
    url: string | null;
    created_at: string;
  }[];'''

new_interface = '''  tracking_events: {
    id: string;
    event_type: string;
    url: string | null;
    created_at: string;
    user_agent: string | null;
    ip_address: string | null;
  }[];'''

content = content.replace(old_interface, new_interface)

with open('src/hooks/useDashboardData.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Email interface in useDashboardData.ts")
