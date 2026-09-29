'use client';
import { useState, useEffect } from 'react';

import { useDashboardData } from '@/hooks/useDashboardData';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { supabase } from '@/utils/supabase';
import HighInterest from '@/components/HighInterest';
import RecentActivity from '@/components/RecentActivity';
import ActivityTrends from '@/components/ActivityTrends';
import { Mail, Eye, MousePointerClick, BarChart3, Clock, ChevronDown, TrendingUp, MailPlus } from 'lucide-react';

// Custom hook for animated numbers
function AnimatedNumber({ value }: { value: string | number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const isPercent = typeof value === 'string' && value.endsWith('%');
  const target = parseFloat(value as string) || 0;

  useEffect(() => {
    if (target === 0) {
      setDisplayValue(0);
      return;
    }
    let start = 0;
    const duration = 1000;
    const steps = 60;
    const increment = target / steps;
    const stepTime = Math.abs(Math.floor(duration / steps));
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setDisplayValue(target);
        clearInterval(timer);
      } else {
        setDisplayValue(start);
      }
    }, stepTime);
    
    return () => clearInterval(timer);
  }, [target]);

  const num = isPercent ? Math.floor(displayValue) : Math.round(displayValue);
  return <>{num}{isPercent ? '%' : ''}</>;
}

function StatCard({ label, value, icon: Icon, colorClass, iconColor, gradient }: { label: string; value: string | number; icon: any; colorClass: string; iconColor: string; gradient?: string }) {
  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-100 p-6 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-default">
      {/* Background hover flare */}
      <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full ${colorClass} opacity-30 group-hover:scale-150 transition-transform duration-700 ease-out`} />
      
      <div className="flex items-start justify-between relative z-10 mb-4">
        <div className={`p-3.5 rounded-xl ${gradient || 'bg-slate-100'} text-white shadow-md transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
          <Icon size={22} strokeWidth={2.5} className="text-white" />
        </div>
      </div>
      <div className="relative z-10 mt-2">
        <p className="text-4xl font-black text-slate-800 tracking-tight mb-1.5 drop-shadow-sm">
          <AnimatedNumber value={value} />
        </p>
        <p className="text-[12px] text-slate-500 uppercase tracking-widest font-bold">{label}</p>
      </div>
    </div>
  );
}

function getTimeToOpenLabel(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DashboardPage() {
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="text-slate-500 font-medium">Loading Dashboard...</div>
      </div>
    );
  }

  const totalEmails = emails.length;
  const totalOpens = emails.reduce((s, e) => s + e.opens, 0);
  const totalClicks = emails.reduce((s, e) => s + e.clicks, 0);
  const openedEmails = emails.filter(e => e.opens > 0).length;
  const openRate = totalEmails > 0 ? ((openedEmails / totalEmails) * 100).toFixed(1) : '0.0';

  // Time to first open analysis
  const withOpens = emails.filter(e => e.first_opened_at);
  let avgMs = 0;
  const buckets = { under1h: 0, under4h: 0, under2d: 0, over2d: 0, never: emails.filter(e => e.opens === 0).length };

  if (withOpens.length > 0) {
    const times = withOpens.map(e => new Date(e.first_opened_at!).getTime() - new Date(e.created_at).getTime());
    avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    times.forEach(t => {
      if (t < 3600000) buckets.under1h++;
      else if (t < 14400000) buckets.under4h++;
      else if (t < 172800000) buckets.under2d++;
      else buckets.over2d++;
    });
  }

  const pct = (n: number) => totalEmails > 0 ? Math.round((n / totalEmails) * 100) : 0;
  const clickRate = totalEmails > 0 ? ((emails.filter(e => e.clicks > 0).length / totalEmails) * 100).toFixed(1) : '0.0';

  const renderBucketBar = (label: string, count: number, color: string) => (
    <div className="flex items-center gap-4 text-sm mb-3.5 last:mb-0" key={label}>
      <span className="w-24 text-slate-500 text-[11px] font-medium">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-[6px]">
        <div className={`${color} h-[6px] rounded-full`} style={{ width: `${pct(count)}%` }} />
      </div>
      <span className="w-16 text-right text-slate-500 font-bold text-[11px] bg-slate-50 px-2 py-0.5 rounded-full">{count} emails</span>
    </div>
  );

  const allEvents = emails.flatMap(e => e.events);

  return (
    <DashboardLayout userEmail={user?.email || ''} onLogout={logout}>
      <div className="p-8 max-w-7xl mx-auto space-y-6 pb-20">
        
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-slate-500 text-[13px] mt-1 font-medium">Track your email performance and engagement metrics.</p>
          </div>
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-[13px] font-bold shadow-sm hover:bg-slate-50 transition-colors">
            Last 30 Days <ChevronDown size={14} className="text-slate-400" />
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-6">
          <StatCard label="Total Emails" value={totalEmails} icon={Mail} colorClass="bg-indigo-500" iconColor="text-white" gradient="bg-gradient-to-br from-indigo-500 to-purple-600" />
          <StatCard label="Opens" value={totalOpens} icon={Eye} colorClass="bg-blue-500" iconColor="text-white" gradient="bg-gradient-to-br from-blue-400 to-blue-600" />
          <StatCard label="Clicks" value={totalClicks} icon={MousePointerClick} colorClass="bg-emerald-500" iconColor="text-white" gradient="bg-gradient-to-br from-emerald-400 to-teal-500" />
          <StatCard label="Open Rate" value={`${openRate}%`} icon={TrendingUp} colorClass="bg-pink-500" iconColor="text-white" gradient="bg-gradient-to-br from-pink-500 to-rose-500" />
        </div>

        {/* Middle Section (Time to Open & Engagement) */}
        <div className="grid grid-cols-2 gap-6">
          {/* Time to First Open */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-100/30 to-transparent rounded-full -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="flex items-center justify-between mb-5 relative z-10">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                <h2 className="font-extrabold text-slate-900 tracking-tight text-sm">Time to First Open</h2>
              </div>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">{totalEmails} emails</span>
            </div>
            
            <div className="relative z-10">
            {withOpens.length > 0 && (
              <div className="flex items-center gap-3 mb-6">
                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md flex items-center gap-1">
                  <Clock size={12} /> Avg {getTimeToOpenLabel(avgMs)}
                </span>
                <span className="text-[11px] text-[#10b981] font-bold bg-[#f0fdf4] px-2.5 py-1 rounded-md flex items-center gap-1 border border-[#bbf7d0]">
                  ⚡ {pct(buckets.under4h + buckets.under1h)}% opened within 4h
                </span>
              </div>
            )}
            
            {/* The main bar */}
            <div className="w-full flex h-3 rounded-full overflow-hidden mb-6 gap-0.5 shadow-inner bg-slate-100">
              <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${pct(buckets.under1h)}%` }} />
              <div className="bg-gradient-to-r from-amber-300 to-amber-400 transition-all duration-1000 ease-out" style={{ width: `${pct(buckets.under4h)}%` }} />
              <div className="bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-1000 ease-out" style={{ width: `${pct(buckets.under2d)}%` }} />
              <div className="bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-1000 ease-out" style={{ width: `${pct(buckets.over2d)}%` }} />
              <div className="bg-slate-200 transition-all duration-1000 ease-out" style={{ width: `${pct(buckets.never)}%` }} />
            </div>

            <div>
              {renderBucketBar("Within 1 hour", buckets.under1h, "bg-gradient-to-r from-emerald-400 to-emerald-500")}
              {renderBucketBar("1 - 4 hours", buckets.under4h, "bg-gradient-to-r from-amber-300 to-amber-400")}
              {renderBucketBar("Within 2 days", buckets.under2d, "bg-gradient-to-r from-orange-400 to-orange-500")}
              {renderBucketBar("2+ days", buckets.over2d, "bg-gradient-to-r from-rose-400 to-rose-500")}
              {renderBucketBar("Never opened", buckets.never, "bg-slate-300")}
            </div>
            </div>
          </div>

          {/* Engagement Rates */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-100/30 to-transparent rounded-full -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <h2 className="font-extrabold text-slate-900 tracking-tight text-base mb-6 relative z-10">Engagement Rates</h2>
            <div className="space-y-8 relative z-10">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                    <div className="bg-gradient-to-br from-blue-400 to-blue-600 p-1.5 rounded-md shadow-sm text-white"><Eye size={14} /></div>
                    Open Rate
                  </div>
                  <span className="font-extrabold text-slate-900 text-xl"><AnimatedNumber value={`${openRate}%`} /></span>
                </div>
                <div className="w-full bg-slate-100 shadow-inner rounded-full h-3">
                  <div className="bg-gradient-to-r from-blue-400 to-blue-600 h-3 rounded-full transition-all duration-1000 ease-out" style={{ width: `${openRate}%` }} />
                </div>
                <p className="text-[11px] font-medium text-slate-400 mt-2">{openedEmails} open{openedEmails !== 1 ? 's' : ''}</p>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                    <div className="bg-gradient-to-br from-emerald-400 to-teal-500 p-1.5 rounded-md shadow-sm text-white"><MousePointerClick size={14} /></div>
                    Click Rate
                  </div>
                  <span className="font-extrabold text-slate-900 text-xl"><AnimatedNumber value={`${clickRate}%`} /></span>
                </div>
                <div className="w-full bg-slate-100 shadow-inner rounded-full h-3">
                  <div className="bg-gradient-to-r from-emerald-400 to-teal-500 h-3 rounded-full transition-all duration-1000 ease-out" style={{ width: `${clickRate}%` }} />
                </div>
                <p className="text-[11px] font-medium text-slate-400 mt-2">{totalClicks} click{totalClicks !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Lower Section (High Interest & Recent Activity) */}
        <div className="grid grid-cols-2 gap-6">
          <HighInterest emails={emails} />
          <RecentActivity emails={emails} />
        </div>

        {/* Chart Section */}
        <ActivityTrends events={allEvents} />
        
        {/* Templates Section */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-slate-100/50 to-transparent rounded-full -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="flex justify-between items-center mb-6 relative z-10">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Email Templates</h2>
            <Link href="/dashboard/templates" className="text-[12px] font-bold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1">
              View All <TrendingUp size={14} />
            </Link>
          </div>
          <div className="relative z-10">
            {(!templates || templates.length === 0) ? (
              <div className="text-center py-10">
                <p className="text-[13px] text-slate-400 font-medium">No email templates yet</p>
                <Link href="/dashboard/templates" className="inline-block mt-3 text-[12px] font-bold text-slate-900 hover:text-indigo-600 transition-colors">
                  Create your first email template
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.slice(0, 3).map(t => (
                  <Link key={t.id} href="/dashboard/templates" className="block bg-slate-50 border border-slate-100 rounded-xl p-4 hover:bg-slate-100 hover:border-slate-200 transition-colors cursor-pointer group/item">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-slate-900 text-sm group-hover/item:text-indigo-600 transition-colors">{t.name}</h3>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{t.subject || 'No subject'}</p>
                  </Link>
                ))}
                
                <Link href="/dashboard/templates" className="mt-4 w-full flex items-center justify-center gap-2 bg-slate-50 border border-dashed border-slate-300 text-slate-600 px-4 py-3 rounded-xl text-[13px] font-bold shadow-sm hover:bg-slate-100 hover:text-indigo-600 transition-colors">
                  <MailPlus size={16} /> Create New Template
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
