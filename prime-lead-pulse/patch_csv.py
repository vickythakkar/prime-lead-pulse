import re

with open('src/app/dashboard/emails/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Download icon import
content = content.replace(
    '''import { Eye, MousePointerClick, Search, Trash2 } from 'lucide-react';''',
    '''import { Eye, MousePointerClick, Search, Trash2, Download } from 'lucide-react';'''
)

# Add Export function
export_func = '''
  const handleExportCSV = () => {
    if (emails.length === 0) return;
    const headers = ['Subject', 'Recipient', 'Status', 'Opens', 'Clicks', 'Sent Date', 'Last Opened'];
    const rows = emails.map(e => [
      "",
      "",
      e.status,
      e.opens,
      e.clicks,
      formatDate(e.created_at),
      formatDate(e.last_opened)
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', prime-lead-pulse-export-.csv);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
'''

content = content.replace(
    '''  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);''',
    '''  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);''' + export_func
)

# Add Export button to UI
old_filters = '''        {/* Filters */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">'''
new_filters = '''        {/* Filters */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">'''

old_filter_end = '''              ))}
            </select>
          </div>
        </div>'''
new_filter_end = '''              ))}
            </select>
          </div>
          <button
            onClick={handleExportCSV}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-sm font-semibold transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>'''

content = content.replace(old_filter_end, new_filter_end)

with open('src/app/dashboard/emails/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied CSV Export to emails/page.tsx")
