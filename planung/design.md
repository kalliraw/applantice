# Corporate Design (Swiss TPH)

**Grundmodus: Dark Mode.** Die App ist grundsätzlich dunkel gehalten (IT-affine
Zielgruppe). Kontrast wird über die hellen Indigo-Töne geschaffen, nicht über
Rot/Grün/Ampelfarben. Ausserhalb von Dark Mode + Markenfarben ist das Design bewusst
offen – Isaak legt sich hier nicht fest. Ein modernes UI-Framework/-Look ist erwünscht;
siehe die Spannung dazu in `techstack.md` (Abschnitt Frontend), die Claude Code beim
Bauen auflöst.

Design-Tokens als CSS-Variablen anlegen, nicht einzelne Hex-Werte im Code verstreuen.

```css
:root {
  /* Primärfarbe: Indigo – im Dark Mode die Kontrast-/Highlight-Farbe schlechthin:
     Headings, aktive Nav-Elemente, zentrale Highlights */
  --farbe-indigo: #432ca1;
  --farbe-indigo-60: #8e80c6;   /* helle Highlights, aktive Icons, Chart-Akzente auf Dunkel */
  --farbe-indigo-40: #b3aad9;
  --farbe-indigo-20: #d9d4ec;   /* höchster Kontrast auf dunklem Grund: Fliesstext-Highlights */

  /* Sekundärfarben */
  --farbe-weiss: #ffffff;        /* Fliesstext auf dunklem Grund */
  --farbe-schwarz: #000000;      /* Basis für dunkle Flächen/Hintergründe im Dark Mode */
  --farbe-schwarz-60: #666666;   /* Sekundärtext auf Dunkel: Captions, Footnotes */
  --farbe-schwarz-20: #cccccc;   /* dezente Trenner/Icons auf Dunkel */

  /* Akzentfarbe: Gelb – in kleinen Dosen, wirkt auf dunklem Grund besonders stark */
  --farbe-gelb: #dde24a;
  --farbe-gelb-60: #eaed93;      /* kleine Highlights, Infografik-Akzente */
  --farbe-gelb-20: #f8f9da;      /* nur für seltene helle Flächen auf Dunkel */
}
```

Für konkrete dunkle Flächen-Abstufungen (App-Hintergrund vs. erhöhte Panels/Cards vs.
Hover-Zustände) reichen `--farbe-schwarz` allein nicht – hier braucht es zusätzliche,
leicht indigo-getönte Dunkelgrau-Stufen (z.B. `#0d0b14`, `#171325`), die Isaak nicht
festgelegt hat. Claude Code kann diese beim Bauen frei ergänzen, solange sie sich klar
von den Marken-Tokens oben unterscheiden lassen (z.B. Präfix `--flaeche-*` statt
`--farbe-*`).

## Anwendungsregeln

- **Dark Mode ist der Grundmodus** der App – dunkler Hintergrund, keine helle
  Standardansicht.
- **Indigo** (`--farbe-indigo` und helle Varianten) schafft auf dem dunklen Grund den
  Kontrast: Headings, Navigations-Branding, zentrale CTAs/Highlights.
- **Weiss/helles Schwarz** (`--farbe-weiss`, `--farbe-schwarz-20`) für Fliesstext auf
  dunklem Grund – hält Text lesbar und lässt Indigo seine Wirkung als Highlight-Farbe
  behalten.
- **Gelb** nur für kleine Akzente (z.B. Status-Badges, kleine Hervorhebungen), nie
  flächig einsetzen – wirkt auf Dunkel besonders stark, daher sparsam verwenden.

## Anwendung auf spezifische UI-Elemente

- Badge "Kanton – offiziell" (schreibgeschützte Handlungskompetenzen) und Badge
  "Betrieblich" (vom Berufsbildner hinzugefügt) sollen visuell klar unterscheidbar
  sein – z.B. Indigo-Ton für offiziell, neutraler Schwarz-20-Hintergrund für
  betrieblich (siehe `roles.md` für den fachlichen Hintergrund dieser Unterscheidung).
- Statusanzeigen für das 3-Stufen-Raster (Erklärt/Geübt/Selbstständig, siehe
  `featurematrix.md`) sollten progressiv unterscheidbar sein (z.B. über Sättigung/Ton
  von Indigo), nicht über Ampelfarben (Rot/Grün), da Gelb die einzige definierte
  Akzentfarbe ist und Rot/Grün nicht Teil der Palette sind.
