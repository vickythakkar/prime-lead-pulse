import re

with open('src/app/dashboard/settings/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add states and delete function
old_imports = '''import { useDashboardData } from '@/hooks/useDashboardData';
import DashboardLayout from '@/components/DashboardLayout';
import { User, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
  const { user, loading, logout } = useDashboardData();'''

new_imports = '''import { useDashboardData } from '@/hooks/useDashboardData';
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
  };'''

content = content.replace(old_imports, new_imports)

# Update the button
old_button = '''            <button className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-red-100 transition-colors shrink-0">
              Delete Account
            </button>'''

new_button = '''            <button 
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-red-100 transition-colors shrink-0 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </button>'''

content = content.replace(old_button, new_button)

with open('src/app/dashboard/settings/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Settings page")
