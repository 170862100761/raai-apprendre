# 04 — Diagrammes UML

## 1. Classes du domaine — module `progression`

Le module le plus riche en règles métier, donc le plus utile à modéliser.

```mermaid
classDiagram
    class Apprenant {
        +IdentifiantApprenant id
        +Prenom prenom
        +ModeIdentite mode
        +estMajeur() bool
    }

    class Progression {
        -IdentifiantApprenant apprenant
        -Map~CodeCompetence, AcquisCompetence~ acquis
        +enregistrerTentative(Tentative) EvenementDomaine[]
        +declarerParEnseignant(CodeCompetence, Niveau, IdentifiantMembre) Resultat
        +tauxCouverture(Referentiel) Pourcentage
        +competencesRestantes(Referentiel) CodeCompetence[]
    }

    class AcquisCompetence {
        +CodeCompetence competence
        +NiveauAcquisition niveau
        +Score score
        +OrigineAcquis origine
        +Date constateLe
        +peutEtreDegrade() bool
    }

    class NiveauAcquisition {
        <<enumeration>>
        NON_ABORDEE
        EN_COURS
        ACQUISE
        MAITRISEE
    }

    class OrigineAcquis {
        <<enumeration>>
        EVALUATION
        DECLARATION_ENSEIGNANT
        CCF
        IMPORT
    }

    class Tentative {
        +IdentifiantEvaluation evaluation
        +Reponse[] reponses
        +Score score
        +Duree duree
        +estAchevee() bool
    }

    Apprenant "1" --> "1" Progression
    Progression "1" *-- "0..*" AcquisCompetence
    AcquisCompetence --> NiveauAcquisition
    AcquisCompetence --> OrigineAcquis
    Progression ..> Tentative : consomme
```

**Invariants portés par l'agrégat `Progression`** — ce sont eux qui justifient
que ce ne soit pas un simple CRUD :

1. Un acquis ne se dégrade jamais du fait d'une évaluation ratée. Un élève qui a
   validé une compétence puis rate un quiz reste validé ; seul un enseignant peut
   dégrader explicitement (`peutEtreDegrade()` renvoie `false` pour l'origine
   `EVALUATION`). Sans cette règle, la validation de compétences devient
   anxiogène et les élèves cessent de tenter.
2. `MAITRISEE` n'est atteignable que par deux constats distincts espacés d'au
   moins sept jours. Une réussite unique ne prouve pas la maîtrise.
3. Une déclaration d'enseignant l'emporte toujours sur un calcul automatique.
4. Tout changement de niveau publie un événement de domaine — c'est la seule
   voie par laquelle gamification et IA sont informées.

## 2. Séquence — inscription d'un élève (mode minimal)

```mermaid
sequenceDiagram
    autonumber
    actor E as Enseignant
    actor A as Élève
    participant UI as Interface
    participant SA as Server Action
    participant ORG as organisation
    participant IDEN as identite
    participant PG as PostgreSQL

    E->>UI: Crée la classe TAE 2026
    UI->>SA: creerClasse(offre, niveau, annee)
    SA->>ORG: CréerClasse
    ORG->>PG: insert classe
    ORG-->>SA: code de classe « TAE-2026-4K7P »
    SA-->>E: Affiche le code à distribuer

    E->>UI: Ajoute 24 élèves (prénom + initiale)
    UI->>SA: creerApprenants(classeId, liste)
    SA->>IDEN: GénérerIdentifiants
    Note over IDEN: identifiant + code à 4 chiffres<br/>bcrypt, aucun email
    IDEN->>PG: insert apprenant, insert inscription
    SA-->>E: PDF des identifiants à distribuer

    A->>UI: Saisit identifiant + code
    UI->>SA: ouvrirSessionApprenant(identifiant, code)
    SA->>IDEN: VérifierCode
    IDEN->>PG: select apprenant (fonction SECURITY DEFINER)
    IDEN-->>SA: jeton de session (30 j)
    SA-->>A: Cookie httpOnly + redirection tableau de bord
```

Rien d'analogue à une inscription publique : **c'est l'établissement qui inscrit**.
Le parcours « pays → établissement → formation → niveau → classe » décrit dans le
cahier des charges est le parcours de l'**adulte** (BTS, licence pro, CFPPA) en
mode complet, et le parcours de **rattachement** en mode minimal, où l'élève ne
saisit qu'un code de classe.

## 3. Séquence — consultation d'une leçon (chemin chaud, 9h00)

```mermaid
sequenceDiagram
    autonumber
    actor A as Élève
    participant CDN as CDN Vercel
    participant RSC as Server Component
    participant R as Redis
    participant PG as PostgreSQL

    A->>CDN: GET /lecon/hydraulique-1
    alt Page en cache
        CDN-->>A: HTML statique (contenu pédagogique)
        Note over A,CDN: TTFB < 100 ms — Postgres n'est pas touché
    else Cache froid
        CDN->>RSC: Rendu
        RSC->>PG: select lecon + blocs
        RSC-->>CDN: HTML + tag « lecon:hydraulique-1 »
        CDN-->>A: HTML
    end

    A->>RSC: Îlot de progression (Suspense)
    RSC->>R: progression:apprenant:<id>
    alt Présent
        R-->>RSC: acquis
    else Absent
        RSC->>PG: select acquis_competence
        RSC->>R: met en cache, TTL 60 s
    end
    RSC-->>A: Barre de progression, compétences visées
```

La séparation du contenu (partagé, mis en cache) et de la progression
(personnelle, dynamique) est ce qui rend tenable le pic de rentrée en classe.

## 4. Séquence — tuteur IA (V1)

```mermaid
sequenceDiagram
    autonumber
    actor A as Élève
    participant UI as Tuteur
    participant SA as Server Action
    participant Q as Quotas
    participant AB as Abstraction IA
    participant F as Fournisseur
    participant AU as Audit

    A->>UI: « Je ne comprends pas le débit hydraulique »
    UI->>SA: poserQuestion(leconId, message)
    SA->>Q: consommer(etablissement, 'tuteur')
    alt Quota dépassé
        Q-->>SA: refus
        SA-->>A: « Ton établissement a atteint sa limite du mois »
    else
        SA->>SA: Construit le contexte (leçon, compétences, historique)
        SA->>AB: completer(tacheTuteur)
        AB->>F: Appel du fournisseur configuré
        F-->>AB: Réponse en flux
        AB-->>SA: Flux
        SA-->>A: Réponse socratique, en flux
        SA->>AU: journalise (tâche, jetons, coût — jamais le contenu en clair)
    end
```

**La clé API ne quitte jamais le serveur.** Aucun appel IA depuis le navigateur,
jamais de variable `NEXT_PUBLIC_` contenant un secret de fournisseur. Règle
héritée de RAAI-Formation, reconduite sans exception.

## 5. États — leçon

```mermaid
stateDiagram-v2
    [*] --> Brouillon : création
    Brouillon --> EnRelecture : soumettre
    EnRelecture --> Brouillon : demander des corrections
    EnRelecture --> Publiee : valider
    Brouillon --> Publiee : publier (auteur = responsable)
    Publiee --> Brouillon : dépublier (nouvelle version)
    Publiee --> Archivee : archiver
    Archivee --> [*]

    note right of Publiee
        Visible des élèves.
        Mise en cache CDN.
        La modification crée une version n+1 :
        une leçon publiée n'est pas éditée en place.
    end note
```

La relecture n'est obligatoire que pour la **bibliothèque nationale** (V2). Dans
un établissement, un enseignant publie directement pour ses classes : imposer une
validation ferait fuir les utilisateurs dès la première semaine.

## 6. États — tentative d'évaluation

```mermaid
stateDiagram-v2
    [*] --> EnCours : démarrer
    EnCours --> EnCours : répondre
    EnCours --> Soumise : soumettre
    EnCours --> Abandonnee : expiration du temps imparti
    Soumise --> CorrigeeAuto : questions fermées
    Soumise --> AttenteCorrection : questions ouvertes
    AttenteCorrection --> Corrigee : correction enseignant
    CorrigeeAuto --> Corrigee : agrégation
    Corrigee --> [*]

    note right of Corrigee
        Immuable. Une révision de note
        crée une nouvelle tentative
        liée à la précédente.
    end note
```

## 7. Cas d'usage — vue d'ensemble

```mermaid
flowchart LR
    subgraph Acteurs
        EL((Élève))
        EN((Enseignant))
        RP((Resp. pédago))
        AE((Admin étab.))
        AN((Admin national))
    end

    EL --> U1[Suivre son parcours]
    EL --> U2[Consulter une leçon]
    EL --> U3[Passer une évaluation]
    EL --> U4[Demander de l'aide au tuteur]

    EN --> U5[Créer du contenu]
    EN --> U6[Rattacher aux compétences]
    EN --> U7[Suivre une classe]
    EN --> U8[Corriger et évaluer]

    RP --> U9[Piloter l'établissement]
    RP --> U10[Vérifier la couverture du référentiel]

    AE --> U11[Gérer comptes et classes]
    AE --> U12[Gérer l'abonnement]

    AN --> U13[Publier un référentiel]
    AN --> U14[Modérer la bibliothèque nationale]

    U3 -.->|inclut| U15[Enregistrer la progression]
    U8 -.->|inclut| U15
    U15 -.->|étend| U16[Attribuer XP et badges]
```
