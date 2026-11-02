# Design system: Bumper

Der Look der App heisst **Bumper**: wie Wettkampf-Hantelscheiben, mit kräftigen Konturen, harten Schatten und Farben nach Gewicht. Dunkel ist Standard, hell folgt der Systemeinstellung oder der Wahl im Profil-Menü.

Die Tokens leben in `artifacts/gym-tracker/src/index.css` (`--bp-*`), die Bausteine in `artifacts/gym-tracker/src/components/bumper.tsx`. Die visuelle Referenz ist das Design-System-Artifact «Gym Tracker» in claude.ai.

## Regeln für Texte

- UI-Texte auf **Englisch**, kurz, Verb zuerst: *Start workout*, *Save set*, *Finish*. Nie *OK* oder *Submit*.
- **Sentence case** überall. Keine Grossbuchstaben als Stilmittel (`uppercase` ist tabu).
- **Keine langen Bindestriche (—) und keine Trennpunkte (·)** im UI. Zwei Angaben in zwei Zeilen oder mit Wörtern verbinden: «Target 3 × 8 at 50 kg».
- Nur metrische Einheiten. Gewichte mit höchstens zwei Nachkommastellen (`52.5`, `1.25`).
- Sätze als `52.5 × 8`, Körpergewicht `BW × 4`, ohne Gewicht `8 reps`.
- Schätzungen benennen (`e1RM`, Epley), nie als Bestwert ausgeben.
- Keine Emojis, keine Ausrufezeichen, kein leeres Lob.

## Farben

| Token | Dark | Light | Verwendung |
|---|---|---|---|
| `bp-bg` | `#111111` | `#f3f3f0` | Seitenhintergrund |
| `bp-surface` | `#1c1c1c` | `#ffffff` | Karten, Sheets, Navigation |
| `bp-surface-2` | `#2a2a2a` | `#ececea` | Stepper-Tasten, leere Wochentage |
| `bp-outline` | `#f5f5f5` | `#111111` | 2px-Kontur auf allem |
| `bp-ink` | `#f5f5f5` | `#111111` | Text |
| `bp-muted` | `#b3b3b3` | `#4d4d4d` | Sekundärtext |
| `bp-brand` | `#ffd60a` | `#ffd60a` | Die eine Aktionsfarbe (15-kg-Scheibe), nur als Fläche |
| `bp-on-brand` | `#111111` | `#111111` | Text auf Gelb |
| `bp-brand-ink` | `#ffd60a` | `#1d4ed8` | Farbiger Text (Gelb ist auf hell nicht lesbar) |
| `bp-done` | `#14402a` | `#c8f2d2` | Erledigte Sätze, Tipps |
| `bp-data-2` | `#3b6cf0` | `#1d4ed8` | Zweite Datenreihe, weisser Text |
| `bp-warn` / `bp-warn-soft` | `#ff8a8a` / `#3a1416` | `#b3141a` / `#ffd9d6` | Hinweise, Löschen |
| `plate-25/20/15/10/5/change` | rot, blau, gelb, grün, weiss, chrom | gleich | Nur in der Scheiben-Anzeige und als Datums-Kachel im Verlauf |

Alle Text-Paare erreichen 4.5:1, Konturen und Diagrammfarben 3:1.

## Form

- **Konturen tragen die Form:** `border-2 border-bp-outline` auf Karten, Buttons, Zellen, Scheiben.
- **Harte Schatten:** Karten mit Fokus und die Hauptaktion `shadow-hard` (4px Versatz, im Dunkeln gelb), Buttons `shadow-hard-sm`. Mit `press` fällt der Schatten beim Drücken weg und das Element rückt nach.
- Radien: Zellen und Buttons 10px, Karten und Hauptaktion 14px, Sheets 20px oben.
- Touch-Ziele mindestens 44px, Stepper und Zellen 48px, Hauptaktion 56px.

## Schrift

- **Bricolage Grotesque** 800 für Titel, Übungsnamen und die Hauptaktion.
- **DM Sans** für alles andere, Zahlen immer mit `tabular` (gleich breite Ziffern). Keine Monospace-Schrift.

## Muster

- Eine gelbe Hauptaktion pro Screen, unten und mit dem Daumen erreichbar.
- Während einer Session keine Navigation, kein Pausen-Timer. Oben Zeit und *Finish*.
- Supersets erscheinen als eine Karte, die Hauptaktion nennt die nächste Übung.
- Nach jedem Satz die optionale Einschätzung *Too easy*, *Just right*, *Too hard*; daraus der Vorschlag für den nächsten Satz.
