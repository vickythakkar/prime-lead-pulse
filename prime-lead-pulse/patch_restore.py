import re

with open('src/app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add states for restore prompt
old_imports = '''import { useDashboardData } from '@/hooks/useDashboardData';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';'''

new_imports = '''import { useDashboardData } from '@/hooks/useDashboardData';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { supabase } from '@/utils/supabase';'''

content = content.replace(old_imports, new_imports)

old_component = '''export default function DashboardPage() {
  const { emails, templates, loading, user, logout } = useDashboardData();

  if (loading) {'''

new_component = '''export default function DashboardPage() {
  const { emails, templates, loading, user, logout } = useDashboardData();
  const [restorePrompt, setRestorePrompt] = useState<{hasBackup: boolean, daysRemaining: number} | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (user && emails.length === 0) {
      checkBackup();
    }
  }, [user, emails.length]);

  const checkBackup = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/auth/restore', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check' })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.hasBackup) setRestorePrompt(data);
    }
  };

  const handleRestore = async (action: 'restore' | 'discard') => {
    setIsRestoring(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/auth/restore', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    window.location.reload();
  };

  if (loading) {'''

content = content.replace(old_component, new_component)

# Render the Restore prompt UI
old_return = '''  return (
    <DashboardLayout userEmail={user?.email || ''} onLogout={logout}>
      <div className="p-8 max-w-7xl mx-auto space-y-6">'''

new_return = '''  return (
    <DashboardLayout userEmail={user?.email || ''} onLogout={logout}>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Restore Prompt */}
        {restorePrompt && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm mb-8">
            <div>
              <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                <span className="text-xl">👋</span> Welcome back!
              </h2>
              <p className="text-indigo-700 text-sm mt-1">We found your old tracking data from your previous account. You have {restorePrompt.daysRemaining} days left to restore it.</p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={() => handleRestore('discard')}
                disabled={isRestoring}
                className="px-4 py-2 text-indigo-600 font-semibold text-sm hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Start Fresh
              </button>
              <button 
                onClick={() => handleRestore('restore')}
                disabled={isRestoring}
                className="px-5 py-2 bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isRestoring ? 'Restoring...' : 'Restore My Data'}
              </button>
            </div>
          </div>
        )}
'''

content = content.replace(old_return, new_return)

with open('src/app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Dashboard page for Restore")
