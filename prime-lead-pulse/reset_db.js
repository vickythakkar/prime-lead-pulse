const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ciihhdpjeklpqgpmrocm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpaWhoZHBqZWtscHFncG1yb2NtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzQ4ODYzOCwiZXhwIjoyMTAzMDY0NjM4fQ.EoH-jDiQsy4TAIIlIFQ9j4yhiLsYlAsAIwC6F0yOYqQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetDb() {
  console.log('Deleting tracking_events...');
  const { error: err1 } = await supabase.from('tracking_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err1) console.error('Error deleting events:', err1);

  console.log('Deleting emails...');
  const { error: err2 } = await supabase.from('emails').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err2) console.error('Error deleting emails:', err2);
  
  console.log('Database reset complete.');
}

resetDb();
