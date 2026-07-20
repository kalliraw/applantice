# Design – Mint-Palette (hell)

**Grundmodus: Light.** Heller, leicht mint-getönter Hintergrund; **Mint** ist der klare
Kontrast-/Akzentton für Buttons, Links, aktive Nav-Elemente und Highlights. Kein
Corporate-Design-Zwang mehr – die frühere Swiss-TPH-Indigo/Dark-Vorgabe ist bewusst
abgelöst (Entscheidung Isaak). Ampelfarben (Rot/Grün) werden nicht als Gestaltungsmittel
eingesetzt; für Status genügt die Mint-Sättigung. Ein einzelnes funktionales **Amber**
ist für Warnungen erlaubt (ausserhalb der Mint-Palette, nur zur Klarheit).

Design-Tokens als CSS-Variablen (`frontend/src/styles/tokens.css`), keine Hex-Werte im
Code verstreuen.

## Palette

```css
:root {
  /* Hintergrund & Oberflächen */
  --bg:        #f5f8f7;   /* Section – App-Canvas */
  --surface:   #ffffff;   /* Page/Card – Karten, Panels */
  --surface-2: #eaf0ee;   /* Card/Panel-Ton – zarte Füllung, Inputs, Hover */
  --surface-3: #dce4e1;   /* stärkerer Hover */
  --border:    #dce4e1;   /* Border / Divider */

  /* Mint – Kontrastfarbe */
  --mint-100:  #e3f6f1;   /* zarte Flächen (accent-soft) */
  --mint-300:  #8fe3d2;   /* Highlights */
  --mint-500:  #2fc3a6;   /* Primary (Buttons, Akzent) */
  --mint-700:  #1b8f79;   /* Hover / Links */
  --mint-900:  #0f5a4c;   /* Text/Icons auf Mint */

  /* Text */
  --text:   #16211f;      /* Überschrift / Primary */
  --text-2: #54615e;      /* Fliesstext / Secondary */
  --text-3: #93a19d;      /* Hinweistext / Muted */
}
```

## Anwendungsregeln

- **Heller Hintergrund** (`--bg`), **weisse Karten** (`--surface`) mit dünnem Border –
  ruhig, nicht überladen.
- **Mint** als Akzent: Primary-Button = Verlauf Mint 500 → 700 mit weisser Schrift;
  Sekundär-Button = weiss mit Mint-Text/-Border; Links & aktive Icons in Mint 700
  (`--accent-bright`), damit der Kontrast auf Hell stimmt. Mint 500 wird für Flächen/Fills
  genutzt, Mint 700/900 für Text auf Hell.
- **Text**: Überschrift `--text`, Fliesstext `--text-2`, Hinweise `--text-3`.
- **Warnung/Unvollständig** (z.B. Modul-Gewichtssumme ≠ 100 %, „ohne Rolle", lokaler
  Break-Glass-Account): funktionales **Amber** (`--gelb`/`--fehler-*`), sparsam.
- **Erledigt**: gefülltes Mint (`--erledigt-*`) – Signal über die Füllung, nicht über eine
  zweite Farbe.

## Anwendung auf spezifische UI-Elemente

- Badge „Kanton – offiziell" vs. „Betrieblich": weiterhin klar unterscheidbar – Kanton in
  Mint-Ton (`--kanton-*`), Betrieblich neutral/grau (`--betrieb-*`).
- 3-Stufen-Raster (Erklärt/Geübt/Selbstständig): progressiv über **Mint-Sättigung**
  (`--stufe-1` hell → `--stufe-3` dunkel), keine Ampelfarben.
- Mail-Templates (`mail-templates/`) verwenden denselben Mint-Akzent (Kopf/Buttons), damit
  App und Benachrichtigungen konsistent wirken.
