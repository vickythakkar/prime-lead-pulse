'use client';

import { useState, useEffect } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import DashboardLayout from '@/components/DashboardLayout';
import { MailPlus, LayoutTemplate, Trash2, X } from 'lucide-react';

export default function TemplatesPage() {
  const { user, loading, logout, supabase } = useDashboardData();
  const [templates, setTemplates] = useState<Record<string, string>[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', subject: '', body: '' });

  useEffect(() => {
    if (!user) return;
    const fetchTemplates = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/templates', { headers: { 'Authorization': `Bearer ${session.access_token}` } });
      if (res.ok) {
        const json = await res.json();
        setTemplates(json.templates || []);
      }
    };
    fetchTemplates();
  }, [user, supabase]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    if (res.ok) {
      const json = await res.json();
      setTemplates([json.template, ...templates]);
      setIsModalOpen(false);
      setFormData({ name: '', subject: '', body: '' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(`/api/templates?id=${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    setTemplates(templates.filter(t => t.id !== id));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="text-slate-500 font-medium">Loading Templates...</div>
      </div>
    );
  }

  return (
    <DashboardLayout userEmail={user?.email || ''} onLogout={logout}>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Email Templates</h1>
            <p className="text-slate-500 text-[13px] mt-1 font-medium">Create templates with subject and body, then apply them instantly in Gmail while composing.</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg text-[13px] font-bold shadow-sm hover:bg-slate-800 transition-colors transform hover:scale-105 duration-200"
          >
            <MailPlus size={16} /> New Template
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-6 py-3.5 font-bold text-slate-500 text-[11px] uppercase tracking-wider w-1/4">Template Name</th>
                <th className="text-left px-6 py-3.5 font-bold text-slate-500 text-[11px] uppercase tracking-wider w-1/2">Subject Preview</th>
                <th className="text-left px-6 py-3.5 font-bold text-slate-500 text-[11px] uppercase tracking-wider">Created</th>
                <th className="text-right px-6 py-3.5 font-bold text-slate-500 text-[11px] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <div className="bg-slate-50 p-4 rounded-full mb-4 hover:scale-110 transition-transform duration-300">
                        <LayoutTemplate size={32} className="text-slate-300" />
                      </div>
                      <h3 className="text-[15px] font-bold text-slate-900 mb-1">No email templates yet</h3>
                      <p className="text-[13px] text-slate-500 mb-5">Create your first email template to use in Gmail.</p>
                      <button 
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-[13px] font-bold shadow-sm hover:bg-slate-50 transition-colors transform hover:scale-105 duration-200"
                      >
                        <MailPlus size={16} /> New Template
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                templates.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 font-bold text-slate-900">{t.name}</td>
                    <td className="px-6 py-4 text-slate-500 truncate max-w-xs">{t.subject || '(No Subject)'}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(t.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-2 opacity-0 group-hover:opacity-100 transform hover:scale-110"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Create Email Template</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Template Name <span className="text-red-500">*</span></label>
                <input required autoFocus type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Intro Follow-up" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Email Subject (Optional)</label>
                <input type="text" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Quick check-in regarding..." />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Email Body (Optional)</label>
                <textarea rows={8} value={formData.body} onChange={e => setFormData({...formData, body: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Hey there..."></textarea>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg text-[13px] font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-indigo-700">Create Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
