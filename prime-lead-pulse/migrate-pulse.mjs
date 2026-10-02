import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.migration' });

const oldSupabase = createClient(process.env.OLD_SUPABASE_URL, process.env.OLD_SUPABASE_KEY, { auth: { persistSession: false } });
const newSupabase = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SUPABASE_KEY, { auth: { persistSession: false } });

async function migrate() {
  console.log('Starting Pulse migration...');
  
  // 1. Fetch old auth users using admin API
  console.log('\nMigrating Users...');
  const { data: { users }, error: usersErr } = await oldSupabase.auth.admin.listUsers();
  if (usersErr) {
    console.error('Error fetching users:', usersErr);
    return;
  }
  
  // 2. Recreate users in new DB
  for (const user of users) {
    console.log('Recreating user: ' + user.email);
    const { error: createErr } = await newSupabase.auth.admin.createUser({
      email: user.email,
      password: 'TemporaryPassword123!',
      email_confirm: true
    });
    if (createErr) console.error('Failed to create user ' + user.email, createErr);
  }
  
  // Fetch newly created users to get their NEW UUIDs
  const { data: { users: newUsers } } = await newSupabase.auth.admin.listUsers();
  const userMap = {};
  for (const oldUser of users) {
    const matchingNewUser = newUsers.find(u => u.email === oldUser.email);
    if (matchingNewUser) userMap[oldUser.id] = matchingNewUser.id;
  }

  // 3. Migrate Emails
  console.log('\nMigrating Emails...');
  const { data: emails } = await oldSupabase.from('emails').select('*');
  if (emails && emails.length > 0) {
    const mappedEmails = emails.map(e => ({
      ...e,
      user_id: userMap[e.user_id] || e.user_id
    }));
    
    const { error: emailsErr } = await newSupabase.from('emails').insert(mappedEmails);
    if (emailsErr) console.error('Error inserting emails:', emailsErr);
    else console.log('Migrated ' + emails.length + ' emails.');
  }

  // 4. Migrate Tracking Events
  console.log('\nMigrating Tracking Events...');
  const { data: events } = await oldSupabase.from('tracking_events').select('*');
  if (events && events.length > 0) {
    const { error: eventsErr } = await newSupabase.from('tracking_events').insert(events);
    if (eventsErr) console.error('Error inserting tracking events:', eventsErr);
    else console.log('Migrated ' + events.length + ' tracking events.');
  }
  
  console.log('\nPulse Migration complete! NOTE: Your passwords for Pulse have been temporarily set to: TemporaryPassword123!');
}

migrate().catch(console.error);
