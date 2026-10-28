import { toonDatum, toonEuro, toonUren } from '../lib/datum'
import { prijsopbouw, termijnLabel } from '../lib/prijs'
import type { Afspraken, Contractvorm, WerkPrijs, Werkzaamheid } from '../lib/types'

// Overzicht hoe de prijs van een klant tot stand komt; alleen voor de beheerder.
export default function PrijsopbouwTabel(props: {
  contractvorm: Contractvorm
  afspraken: Afspraken
  taken: Werkzaamheid[]
  prijzen: Record<string, WerkPrijs>
}) {
  const o = prijsopbouw(props.contractvorm, props.afspraken, props.taken, props.prijzen)
  const vast = props.contractvorm === 'vast_contract'
  const over = o.periode ? 'de looptijd' : 'een jaar'
  const termijnSoort = termijnLabel[props.afspraken.termijnen || 1]?.toLowerCase()
  return (
    <div className="opbouw">
      {o.periode && (
        <p className="klein">
          Looptijd {toonDatum(o.periode.van)} t/m {toonDatum(o.periode.tot)}: {o.maanden} {o.maanden === 1 ? 'maand' : 'maanden'}
        </p>
      )}
      <table className="tabel">
        <thead>
          <tr>
            <th>Wat</th>
            <th>Hoe vaak</th>
            <th>Uren</th>
            <th>Prijs</th>
            <th>{o.periode ? 'Looptijd' : 'Per jaar'}</th>
          </tr>
        </thead>
        <tbody>
          {o.regels.map((r, i) => (
            <tr key={i} className={r.telt ? '' : 'gedimd'}>
              <td>{r.omschrijving}</td>
              <td>{r.hoeVaak}</td>
              <td>{r.uren != null ? toonUren(r.uren) : '–'}</td>
              <td>{r.prijs}</td>
              <td>{r.bedrag !== null ? toonEuro(r.bedrag) : r.prijs === 'Inbegrepen' || vast ? '–' : 'naar gebruik'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="klein">
        {o.beurten !== null && <li>{Math.round(o.beurten)} beurten in {over}</li>}
        {o.uren !== null && <li>{toonUren(Math.round(o.uren))} in {over}</li>}
      </ul>
      <p>
        <strong>
          Klant betaalt {toonEuro(o.totaal)} {o.periode ? 'over de looptijd' : 'per jaar'}
        </strong>
        <br />
        <span className="klein">
          {toonEuro(o.totaal / o.maanden)} per maand · factuur {termijnSoort}: {o.termijnen}{' '}
          {o.termijnen === 1 ? 'factuur' : 'facturen'} van {toonEuro(o.totaal / o.termijnen)}
        </span>
      </p>
      {vast && (o.controle !== null || (o.uren !== null && o.uren > 0)) && (
        <div className="controle">
          <strong>Kan het contract uit?</strong>
          <ul className="klein">
            {o.uren !== null && o.uren > 0 && <li>Het contract levert {toonEuro(o.totaal / o.uren)} per gewerkt uur op.</li>}
            {o.controle !== null && (
              <li>
                Volgens de prijzen bij de werkzaamheden is het werk {toonEuro(o.controle)} waard.{' '}
                {o.totaal >= o.controle
                  ? `Het contract is ${toonEuro(o.totaal - o.controle)} hoger: dat kan uit.`
                  : `Het contract is ${toonEuro(o.controle - o.totaal)} lager dan het werk waard is.`}
              </li>
            )}
          </ul>
          <p className="klein">Bij een vast contract tellen de prijzen bij de werkzaamheden niet mee in wat de klant betaalt.</p>
        </div>
      )}
      {o.naarGebruik && <p className="klein">Werk met de prijs “naar gebruik” komt bovenop het totaal, per keer dat het gedaan is.</p>}
    </div>
  )
}
