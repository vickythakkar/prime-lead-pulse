const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ciihhdpjeklpqgpmrocm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpaWhoZHBqZWtscHFncG1yb2NtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzQ4ODYzOCwiZXhwIjoyMTAzMDY0NjM4fQ.EoH-jDiQsy4TAIIlIFQ9j4yhiLsYlAsAIwC6F0yOYqQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: user, error: uErr } = await supabase.auth.admin.createUser({
    email: 'test_delete_123@example.com',
    password: 'password123',
    email_confirm: true
  });
  
  if (uErr) { console.error('Create user error:', uErr); return; }
  
  const uid = user.user.id;
  console.log('Created user:', uid);
  
  const { error: iErr } = await supabase.from('emails').insert([
    { user_id: uid, sender_email: 'a@a.com', recipient: 'b@b.com', subject: 't' }
  ]);
  
  console.log('Insert email error:', iErr);
  
  const { error: dErr } = await supabase.auth.admin.deleteUser(uid);
  console.log('Delete user error:', dErr);
  
  const { data: check } = await supabase.from('emails').select('*').eq('user_id', uid);
  console.log('Emails remaining:', check?.length);
}
run();
