const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ciihhdpjeklpqgpmrocm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpaWhoZHBqZWtscHFncG1yb2NtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzQ4ODYzOCwiZXhwIjoyMTAzMDY0NjM4fQ.EoH-jDiQsy4TAIIlIFQ9j4yhiLsYlAsAIwC6F0yOYqQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('emails').insert([
    { user_id: '00000000-0000-0000-0000-000000000000', sender_email: 'test@test.com', recipient: 'a@b.com', subject: 'test' }
  ]);
  console.log(error);
}
test();
