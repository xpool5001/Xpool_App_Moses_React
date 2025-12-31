import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ghycxtlzvkchuuelrrvx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoeWN4dGx6dmtjaHV1ZWxycnZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MzE0NTUsImV4cCI6MjA4MDUwNzQ1NX0.O6d0m6wzYpN341sXv6xePPZlWfnlDruE1ZWXBNjR_HM'

export const supabase = createClient(supabaseUrl, supabaseKey)