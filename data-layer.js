// DATA LAYER = DATEN-EBENE
// Diese Datei kümmert sich nur darum, Daten zu laden oder zu speichern.
// Sie entscheidet NICHT, welche Route die beste ist, und sie verändert auch keine HTML-Elemente.

window.CampusRouteData = (function () {
  'use strict';

  // Unter diesem Namen merkt sich der Browser unsere lokalen Änderungen.
  // So bleiben z. B. Status und eigene Aufgaben nach einem Neuladen erhalten.
  const storageKey = 'campusroute-state-v2';

  // Das ist die Internet-Adresse des öffentlichen Routing-Dienstes Valhalla.
  // Von dort bekommen wir echte Wegstrecken und Wegzeiten.
  const routingApiBase = 'https://valhalla1.openstreetmap.de';

  // Hier merken wir uns bereits geladene Routing-Antworten.
  // Wenn dieselbe Anfrage noch einmal kommt, müssen wir sie nicht erneut aus dem Internet laden.
  const routingCache = new Map();

  // Lädt unsere mitgelieferte JSON-Datei mit den Aufgaben.
  async function loadTasks() {
    // fetch() lädt die Datei genauso, wie ein Browser eine Webseite laden würde.
    const response = await fetch('./campus_tasks.json');

    // Falls die Datei nicht gefunden wurde oder ein anderer Fehler auftritt,
    // brechen wir mit einer verständlichen Fehlermeldung ab.
    if (!response.ok) {
      throw new Error('HTTP Status ' + response.status + ' beim Laden der JSON-Datei');
    }

    // Die geladene JSON-Datei wird in normale JavaScript-Daten umgewandelt.
    const tasks = await response.json();

    // Wir erwarten eine Liste von Aufgaben. Wenn keine Liste kommt, stimmt die Datei nicht.
    if (!Array.isArray(tasks)) {
      throw new Error('Die JSON-Datei muss eine Aufgabenliste enthalten.');
    }

    return tasks;
  }

  // Liest den zuletzt gespeicherten Zustand aus dem Browser.
  function loadState() {
    try {
      // Wenn noch nichts gespeichert wurde, verwenden wir einfach ein leeres Objekt.
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (_) {
      // Falls kaputte Daten gespeichert wurden, soll die App trotzdem weiterlaufen.
      return {};
    }
  }

  // Speichert den aktuellen Zustand im Browser.
  function saveState(state) {
    try {
      // JavaScript-Daten werden zuerst in Text umgewandelt und dann gespeichert.
      localStorage.setItem(storageKey, JSON.stringify(state));
      return true;
    } catch (_) {
      // false bedeutet: Speichern hat nicht funktioniert.
      return false;
    }
  }

  // Baut aus dem gewünschten Valhalla-Bereich und unseren Daten eine vollständige Internet-Adresse.
  function buildRoutingUrl(action, payload) {
    return routingApiBase + action + '?json=' + encodeURIComponent(JSON.stringify(payload));
  }

  // Schickt eine Anfrage an Valhalla und gibt die Antwort zurück.
  async function requestRouting(action, payload) {
    // Diese Zeichenkette beschreibt die Anfrage eindeutig.
    const cacheKey = action + '|' + JSON.stringify(payload);

    // Falls wir genau diese Antwort schon haben, verwenden wir sie sofort wieder.
    if (routingCache.has(cacheKey)) {
      return routingCache.get(cacheKey);
    }

    // Anfrage an den Routing-Dienst senden.
    const response = await fetch(buildRoutingUrl(action, payload));

    // Bei einem Fehler versuchen wir, eine hilfreiche Meldung vom Dienst auszulesen.
    if (!response.ok) {
      let message = 'HTTP ' + response.status;
      try {
        const errorData = await response.json();
        message = errorData.error || errorData.status_message || message;
      } catch (_) {
        // Wenn keine zusätzliche Fehlermeldung gelesen werden kann,
        // bleibt einfach die HTTP-Nummer als Meldung stehen.
      }
      throw new Error(message);
    }

    // Erfolgreiche Antwort in JavaScript-Daten umwandeln.
    const data = await response.json();

    // Antwort merken, damit dieselbe Anfrage später schneller ist.
    routingCache.set(cacheKey, data);

    return data;
  }

  // Nur diese Funktionen dürfen von den anderen Dateien verwendet werden.
  // Alles andere bleibt innerhalb der Data Layer.
  return {
    storageKey: storageKey,
    loadTasks: loadTasks,
    loadState: loadState,
    saveState: saveState,
    requestRouting: requestRouting
  };
})();
