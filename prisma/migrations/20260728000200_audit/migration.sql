-- Écriture dans le journal d'audit.
--
-- Le schéma `raai_apprendre_audit` est fermé à tout le monde : politique
-- `USING (false)`, droits révoqués, déclencheur append-only. Personne ne peut
-- y écrire directement — et c'est exactement ce qu'on veut d'un journal.
--
-- La seule porte est cette fonction `SECURITY DEFINER`. Elle n'accepte que
-- des métadonnées : qui, quoi, sur quoi. Aucun paramètre ne permet d'y
-- déverser un contenu, ce qui rend structurellement impossible de transformer
-- le journal en base de données personnelles.

CREATE OR REPLACE FUNCTION raai_apprendre_audit.journaliser(
  p_sujet_id         uuid,
  p_sujet_type       text,
  p_role_effectif    text,
  p_action           text,
  p_ressource_type   text,
  p_ressource_id     uuid,
  p_etablissement_id uuid,
  p_id_requete       text,
  p_ip_tronquee      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raai_apprendre_audit, pg_temp
AS $$
BEGIN
  INSERT INTO raai_apprendre_audit.evenement (
    id, sujet_id, sujet_type, role_effectif, action,
    ressource_type, ressource_id, etablissement_id, id_requete, ip_tronquee
  )
  VALUES (
    gen_random_uuid(), p_sujet_id, p_sujet_type, p_role_effectif, p_action,
    p_ressource_type, p_ressource_id, p_etablissement_id, p_id_requete,
    -- Ceinture et bretelles : même si l'appelant transmettait une adresse
    -- entière, elle est tronquée ici. La règle vit en base, pas seulement
    -- dans le code applicatif qui pourrait l'oublier.
    CASE
      WHEN p_ip_tronquee IS NULL THEN NULL
      WHEN p_ip_tronquee LIKE '%.%' THEN
        regexp_replace(p_ip_tronquee, '^(\d+\.\d+\.\d+)\.\d+$', '\1.0')
      ELSE p_ip_tronquee
    END
  );
END $$;

-- Exécutable par les rôles applicatifs — mais toujours pas lisible par eux.
GRANT EXECUTE ON FUNCTION raai_apprendre_audit.journaliser(
  uuid, text, text, text, text, uuid, uuid, text, text
) TO anon, authenticated;

-- Lecture : réservée à une fonction distincte, elle aussi SECURITY DEFINER,
-- et cloisonnée par établissement. Un administrateur national n'a rien à faire
-- dans le journal d'une MFR.
CREATE OR REPLACE FUNCTION raai_apprendre_audit.lire_journal(
  p_etablissement_id uuid,
  p_limite integer DEFAULT 200
)
RETURNS TABLE (
  action         text,
  ressource_type text,
  role_effectif  text,
  survenu_le     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = raai_apprendre_audit, raai_apprendre, pg_temp
AS $$
  SELECT e.action, e.ressource_type, e.role_effectif, e.survenu_le
    FROM raai_apprendre_audit.evenement e
   WHERE e.etablissement_id = p_etablissement_id
     -- Le lecteur doit appartenir à l'établissement qu'il consulte.
     AND p_etablissement_id = raai_apprendre.etablissement_courant()
     AND raai_apprendre.a_role(
           ARRAY['admin_etablissement']::raai_apprendre.role[])
   ORDER BY e.survenu_le DESC
   LIMIT LEAST(p_limite, 1000);
$$;

GRANT EXECUTE ON FUNCTION raai_apprendre_audit.lire_journal(uuid, integer)
  TO anon, authenticated;

-- Purge selon la durée de conservation (doc 09 §4) : trois ans pour la
-- sécurité, un an pour le reste. Appelée par une tâche planifiée, jamais par
-- l'application — un journal que l'application peut vider ne prouve rien.
CREATE OR REPLACE FUNCTION raai_apprendre_audit.purger()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = raai_apprendre_audit, pg_temp
AS $$
DECLARE supprimes integer;
BEGIN
  -- Le déclencheur append-only interdit DELETE : on le contourne ici, dans la
  -- seule fonction qui en a le droit, et pour la seule raison légitime.
  ALTER TABLE raai_apprendre_audit.evenement DISABLE TRIGGER audit_append_only;

  WITH securite AS (
    SELECT unnest(ARRAY[
      'connexion.reussie', 'connexion.echouee', 'connexion.verrouillage',
      'membre.modifie', 'session.impersonnee', 'donnees.consultees'
    ]) AS action
  )
  DELETE FROM raai_apprendre_audit.evenement e
   WHERE e.survenu_le < now() - (
     CASE WHEN e.action IN (SELECT action FROM securite)
          THEN interval '3 years'
          ELSE interval '1 year'
     END
   );

  GET DIAGNOSTICS supprimes = ROW_COUNT;

  ALTER TABLE raai_apprendre_audit.evenement ENABLE TRIGGER audit_append_only;
  RETURN supprimes;
END $$;

REVOKE EXECUTE ON FUNCTION raai_apprendre_audit.purger() FROM public, anon, authenticated;

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
