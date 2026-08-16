/**
 * La pousse RAAI Apprendre — l'agricole et l'apprentissage dans un geste.
 *
 * Un seul dessin, décliné partout (favicon compris, `app/icon.svg`) : une
 * marque qui change de forme selon l'écran n'est pas une marque. `aria-hidden`
 * par défaut, car le logo accompagne toujours le nom écrit à côté de lui —
 * le répéter aux lecteurs d'écran serait du bruit.
 */
export function Logo({ taille = 40 }: { taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#1c6b3c" />
      <path
        d="M32 50 C32 42 32 34 32 27"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M31 33 C22 32 15 25 14.5 15.5 C24 16 31 23 31.5 33 Z" fill="#fff" />
      <path d="M33 28 C41 27 47.5 21 48 12.5 C39.5 13 33.5 19 33 28 Z" fill="#9fd3ae" />
    </svg>
  )
}
