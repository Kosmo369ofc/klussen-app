-- Klantenbestand importeren (Klantenbestand_Hoveniersbedrijf_v2.xlsx, 22 klanten).
-- Uitvoeren in de SQL-editor van Supabase, na 0010_kilometers.sql.
--
-- Wat dit doet:
--   * Elke klant uit het Excel-bestand wordt een klant in de app.
--   * Bestaat de klant al (zelfde achternaam/bedrijfsnaam of zelfde telefoonnummer),
--     dan wordt hij overgeslagen. Er komen dus geen dubbele klanten.
--   * Type onderhoud + frequentie wordt een werkzaamheid met interval, zodat de app
--     kan uitrekenen wanneer het werk weer nodig is:
--       Maandelijks -> elke 1 maand, 2-wekelijks -> elke 2 weken, Op afroep -> alleen als het nodig is.
--   * Werkdag, route, seizoen, tuin, machines en e-mail komen in de notities.
--   * Alle klanten worden 'per beurt' en actief. Dat kun je per klant aanpassen in de app.
--
-- Je kunt dit bestand gerust twee keer uitvoeren: de tweede keer wordt alles overgeslagen.
-- Ongedaan maken: zie 0011_klanten_import_ongedaan.sql.

drop table if exists pg_temp.import_klanten;
create temp table import_klanten (
  klantnummer int primary key,
  naam text not null,
  zoeknaam text not null,
  adres text,
  telefoon text,
  notities text,
  werk text,
  interval_aantal int,
  interval_eenheid text,
  wanneer_nodig boolean,
  nieuw_id uuid not null default gen_random_uuid(),
  bestaat_als text
);

insert into import_klanten
  (klantnummer, naam, zoeknaam, adres, telefoon, notities, werk, interval_aantal, interval_eenheid, wanneer_nodig)
values
  (1, 'Kari-Anne Swart', 'swart', 'Hemsterhuislaan 69, 9752 NC Haren', '06-2924050', 'Vaste werkdag: maandag
Route: Eelde
Seizoen: heel jaar
E-mail: karianneswart@gmail.com
Klantnummer 1 uit klantenbestand', 'Totaal onderhoud', 1, 'maand', false),
  (2, 'Dijk', 'dijk', 'Dievelings 33, 9761 BD Eelde', null, 'Vaste werkdag: dinsdag
Route: Eelde
Seizoen: mrt-okt
Tuin: borders met tegels (klein)
Klantnummer 2 uit klantenbestand', 'Totaal onderhoud', 1, 'maand', false),
  (3, 'Wesseling', 'wesseling', 'Hooiweg 228, 9765 EN Paterswolde', '050-3091509', 'Vaste werkdag: vrijdag
Route: Eelde
Seizoen: mrt-okt
Machines: zitmaaier
Klantnummer 3 uit klantenbestand', 'Maaien', 2, 'week', false),
  (4, 'A.B.S.C. HW assetmanagement', 'a.b.s.c. hw assetmanagement', 'Groningerweg 13, 9765 TA Paterswolde', null, 'Vaste werkdag: woensdag
Route: Eelde
Klantnummer 4 uit klantenbestand', null, null, null, null),
  (5, 'Loes v.d. Plaat', 'plaat', 'Vermeerweg 4, 9761 KT Eelde', '06-57125743', 'Vaste werkdag: dinsdag
Route: Eelde
Seizoen: mrt-okt
E-mail: loesmvanderplaat@kpnmail.nl
Klantnummer 5 uit klantenbestand', 'Totaal onderhoud', 1, 'maand', false),
  (6, 'Hazenberg', 'hazenberg', 'Hoppenkampsweg 8, 9761 GB Eelde', '06-18306016', 'Vaste werkdag: woensdag
Route: Eelde
Seizoen: mrt-okt
E-mail: m.c.a.smilde@home.nl
Klantnummer 6 uit klantenbestand', 'Maaien', 2, 'week', false),
  (7, 'Bodewes', 'bodewes', 'Kooistukken 30, 9761 JZ Eelde', '06-20756067', 'Vaste werkdag: maandag
Route: Eelde
Seizoen: mrt-okt
E-mail: cambodewes@gmail.com
Klantnummer 7 uit klantenbestand', 'Totaal onderhoud', 1, 'maand', false),
  (8, 'AJ Cingel', 'cingel', null, '050-3110803', 'Vaste werkdag: dinsdag
Klantnummer 8 uit klantenbestand', null, null, null, null),
  (9, 'A.B.S.C. Assen', 'a.b.s.c. assen', 'Oosterhoutstraat 9/9a, 9401 NA Assen', '06-21405225', 'Vaste werkdag: donderdag
Route: Assen
Klantnummer 9 uit klantenbestand', null, null, null, null),
  (10, 'Graf Put', 'put', '9479 PR Noordlaren', '06-22914592', 'Vaste werkdag: donderdag
Route: Assen
Klantnummer 10 uit klantenbestand', null, null, null, null),
  (11, 'Albert Hovius', 'hovius', 'Doornakkers 34, 9467 PR Anloo', '0592-268683', 'Vaste werkdag: vrijdag
Route: Assen
E-mail: a.hovius@kpnplanet.nl
Klantnummer 11 uit klantenbestand', null, null, null, null),
  (12, 'Daniel Furrer', 'furrer', 'Helper Esweg 11a, 9722 RP Groningen', '06-57814031', 'Vaste werkdag: zaterdag
Route: Route Groningen
Seizoen: heel jaar
E-mail: daniel.furrer@gmail.com
Klantnummer 12 uit klantenbestand', 'Totaal onderhoud', null, null, true),
  (13, 'D.R. Stavasius', 'stavasius', 'G.C. Marshallstraat 14, 9728 WS Groningen', '050-5274658', 'Vaste werkdag: zaterdag
Route: Route Groningen
Seizoen: heel jaar
E-mail: d.r.stavasius@home.nl
Klantnummer 13 uit klantenbestand', 'Totaal onderhoud', null, null, true),
  (14, 'Roos Smid', 'smid', 'Goeman Borgesiuslaan 145, 9722 RG Groningen', '050-5270606', 'Vaste werkdag: vrijdag
Route: Route Groningen
Seizoen: heel jaar
E-mail: smidroos@planet.nl
Klantnummer 14 uit klantenbestand', 'Totaal onderhoud', null, null, true),
  (15, 'Luursema-Weitering', 'luursema-weitering', 'Beethovenweg 20, 9761 JJ Eelde', '050-3093309', 'Route: Eelde
Klantnummer 15 uit klantenbestand', null, null, null, null),
  (16, 'Brita Determeier', 'determeier', 'Meerstukken 9, 9761 KR Eelde', '06-46948878', 'Route: Eelde
E-mail: brita.determeier@gmail.com
Klantnummer 16 uit klantenbestand', null, null, null, null),
  (17, 'Roger Aretz', 'aretz', 'Ruskenstukken 62, 9761 KK Eelde', '06-11005658', 'Route: Eelde
E-mail: roger.aretz@home.nl
Klantnummer 17 uit klantenbestand', null, null, null, null),
  (18, 'Van der Meer', 'meer', 'Verweylaan 14', null, 'Klantnummer 18 uit klantenbestand', null, null, null, null),
  (19, 'Marian Laseur', 'laseur', 'Lokveenweg 35, 9751 CH', '06-38540308', 'Route: Eelde
E-mail: mlaseur@gmail.com
Klantnummer 19 uit klantenbestand', null, null, null, null),
  (20, 'Ria Duurkens', 'duurkens', 'Koninginjulianalaan 4', '06-23993253', 'Route: Paterswolde
E-mail: ria.duurkens@gmail.com
Klantnummer 20 uit klantenbestand', 'Snoeien', null, null, true),
  (21, 'Marli de Weerdt', 'weerdt', 'Kamperfoelieweg 26, 9765 HL', '050-3096795', 'Route: Paterswolde
E-mail: m.e.deweerdt@kpnmail.nl
Klantnummer 21 uit klantenbestand', 'Snoeien', null, null, true),
  (22, 'Renee Schaaphok', 'schaaphok', 'Burg.j.g. Legroweg 27, Paterswolde', '06-10658366', 'E-mail: r.d.schaaphok@kpnmail.nl
Klantnummer 22 uit klantenbestand', null, null, null, null)
;

-- Bestaande klanten opzoeken: zelfde achternaam/bedrijfsnaam als los woord in de
-- naam, of hetzelfde telefoonnummer (alleen de cijfers vergeleken).
update import_klanten i
set bestaat_als = (
  select k.naam from klanten k
  where k.naam ~* ('\m' || regexp_replace(i.zoeknaam, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M')
     or (i.telefoon is not null
         and regexp_replace(coalesce(k.telefoon, ''), '\D', '', 'g') = regexp_replace(i.telefoon, '\D', '', 'g'))
  order by k.naam
  limit 1
);

-- Nieuwe klanten toevoegen.
insert into klanten (id, naam, adres, telefoon, notities, contractvorm, actief)
select nieuw_id, naam, adres, telefoon, notities, 'per_beurt', true
from import_klanten
where bestaat_als is null;

-- Werkzaamheid met interval bij de nieuwe klanten.
insert into werkzaamheden (klant_id, omschrijving, interval_aantal, interval_eenheid, wanneer_nodig, volgorde)
select nieuw_id, werk, interval_aantal, interval_eenheid, wanneer_nodig, 0
from import_klanten
where bestaat_als is null and werk is not null;

-- Resultaat: per regel uit het Excel-bestand wat er gebeurd is.
select
  klantnummer as "Nr",
  naam as "Klant",
  case when bestaat_als is null then 'Toegevoegd'
       else 'Overgeslagen, bestaat al als: ' || bestaat_als end as "Resultaat",
  coalesce(werk || case when wanneer_nodig then ' (als het nodig is)'
                        else ' (elke ' || interval_aantal || ' ' || case interval_eenheid when 'week' then 'weken' else interval_eenheid end || ')' end, '-') as "Werk"
from import_klanten
order by klantnummer;
