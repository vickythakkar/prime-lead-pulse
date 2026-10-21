export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper to get an authenticated Supabase client using the token passed from the Chrome Extension
function getAuthClient(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const authClient = getAuthClient(request);
    let user = null;
    if (authClient) {
      try {
        const { data } = await authClient.auth.getUser();
        user = data?.user;
      } catch (_) {}
    }

    const body = await request.json();
    const { id, sender_email, recipient, subject } = body;

    if (!sender_email) {
      return NextResponse.json({ error: 'sender_email is required' }, { status: 400 });
    }

    const adminSb = getAdminClient();
    let targetUserId = user?.id;

    // Fail-safe: If token expired, missing, or unauthorized, resolve user by sender_email
    if (!targetUserId) {
      const cleanSender = (sender_email || '').toLowerCase().trim();
      
      // 1. Try matching with Supabase auth users
      try {
        const { data: userData } = await adminSb.auth.admin.listUsers();
        const matchedUser = userData?.users?.find(
          (u) => u.email?.toLowerCase().trim() === cleanSender
        );
        if (matchedUser) {
          targetUserId = matchedUser.id;
        }
      } catch (err) {
        console.warn('Could not list admin users:', err);
      }

      // 2. Try looking up the most recent user_id associated with this sender_email
      if (!targetUserId) {
        const { data: prevEmail } = await adminSb
          .from('emails')
          .select('user_id')
          .ilike('sender_email', cleanSender)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (prevEmail?.user_id) {
          targetUserId = prevEmail.user_id;
        }
      }

      // 3. Fallback: match primary account owner (vicky@diyflatfee.com)
      if (!targetUserId) {
        const { data: primaryEmail } = await adminSb
          .from('emails')
          .select('user_id')
          .limit(1)
          .single();
        if (primaryEmail?.user_id) {
          targetUserId = primaryEmail.user_id;
        }
      }
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Unable to resolve account owner' }, { status: 401 });
    }

    // Insert the new email record
    const insertPayload: any = {
      user_id: targetUserId,
      sender_email,
      recipient,
      subject,
    };
    if (id) insertPayload.id = id;

    const { data, error } = await adminSb
      .from('emails')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, email: data });
  } catch (error: any) {
    console.error('Error creating email record:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const authClient = getAuthClient(request);
    let user = null;
    if (authClient) {
      try {
        const { data } = await authClient.auth.getUser();
        user = data?.user;
      } catch (_) {}
    }

    const { searchParams } = new URL(request.url);
    const senderEmail = searchParams.get('sender_email');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    const adminSb = getAdminClient();
    let targetUserId = user?.id;

    // Fail-safe: If token expired or missing, resolve user by sender_email
    if (!targetUserId && senderEmail) {
      const cleanSender = senderEmail.toLowerCase().trim();
      try {
        const { data: userData } = await adminSb.auth.admin.listUsers();
        const matchedUser = userData?.users?.find(
          (u) => u.email?.toLowerCase().trim() === cleanSender
        );
        if (matchedUser) {
          targetUserId = matchedUser.id;
        }
      } catch (err) {
        console.warn('Could not list admin users:', err);
      }

      if (!targetUserId) {
        const { data: prevEmail } = await adminSb
          .from('emails')
          .select('user_id')
          .ilike('sender_email', cleanSender)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (prevEmail?.user_id) targetUserId = prevEmail.user_id;
      }

      if (!targetUserId) {
        const { data: primaryEmail } = await adminSb
          .from('emails')
          .select('user_id')
          .limit(1)
          .single();
        if (primaryEmail?.user_id) targetUserId = primaryEmail.user_id;
      }
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = adminSb
      .from('emails')
      .select(`
        *,
        tracking_events (
          id,
          event_type,
          url,
          user_agent,
          ip_address,
          created_at
        )
      `)
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // If filtering by a specific sender (for the Gmail extension)
    if (senderEmail && senderEmail !== 'unknown') {
      query = query.ilike('sender_email', senderEmail);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Process the data to return a clean summary
    const formattedData = (data || []).map((email: any) => {
      const opens = (email.tracking_events || []).filter((e: any) => e.event_type === 'open');
      const clicks = (email.tracking_events || []).filter((e: any) => e.event_type === 'click');
      return {
        ...email,
        stats: {
          opens: opens.length,
          clicks: clicks.length,
          last_opened: opens.length > 0 ? opens[opens.length - 1].created_at : null,
        }
      };
    });

    return NextResponse.json({ success: true, emails: formattedData });
  } catch (error: any) {
    console.error('Error fetching emails:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authClient = getAuthClient(request);
    let user = null;
    if (authClient) {
      const { data } = await authClient.auth.getUser();
      user = data?.user;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Email ID is required' }, { status: 400 });
    }

    const adminSb = getAdminClient();
    let query = adminSb.from('emails').delete().eq('id', id);
    if (user?.id) {
      query = query.eq('user_id', user.id);
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting email:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
