# 09 — Sécurité & RGPD

## 1. Le cadre qui prime sur tout

**La majorité des utilisateurs sont des mineurs.** Cela change la nature du
projet : la minimisation n'est pas une bonne pratique, c'est la ligne de défense
principale. La donnée qu'on ne collecte pas ne peut ni fuir, ni être réclamée,
ni être conservée trop longtemps.

D'où la reconduction de la règle de RAAI-Formation : en mode minimal, un élève
c'est un **prénom, une initiale, un identifiant et un code**. Pas d'email, pas de
nom complet, pas de date de naissance.

## 2. Modèle de menaces

| Menace | Vraisemblance | Impact | Traitement |
|---|---|---|---|
| Fuite inter-établissements | Moyenne | **Critique** | RLS `force` + tests bloquants ([07](07-permissions.md)) |
| Force brute sur code à 4 chiffres | **Élevée** | Élevé | 5 essais/heure, verrouillage, alerte enseignant |
| Élève accédant aux corrigés | **Élevée** | Moyen | Corrigés jamais envoyés au client avant soumission |
| Partage de compte entre élèves | Élevée | Faible | Détection d'usages concurrents, information de l'enseignant |
| XSS via contenu enseignant | Moyenne | Élevé | Blocs typés, aucun HTML libre, assainissement |
| Téléversement malveillant | Moyenne | Élevé | Liste blanche MIME + signature binaire + antivirus + servi depuis un domaine distinct |
| Fuite de clé IA | Faible | Élevé | Serveur uniquement, contrôle en CI, rotation |
| Compromission d'un compte enseignant | Moyenne | Élevé | MFA proposée, audit, alerte sur connexion inhabituelle |
| Ré-identification par agrégats | Moyenne | Élevé | Seuil k ≥ 10 sur toute statistique nationale |
| Exfiltration en masse par export | Faible | Élevé | Débit limité, audité, alerte au-delà d'un volume |

## 3. Protections applicatives

| Vecteur | Mesure |
|---|---|
| Injection SQL | Prisma exclusivement ; `$queryRaw` interdit hors migrations relues |
| XSS | Blocs typés validés par Zod ; `dangerouslySetInnerHTML` interdit par ESLint ; CSP stricte sans `unsafe-inline` |
| CSRF | Server Actions protégées nativement ; API Routes : vérification d'origine + jeton |
| Clickjacking | `frame-ancestors 'none'` |
| Fixation de session | Rotation du jeton à chaque authentification |
| Énumération | Réponses et délais identiques pour identifiant inexistant et code faux |
| Déni de service | Limitation de débit Redis par IP, par compte et par établissement |
| Fuite par en-têtes | `Referrer-Policy: strict-origin-when-cross-origin`, HSTS, `X-Content-Type-Options` |

Médias servis depuis un **domaine distinct** de l'application : un fichier
téléversé par un utilisateur ne doit jamais s'exécuter dans l'origine qui porte
les cookies de session.

## 4. Journal d'audit

Schéma `raai_apprendre_audit`, non exposé à PostgREST, **append-only** :

```sql
revoke update, delete on raai_apprendre_audit.evenement from public, authenticated;
```

Événements journalisés : authentification (succès et échec), création et
suppression de compte, changement de permission, accès à des données
personnelles hors périmètre habituel, modification de note, publication et
dépublication, export, appel IA (métadonnées), impersonation de support,
opérations de facturation.

Chaque entrée porte : sujet, rôle et portée effectifs, action, ressource,
`idRequete`, horodatage, adresse IP tronquée. **Jamais le contenu en clair** —
un journal d'audit qui recopie les données devient lui-même une base de données
personnelles.

Rétention : 3 ans pour la sécurité, 1 an pour l'usage.

## 5. RGPD — mise en œuvre

| Obligation | Mise en œuvre |
|---|---|
| Base légale | Mission d'intérêt public (établissement responsable de traitement) ; RAAI est **sous-traitant** |
| Registre | Tenu, versionné dans le dépôt |
| Contrat de sous-traitance | Modèle art. 28 signé par chaque établissement à l'inscription |
| Minimisation | Toute colonne personnelle justifiée par un écran existant ; revue à chaque migration |
| Information | Notice adaptée aux mineurs, en langage clair, à la première connexion |
| Consentement | Requis uniquement pour ce qui n'est pas nécessaire à la mission (IA facultative, classements nominatifs) |
| Accès et portabilité | Export JSON + PDF, déclenchable par l'administrateur d'établissement |
| Effacement | Suppression outillée sous 30 jours, y compris sauvegardes (procédure documentée) |
| Rectification | Par l'établissement, tracée |
| Conservation | Données actives : durée de la formation + 1 an. Puis anonymisation, pas suppression : les statistiques agrégées survivent |
| Décision automatisée | Aucune. L'IA propose, un humain décide ([08](08-architecture-ia.md#7-détection-de-décrochage-v1)) |
| Violation de données | Procédure de notification sous 72 h, testée une fois par an |
| Hébergement | UE uniquement, région par région, fournisseur par fournisseur |
| Transferts hors UE | Uniquement fournisseurs IA non européens, avec choix d'alternative européenne toujours disponible |

### Le classement nominatif

Un classement public par nom est une donnée personnelle diffusée, et un facteur
de mal-être scolaire documenté. Choix retenu :

- Classement **par défaut anonyme** (« tu es 7e sur 24 »).
- Nominatif possible uniquement si l'enseignant l'active **et** que les élèves
  concernés y consentent.
- Jamais de classement inter-établissements nominatif.

## 6. Anti-triche (V2)

Positionnement clair : **on décourage et on informe, on n'accuse pas.**

| Signal | Usage |
|---|---|
| Changement d'onglet pendant une évaluation chronométrée | Compté, affiché à l'enseignant |
| Vitesse de réponse anormale | Signal faible |
| Similarité entre copies d'une même classe | Signalé à l'enseignant, jamais à l'élève |
| Détection de texte généré par IA | **Indicatif uniquement, jamais probant** |

La détection de texte généré par IA a un taux de faux positifs qui la rend
inutilisable comme preuve — elle pénalise notamment les élèves qui écrivent de
façon scolaire et appliquée. Elle est présentée comme une invitation à
l'enseignant à engager une conversation, avec cet avertissement affiché dans
l'interface. Aucune sanction automatique n'est possible depuis la plateforme.

Pas de surveillance par webcam, pas de capture d'écran, pas de verrouillage du
poste. Ces dispositifs sont disproportionnés pour des mineurs et juridiquement
fragiles.

## 7. Sauvegardes et continuité

| Élément | Dispositif |
|---|---|
| PostgreSQL | PITR Supabase, 7 jours ; export quotidien chiffré, conservé 30 jours |
| Storage | Réplication + versionnement des objets |
| Restauration | Testée **trimestriellement** — une sauvegarde jamais restaurée n'est pas une sauvegarde |
| RPO / RTO | 1 h / 4 h en période scolaire |
| Réversibilité | Export complet d'un établissement, format ouvert documenté |

## 8. Dans le cycle de développement

- Dépendances : Dependabot + `npm audit` bloquant sur les vulnérabilités hautes.
- Secrets : jamais dans le dépôt, détection en pré-commit ; rotation semestrielle.
- Revue de sécurité obligatoire sur tout changement touchant auth, RLS, permissions
  ou téléversement.
- Test d'intrusion externe avant l'ouverture nationale (V2).
- Chaque nouvelle table passe les trois familles de tests de permissions
  ([07 §6](07-permissions.md#6-tests-de-permissions--bloquants)) avant fusion.
