// Koppeling klussen-app -> Google Drive.
//
// Maakt in Google Drive een map "Klussen-app" met per klant een eigen map.
// Daarin staat een spreadsheet met alle beurten en een map met de foto's.
// Zie google-drive/LEESMIJ.md voor het installeren in het Google-account van
// de beheerder.

const INSTELLINGEN = {
  // Supabase > Project Settings > API (of Data API): Project URL.
  SUPABASE_URL: 'https://JOUWPROJECT.supabase.co',
  // De publishable / anon key: dezelfde als in Netlify. Nooit de service_role key.
  SUPABASE_SLEUTEL: 'PLAK_HIER_DE_PUBLISHABLE_KEY',
  // Het account waarmee het script in de app inlogt. Het wachtwoord staat
  // niet hier maar bij Projectinstellingen > Scripteigenschappen > WACHTWOORD.
  EMAIL: 'info@darnevieldienstverlening.nl',
  HOOFDMAP: 'Klussen-app',
  // Leeg: de map komt in "Mijn Drive". Of plak de id van een map in jullie
  // gezamenlijke drive: het laatste stuk van de link, na /folders/.
  MAP_ID: '',
}

// Een uitvoering mag bij Google 6 minuten duren. Foto's die niet meer passen,
// komen bij de volgende keer.
const MAX_DUUR_MS = 4.5 * 60 * 1000

const eigenschappen = () => PropertiesService.getScriptProperties()

// Eén keer uitvoeren: daarna werkt het script elk uur alles bij.
function elkUurBijwerken() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'bijwerken') ScriptApp.deleteTrigger(t)
  }
  ScriptApp.newTrigger('bijwerken').timeBased().everyHours(1).create()
  bijwerken()
}

function bijwerken() {
  const begin = Date.now()
  const token = inloggen()
  const klanten = haalAlles(token, 'klanten?select=id,naam,adres,contactpersoon,telefoon,actief&order=naam')
  const namen = {}
  for (const m of haalAlles(token, 'medewerkers?select=id,naam')) namen[m.id] = m.naam
  const eenheden = {}
  for (const w of haalAlles(token, 'werkzaamheden?select=id,meeteenheid')) eenheden[w.id] = w.meeteenheid
  const bezoeken = haalAlles(
    token,
    'bezoeken?select=id,klant_id,datum,opmerkingen,gefactureerd,bezoek_uren(medewerker_id,uren),' +
      'bezoekregels(omschrijving,hoeveelheid,werkzaamheid_id),bezoek_fotos(id,pad)&order=datum.desc,aangemaakt_op.desc',
  )

  const plek = INSTELLINGEN.MAP_ID ? DriveApp.getFolderById(INSTELLINGEN.MAP_ID) : DriveApp.getRootFolder()
  const hoofdmap = vindOfMaakMap('hoofdmap', plek, INSTELLINGEN.HOOFDMAP)
  const fotoTaken = []
  for (const klant of klanten) {
    const eigen = bezoeken.filter((b) => b.klant_id === klant.id)
    // Oude klanten zonder beurten krijgen geen lege map.
    if (!klant.actief && eigen.length === 0) continue
    const map = vindOfMaakMap(`map:${klant.id}`, hoofdmap, bestandsnaam(klant.naam))
    const fotomap = vindOfMaakMap(`fotos:${klant.id}`, map, "Foto's")
    schrijfBeurten(klant, map, fotomap, eigen, namen, eenheden)
    for (const b of eigen) {
      for (const f of b.bezoek_fotos || []) fotoTaken.push({ fotomap, naam: `${b.datum} ${f.pad.split('/').pop()}`, pad: f.pad })
    }
  }

  // Zonder 0005_urenregistratie.sql in Supabase is er nog geen urentabel: dan alleen de beurten.
  let uren = null
  try {
    uren = haalAlles(token, 'werkuren?select=*&order=datum.desc,begintijd')
  } catch (e) {
    console.warn(`Urenregistratie overgeslagen: ${e.message}`)
  }
  if (uren) schrijfUren(hoofdmap, uren, namen)

  let nieuw = 0
  let overgeslagen = 0
  for (const t of fotoTaken) {
    if (t.fotomap.getFilesByName(t.naam).hasNext()) continue
    if (Date.now() - begin > MAX_DUUR_MS) {
      overgeslagen++
      continue
    }
    const antwoord = UrlFetchApp.fetch(`${INSTELLINGEN.SUPABASE_URL}/storage/v1/object/authenticated/fotos/${t.pad}`, {
      headers: kop(token),
      muteHttpExceptions: true,
    })
    if (antwoord.getResponseCode() !== 200) {
      console.warn(`Foto ${t.pad} ophalen lukte niet: ${antwoord.getResponseCode()}`)
      continue
    }
    t.fotomap.createFile(antwoord.getBlob().setName(t.naam))
    nieuw++
  }
  console.log(`${klanten.length} klanten, ${bezoeken.length} beurten, ${nieuw} nieuwe foto's` +
    (overgeslagen ? `, ${overgeslagen} foto's volgende keer` : ''))
}

function schrijfBeurten(klant, map, fotomap, bezoeken, namen, eenheden) {
  const blad = vindOfMaakBlad(`blad:${klant.id}`, map, `Beurten ${klant.naam}`)
  const tab = blad.getSheets()[0]
  const kopregel = ['Datum', 'Werkzaamheden', 'Uren', 'Wie', 'Opmerkingen', "Foto's", 'Gefactureerd']
  const rijen = bezoeken.map((b) => {
    const uren = (b.bezoek_uren || []).reduce((som, u) => som + Number(u.uren), 0)
    const fotos = (b.bezoek_fotos || []).length
    return [
      new Date(`${b.datum}T12:00:00`),
      (b.bezoekregels || [])
        .map((r) =>
          r.hoeveelheid === null || r.hoeveelheid === undefined
            ? r.omschrijving
            : `${r.omschrijving} (${String(r.hoeveelheid).replace('.', ',')} ${eenheden[r.werkzaamheid_id] || ''})`.replace(' )', ')'),
        )
        .join(', '),
      uren,
      (b.bezoek_uren || []).map((u) => `${namen[u.medewerker_id] || '?'} ${String(u.uren).replace('.', ',')}`).join(', '),
      b.opmerkingen || '',
      fotos ? `=HYPERLINK("${fotomap.getUrl()}", "${fotos} ${fotos === 1 ? 'foto' : "foto's"}")` : '',
      b.gefactureerd ? 'ja' : 'nee',
    ]
  })
  tab.clearContents()
  tab.setName('Beurten')
  tab.getRange(1, 1, 1, kopregel.length).setValues([kopregel]).setFontWeight('bold')
  tab.setFrozenRows(1)
  if (rijen.length) {
    tab.getRange(2, 1, rijen.length, kopregel.length).setValues(rijen)
    tab.getRange(2, 1, rijen.length, 1).setNumberFormat('dd-mm-yyyy')
  }
  if (blad.getName() !== `Beurten ${klant.naam}`) blad.rename(`Beurten ${klant.naam}`)
}

// Urenregistratie staat in een eigen spreadsheet, los van de klantmappen.
function schrijfUren(hoofdmap, uren, namen) {
  const blad = vindOfMaakBlad('blad:uren', hoofdmap, 'Urenregistratie medewerkers')
  const tabs = blad.getSheets()
  const alle = tabs[0]
  const perWeek = tabs[1] || blad.insertSheet('Per week')
  const kop = ['Week', 'Dag', 'Datum', 'Medewerker', 'Begin', 'Eind', 'Pauze (min)', 'Uren', 'Opmerking', 'Goedgekeurd']
  const dagen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
  const rijen = uren.map((u) => [
    weeknummer(u.datum),
    dagen[new Date(`${u.datum}T12:00:00`).getDay()],
    new Date(`${u.datum}T12:00:00`),
    namen[u.medewerker_id] || '?',
    String(u.begintijd).slice(0, 5),
    String(u.eindtijd).slice(0, 5),
    Number(u.pauze_minuten),
    Number(u.uren),
    u.opmerking || '',
    u.goedgekeurd ? 'ja' : 'nee',
  ])
  alle.clearContents()
  alle.setName('Alle uren')
  alle.getRange(1, 1, 1, kop.length).setValues([kop]).setFontWeight('bold')
  alle.setFrozenRows(1)
  if (rijen.length) {
    alle.getRange(2, 1, rijen.length, kop.length).setValues(rijen)
    alle.getRange(2, 3, rijen.length, 1).setNumberFormat('dd-mm-yyyy')
  }

  // Totaal per medewerker per week, nieuwste week bovenaan.
  const totaal = {}
  for (const u of uren) {
    const jaar = isoJaar(u.datum)
    const sleutel = `${jaar}|${String(weeknummer(u.datum)).padStart(2, '0')}|${namen[u.medewerker_id] || '?'}`
    totaal[sleutel] = (totaal[sleutel] || 0) + Number(u.uren)
  }
  const weekRijen = Object.keys(totaal)
    .sort((a, b) => (a.slice(0, 7) === b.slice(0, 7) ? a.localeCompare(b) : b.localeCompare(a)))
    .map((k) => {
      const [jaar, week, naam] = k.split('|')
      return [Number(jaar), Number(week), naam, Math.round(totaal[k] * 100) / 100]
    })
  const weekKop = ['Jaar', 'Week', 'Medewerker', 'Uren']
  perWeek.clearContents()
  perWeek.getRange(1, 1, 1, weekKop.length).setValues([weekKop]).setFontWeight('bold')
  perWeek.setFrozenRows(1)
  if (weekRijen.length) perWeek.getRange(2, 1, weekRijen.length, weekKop.length).setValues(weekRijen)
}

// ISO-weeknummer (week begint op maandag), zoals in de agenda.
function weeknummer(datum) {
  const d = new Date(`${datum}T12:00:00`)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4, 12)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function isoJaar(datum) {
  const d = new Date(`${datum}T12:00:00`)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  return d.getFullYear()
}

// Mappen en bladen worden onthouden op hun id, zodat een andere klantnaam
// geen nieuwe map oplevert: de map krijgt dan alleen een nieuwe naam.
function vindOfMaakMap(sleutel, ouder, naam) {
  const id = eigenschappen().getProperty(sleutel)
  if (id) {
    try {
      const map = DriveApp.getFolderById(id)
      if (!map.isTrashed()) {
        if (map.getName() !== naam) map.setName(naam)
        // Een andere MAP_ID: verhuis de bestaande map in plaats van een nieuwe te maken.
        const ouders = map.getParents()
        if (!(ouders.hasNext() && ouders.next().getId() === ouder.getId())) map.moveTo(ouder)
        return map
      }
    } catch (e) {
      // Map bestaat niet meer: maak een nieuwe.
    }
  }
  const bestaand = ouder.getFoldersByName(naam)
  const map = bestaand.hasNext() ? bestaand.next() : ouder.createFolder(naam)
  eigenschappen().setProperty(sleutel, map.getId())
  return map
}

function vindOfMaakBlad(sleutel, map, naam) {
  const id = eigenschappen().getProperty(sleutel)
  if (id) {
    try {
      if (!DriveApp.getFileById(id).isTrashed()) return SpreadsheetApp.openById(id)
    } catch (e) {
      // Blad bestaat niet meer: maak een nieuw.
    }
  }
  const blad = SpreadsheetApp.create(naam)
  DriveApp.getFileById(blad.getId()).moveTo(map)
  eigenschappen().setProperty(sleutel, blad.getId())
  return blad
}

function bestandsnaam(naam) {
  return naam.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Naamloos'
}

function inloggen() {
  const wachtwoord = eigenschappen().getProperty('WACHTWOORD')
  if (!wachtwoord) throw new Error('Zet eerst het wachtwoord bij Projectinstellingen > Scripteigenschappen > WACHTWOORD.')
  const antwoord = UrlFetchApp.fetch(`${INSTELLINGEN.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: INSTELLINGEN.SUPABASE_SLEUTEL },
    payload: JSON.stringify({ email: INSTELLINGEN.EMAIL, password: wachtwoord }),
    muteHttpExceptions: true,
  })
  if (antwoord.getResponseCode() !== 200) {
    throw new Error(`Inloggen bij de app lukte niet (${antwoord.getResponseCode()}). Klopt het wachtwoord?`)
  }
  return JSON.parse(antwoord.getContentText()).access_token
}

function kop(token) {
  return { apikey: INSTELLINGEN.SUPABASE_SLEUTEL, Authorization: `Bearer ${token}` }
}

// Haalt alle rijen op, 1000 per keer.
function haalAlles(token, pad) {
  const alles = []
  for (let vanaf = 0; ; vanaf += 1000) {
    const antwoord = UrlFetchApp.fetch(`${INSTELLINGEN.SUPABASE_URL}/rest/v1/${pad}&limit=1000&offset=${vanaf}`, {
      headers: kop(token),
      muteHttpExceptions: true,
    })
    if (antwoord.getResponseCode() !== 200) {
      throw new Error(`Ophalen van ${pad.split('?')[0]} lukte niet (${antwoord.getResponseCode()}): ${antwoord.getContentText()}`)
    }
    const rijen = JSON.parse(antwoord.getContentText())
    alles.push(...rijen)
    if (rijen.length < 1000) return alles
  }
}
