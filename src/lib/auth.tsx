import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Medewerker } from './types'

interface AuthStatus {
  laden: boolean
  sessie: Session | null
  // null als iemand wel is ingelogd maar niet als medewerker bekend is.
  medewerker: Medewerker | null
  isBeheerder: boolean
}

const AuthContext = createContext<AuthStatus>({
  laden: true,
  sessie: null,
  medewerker: null,
  isBeheerder: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessie, setSessie] = useState<Session | null>(null)
  const [medewerker, setMedewerker] = useState<Medewerker | null>(null)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessie(data.session)
      if (!data.session) setLaden(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSessie(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = sessie?.user.id
  useEffect(() => {
    if (!userId) {
      setMedewerker(null)
      return
    }
    setLaden(true)
    void (async () => {
      await supabase.rpc('koppel_eigen_account')
      const { data } = await supabase
        .from('medewerkers')
        .select('*')
        .eq('user_id', userId)
        .eq('actief', true)
        .maybeSingle()
      setMedewerker(data as Medewerker | null)
      setLaden(false)
    })()
  }, [userId])

  return (
    <AuthContext.Provider
      value={{ laden, sessie, medewerker, isBeheerder: medewerker?.rol === 'beheerder' }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
