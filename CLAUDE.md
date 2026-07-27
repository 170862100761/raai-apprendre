# raai-apprendre

Lis `docs/README.md` en premier. Le dossier de conception fait autorité sur ce
dépôt : si le code et les documents divergent, c'est le code qui a tort — ou
c'est le document qu'il faut corriger explicitement, pas ignorer.

## Ce dépôt

Plateforme pédagogique nationale pour l'enseignement agricole et technique.
Next.js 15 (App Router) + React 19 + TypeScript strict + Prisma + PostgreSQL.

**Français partout** : interface, contenu, tables, colonnes, messages, **et le
code** (variables, fonctions, composants). Ne mélange pas les langues dans un
même identifiant. Hérité de RAAI-Formation, non négociable.

## Règles à ne pas enfreindre

**Rien n'est accessible sans RLS.** Toute nouvelle table arrive avec sa
politique, dans le même commit. Le garde-fou de fin de migration et
`src/test/permissions/couverture.test.ts` échouent sinon. `FORCE ROW LEVEL
SECURITY` compte autant que `ENABLE` : sans lui, le propriétaire — celui-là même
qui exécute les migrations — contourne ses propres politiques.

**Les élèves mineurs n'ont pas de compte Auth.** Identifiant + code à 4 chiffres
créés par l'établissement. Pas d'email, pas de nom complet, pas de date de
naissance. Le mode est un choix juridique de l'établissement
(`etablissement.mode_identite`), pas un réglage technique.

**Un seul type `Session`.** Au-delà du middleware, plus une seule ligne de code
ne sait d'où vient la session. Aucun `if (estEleveMinimal)` dans les cas
d'usage, les composants ou les politiques. Toute divergence en aval est un défaut.

**La clé API ne quitte jamais le serveur.** Jamais dans une variable
`NEXT_PUBLIC_`, jamais dans un composant client.

**Aucun contenu généré ne part vers les élèves sans validation humaine.** Et
tant qu'une génération n'est pas branchée, l'interface dit noir sur blanc qu'il
s'agit d'un exemple.

**Le corrigé ne sort jamais avant soumission.** Ni vers le navigateur, ni dans le
contexte d'un appel IA.

**Le référentiel national ne porte pas d'`etablissement_id`.** Seule exception :
`adaptation_locale`, qui vit dans le schéma applicatif et matérialise le module
d'adaptation professionnelle défini régionalement.

## Architecture

Découpage en modules (`src/domaines/<module>/`), Clean Architecture à quatre
couches. Les flèches pointent vers le centre : le domaine n'importe rien,
l'infrastructure est injectée. Un module n'expose que son `index.ts`, et ne peut
dépendre que de ce que déclare `.dependency-cruiser.cjs` — qui est la matrice du
document 01, pas un schéma décoratif. Pour parler à un module non déclaré, on
publie un événement de domaine.

`gamification` et `assistance-ia` doivent rester supprimables : c'est le test de
découplage.

## Base de données

Rien dans `public`. Trois schémas : `raai_apprendre` (applicatif, cloisonné),
`raai_apprendre_ref` (national, lecture quasi seule), `raai_apprendre_audit`
(append-only, **jamais** exposé à PostgREST).

Prisma porte le schéma ; les politiques RLS, fonctions et déclencheurs vivent
dans des migrations SQL versionnées à côté, numérotées avec elles.

Sur Supabase, après migration : Project Settings › API › Exposed schemas →
ajouter `raai_apprendre` et `raai_apprendre_ref`. Jamais l'audit.

## Vérifier

```bash
npm run verifier      # types + lint + architecture + tests — doit rester vert
npm test              # 31 tests, dont 25 de permissions (bloquants)
npm run architecture  # matrice de dépendances
```

Les tests de permissions tournent sur **PGlite** (PostgreSQL en WASM), sans
Docker : un test bloquant qui exige une infrastructure finit désactivé « en
attendant », et ce qui protège le cloisonnement ne peut pas être désactivé.

Quand tu touches à la RLS, vérifie que le harnais sait encore échouer : ouvre
volontairement une politique, lance les tests, confirme le rouge, restaure.

## Import des référentiels

```bash
npm run referentiel:importer -- <url-chlorofil|chemin.pdf> [--json sortie.json]
```

N'écrit rien en base — la validation humaine est obligatoire. **Le nom du
fichier ne fait pas foi** : sur ChloroFil, `bac-pro-ae-ref-en-vigueur.pdf`
contient l'arrêté de 2010 alors que celui de 2023 s'applique. La référence
d'arrêté se lit dans le contenu, et son absence est signalée.

## Conventions

Commentaires : expliquent *pourquoi*, pas *quoi*. Un commentaire qui paraphrase
la ligne suivante est du bruit.

Cas d'usage : renvoient `Resultat<T, ErreurMetier>`, jamais d'exception métier.
Une exception non rattrapée est un bug.

Server Actions : six étapes dans cet ordre — authentifier, valider, autoriser,
exécuter, invalider, auditer (doc 06 §2).

Identifiants : objets-valeurs typés, pas des `string` nus.

## Base de développement locale

```bash
npm run bd:locale   # PGlite + migrations + jeu de démonstration, port 5433
npm run dev
```

Aucune installation, ni Docker ni PostgreSQL : un environnement qui demande une
mise en place préalable est un environnement où l'on ne lance pas l'application
« juste pour vérifier ».

Deux limites, propres à PGlite et absentes en production :

- **Une seule connexion à la fois.** Arrêter `npm run dev` avant de lancer les
  tests d'intégration, sinon ils échouent sur « Can't reach database server ».
- **Requêtes préparées non conservées.** D'où `pgbouncer=true` dans
  `DATABASE_URL` — réglage que Supabase impose de toute façon derrière son pooler.

Comptes de démonstration : `lea.escatalens` / `4271`, `thomas.escatalens` /
`8305`, `ines.escatalens` / `6194`. Trois états de progression différents, pour
que la démonstration ne montre pas qu'un seul cas.
