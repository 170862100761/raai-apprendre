# 13 — Bascule vers Supabase

Procédure pour remplacer les deux objets transitoires — `compte.mot_de_passe_hash`
et la table `session_compte` — par Supabase Auth, et pour passer du disque
local à Supabase Storage.

> **Le code est déjà écrit.** La bascule est une affaire de configuration, pas
> de développement : dès que les trois variables Supabase sont renseignées,
> `sessionCourante()` authentifie les adultes par Supabase. Sans elles, le
> chemin transitoire reste actif. Aucun écran, aucune autorisation, aucune
> politique RLS ne change.

## 1. Les clés à renseigner — à faire vous-même

Dans le tableau de bord Supabase, **Project Settings › API**, puis coller dans
`.env.local` (développement) et dans les variables Vercel (production) :

```bash
NEXT_PUBLIC_SUPABASE_URL=""          # Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=""     # anon / public
SUPABASE_SERVICE_ROLE_KEY=""         # service_role — SECRÈTE
```

Puis, dans **Project Settings › Database › Connection string** :

```bash
DATABASE_URL=""    # pooler, port 6543, avec ?pgbouncer=true
DIRECT_URL=""      # connexion directe, port 5432 — pour les migrations
```

Trois pièges qui coûtent une demi-journée :

- **`service_role` n'est jamais préfixée `NEXT_PUBLIC_`.** Elle contourne la
  RLS ; exposée au navigateur, elle donne accès à toute la base. Le contrôle de
  `src/noyau/environnement.ts` fait échouer le démarrage si quelqu'un essaie.
- **`DATABASE_URL` doit porter `?pgbouncer=true`**, sinon Prisma tente des
  requêtes préparées que le pooler ne conserve pas.
- **Les trois variables Supabase vont ensemble.** Une configuration à moitié
  remplie fait échouer le démarrage, volontairement : l'application basculerait
  sinon sur le chemin Supabase sans pouvoir authentifier personne.

## 2. Appliquer le schéma

```bash
npm run bd:deployer     # prisma migrate deploy
```

Puis, **action manuelle indispensable** — Project Settings › API › **Exposed
schemas** : ajouter `raai_apprendre` et `raai_apprendre_ref`.

**Ne jamais y ajouter `raai_apprendre_audit`.** Ce schéma doit rester
inaccessible : c'est ce qui rend le journal opposable.

## 3. Vérifier le cloisonnement sur la vraie base

```bash
DATABASE_URL_TEST="<DIRECT_URL>" npm test
```

Les trois familles de tests de permissions doivent passer sur Supabase comme
elles passent sur PGlite. Si l'une échoue, **ne pas ouvrir aux établissements** :
c'est le cloisonnement entre MFR qui est en cause.

### L'écran de journal ne peut pas être vérifié avant cette étape

`/administration/journal` affiche « Aucune action enregistrée » en mode
transitoire, et c'est attendu : `lire_journal` filtre sur
`raai_apprendre.etablissement_courant()`, qui lit `auth.uid()`. Sans Supabase
Auth, `auth.uid()` est nul, la condition n'est jamais satisfaite, et la fonction
ne renvoie rien — quel que soit le contenu réel du journal.

L'écriture, elle, est vérifiée sur PGlite (`src/test/audit.test.ts`). C'est donc
**la lecture seule** qui reste à confirmer, et elle doit l'être ici :

1. se connecter avec un compte `admin_etablissement` réel ;
2. ouvrir `/administration/journal` et constater que des lignes s'affichent ;
3. se connecter avec un compte `enseignant` du même établissement et vérifier
   que la page renvoie vers `/formateur` ;
4. **le point qui compte** : vérifier qu'un `admin_etablissement` d'un AUTRE
   établissement ne voit aucune ligne de celui-ci.

Tant que le point 4 n'est pas constaté de visu, considérer que l'écran n'est pas
vérifié. Un journal qui fuiterait d'un établissement à l'autre serait pire que
pas de journal du tout.

## 4. Migrer les comptes adultes existants

Chaque compte de `raai_apprendre.compte` doit exister dans `auth.users` **avec
le même identifiant** — c'est ce que suppose `chargerProfilCompte`.

Pour chaque adulte :

1. Créer l'utilisateur via l'API d'administration Supabase, en imposant l'`id`
   existant.
2. Lui faire définir son mot de passe par le lien de réinitialisation. **Ne
   jamais transférer les condensats bcrypt** : ils sont hors de portée, et c'est
   très bien.
3. Une fois connecté, passer `mot_de_passe_hash` à `NULL`.

```sql
-- Comptes encore sur le chemin transitoire.
SELECT id, email FROM raai_apprendre.compte WHERE mot_de_passe_hash IS NOT NULL;
```

Tant que la colonne est renseignée, le compte peut encore passer par l'ancien
chemin — les deux cohabitent, ce qui permet de migrer établissement par
établissement plutôt que d'un bloc.

## 5. Retirer le code transitoire

Quand la requête ci-dessus ne renvoie plus rien :

| À supprimer | Où |
|---|---|
| `compte.mot_de_passe_hash` | migration Prisma |
| Table `session_compte` | migration Prisma |
| `ouvrirSessionCompte` | `identite/application/` |
| `trouverCompteParEmail`, `creerSessionCompte`, `resoudreJetonCompte` | port et adaptateur |
| `compteMaison` | `app/_session.ts` |
| `/connexion-formateur` | remplacé par l'écran Supabase |

Rien d'autre. C'est la contrepartie d'avoir mis ces objets derrière un port dès
le premier jour.

## 6. Le stockage

`stockageDisque` est transitoire au même titre. **Sur Vercel, le disque est
éphémère et non partagé entre instances** : un fichier déposé disparaît au
redéploiement et n'est pas visible des autres instances.

Créer un bucket privé `medias`, puis remplacer le seul fichier
`mediatheque/infrastructure/stockage-disque.ts` par un adaptateur Supabase
Storage. Le port `StockageObjet` ne bouge pas.

Les médias doivent à terme être servis depuis un **domaine distinct** de
l'application : tant que ce n'est pas le cas, les en-têtes de
`/api/v1/medias/[id]` sont la seule barrière contre l'exécution d'un fichier
déposé.

## 7. Ce qui ne change pas

- Les **élèves mineurs n'ont toujours pas de compte Auth**. Identifiant + code,
  `session_apprenant`, verrou anti-force brute : rien de tout cela ne dépend de
  Supabase Auth, et c'est délibéré.
- La **RLS** : `etablissement_courant()` lit déjà `auth.uid()`, qui devient
  simplement réel au lieu d'être posé par l'application.
- Le **journal d'audit** reste fermé, y compris à `service_role` — la fonction
  `journaliser` est la seule porte.

## 8. Retour arrière

Retirer les trois variables Supabase de l'environnement. L'application repart
sur le chemin transitoire au redémarrage, sans migration ni redéploiement de
schéma — tant que l'étape 5 n'a pas été faite.

C'est la raison pour laquelle l'étape 5 vient en dernier, et longtemps après.
