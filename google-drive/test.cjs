// Bootst Google Apps Script en Supabase na om Code.gs te testen.
const fs = require('fs'), vm = require('vm')
let nr = 0; const items = {}; const props = {}; const triggers = []
const iter = (a) => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] } }
function folder(naam, ouder) { const f = { id: 'f' + ++nr, naam, ouder, trashed: false, kind: [], files: [],
  getId: () => f.id, getName: () => f.naam, setName: (n) => { f.naam = n }, isTrashed: () => f.trashed, getUrl: () => 'https://drive/' + f.id,
  getParents: () => iter(f.ouder ? [f.ouder] : []), moveTo: (m) => { f.ouder.kind = f.ouder.kind.filter((k) => k !== f); m.kind.push(f); f.ouder = m },
  getFoldersByName: (n) => iter(f.kind.filter((k) => k.naam === n && !k.trashed)),
  createFolder: (n) => { const k = folder(n, f); f.kind.push(k); return k },
  getFilesByName: (n) => iter(f.files.filter((k) => k.naam === n)),
  createFile: (blob) => { const b = { id: 'b' + ++nr, naam: blob.naam }; f.files.push(b); return b } }; items[f.id] = f; return f }
const root = folder('Mijn Drive')
function sheet(naam) { const tab = { naam: 'Blad1', cel: {}, getRange: (r, c, h, w) => ({ setValues: (v) => { v.forEach((rij, i) => rij.forEach((x, j) => { tab.cel[`${r + i},${c + j}`] = x })); return { setFontWeight() {} } }, setNumberFormat() {} }),
  clearContents: () => { tab.cel = {} }, setName: (n) => { tab.naam = n }, setFrozenRows() {} }
  const tabs = [tab]
  const s = { id: 's' + ++nr, naam, tab, tabs, map: root, getId: () => s.id, getName: () => s.naam, rename: (n) => { s.naam = n }, getSheets: () => tabs,
    insertSheet: (n) => { const t = sheet(n).tab; t.naam = n; tabs.push(t); return t } }
  items[s.id] = s; return s }
const db = {
  klanten: [{ id: 'k1', naam: 'Carin Bodewes', actief: true }, { id: 'k2', naam: 'Fam/Bakker', actief: true }, { id: 'k3', naam: 'Oud', actief: false }],
  medewerkers: [{ id: 'm1', naam: 'Beau' }, { id: 'm2', naam: 'Jan' }],
  werkuren: [
    { id: 'u1', medewerker_id: 'm2', datum: '2026-11-03', begintijd: '07:30:00', eindtijd: '16:00:00', pauze_minuten: 30, uren: 8, opmerking: null, goedgekeurd: true },
    { id: 'u2', medewerker_id: 'm2', datum: '2026-11-02', begintijd: '08:00:00', eindtijd: '12:00:00', pauze_minuten: 0, uren: 4, opmerking: 'werkplaats', goedgekeurd: false },
    { id: 'u3', medewerker_id: 'm1', datum: '2026-10-28', begintijd: '08:00:00', eindtijd: '17:00:00', pauze_minuten: 60, uren: 8, opmerking: null, goedgekeurd: false },
  ],
  werkzaamheden: [{ id: 'w1', meeteenheid: 'm³' }],
  bezoeken: [{ id: 'b1', klant_id: 'k1', datum: '2026-10-07', opmerkingen: 'nat', gefactureerd: true, bezoek_uren: [{ medewerker_id: 'm1', uren: 2.5 }], bezoekregels: [{ omschrijving: 'Gras', hoeveelheid: null, werkzaamheid_id: null }, { omschrijving: 'Groenafval', hoeveelheid: 3, werkzaamheid_id: 'w1' }], bezoek_fotos: [{ id: 'p1', pad: 'b1/a.jpg' }] }],
}
const aanroepen = []
const ctx = {
  console, Date, JSON, Number, String, Error,
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v } }) },
  DriveApp: { getRootFolder: () => root, getFolderById: (id) => { if (!items[id]) throw new Error('weg'); return items[id] },
    getFileById: (id) => { if (!items[id]) throw new Error('weg'); return { isTrashed: () => false, moveTo: (m) => { items[id].map = m } } } },
  SpreadsheetApp: { create: (n) => sheet(n), openById: (id) => items[id] },
  ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger() {}, newTrigger: (f) => ({ timeBased: () => ({ everyHours: () => ({ create: () => triggers.push({ getHandlerFunction: () => f }) }) }) }) },
  UrlFetchApp: { fetch: (url, opt) => { aanroepen.push(url); const u = new URL(url)
    const ant = (code, tekst) => ({ getResponseCode: () => code, getContentText: () => tekst, getBlob: () => ({ setName: (n) => ({ naam: n }) }) })
    if (u.pathname.startsWith('/auth/')) return JSON.parse(opt.payload).password === 'geheim' ? ant(200, '{"access_token":"t"}') : ant(400, '{}')
    if (opt.headers.Authorization !== 'Bearer t') return ant(401, 'nee')
    if (u.pathname.startsWith('/storage/')) return ant(200, '')
    const tabel = u.pathname.split('/').pop(); const off = Number(u.searchParams.get('offset'))
    return ant(200, JSON.stringify(off ? [] : db[tabel])) } },
}
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'Code.gs'), 'utf8').replace(/^const /gm, 'var '), ctx)
const ok = (l, v) => { console.log(v ? 'OK  ' : 'FOUT', l); if (!v) process.exitCode = 1 }
try { ctx.bijwerken(); ok('zonder wachtwoord een fout', false) } catch (e) { ok('zonder wachtwoord een duidelijke fout', /WACHTWOORD/.test(e.message)) }
props.WACHTWOORD = 'geheim'
ctx.elkUurBijwerken()
ok('trigger elk uur', triggers.length === 1)
const hoofd = root.kind.find((k) => k.naam === 'Klussen-app')
ok('hoofdmap', !!hoofd)
ok('mappen per actieve klant, niet voor oude zonder beurten', hoofd.kind.map((k) => k.naam).join('|') === 'Carin Bodewes|Fam-Bakker')
const carin = hoofd.kind[0]
const blad = Object.values(items).find((x) => x.naam === 'Beurten Carin Bodewes')
ok('blad in klantmap', blad && blad.map === carin)
ok('rij met werk en m³', blad.tab.cel['2,2'] === 'Gras, Groenafval (3 m³)')
ok('uren en wie', blad.tab.cel['2,3'] === 2.5 && blad.tab.cel['2,4'] === 'Beau 2,5')
ok('gefactureerd', blad.tab.cel['2,7'] === 'ja')
ok('foto link', /HYPERLINK\(".*", "1 foto"\)/.test(blad.tab.cel['2,6']))
const fotomap = carin.kind.find((k) => k.naam === "Foto's")
ok('foto gekopieerd', fotomap.files.length === 1 && fotomap.files[0].naam === '2026-10-07 a.jpg')
const uren = Object.values(items).find((x) => x.naam === 'Urenregistratie medewerkers')
ok('apart urenbestand in hoofdmap', uren && uren.map === hoofd)
ok('alle uren met week en wie', uren.tabs[0].naam === 'Alle uren' && uren.tabs[0].cel['2,1'] === 45 && uren.tabs[0].cel['2,2'] === 'dinsdag' && uren.tabs[0].cel['2,4'] === 'Jan' && uren.tabs[0].cel['2,5'] === '07:30' && uren.tabs[0].cel['3,9'] === 'werkplaats')
ok('per week opgeteld, nieuwste bovenaan', uren.tabs[1].naam === 'Per week' && uren.tabs[1].cel['2,2'] === 45 && uren.tabs[1].cel['2,4'] === 12 && uren.tabs[1].cel['3,2'] === 44 && uren.tabs[1].cel['3,3'] === 'Beau')
// Tweede keer: niets dubbel, hernoemen werkt.
db.klanten[0].naam = 'Carin Bodewes-Jansen'
ctx.bijwerken()
ok('geen dubbele mappen', hoofd.kind.length === 2 && root.kind.length === 1)
ok('urenbestand niet dubbel', Object.values(items).filter((x) => x.naam === 'Urenregistratie medewerkers').length === 1 && uren.tabs.length === 2)
ok('map hernoemd', carin.naam === 'Carin Bodewes-Jansen' && blad.naam === 'Beurten Carin Bodewes-Jansen')
ok('foto niet dubbel', fotomap.files.length === 1)
// In een map in de gezamenlijke drive.
const gedeeld = folder('Gedeelde drive')
vm.runInContext(`INSTELLINGEN.MAP_ID = '${gedeeld.id}'`, ctx)
ctx.bijwerken()
ok('bestaande map verhuisd naar gezamenlijke drive', gedeeld.kind.length === 1 && gedeeld.kind[0] === hoofd && hoofd.kind.length === 2 && root.kind.length === 0)
