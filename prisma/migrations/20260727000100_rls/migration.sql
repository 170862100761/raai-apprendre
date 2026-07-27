-- ===========================================================================
-- raai-apprendre — cloisonnement (doc 07)
--
-- La RLS est le FILET DE SÉCURITÉ : même un bug applicatif ne peut pas faire
-- fuir les données d'un autre établissement. L'autorisation applicative
-- (`peut()`) est la seconde couche, pas un remplacement — ne jamais retirer
-- l'une sous prétexte que l'autre existe.
--
-- Idempotent : ré-exécutable sans casse.
--
-- APRÈS EXÉCUTION, action manuelle sur Supabase :
--   Project Settings › API › Exposed schemas → ajouter `raai_apprendre` et
--   `raai_apprendre_ref`. NE JAMAIS y ajouter `raai_apprendre_audit`.
-- ===========================================================================

-- Pas de pgcrypto ici : le hachage des codes élèves se fait dans Node
-- (bcryptjs), pas en SQL. Une dépendance d'extension en moins, c'est un
-- environnement de test de moins à configurer.

-- ---------------------------------------------------------------------------
-- 1. Les deux seules fonctions sur lesquelles s'appuient les politiques
-- ---------------------------------------------------------------------------

-- Le jeton d'un apprenant en mode minimal voyage dans une revendication JWT
-- dédiée. Il n'y a pas de compte auth.users derrière : c'est tout l'intérêt.
CREATE OR REPLACE FUNCTION raai_apprendre.jeton_apprenant_courant()
RETURNS uuid LANGUAGE sql STABLE
SET search_path = raai_apprendre, extensions, pg_temp AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'jeton_apprenant',
    ''
  )::uuid;
$$;

-- L'apprenant courant, s'il y en a un : jeton valide, non expiré, non révoqué.
CREATE OR REPLACE FUNCTION raai_apprendre.apprenant_courant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = raai_apprendre, extensions, pg_temp AS $$
  SELECT s.apprenant_id
    FROM raai_apprendre.session_apprenant s
    JOIN raai_apprendre.apprenant a ON a.id = s.apprenant_id
   WHERE s.jeton = raai_apprendre.jeton_apprenant_courant()
     AND s.expire_le > now()
     AND s.revoquee_le IS NULL
     AND a.actif
   LIMIT 1;
$$;

-- L'établissement du sujet courant, QUEL QUE SOIT son chemin
-- d'authentification. Au-delà d'ici, plus rien ne sait d'où vient la session.
CREATE OR REPLACE FUNCTION raai_apprendre.etablissement_courant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = raai_apprendre, extensions, pg_temp AS $$
  SELECT COALESCE(
    -- Adulte : compte Supabase Auth, attribution non expirée.
    (SELECT m.etablissement_id
       FROM raai_apprendre.membre m
      WHERE m.compte_id = auth.uid()
        AND m.etablissement_id IS NOT NULL
        AND (m.expire_le IS NULL OR m.expire_le > now())
      LIMIT 1),
    -- Apprenant en mode minimal : jeton de session.
    (SELECT a.etablissement_id
       FROM raai_apprendre.apprenant a
      WHERE a.id = raai_apprendre.apprenant_courant()),
    -- Apprenant majeur : compte Auth, mais pas de ligne `membre`.
    (SELECT a.etablissement_id
       FROM raai_apprendre.apprenant a
      WHERE a.compte_id = auth.uid())
  );
$$;

-- Le droit se lit sur les attributions non expirées. Un rôle seul ne suffit
-- pas : « enseignant » ne dit rien tant qu'on ne sait pas de quelles classes.
CREATE OR REPLACE FUNCTION raai_apprendre.a_role(roles raai_apprendre.role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = raai_apprendre, extensions, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM raai_apprendre.membre m
     WHERE m.compte_id = auth.uid()
       AND m.role = ANY(roles)
       AND (m.expire_le IS NULL OR m.expire_le > now())
       AND (
         m.etablissement_id IS NULL
         OR m.etablissement_id = raai_apprendre.etablissement_courant()
       )
  );
$$;

-- Portée « ses classes » : sans affectation, un enseignant ne voit aucun élève.
CREATE OR REPLACE FUNCTION raai_apprendre.classes_du_sujet()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = raai_apprendre, extensions, pg_temp AS $$
  SELECT DISTINCT af.classe_id
    FROM raai_apprendre.affectation af
    JOIN raai_apprendre.membre m ON m.id = af.membre_id
   WHERE m.compte_id = auth.uid()
     AND (m.expire_le IS NULL OR m.expire_le > now())
  UNION
  -- Un responsable pédagogique voit toutes les classes de son établissement,
  -- en lecture. Il ne modifie jamais une note pour autant : c'est la couche
  -- applicative qui porte cette interdiction.
  SELECT c.id
    FROM raai_apprendre.classe c
   WHERE raai_apprendre.a_role(
           ARRAY['responsable_pedagogique','admin_etablissement']::raai_apprendre.role[])
     AND c.etablissement_id = raai_apprendre.etablissement_courant();
$$;

REVOKE EXECUTE ON FUNCTION raai_apprendre.apprenant_courant() FROM public;
REVOKE EXECUTE ON FUNCTION raai_apprendre.etablissement_courant() FROM public;
GRANT EXECUTE ON FUNCTION raai_apprendre.apprenant_courant() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION raai_apprendre.etablissement_courant() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION raai_apprendre.a_role(raai_apprendre.role[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION raai_apprendre.classes_du_sujet() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. RLS activée et FORCÉE partout
--
-- `FORCE` est indispensable : sans lui, le propriétaire de la table contourne
-- ses propres politiques — et c'est le propriétaire qui exécute les migrations.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
      FROM pg_tables
     WHERE schemaname IN ('raai_apprendre', 'raai_apprendre_ref', 'raai_apprendre_audit')
       AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Référentiel national — lecture pour tous, écriture réservée
--
-- Rien ici n'est cloisonné par établissement : c'est le patrimoine commun.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['diplome','niveau','version_referentiel','competence',
                           'savoir','competence_equivalence']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON raai_apprendre_ref.%I', t || '_lecture', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON raai_apprendre_ref.%I', t || '_ecriture', t);

    EXECUTE format($f$
      CREATE POLICY %I ON raai_apprendre_ref.%I FOR SELECT USING (true)
    $f$, t || '_lecture', t);

    -- Seul l'administrateur national publie un référentiel.
    EXECUTE format($f$
      CREATE POLICY %I ON raai_apprendre_ref.%I FOR ALL
        USING (raai_apprendre.a_role(ARRAY['admin_national']::raai_apprendre.role[]))
        WITH CHECK (raai_apprendre.a_role(ARRAY['admin_national']::raai_apprendre.role[]))
    $f$, t || '_ecriture', t);
  END LOOP;
END $$;

-- Une version publiée est immuable : la garantie vit en base, pas dans le code.
CREATE OR REPLACE FUNCTION raai_apprendre_ref.refuser_modif_version_publiee()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut = 'publie' AND NEW.statut <> 'abroge' THEN
    RAISE EXCEPTION
      'Référentiel % publié : créer une nouvelle version plutôt que le modifier.',
      OLD.reference_arrete;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS version_publiee_immuable ON raai_apprendre_ref.version_referentiel;
CREATE TRIGGER version_publiee_immuable
  BEFORE UPDATE ON raai_apprendre_ref.version_referentiel
  FOR EACH ROW EXECUTE FUNCTION raai_apprendre_ref.refuser_modif_version_publiee();

-- ---------------------------------------------------------------------------
-- 4. Tables cloisonnées par établissement
--
-- `etablissement_id` est en tête de tout index composite sur ces tables : la
-- politique ajoute systématiquement ce prédicat, un index qui ne le porte pas
-- en premier ne serait pas utilisé.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['annee_scolaire','offre_formation','classe','apprenant',
                           'inscription','adaptation_locale','evaluation','tentative',
                           'presence_jour','acquis_competence']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON raai_apprendre.%I', t || '_etablissement', t);
    EXECUTE format($f$
      CREATE POLICY %I ON raai_apprendre.%I FOR ALL
        USING (etablissement_id = raai_apprendre.etablissement_courant())
        WITH CHECK (etablissement_id = raai_apprendre.etablissement_courant())
    $f$, t || '_etablissement', t);
  END LOOP;
END $$;

-- Tables où l'établissement peut être NULL (= patrimoine national partagé).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['matiere','ressource']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON raai_apprendre.%I', t || '_lecture', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON raai_apprendre.%I', t || '_ecriture', t);

    EXECUTE format($f$
      CREATE POLICY %I ON raai_apprendre.%I FOR SELECT USING (
        etablissement_id IS NULL
        OR etablissement_id = raai_apprendre.etablissement_courant()
      )
    $f$, t || '_lecture', t);

    -- On ne modifie jamais une ressource nationale depuis un établissement.
    EXECUTE format($f$
      CREATE POLICY %I ON raai_apprendre.%I FOR ALL
        USING (etablissement_id = raai_apprendre.etablissement_courant())
        WITH CHECK (etablissement_id = raai_apprendre.etablissement_courant())
    $f$, t || '_ecriture', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Contenu pédagogique
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS lecon_lecture ON raai_apprendre.lecon;
CREATE POLICY lecon_lecture ON raai_apprendre.lecon FOR SELECT USING (
  (etablissement_id IS NULL OR etablissement_id = raai_apprendre.etablissement_courant())
  AND (
    statut = 'publiee'
    -- Un brouillon reste visible de ceux qui peuvent écrire.
    OR raai_apprendre.a_role(ARRAY['enseignant','responsable_pedagogique',
                                   'admin_etablissement','admin_national']::raai_apprendre.role[])
  )
);

DROP POLICY IF EXISTS lecon_ecriture ON raai_apprendre.lecon;
CREATE POLICY lecon_ecriture ON raai_apprendre.lecon FOR ALL
  USING (
    etablissement_id = raai_apprendre.etablissement_courant()
    AND raai_apprendre.a_role(ARRAY['enseignant','responsable_pedagogique',
                                    'admin_etablissement']::raai_apprendre.role[])
  )
  WITH CHECK (
    etablissement_id = raai_apprendre.etablissement_courant()
    AND raai_apprendre.a_role(ARRAY['enseignant','responsable_pedagogique',
                                    'admin_etablissement']::raai_apprendre.role[])
  );

-- Les blocs suivent leur leçon : pas de politique divergente, sinon le contenu
-- d'un brouillon fuirait par la table enfant.
DROP POLICY IF EXISTS bloc_contenu_via_lecon ON raai_apprendre.bloc_contenu;
CREATE POLICY bloc_contenu_via_lecon ON raai_apprendre.bloc_contenu FOR ALL
  USING (EXISTS (SELECT 1 FROM raai_apprendre.lecon l WHERE l.id = lecon_id))
  WITH CHECK (EXISTS (SELECT 1 FROM raai_apprendre.lecon l WHERE l.id = lecon_id));

DROP POLICY IF EXISTS lien_competence_via_lecon ON raai_apprendre.lien_competence;
CREATE POLICY lien_competence_via_lecon ON raai_apprendre.lien_competence FOR ALL
  USING (EXISTS (SELECT 1 FROM raai_apprendre.lecon l WHERE l.id = lecon_id))
  WITH CHECK (EXISTS (SELECT 1 FROM raai_apprendre.lecon l WHERE l.id = lecon_id));

DROP POLICY IF EXISTS module_formation_via_matiere ON raai_apprendre.module_formation;
CREATE POLICY module_formation_via_matiere ON raai_apprendre.module_formation FOR ALL
  USING (EXISTS (SELECT 1 FROM raai_apprendre.matiere m WHERE m.id = matiere_id))
  WITH CHECK (EXISTS (SELECT 1 FROM raai_apprendre.matiere m WHERE m.id = matiere_id));

DROP POLICY IF EXISTS chapitre_via_module ON raai_apprendre.chapitre;
CREATE POLICY chapitre_via_module ON raai_apprendre.chapitre FOR ALL
  USING (EXISTS (SELECT 1 FROM raai_apprendre.module_formation m WHERE m.id = module_id))
  WITH CHECK (EXISTS (SELECT 1 FROM raai_apprendre.module_formation m WHERE m.id = module_id));

-- ---------------------------------------------------------------------------
-- 6. Évaluation
--
-- Le corrigé ne sort jamais avant soumission. Un élève qui lit `question`
-- directement ne doit rien y trouver d'utile : d'où une politique de lecture
-- qui exclut les apprenants, l'énoncé leur étant servi par une fonction
-- SECURITY DEFINER qui retire `corrige`.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS question_lecture_encadrants ON raai_apprendre.question;
CREATE POLICY question_lecture_encadrants ON raai_apprendre.question FOR ALL
  USING (
    raai_apprendre.a_role(ARRAY['enseignant','responsable_pedagogique',
                                'admin_etablissement']::raai_apprendre.role[])
    AND EXISTS (SELECT 1 FROM raai_apprendre.evaluation e WHERE e.id = evaluation_id)
  )
  WITH CHECK (
    raai_apprendre.a_role(ARRAY['enseignant','responsable_pedagogique',
                                'admin_etablissement']::raai_apprendre.role[])
    AND EXISTS (SELECT 1 FROM raai_apprendre.evaluation e WHERE e.id = evaluation_id)
  );

-- Un apprenant ne voit QUE ses propres tentatives. Jamais celles d'un autre,
-- même de sa classe.
DROP POLICY IF EXISTS tentative_apprenant ON raai_apprendre.tentative;
CREATE POLICY tentative_apprenant ON raai_apprendre.tentative FOR ALL
  USING (
    apprenant_id = raai_apprendre.apprenant_courant()
    OR (
      etablissement_id = raai_apprendre.etablissement_courant()
      AND EXISTS (
        SELECT 1 FROM raai_apprendre.inscription i
         WHERE i.apprenant_id = tentative.apprenant_id
           AND i.classe_id IN (SELECT raai_apprendre.classes_du_sujet())
      )
    )
  )
  WITH CHECK (etablissement_id = raai_apprendre.etablissement_courant());

DROP POLICY IF EXISTS reponse_via_tentative ON raai_apprendre.reponse;
CREATE POLICY reponse_via_tentative ON raai_apprendre.reponse FOR ALL
  USING (EXISTS (SELECT 1 FROM raai_apprendre.tentative t WHERE t.id = tentative_id))
  WITH CHECK (EXISTS (SELECT 1 FROM raai_apprendre.tentative t WHERE t.id = tentative_id));

-- Une tentative est immuable une fois corrigée : une révision de note crée une
-- nouvelle ligne liée à la précédente.
CREATE OR REPLACE FUNCTION raai_apprendre.refuser_modif_tentative_corrigee()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut = 'corrigee' THEN
    RAISE EXCEPTION
      'Tentative % corrigée : créer une tentative de révision plutôt que la modifier.',
      OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tentative_corrigee_immuable ON raai_apprendre.tentative;
CREATE TRIGGER tentative_corrigee_immuable
  BEFORE UPDATE ON raai_apprendre.tentative
  FOR EACH ROW EXECUTE FUNCTION raai_apprendre.refuser_modif_tentative_corrigee();

-- ---------------------------------------------------------------------------
-- 7. Progression — un apprenant ne voit que la sienne
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS acquis_competence_etablissement ON raai_apprendre.acquis_competence;
CREATE POLICY acquis_competence_etablissement ON raai_apprendre.acquis_competence FOR ALL
  USING (
    apprenant_id = raai_apprendre.apprenant_courant()
    OR (
      etablissement_id = raai_apprendre.etablissement_courant()
      AND EXISTS (
        SELECT 1 FROM raai_apprendre.inscription i
         WHERE i.apprenant_id = acquis_competence.apprenant_id
           AND i.classe_id IN (SELECT raai_apprendre.classes_du_sujet())
      )
    )
  )
  WITH CHECK (etablissement_id = raai_apprendre.etablissement_courant());

-- Un acquis ne se dégrade jamais du fait d'une évaluation ratée : seul un
-- enseignant peut dégrader explicitement. Sans cette règle, la validation de
-- compétences devient anxiogène et les élèves cessent de tenter.
CREATE OR REPLACE FUNCTION raai_apprendre.proteger_acquis()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rang_ancien int; rang_nouveau int;
BEGIN
  rang_ancien := array_position(
    ARRAY['non_abordee','en_cours','acquise','maitrisee'], OLD.niveau::text);
  rang_nouveau := array_position(
    ARRAY['non_abordee','en_cours','acquise','maitrisee'], NEW.niveau::text);

  IF rang_nouveau < rang_ancien AND NEW.origine <> 'declaration_enseignant' THEN
    RAISE EXCEPTION
      'Un acquis ne se dégrade que sur déclaration d''un enseignant (origine reçue : %).',
      NEW.origine;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS acquis_non_degradable ON raai_apprendre.acquis_competence;
CREATE TRIGGER acquis_non_degradable
  BEFORE UPDATE ON raai_apprendre.acquis_competence
  FOR EACH ROW EXECUTE FUNCTION raai_apprendre.proteger_acquis();

-- ---------------------------------------------------------------------------
-- 8. Identité
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS compte_soi ON raai_apprendre.compte;
CREATE POLICY compte_soi ON raai_apprendre.compte FOR ALL
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM raai_apprendre.membre m
       WHERE m.compte_id = compte.id
         AND m.etablissement_id = raai_apprendre.etablissement_courant()
         AND raai_apprendre.a_role(
               ARRAY['admin_etablissement','admin_national']::raai_apprendre.role[])
    )
  )
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS membre_etablissement ON raai_apprendre.membre;
CREATE POLICY membre_etablissement ON raai_apprendre.membre FOR ALL
  USING (
    compte_id = auth.uid()
    OR etablissement_id = raai_apprendre.etablissement_courant()
  )
  WITH CHECK (
    etablissement_id = raai_apprendre.etablissement_courant()
    AND raai_apprendre.a_role(
          ARRAY['admin_etablissement','admin_national']::raai_apprendre.role[])
  );

DROP POLICY IF EXISTS affectation_via_membre ON raai_apprendre.affectation;
CREATE POLICY affectation_via_membre ON raai_apprendre.affectation FOR ALL
  USING (EXISTS (SELECT 1 FROM raai_apprendre.membre m WHERE m.id = membre_id))
  WITH CHECK (EXISTS (SELECT 1 FROM raai_apprendre.membre m WHERE m.id = membre_id));

-- Le jeton n'est jamais lisible depuis le navigateur : seules les fonctions
-- SECURITY DEFINER y touchent. D'où l'absence délibérée de politique
-- permissive ici — la table est verrouillée par défaut.
DROP POLICY IF EXISTS session_apprenant_aucune ON raai_apprendre.session_apprenant;
CREATE POLICY session_apprenant_aucune ON raai_apprendre.session_apprenant
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS verrou_acces_aucune ON raai_apprendre.verrou_acces;
CREATE POLICY verrou_acces_aucune ON raai_apprendre.verrou_acces
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS consentement_etablissement ON raai_apprendre.consentement;
CREATE POLICY consentement_etablissement ON raai_apprendre.consentement FOR ALL
  USING (
    compte_id = auth.uid()
    OR apprenant_id = raai_apprendre.apprenant_courant()
    OR EXISTS (
      SELECT 1 FROM raai_apprendre.apprenant a
       WHERE a.id = consentement.apprenant_id
         AND a.etablissement_id = raai_apprendre.etablissement_courant()
    )
  )
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 9. Géographie — lecture publique, elle sert au parcours d'inscription
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS pays_lecture ON raai_apprendre.pays;
CREATE POLICY pays_lecture ON raai_apprendre.pays FOR SELECT USING (true);

DROP POLICY IF EXISTS academie_lecture ON raai_apprendre.academie;
CREATE POLICY academie_lecture ON raai_apprendre.academie FOR SELECT USING (true);

-- Nom, UAI et type d'un établissement actif sont publics ; le reste ne l'est pas.
DROP POLICY IF EXISTS etablissement_lecture ON raai_apprendre.etablissement;
CREATE POLICY etablissement_lecture ON raai_apprendre.etablissement FOR SELECT
  USING (actif OR id = raai_apprendre.etablissement_courant());

DROP POLICY IF EXISTS etablissement_ecriture ON raai_apprendre.etablissement;
CREATE POLICY etablissement_ecriture ON raai_apprendre.etablissement FOR ALL
  USING (
    id = raai_apprendre.etablissement_courant()
    AND raai_apprendre.a_role(
          ARRAY['admin_etablissement','admin_national']::raai_apprendre.role[])
  )
  WITH CHECK (
    id = raai_apprendre.etablissement_courant()
    AND raai_apprendre.a_role(
          ARRAY['admin_etablissement','admin_national']::raai_apprendre.role[])
  );

-- ---------------------------------------------------------------------------
-- 10. Journal d'audit — append-only, hors de portée
-- ---------------------------------------------------------------------------

REVOKE UPDATE, DELETE ON raai_apprendre_audit.evenement FROM public, authenticated, anon;
REVOKE ALL ON SCHEMA raai_apprendre_audit FROM public, authenticated, anon;

DROP POLICY IF EXISTS audit_aucune_lecture ON raai_apprendre_audit.evenement;
CREATE POLICY audit_aucune_lecture ON raai_apprendre_audit.evenement
  FOR ALL USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION raai_apprendre_audit.refuser_reecriture()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est append-only.';
END $$;

DROP TRIGGER IF EXISTS audit_append_only ON raai_apprendre_audit.evenement;
CREATE TRIGGER audit_append_only
  BEFORE UPDATE OR DELETE ON raai_apprendre_audit.evenement
  FOR EACH ROW EXECUTE FUNCTION raai_apprendre_audit.refuser_reecriture();

-- ---------------------------------------------------------------------------
-- 11. Tables de service — aucun accès direct depuis un client
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['evenement_domaine','quota_ia']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON raai_apprendre.%I', t || '_aucune', t);
    EXECUTE format($f$
      CREATE POLICY %I ON raai_apprendre.%I FOR ALL USING (false) WITH CHECK (false)
    $f$, t || '_aucune', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 12. Garde-fou : aucune table ne peut exister sans politique
--
-- C'est là que se produisent les oublis — sur les tables ajoutées après coup.
-- Le test src/test/permissions/couverture.test.ts rejoue cette vérification en
-- CI, mais l'échec doit aussi se produire ici, au plus près de la migration.
-- ---------------------------------------------------------------------------

DO $$
DECLARE manquantes text[];
BEGIN
  SELECT array_agg(format('%s.%s', c.relnamespace::regnamespace, c.relname))
    INTO manquantes
    FROM pg_class c
   WHERE c.relnamespace::regnamespace::text
         IN ('raai_apprendre', 'raai_apprendre_ref', 'raai_apprendre_audit')
     AND c.relkind = 'r'
     AND c.relname <> '_prisma_migrations'
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);

  IF manquantes IS NOT NULL THEN
    RAISE EXCEPTION
      'Tables sans politique RLS : %. Une table sans politique est une fuite en attente.',
      array_to_string(manquantes, ', ');
  END IF;
END $$;
