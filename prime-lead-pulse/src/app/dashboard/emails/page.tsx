'use client';

import { useState } from 'react';
import { useDashboardData, ProcessedEmail } from '@/hooks/useDashboardData';
import DashboardLayout from '@/components/DashboardLayout';
import ActivityModal from '@/components/ActivityModal';
import { Eye, MousePointerClick, Search, Trash2, Download } from 'lucide-react';

function StatusBadge({ status }: { status: ProcessedEmail['status'] }) {
  const styles = {
    Clicked: 'bg-green-100 text-green-700',
    Opened: 'bg-gray-100 text-gray-700',
    Sent: 'bg-gray-50 text-gray-400 border border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function TrackedEmailsPage() {
  const { emails, loading, user, logout, deleteEmail } = useDashboardData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | ProcessedEmail['status']>('All');
  const [page, setPage] = useState(1);
  const [selectedEmail, setSelectedEmail] = useState<ProcessedEmail | null>(null);
  const PER_PAGE = 20;

  const filtered = emails.filter(e => {
    const matchSearch = search === '' ||
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      e.recipient.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
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
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', prime-lead-pulse-export-.csv);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <DashboardLayout userEmail={user?.email || ''} onLogout={logout}>
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Tracked Emails</h1>
          <p className="text-slate-500 text-[13px] mt-1 font-medium">Monitor and view all your tracked emails. Click a row to see the full activity timeline.</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="All">All Status</option>
            <option value="Clicked">Clicked</option>
            <option value="Opened">Opened</option>
            <option value="Sent">Sent</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Recipient</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Engagement</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Sent</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Last Opened</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    No tracked emails found.
                  </td>
                </tr>
              ) : (
                paginated.map(email => (
                  <tr
                    key={email.id}
                    onClick={() => setSelectedEmail(email)}
                    className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900 truncate max-w-xs">{email.subject}</p>
                      <p className="text-gray-400 text-xs">{email.recipient}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={email.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 text-gray-600">
                        <span className="flex items-center gap-1">
                          <Eye size={13} className="text-blue-400" />
                          {email.opens}
                        </span>
                        <span className="flex items-center gap-1">
                          <MousePointerClick size={13} className="text-green-400" />
                          {email.clicks}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{formatDate(email.created_at)}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{formatDate(email.last_opened)}</td>
                    <td className="px-5 py-4 text-right">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to delete this tracked email log?')) {
                            deleteEmail(email.id);
                          }
                        }}
                        className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-2"
                        title="Delete log"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Showing {(page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} entries</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded disabled:opacity-40 hover:bg-gray-100">«</button>
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="px-2 py-1 rounded disabled:opacity-40 hover:bg-gray-100">‹</button>
                <span className="px-3">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} className="px-2 py-1 rounded disabled:opacity-40 hover:bg-gray-100">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded disabled:opacity-40 hover:bg-gray-100">»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity Timeline Modal */}
      {selectedEmail && (
        <ActivityModal email={selectedEmail} onClose={() => setSelectedEmail(null)} />
      )}
    </DashboardLayout>
  );
}
