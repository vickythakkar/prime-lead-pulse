import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await request.json(); // 'check', 'restore', or 'discard'

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Find the old account
  // Supabase listUsers doesn't have deep filtering, so we fetch and filter in memory.
  // In a massive app this is slow, but for this it's perfectly fine since we only have a few users.
  const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const oldUser = users.find(u => 
    u.user_metadata?.original_email === user.email && 
    u.user_metadata?.deleted_at
  );

  if (!oldUser) {
    return NextResponse.json({ hasBackup: false });
  }

  const deletedAt = new Date(oldUser.user_metadata.deleted_at);
  const daysSinceDelete = (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);

  // If > 30 days old, auto-delete and say no backup
  if (daysSinceDelete > 30) {
    await adminClient.auth.admin.deleteUser(oldUser.id);
    return NextResponse.json({ hasBackup: false });
  }

  if (action === 'check') {
    return NextResponse.json({ hasBackup: true, daysRemaining: Math.floor(30 - daysSinceDelete) });
  }

  if (action === 'discard') {
    await adminClient.auth.admin.deleteUser(oldUser.id);
    return NextResponse.json({ success: true });
  }

  if (action === 'restore') {
    // Re-assign all data from oldUser.id to user.id
    const { error: moveError } = await adminClient.from('emails').update({ user_id: user.id }).eq('user_id', oldUser.id);
    const { error: moveError2 } = await adminClient.from('templates').update({ user_id: user.id }).eq('user_id', oldUser.id);
    
    // Delete the old ghost user account
    await adminClient.auth.admin.deleteUser(oldUser.id);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
