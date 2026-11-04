// Zwarte werkbus (opmaak 9B): korte schuine neus, lange voorruit, getint raam voorin,
// achter blacked out, grote zwarte velgen en een grijze sierstreep onderlangs.
export default function Busje({ breed = 44 }: { breed?: number }) {
  return (
    <svg className="busje" width={breed} height={(breed * 34) / 80} viewBox="0 0 80 34" aria-hidden>
      <path d="M4.5 27.5 Q1.6 27.5 1.6 24.6 V21.4 Q1.6 18.6 4.6 17.6 L11.5 15.2 Q13.6 14.4 15 12.8 L22.6 5.4 Q24.2 4 27 4 H71.5 Q74.6 4 75.4 7 L77.6 22.5 Q78 27.5 74.5 27.5 Z" fill="#121212" />
      <path d="M28 3.4 H71 Q73.5 3.4 74 5" stroke="#2c2c2c" strokeWidth=".5" fill="none" />
      <path d="M24.8 6 H36.6 V15.2 H17.4 Z" fill="#3b3f42" />
      <path d="M38.6 6 H66.5 Q68.6 6 69 8.6 L70 15.2 H38.6 Z" fill="#1c1c1c" />
      <path d="M37.6 5 V26 M54 15.8 V26" stroke="#000" strokeWidth=".35" />
      <path d="M24 13.6 h3 v2 h-3 z" fill="#0a0a0a" />
      <path d="M2.4 19.6 Q5.5 18.2 8.6 17.8 L8 19.6 Q5 20 2.3 21 Z" fill="#d9d6cc" />
      <rect x="75.6" y="10" width="1.8" height="8" rx=".6" fill="#b3261e" />
      <path d="M25 24.4 H45 M46 24.4 L48 21.8 M48.8 24.4 L50.8 21.8 M51.6 24.4 L53.6 21.8 M54.4 24.4 L56.4 21.8 H57.2 M71 22.4 H76.6" stroke="#6b6e72" strokeWidth=".8" fill="none" />
      <circle cx="17.5" cy="27.5" r="6.2" fill="#0a0a0a" />
      <circle cx="17.5" cy="27.5" r="4.3" fill="#1d1d1d" />
      <circle cx="17.5" cy="27.5" r="1.2" fill="#3a3a3a" />
      <circle cx="64" cy="27.5" r="6.2" fill="#0a0a0a" />
      <circle cx="64" cy="27.5" r="4.3" fill="#1d1d1d" />
      <circle cx="64" cy="27.5" r="1.2" fill="#3a3a3a" />
    </svg>
  )
}
