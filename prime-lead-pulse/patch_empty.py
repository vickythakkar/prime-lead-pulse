import re

with open('src/components/RecentActivity.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_empty = '''        {recent.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No activity yet.</p>
          ) : ('''

new_empty = '''        {recent.length === 0 ? (
            <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-3">
                <Clock size={20} className="text-indigo-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">No activity yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">Send a tracked email using the Prime Lead Pulse Chrome Extension to see live activity here.</p>
            </div>
          ) : ('''

content = content.replace(old_empty, new_empty)

with open('src/components/RecentActivity.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated RecentActivity empty state")
