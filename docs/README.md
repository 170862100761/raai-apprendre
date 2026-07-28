# raai-apprendre — dossier de conception

Plateforme pédagogique nationale pour l'enseignement agricole et technique.
`raai-apprendre.vercel.app`

> **Aucun code applicatif n'est écrit tant que ce dossier n'est pas validé.**
> Les extraits SQL et TypeScript qu'il contient sont des spécifications, pas des
> livrables : ils fixent des formes, pas des fichiers.

## Décisions structurantes déjà arrêtées

| Sujet | Décision | Conséquence |
|---|---|---|
| Point de départ | Nouveau dépôt, reprise des acquis de `RAAI-Formation` | Le contenu des 51 cours, les jetons de design et les patterns RLS sont migrés ; l'ancienne app reste en ligne jusqu'à la bascule |
| Identité élève | **Hybride, choisi par établissement** | Deux chemins d'authentification à concevoir et tester de bout en bout ([07](07-permissions.md)) |
| Périmètre MVP | Socle multi-établissements + cours + suivi de compétences | IA et gamification en V1 ([11](11-roadmap.md)) |
| Langue | Français partout, **y compris le code** | Tables, colonnes, variables, composants, messages. Hérité de RAAI-Formation, non négociable |

## Plan du dossier

| # | Document | Répond à |
|---|---|---|
| 00 | [Cahier des charges](00-cahier-des-charges.md) | Quoi, pour qui, avec quelles contraintes |
| 01 | [Architecture logicielle](01-architecture-logicielle.md) | Découpage en modules, Clean Architecture, DDD |
| 02 | [Architecture technique](02-architecture-technique.md) | Next.js, Supabase, Redis, Vercel, 3D |
| 03 | [Modèle de données](03-modele-de-donnees.md) | ERD, tables, index, stratégie de cloisonnement |
| 04 | [Diagrammes UML](04-diagrammes-uml.md) | Classes du domaine, séquences, états |
| 05 | [Parcours utilisateurs](05-parcours-utilisateurs.md) | Inscription, cours, évaluation, pilotage |
| 06 | [API & Server Actions](06-api-server-actions.md) | Contrats, conventions, versionnement |
| 07 | [Permissions](07-permissions.md) | Rôles, portées, RLS, double chemin d'auth |
| 08 | [Architecture IA](08-architecture-ia.md) | Couche d'abstraction multi-fournisseurs, tuteur |
| 09 | [Sécurité & RGPD](09-securite-rgpd.md) | Mineurs, audit, anti-triche, menaces |
| 10 | [Déploiement](10-deploiement.md) | Environnements, CI/CD, migrations, observabilité |
| 11 | [Roadmap](11-roadmap.md) | MVP → V1 → V2 → V3, jalons, critères de sortie |
| 12 | [Import des référentiels](12-import-referentiels.md) | Source ChloroFil, faisabilité mesurée, chiffrage |
| 13 | [Bascule vers Supabase](13-bascule-supabase.md) | Clés à renseigner, migration des comptes, retrait du transitoire |

## Ordre de lecture conseillé

Pour valider : 00 → 11 → 03 → 07. Ces quatre documents portent les décisions
coûteuses à défaire. Le reste en découle.
