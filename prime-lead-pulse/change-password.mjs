import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function changePassword() {
  const email = 'vicky@diyflatfee.com';
  // CHANGE THIS TO YOUR DESIRED PASSWORD
  const newPassword = '1PavBhaji@.';

  const { data: { users }, error: fetchErr } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === email);

  if (user) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
    if (!error) console.log('Password successfully changed for ' + email);
    else console.error('Error:', error);
  } else {
    console.log('User not found!');
  }
}
changePassword();
