import { Card, PageHeader } from '../ui/index.ts'

export function PlatzhalterPage({ titel }: { titel: string }) {
  return (
    <div>
      <PageHeader eyebrow="In Umsetzung" title={titel} />
      <Card>
        <p className="muted" style={{ margin: 0 }}>
          Diese Funktion wird als nächstes P0-Feature umgesetzt. Das Login- und
          Rollen-Fundament sowie die Design-Basis stehen bereits.
        </p>
      </Card>
    </div>
  )
}
