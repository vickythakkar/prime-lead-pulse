const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) { console.error("Missing keys"); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: emails } = await supabase.from('emails').select('*').order('created_at', { ascending: false }).limit(3);
  console.log('--- RECENT EMAILS ---');
  for (const e of emails) {
    console.log(`Email ID: ${e.id} | Subj: ${e.subject} | To: ${e.recipient} | Created: ${e.created_at}`);
    const { data: events } = await supabase.from('tracking_events').select('*').eq('email_id', e.id);
    console.log(`   Events:`, events);
  }
}
check();
