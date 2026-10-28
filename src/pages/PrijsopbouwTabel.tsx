import { toonEuro, toonUren } from '../lib/datum'
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
  const termijnen = props.afspraken.termijnen || 1
  return (
    <div className="opbouw">
      <table className="tabel">
        <thead>
          <tr>
            <th>Wat</th>
            <th>Hoe vaak</th>
            <th>Uren</th>
            <th>Prijs</th>
            <th>Per jaar</th>
          </tr>
        </thead>
        <tbody>
          {o.regels.map((r, i) => (
            <tr key={i}>
              <td>{r.omschrijving}</td>
              <td>{r.hoeVaak}</td>
              <td>{r.uren !== null ? toonUren(r.uren) : '–'}</td>
              <td>{r.prijs}</td>
              <td>{r.perJaar !== null ? toonEuro(r.perJaar) : r.prijs === 'Inbegrepen' ? '–' : 'naar gebruik'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="klein">
        {o.beurtenPerJaar !== null && <li>Ongeveer {Math.round(o.beurtenPerJaar)} beurten per jaar</li>}
        {o.urenPerJaar !== null && <li>Ongeveer {toonUren(Math.round(o.urenPerJaar))} per jaar</li>}
      </ul>
      <p>
        <strong>Totaal {toonEuro(o.totaalPerJaar)} per jaar</strong>
        <br />
        <span className="klein">
          {toonEuro(o.totaalPerJaar / 12)} per maand · factuur {termijnLabel[termijnen]?.toLowerCase()}
          {termijnen > 1 && `: ${toonEuro(o.totaalPerJaar / termijnen)} per termijn`}
        </span>
      </p>
      {o.naarGebruik && <p className="klein">Werk met de prijs “naar gebruik” komt bovenop het totaal, per keer dat het gedaan is.</p>}
    </div>
  )
}
