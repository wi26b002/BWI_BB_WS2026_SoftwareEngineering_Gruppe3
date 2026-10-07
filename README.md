# CampusRoute – Aufgaben- und Routenplaner

## Projektidee

CampusRoute ist eine Web-Anwendung für Studierende. Die Anwendung lädt Aufgaben aus einer JSON-Datei, zeigt sie übersichtlich an und plant eine sinnvolle Reihenfolge für ausgewählte Aufgaben rund um die FH Technikum Wien.

Der Benutzer kann:

- Aufgaben aus einer JSON-Datei ansehen,
- Aufgaben suchen, filtern und sortieren,
- mehrere sichtbare Aufgaben gesammelt für eine Route auswählen,
- entweder die FH Technikum Wien oder den eigenen Browser-Standort als Startpunkt verwenden,
- eine Startzeit festlegen,
- zwischen **Zu Fuß, Fahrrad, Auto und Öffis** wählen,
- eine optimierte Reihenfolge berechnen lassen,
- Strecke, Wegzeit und ungefähre Ankunftszeiten sehen,
- die Route auf einer interaktiven Karte anzeigen,
- Aufgaben von **Geplant → Auf dem Weg → Erledigt** weiterführen,
- Status und Auswahl im Browser speichern,
- ausführliche Detailinformationen zu einer Aufgabe öffnen.

## Verwendete Technologien

- **HTML** – Aufbau der Benutzeroberfläche
- **Tailwind CSS** – Gestaltung und responsives Layout
- **Vanilla JavaScript** – Logik der Anwendung
- **JSON** – Speicherung der Aufgabendaten
- **Leaflet** – Darstellung der interaktiven Karte
- **OpenStreetMap** – Kartendaten
- **Valhalla** – Berechnung von Wegen und Fahrzeiten

Es werden **kein Framework, kein npm, keine Datenbank und kein eigener Backend-Server** benötigt.

## Die drei logischen Schichten

### 1. Darstellungsschicht

Die Darstellungsschicht ist das, was der Benutzer sieht und bedient.

Bei CampusRoute sind das:

- Aufgabenübersicht
- Routenplaner
- Detailansicht
- Karte
- Buttons, Auswahlfelder und Statusanzeigen

Sie befindet sich hauptsächlich in `index.html`.

### 2. Logikschicht

Die Logikschicht verarbeitet die Daten.

Wichtige Funktionen sind zum Beispiel:

- `calculateDistance()` – berechnet eine direkte Entfernung mit der Haversine-Formel
- `findNearestTask()` – sucht die nächste passende Aufgabe
- `optimizeRoute()` – lokale Ersatzberechnung
- `optimizeNetworkRoute()` – optimiert die Route mit echten Wegzeiten
- `planRoute()` – verbindet Eingabe, Algorithmus und Ausgabe

### 3. Datenschicht

Die Aufgabendaten liegen in:

`campus_tasks.json`

Jede Aufgabe enthält zum Beispiel:

- ID
- Titel
- Beschreibung
- Koordinaten
- Kategorie
- Priorität
- Dauer
- Status
- optional eine Datei

## Wie funktioniert der Algorithmus?

CampusRoute verwendet einen **Greedy-/Nearest-Neighbour-Ansatz**.

Vereinfacht:

1. Startpunkt ist die FH Technikum Wien.
2. Alle ausgewählten und noch offenen Aufgaben werden betrachtet.
3. Für das gewählte Verkehrsmittel werden Wegzeiten zwischen den Standorten berechnet.
4. Die aktuell am schnellsten erreichbare Aufgabe wird als nächster Stopp gewählt.
5. Dieser Standort wird zum neuen Ausgangspunkt.
6. Der Vorgang wird wiederholt, bis alle ausgewählten Aufgaben eingeplant sind.

Der Algorithmus ist einfach und gut nachvollziehbar. Er liefert eine sinnvolle Route, garantiert aber nicht mathematisch die weltweit kürzestmögliche Gesamtroute.

### Warum gibt es zusätzlich die Haversine-Formel?

Die Haversine-Funktion berechnet die direkte Entfernung zwischen zwei geografischen Koordinaten.

Sie wird:

- in den Tests geprüft,
- als lokale Ersatzberechnung verwendet, falls der Online-Routendienst nicht erreichbar ist.

## Verkehrsmittel

CampusRoute unterstützt:

- 🚶 Zu Fuß
- 🚲 Fahrrad
- 🚗 Auto
- 🚇 Öffis

Für **Zu Fuß, Fahrrad und Auto** wird die Stoppreihenfolge anhand der berechneten Wegzeiten optimiert.

Bei **Öffis** wird die Reihenfolge näherungsweise über die Erreichbarkeit zu Fuß bestimmt. Die einzelnen Strecken werden anschließend multimodal berechnet.

## Backend

CampusRoute hat **kein eigenes Backend**.

Der lokale HTTP-Server dient nur dazu, die statischen Dateien auszuliefern, damit der Browser die JSON-Datei laden kann.

Das bedeutet:

- keine Datenbank,
- keine Benutzerkonten auf einem Server,
- keine serverseitige Geschäftslogik.

Statusänderungen und die aktuelle Routenauswahl werden mit `localStorage` im Browser gespeichert und bleiben daher auch nach einem Neuladen erhalten. Es gibt trotzdem keine zentrale Datenbank und keine Synchronisation zwischen verschiedenen Geräten.

## Anwendung starten

### Variante 1 – Visual Studio Code mit Live Server

1. Projektordner in Visual Studio Code öffnen.
2. Die Erweiterung **Live Server** verwenden.
3. `index.html` mit Live Server öffnen.

### Variante 2 – Python

Im Projektordner:

```bash
python3 -m http.server 3000
```

Danach im Browser öffnen:

```text
http://localhost:3000
```

Die Anwendung sollte nicht direkt über `file://` geöffnet werden, weil sonst das Laden von `campus_tasks.json` blockiert werden kann.

Für Karte und Online-Routenberechnung ist eine Internetverbindung notwendig.

## Tests ausführen

Über denselben lokalen Server öffnen:

```text
http://localhost:3000/tests.html
```

Die Testseite prüft sieben Fälle:

1. Identische Koordinaten ergeben ungefähr 0 km.
2. Entfernung A → B entspricht B → A.
3. Die nächstgelegene Aufgabe wird erkannt.
4. Eine Route mit genau einer Aufgabe funktioniert.
5. Erledigte Aufgaben werden ausgeschlossen.
6. Eine leere Aufgabenliste verursacht keinen Absturz.
7. Ungültige Koordinaten werden sicher behandelt.

Das erwartete Ergebnis ist:

```text
7 Tests · 7 bestanden · 0 fehlgeschlagen
```

## Bekannte Einschränkungen

- Der Greedy-Algorithmus garantiert nicht die global optimale Route.
- Priorität und Deadline beeinflussen die Routenreihenfolge derzeit nicht.
- Status und Auswahl werden nur lokal im jeweiligen Browser gespeichert; es gibt keine Synchronisation zwischen Geräten.
- Es wird kein Rückweg zum Startpunkt berechnet.
- Die Online-Routenberechnung benötigt Internetzugang.
- Der verwendete öffentliche Valhalla-Dienst ist ein externer Dienst und kann zeitweise nicht erreichbar sein. In diesem Fall verwendet CampusRoute automatisch die lokale Ersatzberechnung.

## Kurz erklärt für die Präsentation

**Was macht CampusRoute?**  
CampusRoute lädt Aufgaben aus JSON und plant eine sinnvolle Reihenfolge für mehrere Standorte.

**Wo sind die drei Schichten?**  
Darstellung = HTML/Tailwind/Leaflet, Logik = JavaScript-Algorithmen, Daten = `campus_tasks.json`.

**Gibt es ein Backend?**  
Nein. Die Anwendung läuft vollständig im Browser. Der lokale Server liefert nur Dateien aus.

**Was ist unser eigener Algorithmus?**  
Ein Greedy-/Nearest-Neighbour-Algorithmus: Von der aktuellen Position wird immer die am besten erreichbare nächste Aufgabe gewählt.

**Was machen Leaflet und Valhalla?**  
Leaflet zeigt die Karte. Valhalla liefert Wegstrecken und Wegzeiten. Die Reihenfolge der Aufgaben wird weiterhin von unserer JavaScript-Logik bestimmt.

**Wie haben wir getestet?**  
Mit einer eigenen Browser-Testseite `tests.html` und sieben definierten Testfällen für die Kernfunktionen.


## UX-Funktionen

Für eine alltagstauglichere Nutzung wurden zusätzlich folgende Funktionen umgesetzt:

- responsive Desktop- und Mobile-Ansicht,
- Suche über Titel, Beschreibung, Kategorie, Ort und Status,
- Filter nach Kategorie und Status,
- Sortierung nach Deadline, Priorität oder Titel,
- Sammelauswahl der sichtbaren Aufgaben,
- aktueller Browser-Standort als optionaler Startpunkt,
- lokale Speicherung von Status und Routenauswahl,
- realistische Detailansicht mit Ort, Deadline, Priorität, Dauer und Status,
- Status-Workflow von „Geplant“ über „Auf dem Weg“ bis „Erledigt“.
