'use client';

import { useDashboardData } from '@/hooks/useDashboardData';
import DashboardLayout from '@/components/DashboardLayout';
import { User, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/utils/supabase';

export default function SettingsPage() {
  const { user, loading, logout } = useDashboardData();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!confirm('Are you absolutely sure you want to delete your account? This will hide your data and disable your login. You will have 30 days to restore it if you sign up again.')) return;
    setIsDeleting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/auth/delete', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      if (res.ok) {
        await supabase.auth.signOut();
        window.location.href = '/';
      } else {
        alert('Failed to delete account');
        setIsDeleting(false);
      }
    } catch (err) {
      alert('An error occurred');
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="text-slate-500 font-medium">Loading Settings...</div>
      </div>
    );
  }

  // Extract name for display
  const name = user?.email?.split('@')[0].replace(/[^a-zA-Z]/g, ' ') || 'User';
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <DashboardLayout userEmail={user?.email || ''} onLogout={logout}>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-slate-500 text-[13px] mt-1 font-medium">Manage your account settings and preferences.</p>
        </div>

        {/* Profile Info */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-5 flex items-center gap-3">
            <User size={18} className="text-slate-400" />
            <div>
              <h2 className="text-[14px] font-bold text-slate-900">Profile Information</h2>
              <p className="text-[12px] text-slate-500 mt-0.5">Update your profile information and email address.</p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {/* Avatar block matching the video */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-[14px]">{displayName}</p>
                <p className="text-slate-500 text-[12px]">{user?.email}</p>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Display Name</label>
              <input 
                type="text" 
                defaultValue={displayName}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-1.5">Email</label>
              <input 
                type="email" 
                defaultValue={user?.email || ''}
                disabled
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] bg-slate-100 text-slate-500 cursor-not-allowed"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" defaultChecked id="notifs" className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer" />
              <label htmlFor="notifs" className="text-[13px] text-slate-700 cursor-pointer">Receive important Prime Lead Pulse updates and security notifications</label>
            </div>
            <div className="flex justify-end pt-4">
              <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-slate-800 transition-colors shadow-sm">
                Save Changes
              </button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
          <div className="border-b border-red-100 px-6 py-5 flex items-center gap-3 bg-red-50/50">
            <AlertTriangle size={18} className="text-red-500" />
            <div>
              <h2 className="text-[14px] font-bold text-red-600">Danger Zone</h2>
              <p className="text-[12px] text-red-400 mt-0.5">Irreversible actions that affect your account and data.</p>
            </div>
          </div>
          <div className="p-6 flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-slate-900 mb-1">Delete Account & Data</h3>
              <p className="text-[12px] text-slate-500">Permanently delete your account and all tracking data. This action cannot be undone.</p>
            </div>
            <button 
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-red-100 transition-colors shrink-0 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
