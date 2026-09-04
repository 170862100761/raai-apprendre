'use client'

import type { Jeu as DonneesJeu } from './types'
import { Association } from './association'
import { JeuChrono } from './chrono'
import { Memory } from './memory'
import { QuizEclair } from './quiz-eclair'
import { VraiFaux } from './vrai-faux'

/** Aiguille vers la mécanique. Le type discriminé rend le `switch` exhaustif. */
export function Jeu({ jeu }: { jeu: DonneesJeu }) {
  switch (jeu.mecanique) {
    case 'quiz':
      return <QuizEclair cle={jeu.cle} questions={jeu.donnees.questions} />
    case 'vraifaux':
      return <VraiFaux cle={jeu.cle} affirmations={jeu.donnees.statements} />
    case 'memory':
      return <Memory cle={jeu.cle} paires={jeu.donnees.pairs} />
    case 'assoc':
      return <Association cle={jeu.cle} banque={jeu.donnees.bank} />
    case 'chrono':
      return (
        <JeuChrono
          cle={jeu.cle}
          titre={jeu.chrono.titre}
          consigne={jeu.chrono.consigne}
          duree={jeu.chrono.duree}
          questions={jeu.donnees.questions}
        />
      )
  }
}
