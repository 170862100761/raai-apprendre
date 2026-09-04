/**
 * Deux établissements peuplés à l'identique. Toute la valeur du test de
 * cloisonnement tient là : si A et B ne se ressemblent pas, une fuite peut
 * passer pour une absence de données.
 */
import type { BaseDeTest } from './base'

export type Etablissement = {
  id: string
  nom: string
  classeId: string
  apprenantId: string
  jetonApprenant: string
  enseignantId: string
  /** Enseignant sans affectation : ne doit voir aucun élève. */
  enseignantSansClasseId: string
  responsableId: string
  adminId: string
  leconPublieeId: string
  leconBrouillonId: string
  evaluationId: string
  questionId: string
  tentativeId: string
  acquisId: string
  scoreJeuId: string
}

export type JeuDeDonnees = {
  a: Etablissement
  b: Etablissement
  adminNationalId: string
  competenceId: string
  versionId: string
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let compteur = 1
const suivant = () => uuid(compteur++)

async function creerEtablissement(
  bd: BaseDeTest,
  academieId: string,
  versionId: string,
  competenceId: string,
  nom: string,
  uai: string,
): Promise<Etablissement> {
  const e: Etablissement = {
    id: suivant(),
    nom,
    classeId: suivant(),
    apprenantId: suivant(),
    jetonApprenant: suivant(),
    enseignantId: suivant(),
    enseignantSansClasseId: suivant(),
    responsableId: suivant(),
    adminId: suivant(),
    leconPublieeId: suivant(),
    leconBrouillonId: suivant(),
    evaluationId: suivant(),
    questionId: suivant(),
    tentativeId: suivant(),
    acquisId: suivant(),
    scoreJeuId: suivant(),
  }
  const diplomeId = suivant()
  const niveauId = suivant()
  const offreId = suivant()
  const anneeId = suivant()
  const matiereId = suivant()
  const moduleId = suivant()
  const chapitreId = suivant()
  const membreEnsId = suivant()
  const inscriptionId = suivant()

  await bd.prepare(
    `INSERT INTO raai_apprendre.etablissement (id, academie_id, uai, nom, type, mode_identite)
     VALUES ($1, $2, $3, $4, 'MFR', 'minimal')`,
    [e.id, academieId, uai, nom],
  )

  // Comptes adultes + attributions.
  for (const [id, role, prenom] of [
    [e.enseignantId, 'enseignant', 'Ens'],
    [e.enseignantSansClasseId, 'enseignant', 'EnsSansClasse'],
    [e.responsableId, 'responsable_pedagogique', 'Resp'],
    [e.adminId, 'admin_etablissement', 'Admin'],
  ] as const) {
    await bd.prepare(
      `INSERT INTO raai_apprendre.compte (id, email, prenom) VALUES ($1, $2, $3)`,
      [id, `${prenom.toLowerCase()}.${uai}@test.fr`, prenom],
    )
    await bd.prepare(
      `INSERT INTO raai_apprendre.membre (id, compte_id, etablissement_id, role)
       VALUES ($1, $2, $3, $4)`,
      [id === e.enseignantId ? membreEnsId : suivant(), id, e.id, role],
    )
  }

  // Le diplôme est national ; l'offre le rattache à l'établissement.
  await bd.prepare(
    `INSERT INTO raai_apprendre_ref.diplome (id, code, intitule, ministere, niveau_europeen, filiere)
     VALUES ($1, $2, 'Bac Pro Agroéquipement', 'MASA', 4, 'agroequipement')`,
    [diplomeId, `BACPRO-AE-${uai}`],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre_ref.niveau (id, diplome_id, code, intitule, ordre)
     VALUES ($1, $2, 'TERM', 'Terminale', 3)`,
    [niveauId, diplomeId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.offre_formation (id, etablissement_id, diplome_id)
     VALUES ($1, $2, $3)`,
    [offreId, e.id, diplomeId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.annee_scolaire (id, etablissement_id, libelle, debut, fin)
     VALUES ($1, $2, '2026-2027', '2026-09-01', '2027-07-05')`,
    [anneeId, e.id],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.classe
       (id, etablissement_id, offre_id, niveau_id, annee_id, nom, code_rattachement)
     VALUES ($1, $2, $3, $4, $5, 'TAE 2026', $6)`,
    [e.classeId, e.id, offreId, niveauId, anneeId, `TAE-${uai}`],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.affectation (id, membre_id, classe_id)
     VALUES ($1, $2, $3)`,
    [suivant(), membreEnsId, e.classeId],
  )

  // Apprenant en mode minimal : prénom, initiale, identifiant, code haché.
  await bd.prepare(
    `INSERT INTO raai_apprendre.apprenant
       (id, etablissement_id, prenom, initiale_nom, identifiant, code_hash)
     VALUES ($1, $2, 'Léa', 'M', $3, '$2a$10$fauxhashpourletest')`,
    [e.apprenantId, e.id, `lea.${uai}`],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.session_apprenant (jeton, apprenant_id, expire_le)
     VALUES ($1, $2, now() + interval '30 days')`,
    [e.jetonApprenant, e.apprenantId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.inscription
       (id, apprenant_id, classe_id, etablissement_id, debut, statut)
     VALUES ($1, $2, $3, $4, '2026-09-01', 'active')`,
    [inscriptionId, e.apprenantId, e.classeId, e.id],
  )

  // Contenu.
  await bd.prepare(
    `INSERT INTO raai_apprendre.matiere (id, etablissement_id, code, intitule)
     VALUES ($1, $2, 'HYDRO', 'Hydraulique')`,
    [matiereId, e.id],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.module_formation (id, matiere_id, code, intitule, ordre)
     VALUES ($1, $2, 'MP7', 'Technologies des équipements', 1)`,
    [moduleId, matiereId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.chapitre (id, module_id, titre, ordre)
     VALUES ($1, $2, 'Débit et pression', 1)`,
    [chapitreId, moduleId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.lecon (id, chapitre_id, etablissement_id, titre, statut)
     VALUES ($1, $2, $3, 'Le circuit hydraulique', 'publiee')`,
    [e.leconPublieeId, chapitreId, e.id],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.lecon (id, chapitre_id, etablissement_id, titre, statut)
     VALUES ($1, $2, $3, 'Brouillon en cours', 'brouillon')`,
    [e.leconBrouillonId, chapitreId, e.id],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.lien_competence (id, lecon_id, competence_id)
     VALUES ($1, $2, $3)`,
    [suivant(), e.leconPublieeId, competenceId],
  )

  // Évaluation, avec un corrigé qui ne doit jamais atteindre un élève.
  await bd.prepare(
    `INSERT INTO raai_apprendre.evaluation (id, chapitre_id, etablissement_id, titre, type, statut)
     VALUES ($1, $2, $3, 'Quiz hydraulique', 'quiz', 'publiee')`,
    [e.evaluationId, chapitreId, e.id],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.question (id, evaluation_id, type, enonce, corrige, ordre)
     VALUES ($1, $2, 'qcm', 'Quelle est l''unité du débit ?', $3, 1)`,
    [e.questionId, e.evaluationId, JSON.stringify({ bonneReponse: 'L/min' })],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.tentative
       (id, evaluation_id, apprenant_id, etablissement_id, statut, score, score_max)
     VALUES ($1, $2, $3, $4, 'corrigee', 8, 10)`,
    [e.tentativeId, e.evaluationId, e.apprenantId, e.id],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.acquis_competence
       (id, apprenant_id, competence_id, version_referentiel_id, etablissement_id,
        niveau, origine)
     VALUES ($1, $2, $3, $4, $5, 'acquise', 'evaluation')`,
    [e.acquisId, e.apprenantId, competenceId, versionId, e.id],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.score_jeu
       (id, apprenant_id, etablissement_id, jeu, score, score_max, part)
     VALUES ($1, $2, $3, 'quiz-hydraulique-tracteur', 8, 10, 0.8)`,
    [e.scoreJeuId, e.apprenantId, e.id],
  )

  return e
}

export async function semer(bd: BaseDeTest): Promise<JeuDeDonnees> {
  compteur = 1

  const paysId = suivant()
  const academieId = suivant()
  const adminNationalId = suivant()
  const diplomeRefId = suivant()
  const versionId = suivant()
  const competenceId = suivant()
  const sousCompetenceId = suivant()

  await bd.prepare(
    `INSERT INTO raai_apprendre.pays (id, code, nom) VALUES ($1, 'FR', 'France')`,
    [paysId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.academie (id, pays_id, code, nom)
     VALUES ($1, $2, 'TOULOUSE', 'Toulouse')`,
    [academieId, paysId],
  )

  await bd.prepare(
    `INSERT INTO raai_apprendre.compte (id, email, prenom) VALUES ($1, 'national@test.fr', 'Nat')`,
    [adminNationalId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre.membre (id, compte_id, role) VALUES ($1, $2, 'admin_national')`,
    [suivant(), adminNationalId],
  )

  // Référentiel national partagé : aucun etablissement_id ici.
  await bd.prepare(
    `INSERT INTO raai_apprendre_ref.diplome (id, code, intitule, ministere, niveau_europeen, filiere)
     VALUES ($1, 'BACPRO-AE', 'Bac Pro Agroéquipement', 'MASA', 4, 'agroequipement')`,
    [diplomeRefId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre_ref.version_referentiel
       (id, diplome_id, reference_arrete, entree_en_vigueur, statut)
     VALUES ($1, $2, 'Arrêté du 21 mars 2023', '2023-09-01', 'publie')`,
    [versionId, diplomeRefId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre_ref.competence (id, version_id, code, code_bloc, intitule, ordre)
     VALUES ($1, $2, 'C5', 'B5',
             'Choisir un équipement adapté à un contexte en lien avec les transitions', 5)`,
    [competenceId, versionId],
  )
  await bd.prepare(
    `INSERT INTO raai_apprendre_ref.competence
       (id, version_id, code, intitule, parent_id, ordre)
     VALUES ($1, $2, 'C5.1',
             'Identifier les éléments d''un contexte professionnel', $3, 1)`,
    [sousCompetenceId, versionId, competenceId],
  )

  const a = await creerEtablissement(bd, academieId, versionId, competenceId, 'MFR Escatalens', '0820001A')
  const b = await creerEtablissement(bd, academieId, versionId, competenceId, 'MFR Moissac', '0820002B')

  return { a, b, adminNationalId, competenceId, versionId }
}
