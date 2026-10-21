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
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
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
    // 1. BOT FILTER: Temporarily removed to allow Apple Mail Privacy Protection (AMPP) and GoogleImageProxy prefetches to log as opens
    // if (isLikelyBot(userAgent, ipAddress)) {
    //   return new NextResponse(PIXEL_BUFFER, { status: 200, headers: PIXEL_HEADERS });
    // }

    // 2. Fetch the email to check its creation time and owner
    let { data: emailData } = await supabase
      .from('emails')
      .select('id, user_id, recipient, subject, sender_email, created_at')
      .eq('id', emailId)
      .single();

    // If email record is not found yet (handles race condition between client send and recipient open)
    if (!emailData) {
      await new Promise(r => setTimeout(r, 1500));
      const { data: retryData } = await supabase
        .from('emails')
        .select('id, user_id, recipient, subject, sender_email, created_at')
        .eq('id', emailId)
        .single();
      emailData = retryData;
    }

    if (emailData) {
      // 3. DEBOUNCE: Prevent duplicate opens within 15 seconds
      const fifteenSecondsAgo = new Date(Date.now() - 15000).toISOString();
      const { data: recentOpens } = await supabase
        .from('tracking_events')
        .select('id')
        .eq('email_id', emailId)
        .eq('event_type', 'open')
        .gte('created_at', fifteenSecondsAgo)
        .limit(1);

      if (!recentOpens || recentOpens.length === 0) {
        const { data: newEvent } = await supabase.from('tracking_events').insert({
          email_id: emailId,
          event_type: 'open',
          ip_address: ipAddress,
          user_agent: userAgent,
        }).select().single();

        // Broadcast real-time alert to the sender
        if (emailData?.user_id) {
          try {
            await Promise.race([
              new Promise((resolve) => {
                const rtChan = supabase.channel(`realtime:user_${emailData.user_id}`);
                rtChan.subscribe(async (status) => {
                  if (status === 'SUBSCRIBED') {
                    await rtChan.send({
                      type: 'broadcast',
                      event: 'tracking_event',
                      payload: {
                        id: newEvent?.id,
                        email_id: emailId,
                        event_type: 'open',
                        recipient: emailData.recipient,
                        subject: emailData.subject,
                        sender_email: emailData.sender_email,
                        created_at: newEvent?.created_at || new Date().toISOString()
                      }
                    });
                    supabase.removeChannel(rtChan);
                    resolve(true);
                  }
                });
              }),
              new Promise((resolve) => setTimeout(resolve, 1500))
            ]);
          } catch (rtErr) {
            console.error('[Track Pixel] Realtime broadcast error:', rtErr);
          }
        }
      }
    } else {
      console.warn(`[Track Pixel] Email ID ${emailId} not found in database. Skipping tracking event.`);
    }
  } catch (error) {
    console.error('Error logging pixel open:', error);
  }

  return new NextResponse(PIXEL_BUFFER, { status: 200, headers: PIXEL_HEADERS });
}
