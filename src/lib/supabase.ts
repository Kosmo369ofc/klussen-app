import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const sleutel = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isGeconfigureerd = Boolean(url && sleutel)

// Zonder configuratie draait de app niet; App.tsx toont dan uitleg.
export const supabase = createClient(url ?? 'http://localhost', sleutel ?? 'ontbreekt')
