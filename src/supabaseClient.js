import { createClient } from '@supabase/supabase-js'
import { getStorageAdapter, logEnvironmentInfo, isWebView } from './utils/webViewHelper'

const supabaseUrl = 'https://ghycxtlzvkchuuelrrvx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoeWN4dGx6dmtjaHV1ZWxycnZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MzE0NTUsImV4cCI6MjA4MDUwNzQ1NX0.O6d0m6wzYpN341sXv6xePPZlWfnlDruE1ZWXBNjR_HM'

// Log environment info for debugging
logEnvironmentInfo();

const supabaseOptions = {
    auth: {
        // DISABLE internal persistence to prevent WebView hangs (we handle this manually in App.jsx)
        persistSession: false,
        // DISABLE auto-refresh to prevent network loops/hangs
        autoRefreshToken: false,
        // Don't detect session in URL (not needed for mobile apps)
        detectSessionInUrl: false,
        // Use custom storage adapter that works in WebView
        storage: getStorageAdapter(),
        // Custom storage key for Xpool app
        storageKey: 'xpool-auth-token',
        // Flow type for authentication
        flowType: 'pkce'
    },
    global: {
        headers: {
            // Custom header to identify requests from mobile app
            'X-Client-Info': 'xpool-mobile-app'
        }
    },
    // Increase timeout for slower mobile networks
    db: {
        schema: 'public'
    },
    // Realtime options
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
}

export const supabase = createClient(supabaseUrl, supabaseKey, supabaseOptions)
