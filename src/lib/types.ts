export type Rol = 'beheerder' | 'medewerker'
export type Contractvorm = 'vast_contract' | 'per_beurt'
export type Frequentie = 'elke_beurt' | 'maandelijks' | 'per_seizoen' | 'jaarlijks'

export interface Medewerker {
  id: string
  user_id: string | null
  naam: string
  email: string
  rol: Rol
  actief: boolean
}

export interface Klant {
  id: string
  naam: string
  adres: string | null
  telefoon: string | null
  contractvorm: Contractvorm
  notities: string | null
  actief: boolean
}

export interface Werkzaamheid {
  id: string
  klant_id: string
  omschrijving: string
  frequentie: Frequentie
  volgorde: number
  actief: boolean
}

export interface Bezoek {
  id: string
  klant_id: string
  datum: string
  opmerkingen: string | null
  gefactureerd: boolean
  aangemaakt_door: string
  bezoek_uren: { medewerker_id: string; uren: number }[]
  bezoekregels: { id: string; werkzaamheid_id: string | null; omschrijving: string }[]
}

// Wat de telefoon verstuurt, ook als het eerst offline bewaard is.
export interface NieuwBezoek {
  id: string
  klant_id: string
  datum: string
  opmerkingen: string
  uren: { medewerker_id: string; uren: number }[]
  regels: { werkzaamheid_id: string | null; omschrijving: string }[]
}

export const frequentieLabel: Record<Frequentie, string> = {
  elke_beurt: 'Elke beurt',
  maandelijks: 'Maandelijks',
  per_seizoen: 'Per seizoen',
  jaarlijks: 'Jaarlijks',
}
