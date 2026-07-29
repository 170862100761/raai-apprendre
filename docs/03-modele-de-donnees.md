# 03 — Modèle de données

## 1. Principes

1. **Deux arbres, un point de rencontre.** L'arbre organisationnel appartient aux
   établissements ; l'arbre référentiel est national. Ils se rejoignent
   exclusivement sur `acquis_competence`. Aucune table de référentiel ne porte
   d'`etablissement_id` — jamais.
2. **Cloisonnement par ligne.** Une seule base, RLS partout. `etablissement_id`
   est présent sur toute table portant une donnée d'établissement, y compris
   quand il serait déductible par jointure : la RLS doit rester peu coûteuse.
3. **Minimisation.** Une colonne de donnée personnelle doit être justifiée par un
   écran existant. En mode minimal, un élève c'est un prénom et une initiale.
4. **Immuabilité de l'évaluation.** Une tentative n'est jamais modifiée. Une
   correction crée une nouvelle ligne.
5. **Versionnement des référentiels.** Un référentiel change (arrêté modifié) ;
   les acquis passés doivent rester lisibles dans leur version d'origine.

## 2. ERD — socle organisationnel

```mermaid
erDiagram
    PAYS ||--o{ ACADEMIE : contient
    ACADEMIE ||--o{ ETABLISSEMENT : regroupe
    ETABLISSEMENT ||--o{ ANNEE_SCOLAIRE : ouvre
    ETABLISSEMENT ||--o{ OFFRE_FORMATION : propose
    ETABLISSEMENT ||--o{ MEMBRE : emploie
    DIPLOME ||--o{ OFFRE_FORMATION : "est instancié par"
    OFFRE_FORMATION ||--o{ CLASSE : "se décline en"
    NIVEAU ||--o{ CLASSE : situe
    ANNEE_SCOLAIRE ||--o{ CLASSE : date
    CLASSE ||--o{ INSCRIPTION : accueille
    APPRENANT ||--o{ INSCRIPTION : "est inscrit via"
    COMPTE ||--o| APPRENANT : "peut identifier"
    COMPTE ||--o{ MEMBRE : identifie
    MEMBRE ||--o{ AFFECTATION : enseigne
    CLASSE ||--o{ AFFECTATION : "est prise en charge par"

    ETABLISSEMENT {
        uuid id PK
        uuid academie_id FK
        text uai UK "code UAI officiel"
        text nom
        text type "MFR|CFA|LPA|CFPPA|SUP"
        text mode_identite "minimal|complet|mixte"
        text fuseau
        boolean actif
    }
    APPRENANT {
        uuid id PK
        uuid etablissement_id FK
        text prenom
        text initiale_nom
        uuid compte_id FK "NULL en mode minimal"
        text identifiant UK "mode minimal"
        text code_hash "bcrypt, mode minimal"
        boolean majeur_a_l_inscription
    }
    INSCRIPTION {
        uuid id PK
        uuid apprenant_id FK
        uuid classe_id FK
        date debut
        date fin
        text statut "active|terminee|abandonnee"
    }
```

Points d'attention :

- `APPRENANT.compte_id` est **nullable**. C'est la traduction en base de la
  décision « hybride » : un même établissement peut avoir des mineurs sans compte
  et des majeurs avec compte Supabase Auth. Aucune requête ne doit supposer
  l'existence d'un compte.
- `ETABLISSEMENT.uai` : le code UAI officiel sert de clé de rapprochement avec
  les annuaires ministériels. Unique, contrôlé au format.
- `INSCRIPTION` est historisée : un élève redoublant, ou changeant de classe en
  cours d'année, produit deux lignes. La progression suit l'apprenant, pas
  l'inscription.

## 3. ERD — référentiel national

```mermaid
erDiagram
    DIPLOME ||--o{ VERSION_REFERENTIEL : "est décrit par"
    VERSION_REFERENTIEL ||--o{ COMPETENCE : structure
    COMPETENCE ||--o{ COMPETENCE : "se décompose en (rang 1 → rang 2)"
    COMPETENCE ||--o{ SAVOIR : mobilise
    COMPETENCE ||--o{ ADAPTATION_LOCALE : "peut être adaptée"
    COMPETENCE ||--o{ COMPETENCE_EQUIVALENCE : "se reporte d'une version à l'autre"
    VERSION_REFERENTIEL ||--o{ MODALITE_EVALUATION : "définit (CCF, ponctuel)"

    DIPLOME {
        uuid id PK
        text code UK "BACPRO-AGROEQ"
        text intitule
        text ministere "MASA|MENJ"
        text niveau_europeen "3|4|5|6|7"
        text filiere
    }
    VERSION_REFERENTIEL {
        uuid id PK
        uuid diplome_id FK
        text reference_arrete
        date entree_en_vigueur
        date fin_de_validite
        text statut "brouillon|publie|abroge"
    }
    COMPETENCE {
        uuid id PK
        uuid version_id FK
        text code "C5 au rang 1, C5.1 au rang 2"
        text code_bloc "B5 — NULL si pas de bloc numéroté"
        text intitule
        uuid parent_id FK "NULL au rang 1"
        int ordre
        boolean adaptable_localement
    }
```

Aucun `etablissement_id` dans ce sous-schéma, à l'exception documentée ci-dessous.
C'est vérifié par un test.

> **Corrigé au schéma, avant la première migration.** L'analyse d'un référentiel
> réel ([12](12-import-referentiels.md#3-structure-réelle-du-référentiel-rénové))
> avait montré deux écarts avec l'ERD ci-dessus, tous deux tranchés :
> 1. `BLOC_COMPETENCE` et `COMPETENCE` étaient donnés en relation 1–n. Ils sont en
>    relation **1–1** : le référentiel pose « chaque capacité globale correspond à
>    un bloc de compétences ». Le schéma retenu va plus loin que la simple fusion —
>    **une seule table `competence`, auto-référencée** par `parent_id`, porte les
>    deux rangs : `C5` au rang 1 (`parent_id` nul), `C5.1` au rang 2. Le bloc
>    devient une colonne, `code_bloc`, nulle pour une capacité sans bloc numéroté.
> 2. La dernière capacité (module d'adaptation professionnelle) est **définie
>    régionalement**. D'où le drapeau `adaptable_localement` sur la capacité, et la
>    table `adaptation_locale` qui porte, elle, un `etablissement_id` — **seule
>    exception admise** à la règle ci-dessus, et explicitement exclue du test qui
>    la vérifie.

Une `VERSION_REFERENTIEL` publiée est **immuable**. Corriger une coquille impose
une nouvelle version, et une table de correspondance `competence_equivalence`
permet de reporter les acquis d'une version à la suivante — sans quoi chaque
réforme d'arrêté effacerait la progression des élèves en cours de cycle.

## 4. ERD — contenu pédagogique et évaluation

```mermaid
erDiagram
    MATIERE ||--o{ MODULE : contient
    MODULE ||--o{ CHAPITRE : contient
    CHAPITRE ||--o{ LECON : contient
    LECON ||--o{ BLOC_CONTENU : compose
    BLOC_CONTENU }o--o| RESSOURCE : reference
    LECON ||--o{ LIEN_COMPETENCE : "couvre"
    COMPETENCE ||--o{ LIEN_COMPETENCE : "est couverte par"
    CHAPITRE ||--o{ EVALUATION : évalue
    EVALUATION ||--o{ QUESTION : contient
    EVALUATION ||--o{ TENTATIVE : "reçoit"
    APPRENANT ||--o{ TENTATIVE : produit
    TENTATIVE ||--o{ REPONSE : contient
    APPRENANT ||--o{ ACQUIS_COMPETENCE : accumule
    COMPETENCE ||--o{ ACQUIS_COMPETENCE : "est acquise via"

    LECON {
        uuid id PK
        uuid chapitre_id FK
        uuid etablissement_id FK "NULL = bibliothèque nationale"
        text titre
        text statut "brouillon|publiee|archivee"
        int duree_estimee_min
        int version
    }
    BLOC_CONTENU {
        uuid id PK
        uuid lecon_id FK
        text type "texte|image|schema|video|modele3d|pdf|lien|biblio|fichier"
        jsonb contenu
        int ordre
    }
    RESSOURCE {
        uuid id PK
        uuid etablissement_id FK "NULL = nationale"
        text type_mime
        text chemin_stockage
        text chemin_apercu "GLB allégé, vignette"
        bigint taille_octets
        text licence
        text statut_traitement
    }
    ACQUIS_COMPETENCE {
        uuid id PK
        uuid apprenant_id FK
        uuid competence_id FK
        uuid version_referentiel_id FK
        text niveau "non_abordee|en_cours|acquise|maitrisee"
        numeric score
        text origine "evaluation|declaration_enseignant|ccf"
        uuid source_id
        timestamptz constate_le
    }
```

### Le bloc de contenu, brique unique

Une leçon n'est pas du HTML : c'est une **liste ordonnée de blocs typés**, chacun
avec un `contenu` JSONB validé par un schéma Zod propre à son `type`. C'est ce
qui permet d'ajouter un type de bloc (simulation, carte interactive, quiz
intégré) sans migration de schéma, et de rendre la même leçon en HTML, en PDF
exportable et en lecture audio.

Le HTML libre est proscrit : il rendrait l'export, l'accessibilité et la sécurité
XSS impossibles à garantir.

### `ACQUIS_COMPETENCE`, le point de rencontre

C'est la seule table qui référence à la fois un apprenant (établissement) et une
compétence (national). Elle porte `version_referentiel_id` pour rester lisible
après une réforme, et `origine` + `source_id` pour la traçabilité : un acquis
doit toujours pouvoir répondre à « d'où vient cette validation ? ».

## 5. Tables transverses

| Table | Rôle | Particularité |
|---|---|---|
| `session_apprenant` | Jeton élève en mode minimal | Hérité de `jetons_eleve` ; expire à 30 j, révocable par l'enseignant |
| `evenement_domaine` | Journal des événements publiés | Alimente gamification, IA, recherche |
| `audit.evenement` | Actions sensibles | Schéma non exposé, append-only, `REVOKE UPDATE, DELETE` |
| `abonnement`, `siege` | Stripe | Compteur de sièges par établissement |
| `quota_ia` | Consommation IA | Par établissement × mois ; hérité de RAAI-Formation |
| `presence_jour` | Temps passé par jour | Une ligne par apprenant et par jour, pas d'événement fin |
| `consentement` | RGPD | Type, version du texte, date, auteur ; jamais supprimé |

## 6. Index et performance

Les requêtes chaudes, dans l'ordre de fréquence réelle :

| Requête | Index |
|---|---|
| Tableau de bord élève | `acquis_competence (apprenant_id, competence_id)` |
| Suivi d'une classe par l'enseignant | `inscription (classe_id, statut)` + `tentative (apprenant_id, evaluation_id, cree_le desc)` |
| Leçons d'un chapitre | `lecon (chapitre_id, statut, ordre)` |
| Couverture du référentiel | `lien_competence (competence_id, lecon_id)` |
| Recherche | GIN sur `to_tsvector('french', …)` |
| Classement de classe | Redis, **pas** Postgres |

Deux points structurants :

- **`etablissement_id` en tête de tout index composite** sur les tables
  cloisonnées. La RLS ajoute systématiquement ce prédicat ; un index qui ne le
  porte pas en premier ne sera pas utilisé.
- **Partitionnement de `tentative` et `presence_jour` par année scolaire** dès
  V1. Ce sont les deux tables qui grossissent linéairement avec les usages :
  à 100 000 élèves, `tentative` dépasse la centaine de millions de lignes en deux
  ans. Les partitions anciennes deviennent lecture seule.

## 7. Stratégie de migration depuis RAAI-Formation

| Source | Cible | Traitement |
|---|---|---|
| `raai_formation.filieres`, `filiere_matieres` | `diplome`, `matiere` | Reprise directe, enrichie du code officiel |
| Contenu des 51 cours (`src/content/*.json`) | `lecon`, `bloc_contenu` | Script de conversion vers les blocs typés — **le contenu ne se réécrit pas** |
| `eleves`, `jetons_eleve` | `apprenant`, `session_apprenant` | Reprise du modèle bcrypt ; les établissements existants démarrent en `mode_identite = 'minimal'` |
| `progression`, `scores_jeux` | `acquis_competence`, profil de jeu | Conversion avec `origine = 'import'` |
| `formateurs` | `compte`, `membre` | Un formateur devient membre d'un établissement créé pour lui |
| `quota_ia` | `quota_ia` | Reprise, clé passée de formateur à établissement |

La bascule se fait établissement par établissement, pas d'un bloc. L'ancienne
application reste en lecture seule pendant une année scolaire.

## 8. Ce qu'on ne stocke pas

- Nom de famille complet, date de naissance, adresse, téléphone d'un élève mineur.
- Adresse IP au-delà de 7 jours (journal technique uniquement).
- Contenu des conversations avec le tuteur IA au-delà de 12 mois.
- Aucune donnée de santé, d'origine, d'opinion — quel qu'en soit le prétexte
  pédagogique.
