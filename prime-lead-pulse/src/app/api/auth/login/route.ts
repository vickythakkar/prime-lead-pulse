import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createMergedSenderCookieHeader } from '@/utils/senderCookie';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: Request) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    const { email, password } = await request.json();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const res = NextResponse.json({
      success: true,
      session: data.session,
    });

    if (data.session?.user) {
      try {
        const cookieHeader = await createMergedSenderCookieHeader(request, {
          uid: data.session.user.id,
          email: data.session.user.email,
        });
        res.headers.set('Set-Cookie', cookieHeader);
      } catch (cookieErr) {
        console.warn('[Login] Failed to set sender cookie:', cookieErr);
      }
    }

    return res;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
