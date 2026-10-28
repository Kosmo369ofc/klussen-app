import { supabase } from './supabase'

// Maakt een foto kleiner voordat hij wordt geüpload, zodat het ook via
// mobiel internet snel gaat.
async function verklein(bestand: File, maxZijde = 1600): Promise<Blob> {
  const beeld = await createImageBitmap(bestand)
  const schaal = Math.min(1, maxZijde / Math.max(beeld.width, beeld.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(beeld.width * schaal)
  canvas.height = Math.round(beeld.height * schaal)
  canvas.getContext('2d')!.drawImage(beeld, 0, 0, canvas.width, canvas.height)
  return new Promise((klaar, mislukt) =>
    canvas.toBlob((b) => (b ? klaar(b) : mislukt(new Error('Foto omzetten lukte niet'))), 'image/jpeg', 0.8),
  )
}

// Geeft het aantal foto's terug dat niet geüpload kon worden.
export async function fotosUploaden(bezoekId: string, fotos: File[]): Promise<number> {
  let mislukt = 0
  for (const foto of fotos) {
    try {
      const pad = `${bezoekId}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage
        .from('fotos')
        .upload(pad, await verklein(foto), { contentType: 'image/jpeg' })
      if (error) throw error
      const { error: e2 } = await supabase.from('bezoek_fotos').insert({ bezoek_id: bezoekId, pad })
      if (e2) throw e2
    } catch (fout) {
      console.error('Foto uploaden mislukt', fout)
      mislukt++
    }
  }
  return mislukt
}

// Tijdelijke links om afgeschermde bestanden te bekijken (een uur geldig).
export async function bekijkLinks(bucket: 'fotos' | 'contracten', paden: string[]): Promise<Record<string, string>> {
  if (paden.length === 0) return {}
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paden, 3600)
  const links: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) links[d.path] = d.signedUrl
  return links
}
