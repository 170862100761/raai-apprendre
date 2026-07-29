# 14 — Accessibilité (RGAA)

La plateforme s'adresse à des établissements publics : l'accessibilité y est
une obligation légale, pas un raffinement. Elle vise aussi un public où le
besoin est concret — l'agroéquipement est une filière très masculine, et
**environ 8 % des garçons sont daltoniens** : deux élèves par classe.

Ce document dit ce qui est vérifié, comment le rejouer, et ce qui ne l'est pas
encore. Un audit dont on ne peut pas reproduire le résultat ne prouve rien.

## 1. Ce qui est acquis par construction

| Point | Où | Pourquoi ainsi |
|---|---|---|
| Langue déclarée | `layout.tsx` — `<html lang="fr">` | Sans elle, une synthèse vocale lit le français avec une voix anglaise |
| Zoom autorisé | `viewport.maximumScale = 5` | Le bloquer exclut les élèves malvoyants |
| Focus visible | `globals.css` — `:focus-visible` | Les salles informatiques ont des souris capricieuses |
| Animations réduites | `prefers-reduced-motion` | Certains élèves sont sujets au mal des transports numérique |
| Lien d'évitement | `layout.tsx` + `.lien-evitement` | RGAA 12.7 — saute les en-têtes répétés |
| Repère principal | `<main id="contenu" tabindex="-1">` sur les 13 pages | Cible du lien d'évitement, et repère ARIA |
| Jamais la couleur seule | Grille de suivi (`· ◐ ● ★`), journal (« à justifier ») | Un code chromatique serait illisible pour deux élèves par classe |
| Erreurs annoncées | `role="alert"` sur les messages, `aria-invalid` sur les champs | Une erreur seulement affichée n'existe pas pour un lecteur d'écran |
| Résultats annoncés | `aria-live="polite"` sur la recherche | Sinon le changement de nombre de résultats passe inaperçu |
| Règles bloquantes | `eslint.config.mjs` — `jsx-a11y/*` en `error` | Une régression repérée à la relecture humaine est repérée trop tard |

## 2. Contrastes — mesurés, pas estimés

Méthode : conversion `oklch → sRGB linéaire → luminance relative → ratio`,
comparée aux seuils WCAG 2.1 AA (4,5 pour le texte courant ; 3,0 pour les
éléments d'interface). Les deux thèmes sont contrôlés : les salles sont
éclairées au néon, les révisions se font le soir.

| Cas | Clair | Sombre | Seuil |
|---|---|---|---|
| Texte courant sur fond | 14,17 | 15,31 | 4,5 |
| Texte secondaire sur fond | 5,35 | 7,14 | 4,5 |
| Texte secondaire sur surface-2 | 4,97 | 6,45 | 4,5 |
| Libellé de bouton sur accent | 5,06 | 7,99 | 4,5 |
| Texte d'alerte sur alerte-douce | 5,10 | 5,28 | 4,5 |
| **Bordure de champ sur fond** | **3,83** | **4,14** | 3,0 |
| Anneau de focus sur fond | 5,06 | 7,53 | 3,0 |

### Le défaut trouvé, et corrigé

La bordure des champs de saisie était à **1,35 (clair) et 1,45 (sombre)** pour
un seuil de 3,0 — un échec net du critère WCAG 1.4.11. Les champs de connexion
n'étant délimités QUE par leur bordure, un élève sur un écran de salle
informatique ne voyait pas où taper.

Corrigé par un jeton dédié, `--color-bordure-champ`, distinct de
`--color-bordure` qui reste réservé aux séparateurs décoratifs — ceux-ci sont
exemptés du critère puisque l'information est portée par le contenu adjacent.

La règle est appliquée **hors couche CSS**, donc au-dessus des utilitaires
Tailwind. Ce n'est pas de la coquetterie : reprendre les 43 champs un par un
garantissait d'en oublier un, et surtout que le prochain formulaire écrit soit
non conforme sans que personne ne le remarque. Ici la conformité est acquise par
défaut, et un `border-bordure` posé par distraction ne peut plus la casser.

## 3. Ce qui n'est PAS encore vérifié

À ne pas présenter comme conforme tant que ces points ne sont pas faits :

- **Parcours complet au clavier** sur les écrans complexes — éditeur de leçons,
  visionneuse 3D, grille de suivi. La visionneuse est le point le plus douteux :
  un canevas WebGL n'est pas navigable au clavier, et sa description textuelle
  obligatoire est le seul recours. À vérifier avec un vrai lecteur d'écran
  (NVDA), pas seulement en lisant le code.
- **Tableau de la grille de suivi** : en-têtes de lignes et de colonnes
  correctement associés (`scope`, `headers`), sans quoi 200 cellules deviennent
  illisibles à la synthèse vocale.
- **Zoom à 200 %** sur la grille de suivi et l'éditeur, sans défilement
  horizontal du corps de page.
- **Déclaration d'accessibilité** — obligatoire pour un service public, avec le
  taux de conformité et les dérogations. Elle ne peut être rédigée qu'après un
  audit RGAA complet mené sur les 106 critères.

## 4. Rejouer la mesure des contrastes

Le script de vérification n'est pas versionné : il dépend des jetons, qui sont
la source de vérité. Pour le refaire, convertir chaque jeton `oklch` de
`globals.css` en luminance relative et comparer par paires — la table du §2
donne les couples à contrôler et les seuils attendus.

**Tout changement de jeton de couleur exige de refaire cette table.** Un thème
retouché « pour faire plus joli » est la façon la plus courante de perdre une
conformité acquise.
