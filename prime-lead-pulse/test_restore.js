const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ciihhdpjeklpqgpmrocm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpaWhoZHBqZWtscHFncG1yb2NtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzQ4ODYzOCwiZXhwIjoyMTAzMDY0NjM4fQ.EoH-jDiQsy4TAIIlIFQ9j4yhiLsYlAsAIwC6F0yOYqQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'test_restore_123@example.com';
  console.log('1. Creating user');
  const { data: user1, error: e1 } = await supabase.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
  if (e1) return console.error(e1);
  const uid1 = user1.user.id;
  
  console.log('2. Inserting data for uid1');
  await supabase.from('emails').insert([{ user_id: uid1, sender_email: 'a@a.com', recipient: 'b@b.com', subject: 'test' }]);
  
  console.log('3. Soft-deleting (renaming email)');
  const deletedEmail = deleted__;
  const { error: e2 } = await supabase.auth.admin.updateUserById(uid1, { email: deletedEmail, user_metadata: { deleted_at: new Date().toISOString(), original_email: email } });
  if (e2) return console.error(e2);
  
  console.log('4. Creating user again with original email');
  const { data: user2, error: e3 } = await supabase.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
  if (e3) return console.error(e3);
  const uid2 = user2.user.id;
  console.log('Success! New uid:', uid2);
  
  console.log('5. Simulating Restore');
  // Find the deleted account
  const { data: usersData, error: e4 } = await supabase.auth.admin.listUsers();
  const oldUser = usersData.users.find(u => u.user_metadata?.original_email === email && u.user_metadata?.deleted_at);
  if (oldUser) {
    console.log('Found old user:', oldUser.id);
    // Move data
    const { error: e5 } = await supabase.from('emails').update({ user_id: uid2 }).eq('user_id', oldUser.id);
    console.log('Moved data error:', e5);
    // Delete old user permanently
    await supabase.auth.admin.deleteUser(oldUser.id);
    console.log('Restore complete');
  }
}
run();
