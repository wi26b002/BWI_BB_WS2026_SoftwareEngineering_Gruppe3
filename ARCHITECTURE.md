# CampusRoute - Drei-Ebenen-Architektur

CampusRoute verwendet eine klassische Drei-Ebenen-Aufteilung.

## 1. Presentation Layer

**Dateien:** `index.html`, `presentation-layer.js`

Aufgabe:
- Benutzeroberfläche darstellen
- Eingaben lesen
- Aufgaben/Karte/Route rendern
- Benutzeraktionen an die Business Layer weitergeben

Beispiele:
- `renderTasks()`
- `renderRoute()`
- `showTaskDetail()`
- `switchScreen()`

## 2. Business Layer

**Datei:** `business-layer.js`

Aufgabe:
- Fachlogik und Regeln der Anwendung
- keine direkte DOM-Manipulation

Beispiele:
- `calculateDistance()`
- `findNearestTask()`
- `optimizeRoute()`
- `optimizeNetworkRoute()`
- `nextTaskStatus()`

## 3. Data Layer

**Dateien:** `data-layer.js`, `campus_tasks.json`

Aufgabe:
- Daten laden und speichern
- externe Routingdaten abrufen
- Browserzustand über localStorage sichern

Beispiele:
- `loadTasks()`
- `loadState()`
- `saveState()`
- `requestRouting()`

## Datenfluss

```text
campus_tasks.json / localStorage / Valhalla
                 |
             Data Layer
                 |
           Business Layer
                 |
        Presentation Layer
                 |
              Benutzer
```

## Backend

CampusRoute hat kein eigenes Backend.

Der lokale HTTP-Server stellt nur die statischen Dateien bereit. Die Anwendung läuft im Browser. Externe Wegdaten werden über Valhalla abgefragt.
