import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isGeconfigureerd, supabase } from './lib/supabase'
import { aantalInWachtrij, wachtrijVersturen } from './lib/wachtrij'
import Inloggen, { WACHTWOORD_KIEZEN, WachtwoordKiezen } from './pages/Inloggen'
import Klanten from './pages/Klanten'
import Klant from './pages/Klant'
import KlantBewerken from './pages/KlantBewerken'
import NieuwBezoek from './pages/NieuwBezoek'
import Medewerkers from './pages/Medewerkers'
import Overzicht from './pages/Overzicht'
import Facturatie from './pages/Facturatie'
import Foutvanger from './Foutvanger'

function Wachtrijbalk() {
  const [aantal, setAantal] = useState(aantalInWachtrij())
  useEffect(() => {
    const bijwerken = () => setAantal(aantalInWachtrij())
    window.addEventListener('wachtrij', bijwerken)
    void wachtrijVersturen()
    return () => window.removeEventListener('wachtrij', bijwerken)
  }, [])
  if (aantal === 0) return null
  return (
    <div className="wachtrij">
      {aantal === 1 ? '1 bezoek wacht' : `${aantal} bezoeken wachten`} op internet.{' '}
      <button className="link" onClick={() => void wachtrijVersturen()}>Nu versturen</button>
    </div>
  )
}

// Aantal beurten dat nog gefactureerd moet worden, voor in het menu.
function useOpenBeurten(actief: boolean): number {
  const { pathname } = useLocation()
  const [aantal, setAantal] = useState(0)
  useEffect(() => {
    if (!actief) return
    supabase
      .from('bezoeken')
      .select('id', { count: 'exact', head: true })
      .eq('gefactureerd', false)
      .then(({ count }) => setAantal(count ?? 0))
  }, [actief, pathname])
  return aantal
}

function moetWachtwoordKiezen(gebruiker: { user_metadata?: Record<string, unknown> }): boolean {
  if (!gebruiker.user_metadata?.wachtwoord_ingesteld) return true
  try {
    return localStorage.getItem(WACHTWOORD_KIEZEN) === '1'
  } catch {
    return false
  }
}

// Wist de bewaarde inlog en de bewaarde versie van de app, en laadt opnieuw.
async function opnieuwBeginnen() {
  try {
    for (const sleutel of Object.keys(localStorage)) if (sleutel.startsWith('sb-')) localStorage.removeItem(sleutel)
    const registraties = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(registraties.map((r) => r.unregister()))
    for (const naam of (await caches?.keys()) ?? []) await caches.delete(naam)
  } finally {
    window.location.replace(import.meta.env.BASE_URL)
  }
}

function Schil() {
  const { laden, sessie, medewerker, isBeheerder, fout } = useAuth()
  const openBeurten = useOpenBeurten(isBeheerder)
  const { pathname } = useLocation()

  if (laden) return <main className="pagina"><p>Laden…</p></main>
  if (fout) {
    return (
      <main className="pagina smal">
        <h1>Opstarten lukt niet</h1>
        <p>De app kan de database niet goed bereiken. Controleer je internet en probeer het opnieuw.</p>
        <p className="klein">Foutmelding: {fout}</p>
        <div className="formulier">
          <button onClick={() => window.location.reload()}>Opnieuw proberen</button>
          <button className="link" onClick={() => void opnieuwBeginnen()}>Uitloggen en opnieuw beginnen</button>
        </div>
      </main>
    )
  }
  if (!sessie) return <Inloggen />
  if (!medewerker) {
    return (
      <main className="pagina smal">
        <h1>Geen toegang</h1>
        <p>
          {sessie.user.email} staat niet in de lijst met medewerkers. Vraag de beheerder om je toe te voegen.
        </p>
        <button onClick={() => supabase.auth.signOut()}>Uitloggen</button>
      </main>
    )
  }

  if (moetWachtwoordKiezen(sessie.user)) return <WachtwoordKiezen />

  return (
    <>
      <Wachtrijbalk />
      <Foutvanger key={pathname}>
        <Routes>
          <Route path="/" element={<Klanten />} />
          <Route path="/klanten/:id" element={<Klant />} />
          <Route path="/klanten/:id/bezoek" element={<NieuwBezoek />} />
          {isBeheerder && <Route path="/klanten/nieuw" element={<KlantBewerken />} />}
          {isBeheerder && <Route path="/klanten/:id/bewerken" element={<KlantBewerken />} />}
          {isBeheerder && <Route path="/medewerkers" element={<Medewerkers />} />}
          {isBeheerder && <Route path="/facturatie" element={<Facturatie />} />}
          <Route path="/overzicht" element={<Overzicht />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Foutvanger>
      <nav className="menu">
        <NavLink to="/" end>Klanten</NavLink>
        <NavLink to="/overzicht">Overzicht</NavLink>
        {isBeheerder && (
          <NavLink to="/facturatie">
            Facturatie{openBeurten > 0 && <span className="teller">{openBeurten}</span>}
          </NavLink>
        )}
        {isBeheerder && <NavLink to="/medewerkers">Medewerkers</NavLink>}
        <button className="link" onClick={() => supabase.auth.signOut()} title={`Uitloggen (${medewerker.naam})`}>
          Uitloggen
        </button>
      </nav>
    </>
  )
}

export default function App() {
  if (!isGeconfigureerd) {
    return (
      <main className="pagina smal">
        <h1>Nog niet ingesteld</h1>
        <p>
          De app weet nog niet met welke database hij moet praten. Zet VITE_SUPABASE_URL en
          VITE_SUPABASE_ANON_KEY in het bestand .env (zie README).
        </p>
      </main>
    )
  }
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Schil />
      </AuthProvider>
    </BrowserRouter>
  )
}
