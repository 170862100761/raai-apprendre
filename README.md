# raai-apprendre

Plateforme pédagogique nationale pour les établissements agricoles français —
MFR, CFA, lycées agricoles, CFPPA, BTSA, licences professionnelles — conçue pour
s'ouvrir aux autres filières techniques.

> **État : socle en cours.** Le dossier de conception est validé
> ([`docs/`](docs/README.md)). Le schéma, le cloisonnement et l'import des
> référentiels sont posés et testés. Aucune interface n'est encore écrite.

## Démarrer

```bash
npm install
cp .env.example .env.local     # puis remplir
npm run verifier               # types + lint + architecture + tests
```

Les tests tournent sans base à installer : PGlite embarque PostgreSQL.

## Ce qui existe

| Élément | État |
|---|---|
| Dossier de conception, 13 documents | Validé |
| Schéma Prisma du socle (30 tables, 3 schémas) | Écrit, validé |
| Migrations SQL : RLS, fonctions, déclencheurs | Écrites, appliquées en test |
| Tests de permissions (3 familles, 25 tests) | Verts, falsification vérifiée |
| Outil d'import des référentiels DGER | Fonctionnel sur PDF réel, 6 tests |
| Interfaces | À faire |

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
