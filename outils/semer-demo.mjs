/**
 * Jeu de démonstration : un établissement, une classe, trois élèves.
 *
 * Le référentiel semé est le vrai Bac Pro Agroéquipement rénové (arrêté du
 * 21 mars 2023). Semer un référentiel inventé donnerait une démonstration qui
 * ne ressemble à rien de ce que verront les établissements.
 */
import bcrypt from 'bcryptjs'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Extrait du référentiel rénové — les capacités professionnelles B5 à B9. */
const CAPACITES = [
  ['C5', 'B5', 'Choisir un équipement adapté à un contexte en lien avec les transitions'],
  ['C6', 'B6', 'Organiser un chantier en mobilisant des agroéquipements'],
  ['C7', 'B7', 'Adapter les équipements à la conduite d’un chantier'],
  ['C8', 'B8', 'Mettre en œuvre des équipements en sécurité'],
  ['C9', 'B9', 'Réaliser des opérations de maintenance'],
]

const ELEVES = [
  ['Léa', 'M', 'lea.escatalens', '4271'],
  ['Thomas', 'B', 'thomas.escatalens', '8305'],
  ['Inès', 'K', 'ines.escatalens', '6194'],
]

export async function semer(bd) {
  const q = (sql, params = []) => bd.query(sql, params)

  await q(`INSERT INTO raai_apprendre.pays (id, code, nom) VALUES ($1,'FR','France')`, [id(1)])
  await q(
    `INSERT INTO raai_apprendre.academie (id, pays_id, code, nom)
     VALUES ($1,$2,'TOULOUSE','Toulouse')`,
    [id(2), id(1)],
  )
  await q(
    `INSERT INTO raai_apprendre.etablissement (id, academie_id, uai, nom, type, mode_identite)
     VALUES ($1,$2,'0820001A','MFR Escatalens','MFR','minimal')`,
    [id(3), id(2)],
  )

  await q(
    `INSERT INTO raai_apprendre_ref.diplome
       (id, code, intitule, ministere, niveau_europeen, filiere)
     VALUES ($1,'BACPRO-AE','Baccalauréat professionnel Agroéquipement','MASA',4,'agroequipement')`,
    [id(4)],
  )
  await q(
    `INSERT INTO raai_apprendre_ref.niveau (id, diplome_id, code, intitule, ordre)
     VALUES ($1,$2,'TERM','Terminale',3)`,
    [id(5), id(4)],
  )
  await q(
    `INSERT INTO raai_apprendre_ref.version_referentiel
       (id, diplome_id, reference_arrete, entree_en_vigueur, statut)
     VALUES ($1,$2,'Arrêté du 21 mars 2023','2023-09-01','publie')`,
    [id(6), id(4)],
  )

  let n = 20
  const competences = []
  for (const [code, bloc, intitule] of CAPACITES) {
    const cid = id(n++)
    competences.push(cid)
    await q(
      `INSERT INTO raai_apprendre_ref.competence
         (id, version_id, code, code_bloc, intitule, ordre)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cid, id(6), code, bloc, intitule, competences.length],
    )
  }

  await q(
    `INSERT INTO raai_apprendre.offre_formation (id, etablissement_id, diplome_id)
     VALUES ($1,$2,$3)`,
    [id(7), id(3), id(4)],
  )
  await q(
    `INSERT INTO raai_apprendre.annee_scolaire (id, etablissement_id, libelle, debut, fin)
     VALUES ($1,$2,'2026-2027','2026-09-01','2027-07-05')`,
    [id(8), id(3)],
  )
  await q(
    `INSERT INTO raai_apprendre.classe
       (id, etablissement_id, offre_id, niveau_id, annee_id, nom, code_rattachement)
     VALUES ($1,$2,$3,$4,$5,'TAE 2026','TAE-2026-4K7P')`,
    [id(9), id(3), id(7), id(5), id(8)],
  )

  let e = 40
  for (const [prenom, initiale, identifiant, code] of ELEVES) {
    const eid = id(e++)
    await q(
      `INSERT INTO raai_apprendre.apprenant
         (id, etablissement_id, prenom, initiale_nom, identifiant, code_hash)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [eid, id(3), prenom, initiale, identifiant, await bcrypt.hash(code, 10)],
    )
    await q(
      `INSERT INTO raai_apprendre.inscription
         (id, apprenant_id, classe_id, etablissement_id, debut, statut)
       VALUES ($1,$2,$3,$4,'2026-09-01','active')`,
      [id(e++), eid, id(9), id(3)],
    )

    // Léa a de l'avance, Thomas commence, Inès n'a rien encore : trois états
    // différents à l'écran, sinon la démonstration ne montre qu'un seul cas.
    const niveaux =
      prenom === 'Léa'
        ? ['acquise', 'acquise', 'maitrisee', 'en_cours', 'non_abordee']
        : prenom === 'Thomas'
          ? ['acquise', 'en_cours', 'non_abordee', 'non_abordee', 'non_abordee']
          : []

    for (const [i, niveau] of niveaux.entries()) {
      await q(
        `INSERT INTO raai_apprendre.acquis_competence
           (id, apprenant_id, competence_id, version_referentiel_id, etablissement_id,
            niveau, origine)
         VALUES ($1,$2,$3,$4,$5,$6,'evaluation')`,
        [id(e++), eid, competences[i], id(6), id(3), niveau],
      )
    }
  }

  console.log('\n  Jeu de démonstration semé :')
  console.log('    MFR Escatalens · Bac Pro Agroéquipement · TAE 2026')
  for (const [prenom, , identifiant, code] of ELEVES) {
    console.log(`    ${prenom.padEnd(7)} ${identifiant.padEnd(20)} code ${code}`)
  }
}
