import { describe, expect, it } from 'vitest'
import { nomSur, signatureValide, typePourExtension } from './type-fichier'
import { validerTeleversement } from './televersement'

const octets = (...valeurs: number[]) => {
  const tampon = new Uint8Array(64)
  tampon.set(valeurs)
  return tampon
}

const PNG = octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const JPEG = octets(0xff, 0xd8, 0xff, 0xe0)
const PDF = octets(0x25, 0x50, 0x44, 0x46, 0x2d)

const texte = (contenu: string) => {
  const tampon = new Uint8Array(64)
  tampon.set(new TextEncoder().encode(contenu).slice(0, 64))
  return tampon
}

describe('types acceptés', () => {
  it('reconnaît les formats prévus, quelle que soit la casse', () => {
    expect(typePourExtension('schema.PNG')?.mime).toBe('image/png')
    expect(typePourExtension('cours.pdf')?.mime).toBe('application/pdf')
    expect(typePourExtension('verin.STEP')?.mime).toBe('model/step')
  })

  it('refuse tout ce qui n’est pas explicitement prévu', () => {
    // Liste blanche, jamais liste noire.
    for (const nom of ['virus.exe', 'page.html', 'script.js', 'macro.docm', 'logo.svg']) {
      expect(typePourExtension(nom), nom).toBeNull()
    }
  })

  it('refuse le SVG, malgré son apparence d’image', () => {
    // Un SVG est un document XML qui peut contenir du script. Sur une
    // plateforme où des enseignants déposent des schémas lus par des mineurs,
    // c'est un vecteur, pas une image.
    expect(typePourExtension('schema.svg')).toBeNull()
  })
})

describe('vérification du contenu', () => {
  it('accepte un PNG qui est vraiment un PNG', () => {
    const type = typePourExtension('schema.png')!
    expect(signatureValide(type, PNG)).toBe(true)
  })

  it('refuse un fichier renommé en .png', () => {
    // Le cas réel : un exécutable ou une page HTML renommée.
    const type = typePourExtension('schema.png')!
    expect(signatureValide(type, texte('<html><script>'))).toBe(false)
    expect(signatureValide(type, octets(0x4d, 0x5a))).toBe(false) // MZ, exécutable Windows
  })

  it('vérifie la marque MP4 à son décalage réel', () => {
    const type = typePourExtension('cours.mp4')!
    const mp4 = new Uint8Array(64)
    mp4.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])
    expect(signatureValide(type, mp4)).toBe(true)
    // « ftyp » à l'offset 0 n'est pas un MP4.
    expect(signatureValide(type, octets(0x66, 0x74, 0x79, 0x70))).toBe(false)
  })

  it('reconnaît un STEP à sa marque textuelle', () => {
    const type = typePourExtension('verin.step')!
    expect(signatureValide(type, texte('ISO-10303-21;\nHEADER;'))).toBe(true)
    expect(signatureValide(type, texte('bonjour'))).toBe(false)
  })
})

describe('validation complète', () => {
  const demande = (nom: string, tailleOctets: number, tete: Uint8Array) =>
    validerTeleversement({ nom, tailleOctets, tete })

  it('accepte une image raisonnable', () => {
    const r = demande('schéma hydraulique.png', 500_000, PNG)
    expect(r.ok).toBe(true)
    // Le nom est assaini : il repart dans un en-tête HTTP.
    expect(r.ok && r.valeur.nom).toBe('schema-hydraulique.png')
  })

  it('refuse un fichier vide', () => {
    expect(demande('schema.png', 0, PNG).ok).toBe(false)
  })

  it('refuse un fichier trop lourd, en expliquant pourquoi', () => {
    const r = demande('photo.jpg', 50 * 1024 * 1024, JPEG)
    expect(r.ok).toBe(false)
    // Le message parle du réseau des établissements, pas d'une limite abstraite.
    expect(!r.ok && r.erreur.message).toMatch(/rurale/)
  })

  it('accepte un PDF volumineux, qui n’a pas la même limite qu’une image', () => {
    expect(demande('referentiel.pdf', 30 * 1024 * 1024, PDF).ok).toBe(true)
  })

  it('refuse un format non prévu', () => {
    expect(demande('cours.docx', 1000, PDF).ok).toBe(false)
  })
})

describe('assainissement du nom', () => {
  it('retire les chemins, quel que soit le séparateur', () => {
    // Les postes des établissements sont sous Windows.
    expect(nomSur('C:\\Users\\marc\\Bureau\\schema.png')).toBe('schema.png')
    expect(nomSur('../../etc/passwd')).toBe('passwd')
    expect(nomSur('/var/www/index.html')).toBe('index.html')
  })

  it('translittère les accents et neutralise le reste', () => {
    expect(nomSur('Réglage du vérin (2).png')).toBe('Reglage-du-verin-2-.png')
  })

  it('ne rend jamais une chaîne vide', () => {
    expect(nomSur('...')).toBe('fichier')
    expect(nomSur('')).toBe('fichier')
  })

  it('borne la longueur', () => {
    expect(nomSur('a'.repeat(400) + '.png').length).toBeLessThanOrEqual(120)
  })
})
