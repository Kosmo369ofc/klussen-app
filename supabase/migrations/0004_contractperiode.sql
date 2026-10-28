-- Een vast contract kan ook in beurten zijn afgesproken in plaats van uren.
alter table contracten
  add column contract_beurten smallint check (contract_beurten between 1 and 999);
