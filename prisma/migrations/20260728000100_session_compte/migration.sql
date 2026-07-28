-- Connexion des adultes sans Supabase.
--
-- TRANSITOIRE, et assumé comme tel : le compte Supabase n'est pas encore
-- ouvert, et un éditeur de leçons sans enseignant connecté ne sert à rien.
-- Le jour où Supabase Auth arrive, `mot_de_passe_hash` passe à NULL sur les
-- comptes migrés et cette table disparaît. Tout cela vit derrière le même port
-- que les sessions élèves : la bascule ne touchera pas le reste du code.

ALTER TABLE "raai_apprendre"."compte"
  ADD COLUMN IF NOT EXISTS "mot_de_passe_hash" TEXT;

CREATE TABLE IF NOT EXISTS "raai_apprendre"."session_compte" (
  "jeton"       UUID NOT NULL DEFAULT gen_random_uuid(),
  "compte_id"   UUID NOT NULL,
  "cree_le"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expire_le"   TIMESTAMPTZ(6) NOT NULL,
  "revoquee_le" TIMESTAMPTZ(6),

  CONSTRAINT "session_compte_pkey" PRIMARY KEY ("jeton")
);

CREATE INDEX IF NOT EXISTS "session_compte_compte_id_idx"
  ON "raai_apprendre"."session_compte"("compte_id");

DO $$ BEGIN
  ALTER TABLE "raai_apprendre"."session_compte"
    ADD CONSTRAINT "session_compte_compte_id_fkey"
    FOREIGN KEY ("compte_id") REFERENCES "raai_apprendre"."compte"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "raai_apprendre"."session_compte" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raai_apprendre"."session_compte" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON "raai_apprendre"."session_compte" TO anon, authenticated;

-- Verrouillée comme session_apprenant : les jetons ne sont lisibles par
-- personne depuis un client, uniquement par les fonctions SECURITY DEFINER.
DROP POLICY IF EXISTS session_compte_aucune ON raai_apprendre.session_compte;
CREATE POLICY session_compte_aucune ON raai_apprendre.session_compte
  FOR ALL USING (false) WITH CHECK (false);

-- `auth.uid()` reste la source de vérité côté RLS. Tant que Supabase n'est pas
-- branché, la revendication `sub` est posée par le serveur applicatif après
-- vérification du jeton — c'est le pendant exact de `jeton_apprenant`.

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
