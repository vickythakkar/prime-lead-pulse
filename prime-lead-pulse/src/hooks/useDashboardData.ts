'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { User } from '@supabase/supabase-js';

interface Email {
  id: string;
  sender_email: string;
  recipient: string;
  subject: string;
  created_at: string;
  tracking_events: {
    id: string;
    event_type: string;
    url: string | null;
    created_at: string;
    user_agent: string | null;
    ip_address: string | null;
  }[];
}

export interface ProcessedEmail {
  id: string;
  sender_email: string;
  recipient: string;
  subject: string;
  created_at: string;
  opens: number;
  clicks: number;
  status: 'Clicked' | 'Opened' | 'Sent';
  last_opened: string | null;
  first_opened_at: string | null;
  events: Email['tracking_events'];
}

export function useDashboardData() {
  const [emails, setEmails] = useState<ProcessedEmail[]>([]);
  const [templates, setTemplates] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  async function fetchData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/'); return; }

    setUser(session.user);

    try {
      const response = await fetch('/api/emails', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = await response.json();
      if (data.success) {
        const processed: ProcessedEmail[] = data.emails.map((email: Email) => {
          const opens = email.tracking_events.filter(e => e.event_type === 'open');
          const clicks = email.tracking_events.filter(e => e.event_type === 'click');
          const sorted = [...opens].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          let status: ProcessedEmail['status'] = 'Sent';
          if (clicks.length > 0) status = 'Clicked';
          else if (opens.length > 0) status = 'Opened';
          return {
            ...email,
            opens: opens.length,
            clicks: clicks.length,
            status,
            last_opened: opens.length > 0 ? opens[opens.length - 1].created_at : null,
            first_opened_at: sorted.length > 0 ? sorted[0].created_at : null,
            events: email.tracking_events,
          };
        });
        setEmails(processed);
      }

      // Fetch templates
      const tplRes = await fetch('/api/templates', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (tplRes.ok) {
        const tplData = await tplRes.json();
        setTemplates(tplData.templates || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();

    // Set up Realtime subscriptions
    const channel = supabase.channel('dashboard_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tracking_events' },
        () => {
          console.log('Realtime update: tracking_events changed. Refetching...');
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emails' },
        () => {
          console.log('Realtime update: emails changed. Refetching...');
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const deleteEmail = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/emails?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      if (res.ok) {
        setEmails(prev => prev.filter(e => e.id !== id));
      }
    } catch (err) {
      console.error('Error deleting email:', err);
    }
  };

  return { emails, templates, loading, user, logout, deleteEmail, supabase };
}
