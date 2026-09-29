import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This function runs every day to automatically purge accounts that were deleted > 30 days ago
export async function GET(request: Request) {
  // Verify it's Vercel calling the cron (optional but recommended for security)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let page = 1;
  let hasMore = true;
  let deletedCount = 0;

  while (hasMore) {
    const { data: { users }, error } = await adminClient.auth.admin.listUsers({
      page: page,
      perPage: 1000
    });

    if (error || !users || users.length === 0) {
      hasMore = false;
      break;
    }

    for (const user of users) {
      if (user.user_metadata?.deleted_at) {
        const deletedAt = new Date(user.user_metadata.deleted_at);
        const daysSinceDelete = (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceDelete >= 30) {
          // Permanently delete the user. 
          // Supabase's ON DELETE CASCADE will automatically shred all their emails and tracking events!
          await adminClient.auth.admin.deleteUser(user.id);
          deletedCount++;
        }
      }
    }

    if (users.length < 1000) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return NextResponse.json({ success: true, purged: deletedCount });
}
