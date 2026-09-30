import { Badge } from '../../ui/index.ts'
import s from '../Noten.module.css'

export type NormEintrag = {
  label: string
  wert: string
  regel: string
  status: 'erfuellt' | 'nicht_erfuellt' | 'offen'
}

const STATUS = {
  erfuellt: { tone: 'erledigt', text: 'erfüllt' },
  nicht_erfuellt: { tone: 'warn', text: 'nicht erfüllt' },
  offen: { tone: 'neutral', text: 'offen' },
} as const

/** Kompakte Liste von Bestehens-/Promotionsbedingungen mit Status. */
export function NormListe({ eintraege }: { eintraege: NormEintrag[] }) {
  return (
    <div className={s.normListe}>
      {eintraege.map((e) => (
        <div key={e.label} className={s.norm}>
          <span className={s.normLabel}>{e.label}</span>
          <span className={s.normWert}>{e.wert}</span>
          <span className={s.normRegel}>{e.regel}</span>
          <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].text}</Badge>
        </div>
      ))}
    </div>
  )
}
