# 00 — Cahier des charges

## 1. Objectif

Une plateforme pédagogique nationale pour l'enseignement agricole français
(MFR, CFA, lycées agricoles, CFPPA, BTSA, licences pro, écoles d'ingénieurs),
conçue dès le départ pour s'ouvrir aux autres filières techniques.

Le critère de réussite n'est pas la richesse fonctionnelle : c'est qu'un
enseignant de MFR qui n'a jamais ouvert Moodle publie un cours relié au
référentiel en moins de dix minutes, et qu'un élève de terminale y revienne
sans qu'on le lui demande.

## 2. Contraintes de charge (dimensionnement cible V2)

| Dimension | Cible | Implication de conception |
|---|---|---|
| Établissements | ~500 | Cloisonnement par ligne (RLS), pas par base |
| Formations | ~500 | Référentiels partagés nationalement, jamais dupliqués |
| Classes | ~5 000 | Clé de partitionnement naturelle pour les requêtes de suivi |
| Utilisateurs | > 100 000 | ~10 000 simultanés en pic (9h et 14h, jours scolaires) |
| Ressources | plusieurs millions | Stockage objet + CDN ; la base ne stocke que les métadonnées |

Le pic est extrêmement concentré : lundi 8h55, plusieurs milliers de classes
ouvrent la même page. Le dimensionnement se fait sur ce pic, pas sur la moyenne.
Conséquence directe : tout ce qui est identique pour tous les élèves d'une classe
est mis en cache et servi depuis le CDN ([02](02-architecture-technique.md#cache)).

## 3. Hiérarchie du domaine

```
Pays → Académie → Établissement → Formation → Niveau → Classe → Élève
                                      ↓
                              Référentiel officiel
                                      ↓
                    Compétences → Capacités → Objectifs → Savoirs
                                      ↓
                    Cours → Chapitres → Leçons → Exercices → Évaluations
```

Deux arbres distincts qui se rejoignent sur la compétence :

- l'**arbre organisationnel** (qui apprend, où, avec qui) est propre à chaque établissement ;
- l'**arbre référentiel** (quoi apprendre, dans quel ordre) est national et partagé.

Cette séparation est la décision d'architecture la plus structurante du projet.
Elle interdit de rattacher une compétence à un établissement, et impose que
toute ressource pédagogique porte des liens vers des compétences nationales.

## 4. Acteurs et besoins

| Acteur | Besoin principal | Ce qu'il ne doit jamais pouvoir faire |
|---|---|---|
| Administrateur national | Gérer référentiels, établissements, bibliothèque nationale | Lire les notes ou productions d'un élève nommément |
| Administrateur établissement | Gérer classes, comptes, abonnement, imports | Sortir du périmètre de son établissement |
| Responsable pédagogique | Piloter réussite, assiduité, couverture du référentiel | Modifier une note à la place d'un enseignant |
| Enseignant | Créer et suivre ; le moins de clics possible | Voir les élèves des classes qui ne sont pas les siennes |
| Élève | Savoir quoi faire maintenant, et où il en est | Voir les résultats nominatifs d'un autre élève |
| Parent (option) | Suivre son enfant | Accéder aux productions détaillées sans accord de l'établissement |
| Visiteur | Découvrir l'offre | Accéder à quoi que ce soit de pédagogique |

## 5. Périmètre fonctionnel

### 5.1 MVP — le socle (décision validée)

1. **Multi-établissements** : académies, établissements, formations, niveaux, classes, années scolaires.
2. **Comptes et rôles** hybrides ([07](07-permissions.md)).
3. **Inscription guidée** : pays → établissement → formation → diplôme → niveau → classe → année.
4. **Référentiels officiels** : import, versionnement, arbre compétences/capacités/objectifs/savoirs.
5. **Structure de cours** : formation → matière → module → chapitre → leçon.
6. **Leçon riche** : texte, images, schémas, vidéo, PDF, liens, bibliographie, fichiers.
7. **Visionneuse 3D** : STEP, STL, GLB.
8. **Liaison ressource ↔ compétence**, et vue élève des compétences validées / en cours / restantes.
9. **Exercices et quiz** avec correction automatique ; devoirs rendus.
10. **Tableau de bord élève** et **tableau de bord enseignant**.
11. **Exports** PDF / Excel / CSV.
12. **Recherche** plein texte sur cours, ressources, compétences.
13. **Accessibilité** : responsive, clair/sombre, clavier, contrastes.
14. **RGPD** : registre, minimisation, export et suppression.

### 5.2 Hors MVP (V1 et au-delà)

Tuteur IA, génération de contenu, détection de décrochage, gamification complète,
bibliothèque nationale contributive, jeux sérieux, parents, messagerie, calendrier
partagé, CCF et examens blancs, anti-triche, traduction, formats CAO propriétaires.
Détail et ordre dans [11](11-roadmap.md).

### 5.3 Explicitement hors périmètre, durablement

- Ce n'est **pas un logiciel de vie scolaire** : ni appel officiel, ni bulletins
  réglementaires, ni emploi du temps généré. Ces sujets appartiennent à Pronote /
  EDT et impliquent une conformité qui n'est pas la nôtre. On s'y *interface*.
- Ce n'est **pas une visioconférence**. On intègre les liens, on ne réimplémente rien.
- Aucune **décision automatisée** produisant un effet juridique sur un élève
  (orientation, validation de diplôme). L'IA propose, un humain décide — toujours.

## 6. Exigences non fonctionnelles

| Exigence | Cible | Mesure |
|---|---|---|
| Performance | LCP < 2,0 s sur 4G, TTFB < 400 ms | Vercel Speed Insights, budget en CI |
| Disponibilité | 99,5 % en heures scolaires | Sonde externe |
| Accessibilité | RGAA AA sur les parcours élève et enseignant | Audit axe-core en CI + audit manuel avant V1 |
| Sécurité | Aucune donnée accessible sans RLS | Test automatisé par rôle sur chaque table |
| RGPD | Export et suppression sous 30 jours | Procédure outillée, pas manuelle |
| Compatibilité | 2 dernières versions navigateurs, tablettes, Chromebooks | Le parc réel des établissements est modeste : pas de dépendance à une carte graphique pour autre chose que la 3D |
| Réversibilité | Export complet des données d'un établissement | Format documenté et ouvert |

Sur le réseau : beaucoup de MFR et lycées agricoles sont en zone rurale, avec un
débit médiocre et un Wi-Fi saturé à 30 élèves par salle. Le budget de poids par
page et le fonctionnement dégradé hors ligne ne sont pas du confort, ce sont des
conditions d'usage.

## 7. Contraintes réglementaires

- **RGPD** et doctrine CNIL sur les traitements scolaires ; la majorité des
  élèves visés sont **mineurs**.
- Cadre du **Ministère de l'Agriculture** (DGER) pour les référentiels et les CCF.
- **RGAA 4** (accessibilité des services publics et parapublics).
- Hébergement des données **dans l'Union européenne** — contrainte à vérifier
  région par région chez chaque fournisseur ([10](10-deploiement.md)).

## 8. Critères d'acceptation du MVP

Le MVP est livrable quand, sur un établissement pilote réel :

1. Un administrateur crée l'établissement, importe une formation depuis son
   référentiel officiel, et crée trois classes en moins de 30 minutes.
2. Un enseignant publie un chapitre complet avec un modèle 3D et un quiz, relié à
   au moins trois compétences du référentiel, sans assistance.
3. Trente élèves d'une même classe se connectent simultanément et ouvrent la
   leçon sans dégradation perceptible.
4. Un responsable pédagogique sort un export de couverture du référentiel.
5. Les tests de permissions passent au vert pour les sept rôles.
6. Un élève accède à son parcours complet sans qu'aucune donnée personnelle
   au-delà du prénom n'ait été saisie (mode minimal).

## 9. Risques identifiés

| Risque | Gravité | Traitement |
|---|---|---|
| Référentiels DGER hétérogènes, non structurés (PDF) | Élevée | Import semi-automatique + validation humaine ; prévoir une saisie assistée dès le MVP |
| Adoption enseignants (« encore un outil ») | Élevée | Import depuis l'existant, valeur perçue au premier écran, aucun paramétrage obligatoire |
| Double chemin d'authentification | Moyenne | Une seule abstraction de session côté serveur, jamais deux branches dans l'UI ([07](07-permissions.md)) |
| Coût IA non maîtrisé à 100 000 utilisateurs | Moyenne | Quotas par établissement, cache sémantique, choix du modèle par tâche ([08](08-architecture-ia.md)) |
| Formats CAO propriétaires (SolidWorks, CATIA) | Moyenne | Conversion hors ligne vers STEP/GLB ; jamais de parsing propriétaire dans le navigateur |
| Pic de charge 9h00 | Moyenne | Cache CDN agressif sur le contenu pédagogique, qui est identique pour tous |
