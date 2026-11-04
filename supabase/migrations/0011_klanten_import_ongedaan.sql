-- Alleen gebruiken als de import van 0011_klanten_import.sql terug moet.
-- Verwijdert de klanten die door de import zijn toegevoegd (herkenbaar aan
-- "uit klantenbestand" in de notities), samen met hun werkzaamheden.
-- Klanten waar al een beurt bij staat, blijven staan.
delete from klanten k
where k.notities ~ 'Klantnummer [0-9]+ uit klantenbestand'
  and not exists (select 1 from bezoeken b where b.klant_id = k.id)
returning k.naam as "Verwijderd";
