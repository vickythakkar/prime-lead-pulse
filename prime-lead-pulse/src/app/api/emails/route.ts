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

export async function POST(request: Request) {
  const supabase = getAuthClient(request);
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Get the user from the token to ensure it's valid
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { id, sender_email, recipient, subject } = body;

    if (!sender_email) {
      return NextResponse.json({ error: 'sender_email is required' }, { status: 400 });
    }

    // Insert the new email record
    const insertPayload: any = {
      user_id: user.id,
      sender_email,
      recipient,
      subject,
    };
    if (id) insertPayload.id = id;

    const { data, error } = await supabase
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
  const supabase = getAuthClient(request);
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const senderEmail = searchParams.get('sender_email');

    let query = supabase
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
      .order('created_at', { ascending: false })
      .limit(200);

    // If filtering by a specific sender (for the Gmail extension)
    if (senderEmail) {
      query = query.eq('sender_email', senderEmail);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Process the data to return a clean summary
    const formattedData = data.map((email: any) => {
      const opens = email.tracking_events.filter((e: any) => e.event_type === 'open');
      const clicks = email.tracking_events.filter((e: any) => e.event_type === 'click');
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
  const supabase = getAuthClient(request);
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Email ID is required' }, { status: 400 });
    }

    // Because of RLS, the user can only delete their own emails
    const { error } = await supabase
      .from('emails')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting email:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
