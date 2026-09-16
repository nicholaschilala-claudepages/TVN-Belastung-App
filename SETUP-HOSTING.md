# App online stellen

Diese App nutzt **dasselbe Firebase-Projekt** wie die Spielstatistik-App –
du musst dort nichts neu einrichten (kein neues Projekt, keine neuen
Sicherheitsregeln). Der Kader (Spielernamen) wird automatisch von dort
übernommen, sobald ein Gerät einmal online war.

## Ganz einfache Anleitung (GitHub Pages)

1. Gehe zu [github.com](https://github.com) und melde dich an.
2. Klicke oben rechts auf **"+"** → **"New repository"**.
3. Name z. B. `TVN-Belastung-App`, Sichtbarkeit **Public**, dann
   **"Create repository"**.
4. Klicke auf **"uploading an existing file"**.
5. Zieh **alle Dateien und Ordner aus diesem Paket** (also `index.html`,
   `style.css`, `app.js`, `manifest.webmanifest`, `sw.js`, den ganzen
   Ordner `lib`, den ganzen Ordner `icons`) in das Upload-Feld – ziehe
   dabei wirklich die ganzen Ordner `lib` und `icons`, nicht nur die
   Dateien darin.
6. Unten auf **"Commit changes"** klicken.
7. Gehe zu **"Settings"** (oben in der Menüleiste des Repos) →
   **"Pages"** (linkes Menü).
8. Unter "Branch" wähle **"main"** und **"/ (root)"**, dann **"Save"**.
9. Nach ca. 1 Minute erscheint oben ein Link wie
   `https://dein-nutzername.github.io/TVN-Belastung-App/` – das ist die
   App-Adresse für alle Geräte (Trainer + Spieler).

## Kurzer Funktionscheck

Öffne den Link einmal mit Internetverbindung. Unten auf dem Startbildschirm
sollte **☁️ "Cloud-Synchronisation aktiv"** stehen. Falls dort
**📴 "Nur lokal gespeichert"** oder **⚠️ "Cloud-Sync-Fehler"** steht, prüf
wie bei der Spielstatistik-App, ob `lib` und `icons` wirklich als Ordner
(nicht als lose Dateien im Hauptverzeichnis) im Repository liegen.

## Wichtig zu wissen

- **PIN ist kein echter Passwortschutz**, sondern verhindert nur
  versehentliche Fehleingaben – wie bei der Spielstatistik-App gilt: jeder
  mit Zugriff auf den App-Link könnte sich technisch auch ohne PIN Zugriff
  verschaffen. Für ein internes Team-Tool ist das ausreichend.
- Neue Spieler werden weiterhin über die **Spielstatistik-App** im
  Kader-Bereich angelegt – diese App liest den Kader nur mit, verändert ihn
  nicht.
- Die App funktioniert komplett offline; neue Einträge synchronisieren sich
  automatisch, sobald wieder Internet da ist.
