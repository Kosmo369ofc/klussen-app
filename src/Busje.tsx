// Zwarte werkbus (opmaak 7A): blacked out, donkere ramen en zwarte velgen.
export default function Busje({ breed = 40 }: { breed?: number }) {
  return (
    <svg className="busje" width={breed} height={(breed * 30) / 64} viewBox="0 0 64 30" aria-hidden>
      <path d="M4 21 V13 Q4 9 8 8.5 L15 4 Q17 3 20 3 H56 Q60 3 60.5 7 L61.5 19 Q62 22 59 22 H5 Q4 22 4 21Z" fill="#141414" />
      <path d="M16 5.2 Q17.5 4.3 20 4.3 H27 V11 H10.5Z" fill="#3a3d3f" />
      <rect x="28.5" y="4.3" width="12" height="6.7" rx=".8" fill="#3a3d3f" />
      <rect x="42" y="4.3" width="13" height="6.7" rx=".8" fill="#3a3d3f" />
      <path d="M56.5 4.3 Q59 4.3 59.3 7 L59.6 11 H56.5Z" fill="#3a3d3f" />
      <rect x="4" y="15" width="3" height="1.6" rx=".6" fill="#e8e2c8" />
      <circle cx="15" cy="22" r="5" fill="#0a0a0a" />
      <circle cx="15" cy="22" r="2.4" fill="#2b2b2b" />
      <circle cx="50" cy="22" r="5" fill="#0a0a0a" />
      <circle cx="50" cy="22" r="2.4" fill="#2b2b2b" />
    </svg>
  )
}
