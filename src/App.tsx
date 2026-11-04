import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
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
import Uren from './pages/Uren'
import Start from './pages/Start'
import Foutvanger from './Foutvanger'
import beeldmerk from './assets/beeldmerk.svg'

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

// Menu achter de knop met drie streepjes: grote tegels over het hele scherm.
// Beau (beheerder) ziet ook Facturatie en Medewerkers.
function Menu({ isBeheerder, naam, openBeurten, pathname, sluiten }: {
  isBeheerder: boolean
  naam: string
  openBeurten: number
  pathname: string
  sluiten: () => void
}) {
  useEffect(() => {
    const toets = (e: KeyboardEvent) => e.key === 'Escape' && sluiten()
    window.addEventListener('keydown', toets)
    document.body.classList.add('menu-open')
    return () => {
      window.removeEventListener('keydown', toets)
      document.body.classList.remove('menu-open')
    }
  }, [sluiten])

  const tegels = [
    { naar: '/', icoon: '⏱️', tekst: 'Klokken', actief: pathname === '/' },
    { naar: '/uren', icoon: '🕒', tekst: 'Uren invullen', actief: pathname.startsWith('/uren') },
    { naar: '/klanten', icoon: '🌿', tekst: 'Tuinonderhoud', actief: pathname.startsWith('/klanten') },
    { naar: '/overzicht', icoon: '📋', tekst: 'Overzicht', actief: pathname.startsWith('/overzicht') },
    ...(isBeheerder
      ? [
          { naar: '/facturatie', icoon: '💶', tekst: 'Facturatie', actief: pathname.startsWith('/facturatie'), teller: openBeurten, beheer: true },
          { naar: '/medewerkers', icoon: '👥', tekst: 'Medewerkers', actief: pathname.startsWith('/medewerkers'), beheer: true },
        ]
      : []),
  ]

  return (
    <nav className="menuscherm" aria-label="Menu">
      <div className="tegels">
        {tegels.map((t) => (
          <Link
            key={t.naar}
            to={t.naar}
            onClick={sluiten}
            className={`tegel${t.actief ? ' actief' : ''}${'beheer' in t ? ' beheer' : ''}`}
          >
            <span className="tegel-icoon" aria-hidden>{t.icoon}</span>
            {t.tekst}
            {'teller' in t && (t.teller ?? 0) > 0 && <span className="teller">{t.teller}</span>}
          </Link>
        ))}
      </div>
      <button className="knop-uitloggen" onClick={() => supabase.auth.signOut()}>
        Uitloggen ({naam})
      </button>
    </nav>
  )
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
  const [menuOpen, setMenuOpen] = useState(false)

  // Menu dicht na het kiezen van een pagina.
  useEffect(() => setMenuOpen(false), [pathname])

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
      <header className="balk">
        <div className="balk-binnen">
          <NavLink to="/" className="logo">
            <img src={beeldmerk} alt="" />
            <span>DARNEVIEL</span>
          </NavLink>
          <button
            className={`menuknop${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
            aria-expanded={menuOpen}
          >
            <i /><i /><i />
          </button>
        </div>
      </header>
      {menuOpen && (
        <Menu
          isBeheerder={isBeheerder}
          naam={medewerker.naam}
          openBeurten={openBeurten}
          pathname={pathname}
          sluiten={() => setMenuOpen(false)}
        />
      )}
      <Wachtrijbalk />
      <Foutvanger key={pathname}>
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/klanten" element={<Klanten />} />
          <Route path="/klanten/:id" element={<Klant />} />
          <Route path="/klanten/:id/bezoek" element={<NieuwBezoek />} />
          {isBeheerder && <Route path="/klanten/nieuw" element={<KlantBewerken />} />}
          {isBeheerder && <Route path="/klanten/:id/bewerken" element={<KlantBewerken />} />}
          {isBeheerder && <Route path="/medewerkers" element={<Medewerkers />} />}
          {isBeheerder && <Route path="/facturatie" element={<Facturatie />} />}
          <Route path="/overzicht" element={<Overzicht />} />
          <Route path="/uren" element={<Uren />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Foutvanger>
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
