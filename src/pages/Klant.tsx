import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { bekijkLinks } from '../lib/bestanden'
import { toonDatum, toonEuro, toonUren, vandaag } from '../lib/datum'
import {
  intervalLabel,
  volgendeKeer,
  type Afspraken,
  type Bezoek,
  type Klant as KlantT,
  type Medewerker,
  type WerkPrijs,
  type Werkzaamheid,
} from '../lib/types'
import PrijsopbouwTabel from './PrijsopbouwTabel'

export default function Klant() {
  const { id } = useParams()
  const { isBeheerder } = useAuth()
  const melding = (useLocation().state as { melding?: string } | null)?.melding
  const [klant, setKlant] = useState<KlantT | null>(null)
  const [taken, setTaken] = useState<Werkzaamheid[]>([])
  const [laatst, setLaatst] = useState<Record<string, string | null>>({})
  const [afspraken, setAfspraken] = useState<Afspraken | null>(null)
  const [prijzen, setPrijzen] = useState<Record<string, WerkPrijs>>({})
  const [contractLink, setContractLink] = useState<string | null>(null)
  const [bezoeken, setBezoeken] = useState<Bezoek[]>([])
  const [fotoLinks, setFotoLinks] = useState<Record<string, string>>({})
  const [namen, setNamen] = useState<Record<string, string>>({})
  const [alles, setAlles] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase.from('klanten').select('*').eq('id', id).single().then(({ data }) => setKlant(data as KlantT))
    supabase
      .from('werkzaamheden')
      .select('*')
      .eq('klant_id', id)
      .eq('actief', true)
      .order('volgorde')
      .then(({ data }) => setTaken((data as Werkzaamheid[]) ?? []))
    supabase
      .from('werkzaamheid_laatst_gedaan')
      .select('werkzaamheid_id, laatste_datum')
      .eq('klant_id', id)
      .then(({ data }) =>
        setLaatst(Object.fromEntries((data ?? []).map((r) => [r.werkzaamheid_id as string, r.laatste_datum as string | null]))),
      )
    supabase
      .from('medewerkers')
      .select('id, naam')
      .then(({ data }) =>
        setNamen(Object.fromEntries(((data as Pick<Medewerker, 'id' | 'naam'>[]) ?? []).map((m) => [m.id, m.naam]))),
      )
  }, [id])

  useEffect(() => {
    if (!id || !isBeheerder) return
    supabase.from('contracten').select('*').eq('klant_id', id).maybeSingle().then(async ({ data }) => {
      const a = data as Afspraken | null
      setAfspraken(a)
      if (a?.bestand_pad) setContractLink((await bekijkLinks('contracten', [a.bestand_pad]))[a.bestand_pad] ?? null)
    })
  }, [id, isBeheerder])

  useEffect(() => {
    if (!isBeheerder || taken.length === 0) return
    supabase
      .from('werkzaamheid_prijzen')
      .select('*')
      .in('werkzaamheid_id', taken.map((t) => t.id))
      .then(({ data }) => setPrijzen(Object.fromEntries(((data as WerkPrijs[]) ?? []).map((p) => [p.werkzaamheid_id, p]))))
  }, [taken, isBeheerder])

  const laadBezoeken = useCallback(async () => {
    if (!id) return
    const { data } = await supabase
      .from('bezoeken')
      .select('*, bezoek_uren(medewerker_id, uren), bezoekregels(id, werkzaamheid_id, omschrijving, hoeveelheid), bezoek_fotos(id, pad)')
      .eq('klant_id', id)
      .order('datum', { ascending: false })
      .limit(alles ? 200 : 3)
    const lijst = (data as Bezoek[]) ?? []
    setBezoeken(lijst)
    setFotoLinks(await bekijkLinks('fotos', lijst.flatMap((b) => (b.bezoek_fotos ?? []).map((f) => f.pad))))
  }, [id, alles])

  useEffect(() => {
    void laadBezoeken()
  }, [laadBezoeken])

  async function wisselGefactureerd(b: Bezoek) {
    await supabase.from('bezoeken').update({ gefactureerd: !b.gefactureerd }).eq('id', b.id)
    void laadBezoeken()
  }

  if (!klant) return <main className="pagina"><p>Laden…</p></main>

  const kaartLink = klant.adres
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(klant.adres)}`
    : null
  const nu = vandaag()

  return (
    <main className="pagina">
      <Link to="/klanten" className="terug">← Klanten</Link>
      {melding && <p className="melding">{melding}</p>}
      <div className="kop">
        <h1>{klant.naam}</h1>
        {isBeheerder && <Link to={`/klanten/${klant.id}/bewerken`}>Bewerken</Link>}
      </div>
      <p className="klein">{klant.contractvorm === 'vast_contract' ? 'Vast contract' : 'Per beurt'}</p>
      {kaartLink && <p><a href={kaartLink} target="_blank" rel="noreferrer">{klant.adres}</a></p>}
      {(klant.contactpersoon || klant.telefoon) && (
        <p>
          {klant.contactpersoon}
          {klant.contactpersoon && klant.telefoon && ': '}
          {klant.telefoon && <a href={`tel:${klant.telefoon}`}>{klant.telefoon}</a>}
        </p>
      )}
      {klant.notities && <p className="notitie">{klant.notities}</p>}

      {isBeheerder && afspraken && (
        <section className="afspraken">
          <strong>Afspraken</strong>
          <ul>
            {klant.contractvorm === 'vast_contract' && afspraken.uren !== null && (
              <li>
                {toonUren(afspraken.uren)} per {afspraken.periode}
                {afspraken.startdatum && `, van ${toonDatum(afspraken.startdatum)}`}
                {afspraken.einddatum && ` tot ${toonDatum(afspraken.einddatum)}`}
              </li>
            )}
            {klant.contractvorm === 'vast_contract' && afspraken.uurtarief !== null && (
              <li>Meerwerk {toonEuro(afspraken.uurtarief)} per uur</li>
            )}
            {afspraken.prijsafspraak && <li>{afspraken.prijsafspraak}</li>}
            {afspraken.bestand_naam && (
              <li>
                Contract:{' '}
                {contractLink ? <a href={contractLink} target="_blank" rel="noreferrer">{afspraken.bestand_naam}</a> : afspraken.bestand_naam}
              </li>
            )}
          </ul>
          <PrijsopbouwTabel contractvorm={klant.contractvorm} afspraken={afspraken} taken={taken} prijzen={prijzen} />
        </section>
      )}

      <Link className="knop groot" to={`/klanten/${klant.id}/bezoek`}>
        Bezoek invoeren
      </Link>

      <h2>Werkzaamheden</h2>
      {taken.length === 0 ? (
        <p className="klein">Nog geen werkzaamheden toegewezen.</p>
      ) : (
        <ul className="taken">
          {taken.map((t) => {
            const vorige = laatst[t.id] ?? null
            const volgende = volgendeKeer(t, vorige)
            return (
              <li key={t.id}>
                {t.omschrijving} <span className="klein">{intervalLabel(t)}</span>
                <br />
                <span className="klein">
                  {vorige ? `Laatst ${toonDatum(vorige)}` : 'Nog niet gedaan'}
                  {volgende && (
                    <span className={volgende <= nu ? 'nodig' : ''}>
                      {volgende <= nu ? ' · weer nodig' : ` · weer nodig vanaf ${toonDatum(volgende)}`}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <h2>{alles ? 'Alle bezoeken' : 'Laatste bezoeken'}</h2>
      {bezoeken.length === 0 && <p className="klein">Nog geen bezoeken.</p>}
      {bezoeken.map((b) => (
        <article key={b.id} className="bezoek">
          <div className="kop">
            <strong>{toonDatum(b.datum)}</strong>
            {isBeheerder ? (
              <label className="vinkje klein">
                <input type="checkbox" checked={b.gefactureerd} onChange={() => wisselGefactureerd(b)} />
                Gefactureerd
              </label>
            ) : (
              b.gefactureerd && <span className="label">gefactureerd</span>
            )}
          </div>
          <p className="klein">
            {b.bezoek_uren.map((u) => `${namen[u.medewerker_id] ?? '?'} ${toonUren(u.uren)}`).join(', ')}
          </p>
          <ul>
            {b.bezoekregels.map((r) => (
              <li key={r.id}>
                {r.omschrijving}
                {r.hoeveelheid !== null && r.hoeveelheid !== undefined &&
                  `: ${String(r.hoeveelheid).replace('.', ',')} ${taken.find((t) => t.id === r.werkzaamheid_id)?.meeteenheid ?? ''}`}
              </li>
            ))}
          </ul>
          {b.opmerkingen && <p className="notitie">{b.opmerkingen}</p>}
          {(b.bezoek_fotos ?? []).length > 0 && (
            <div className="fotos">
              {b.bezoek_fotos!.map((f) =>
                fotoLinks[f.pad] ? (
                  <a key={f.id} href={fotoLinks[f.pad]} target="_blank" rel="noreferrer">
                    <img src={fotoLinks[f.pad]} alt="Foto van het resultaat" loading="lazy" />
                  </a>
                ) : null,
              )}
            </div>
          )}
        </article>
      ))}
      {!alles && bezoeken.length === 3 && (
        <button className="link" onClick={() => setAlles(true)}>
          Alle bezoeken tonen
        </button>
      )}
    </main>
  )
}
