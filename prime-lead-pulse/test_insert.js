const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testInsert() {
  try {
    const { data, error } = await supabase
      .from('tracking_events')
      .insert({
        email_id: '0a155a54-0cf2-4eb4-a4ab-8c55ca1e85d8',
        event_type: 'open',
        user_agent: 'TestAgent',
        ip_address: '127.0.0.1'
      })
      .select();
    
    if (error) {
      console.error('Supabase Error:', error);
    } else {
      console.log('Success:', data);
    }
  } catch (err) {
    console.error('Exception:', err);
  }
}

testInsert();
