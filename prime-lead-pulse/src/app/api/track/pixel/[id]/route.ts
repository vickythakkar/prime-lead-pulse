import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 1x1 transparent PNG buffer
const PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PIXEL_BUFFER = Uint8Array.from(atob(PIXEL_BASE64), c => c.charCodeAt(0));

const PIXEL_HEADERS = {
  'Content-Type': 'image/png',
  'Content-Length': PIXEL_BUFFER.length.toString(),
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Access-Control-Allow-Origin': '*',
};

// Known bot/scanner user-agent patterns (these are NOT real humans opening emails)
function isLikelyBot(userAgent: string, ipAddress: string): boolean {
  // Bare "Mozilla/5.0" with no browser info = corporate security scanner or proxy
  if (userAgent.trim() === 'Mozilla/5.0') return true;
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /slurp/i,
    /barracuda/i, /proofpoint/i, /mimecast/i, /fireeye/i,
    /fortinet/i, /sophos/i, /symantec/i, /mcafee/i,
    /ZmEu/i, /Nmap/i, /sqlmap/i,
    /com\.apple\./i, // Apple Mail Privacy Protection prefetch
  ];
  if (botPatterns.some(p => p.test(userAgent))) return true;

  // Apple Mail Privacy Protection IPs (starts with 17.)
  if (ipAddress.startsWith('17.')) return true;

  return false;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    SERVICE_KEY
  );

  const { id: emailId } = await params;
  const userAgent = request.headers.get('user-agent') || 'Unknown';
  const ipAddress = request.headers.get('x-forwarded-for') || 'Unknown';
  
  const url = new URL(request.url);
  const tParam = url.searchParams.get('t');

  try {
    // 1. BOT FILTER: Check user-agent and IP
    if (isLikelyBot(userAgent, ipAddress)) {
      return new NextResponse(PIXEL_BUFFER, { status: 200, headers: PIXEL_HEADERS });
    }

    // 2. Fetch the email to check its creation time
    const { data: emailData } = await supabase
      .from('emails')
      .select('created_at')
      .eq('id', emailId)
      .single();

    // 3. BOT FILTER: Ignore opens within 5 seconds of sending to avoid immediate proxy scans
    if (emailData) {
      const sendTimeMs = tParam ? parseInt(tParam, 10) : new Date(emailData.created_at).getTime();
      const emailAgeMs = Date.now() - sendTimeMs;
      if (emailAgeMs < 5000) {
        return new NextResponse(PIXEL_BUFFER, { status: 200, headers: PIXEL_HEADERS });
      }
    }

    // 4. DEBOUNCE: Prevent duplicate opens within 15 seconds (was 5s, too short)
    const fifteenSecondsAgo = new Date(Date.now() - 15000).toISOString();
    const { data: recentOpens } = await supabase
      .from('tracking_events')
      .select('id')
      .eq('email_id', emailId)
      .eq('event_type', 'open')
      .gte('created_at', fifteenSecondsAgo)
      .limit(1);

    if (!recentOpens || recentOpens.length === 0) {
      await supabase.from('tracking_events').insert({
        email_id: emailId,
        event_type: 'open',
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    }
  } catch (error) {
    console.error('Error logging pixel open:', error);
  }

  return new NextResponse(PIXEL_BUFFER, { status: 200, headers: PIXEL_HEADERS });
}
