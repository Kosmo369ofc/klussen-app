import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isGeconfigureerd, supabase } from './lib/supabase'
import { aantalInWachtrij, wachtrijVersturen } from './lib/wachtrij'
import Inloggen from './pages/Inloggen'
import Klanten from './pages/Klanten'
import Klant from './pages/Klant'
import KlantBewerken from './pages/KlantBewerken'
import NieuwBezoek from './pages/NieuwBezoek'
import Medewerkers from './pages/Medewerkers'
import Overzicht from './pages/Overzicht'
import Facturatie from './pages/Facturatie'

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

function Schil() {
  const { laden, sessie, medewerker, isBeheerder } = useAuth()
  const openBeurten = useOpenBeurten(isBeheerder)

  if (laden) return <main className="pagina"><p>Laden…</p></main>
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

  return (
    <>
      <Wachtrijbalk />
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
