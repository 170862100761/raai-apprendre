# raai-apprendre

Plateforme pédagogique nationale pour les établissements agricoles français —
MFR, CFA, lycées agricoles, CFPPA, BTSA, licences professionnelles — conçue pour
s'ouvrir aux autres filières techniques.

> **État : socle posé, quinze écrans, rien de déployé.** Le dossier de conception
> est validé ([`docs/`](docs/README.md)). Le schéma, le cloisonnement et l'import
> des référentiels sont testés ; les écrans fonctionnent contre une vraie base,
> pas une maquette. Aucun établissement ne l'a encore ouvert.

## Démarrer

```bash
npm install
cp .env.example .env.local     # puis remplir
npm run verifier               # types + lint + architecture + tests
npm run bd:locale              # PGlite + migrations + jeu de démonstration
npm run dev
```

Ni Docker ni PostgreSQL à installer : PGlite embarque PostgreSQL. Un
environnement qui demande une mise en place préalable est un environnement où
l'on ne lance pas l'application « juste pour vérifier ».

PGlite ne sert **qu'une connexion à la fois** : arrêter `npm run dev` avant de
lancer les tests d'intégration.

## Ce qui existe

| Élément | État |
|---|---|
| Dossier de conception, 15 documents | Validé |
| Schéma Prisma (39 tables, 3 schémas) | Écrit, validé |
| Migrations SQL : RLS, fonctions, déclencheurs | Écrites, appliquées en test |
| Tests de permissions (3 familles, 35 tests) | Verts, falsification vérifiée |
| Outil d'import des référentiels DGER | Fonctionnel sur PDF réel, 6 tests |
| Écrans élève, enseignant, administration (15) | Fonctionnels sur base réelle |
| Facturation, migration depuis RAAI-Formation | À faire |
| Relecture du référentiel par un enseignant | À faire — et rien ne la remplace |

## Structure

```
docs/                     dossier de conception — fait autorité
prisma/
  schema.prisma           schéma du socle
  migrations/             SQL versionné : tables, puis RLS
src/
  domaines/<module>/      domaine · application · ports · infrastructure
  app/                    App Router — présentation uniquement
  noyau/                  bus d'événements, résultat, erreurs
  test/permissions/       les 3 familles bloquantes
outils/import-referentiel/ extraction des référentiels ChloroFil
```

## Décisions structurantes

- **Deux arbres, un point de rencontre.** L'organisationnel appartient aux
  établissements, le référentiel est national ; ils ne se touchent que sur
  `acquis_competence`.
- **Identité hybride.** Élèves mineurs sans compte Auth (identifiant + code),
  adultes sur Supabase Auth, choix par établissement.
- **Le cloisonnement vit en base.** RLS forcée partout, testée à chaque commit.
- **L'IA propose, un humain décide.** Aucune décision automatisée à effet
  juridique sur un élève.

Détail et justifications dans [`docs/`](docs/README.md).

## Licence

Propriétaire — RAAI.
