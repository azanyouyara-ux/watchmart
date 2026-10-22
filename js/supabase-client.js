import { createClient } from
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://wyystdnjmnnkjesoztyt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5_aP6UO7SQpVMGT1n275LA_QVWb9H_t';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase client ready:', SUPABASE_URL);
