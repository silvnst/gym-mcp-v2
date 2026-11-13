# Design system: Bumper

Der Look der App heisst **Bumper**: wie Wettkampf-Hantelscheiben, mit kräftigen Konturen, harten Schatten und Farben nach Gewicht. Seit November 2026 gilt die leise Variante: Kontur und Schatten gehören nur noch zu dem, was man antippen kann, alles andere ist ruhige Fläche. Dunkel ist Standard, hell folgt der Systemeinstellung oder der Wahl im Profil-Menü.

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
| `bp-outline` | `#f5f5f5` | `#111111` | 2px-Kontur auf Bedienelementen |
| `bp-line` | `#333333` | `#dededa` | 1px-Trennlinie zwischen Zeilen und über der Navigation |
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

- **Kontur heisst antippbar:** `border-2 border-bp-outline` nur auf Buttons, Chips, Eingabefeldern und dem gerade aktiven Satz. Karten, Kacheln, Listenzeilen, Hinweise und Sheets sind Flächen in `bp-surface` ohne Rand.
- **Ein harter Schatten pro Screen:** nur die gelbe Hauptaktion trägt `shadow-hard-ink` (kleine gelbe Buttons `shadow-hard-sm`). Mit `press` fällt der Schatten beim Drücken weg und das Element rückt nach. Karten haben keinen Schatten.
- Symbol-Buttons ohne Text sind gefüllte Flächen in `bp-surface-2`, ohne Kontur.
- Trennen mit Abstand, sonst mit `border-bp-line` (1px). Keine 2px-Linien unter Kopfzeilen oder über der Navigation.
- Radien: Zellen und Buttons 10px, Karten und Hauptaktion 14px, Sheets 20px oben.
- Touch-Ziele mindestens 44px, Stepper und Zellen 48px, Hauptaktion 56px.

## Schrift

- **Bricolage Grotesque** 800 für Titel, Übungsnamen und die Hauptaktion.
- **DM Sans** für alles andere, Zahlen immer mit `tabular` (gleich breite Ziffern). Keine Monospace-Schrift.

## Muster

- Eine gelbe Hauptaktion pro Screen, unten und mit dem Daumen erreichbar.
- Während einer Session keine Navigation, kein Pausen-Timer. Oben Zeit und *Finish*.
- Supersets laufen rundenweise auf einem Screen: jede Übung der Runde als Karte mit eigenem Gewicht und eigenen Wiederholungen, darunter *Save round*. Übungen ohne Gewicht zeigen nur die Wiederholungen über die ganze Breite.
- Readiness ist eine Zeile mit Farbpunkt; die Details klappen auf. An einem Tag mit Warnung ist sie von Anfang an offen.
- Was getippt, aber noch nicht gespeichert ist, bleibt bei einem Neuladen erhalten.
- Nach jedem Satz die optionale Einschätzung *Too easy*, *Just right*, *Too hard*; daraus der Vorschlag für den nächsten Satz.
