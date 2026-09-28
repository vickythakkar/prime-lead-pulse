import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Known bot/scanner user-agent patterns
const BOT_UA_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /slurp/i, /mediapartners/i,
  /barracuda/i, /proofpoint/i, /mimecast/i, /fireeye/i,
  /fortinet/i, /sophos/i, /symantec/i, /mcafee/i,
  /^Mozilla\/5\.0$/,  // Bare "Mozilla/5.0" with nothing else = bot
  /ZmEu/i, /Nmap/i, /sqlmap/i,
];

function isLikelyBot(userAgent: string): boolean {
  // Bare "Mozilla/5.0" with no browser info = scanner bot
  if (userAgent.trim() === 'Mozilla/5.0') return true;
  return BOT_UA_PATTERNS.some(pattern => pattern.test(userAgent));
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
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  const userAgent = request.headers.get('user-agent') || 'Unknown';
  const ipAddress = request.headers.get('x-forwarded-for') || 'Unknown';

  if (!targetUrl) {
    return new NextResponse('Missing target URL', { status: 400 });
  }

  try {
    // 1. BOT FILTER: Check if the email is too new (< 120 seconds old)
    const { data: emailData, error: emailError } = await supabase
      .from('emails')
      .select('created_at')
      .eq('id', emailId)
      .single();

    if (emailError || !emailData) {
      return new NextResponse('Invalid tracking ID', { status: 404 });
    }

    if (emailData) {
      const emailAgeMs = Date.now() - new Date(emailData.created_at).getTime();
      if (emailAgeMs < 120000) {
        // Bot scanner clicking links in a freshly sent email. Skip logging.
        return NextResponse.redirect(targetUrl);
      }
    }

    // 2. BOT FILTER: Check user-agent against known bot patterns
    if (isLikelyBot(userAgent)) {
      return NextResponse.redirect(targetUrl);
    }

    // 3. DEBOUNCE: Prevent duplicate clicks on the same URL within 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
    const { data: recentClicks } = await supabase
      .from('tracking_events')
      .select('id')
      .eq('email_id', emailId)
      .eq('event_type', 'click')
      .eq('url', targetUrl)
      .gte('created_at', thirtySecondsAgo)
      .limit(1);

    if (!recentClicks || recentClicks.length === 0) {
      // Log the click event in Supabase
      await supabase.from('tracking_events').insert({
        email_id: emailId,
        event_type: 'click',
        url: targetUrl,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    }
  } catch (error) {
    console.error('Error logging link click:', error);
  }

  // Redirect the user to their actual destination
  return NextResponse.redirect(targetUrl);
}
