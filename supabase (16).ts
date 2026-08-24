import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ksppkaqoflpztbftqzzh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzcHBrYXFvZmxwenRiZnRxenpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczNzQ3MDgsImV4cCI6MjEwMjk1MDcwOH0.0x2zVfOVFhcnQjCYFW_TjnDY8uD8iNRfOLG-Yi1T1LQ';

export const supabase = createClient(supabaseUrl, supabaseKey);