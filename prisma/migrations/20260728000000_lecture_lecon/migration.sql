-- Avancement d'un apprenant dans une leçon.
--
-- La table ET sa politique dans la même migration : une table sans politique
-- fait échouer le garde-fou de fin de fichier, et c'est voulu.

CREATE TABLE IF NOT EXISTS "raai_apprendre"."lecture_lecon" (
  "apprenant_id"     UUID NOT NULL,
  "lecon_id"         UUID NOT NULL,
  "etablissement_id" UUID NOT NULL,
  "position"         INTEGER NOT NULL DEFAULT 0,
  "ouverte_le"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "terminee_le"      TIMESTAMPTZ(6),

  CONSTRAINT "lecture_lecon_pkey" PRIMARY KEY ("apprenant_id", "lecon_id")
);

-- `etablissement_id` en tête : la politique ajoute systématiquement ce
-- prédicat, un index qui ne le porte pas en premier ne serait pas utilisé.
CREATE INDEX IF NOT EXISTS "lecture_lecon_etablissement_id_lecon_id_idx"
  ON "raai_apprendre"."lecture_lecon"("etablissement_id", "lecon_id");

DO $$ BEGIN
  ALTER TABLE "raai_apprendre"."lecture_lecon"
    ADD CONSTRAINT "lecture_lecon_apprenant_id_fkey"
    FOREIGN KEY ("apprenant_id") REFERENCES "raai_apprendre"."apprenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "raai_apprendre"."lecture_lecon"
    ADD CONSTRAINT "lecture_lecon_lecon_id_fkey"
    FOREIGN KEY ("lecon_id") REFERENCES "raai_apprendre"."lecon"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "raai_apprendre"."lecture_lecon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raai_apprendre"."lecture_lecon" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON "raai_apprendre"."lecture_lecon" TO anon, authenticated;

-- Un apprenant ne voit que sa propre lecture. Un encadrant voit celles de ses
-- classes : savoir qui n'a pas ouvert le cours est le premier signal de
-- décrochage dont dispose un enseignant.
DROP POLICY IF EXISTS lecture_lecon_acces ON raai_apprendre.lecture_lecon;
CREATE POLICY lecture_lecon_acces ON raai_apprendre.lecture_lecon FOR ALL
  USING (
    apprenant_id = raai_apprendre.apprenant_courant()
    OR (
      etablissement_id = raai_apprendre.etablissement_courant()
      AND EXISTS (
        SELECT 1 FROM raai_apprendre.inscription i
         WHERE i.apprenant_id = lecture_lecon.apprenant_id
           AND i.classe_id IN (SELECT raai_apprendre.classes_du_sujet())
      )
    )
  )
  WITH CHECK (
    apprenant_id = raai_apprendre.apprenant_courant()
    AND etablissement_id = raai_apprendre.etablissement_courant()
  );

-- Même garde-fou qu'à la migration précédente : il doit se déclencher au plus
-- près de la migration, pas seulement en CI.
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
