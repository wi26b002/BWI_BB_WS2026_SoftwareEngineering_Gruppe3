// BUSINESS LAYER = LOGIK-EBENE
// Hier liegen die Regeln und Berechnungen von CampusRoute.
// Diese Datei zeichnet nichts auf dem Bildschirm.
// Sie bekommt Daten, verarbeitet sie und gibt ein Ergebnis zurück.

window.CampusRouteBusiness = (function () {
  'use strict';

  // Standard-Startpunkt: FH Technikum Wien.
  const defaultStart = { latitude: 48.2390, longitude: 16.3777 };

  // Für jedes Verkehrsmittel speichern wir:
  // - den Text für die Oberfläche,
  // - ein Symbol,
  // - und den Namen, den Valhalla für die Berechnung erwartet.
  const travelModes = {
    pedestrian: { label: 'Zu Fuß', icon: '🚶', matrixCosting: 'pedestrian' },
    bicycle: { label: 'Fahrrad', icon: '🚲', matrixCosting: 'bicycle' },
    auto: { label: 'Auto', icon: '🚗', matrixCosting: 'auto' },

    // Öffis sind technisch schwieriger. Für die erste Reihenfolge verwenden wir deshalb
    // die Erreichbarkeit zu Fuß. Beim einzelnen Weg versuchen wir später trotzdem "multimodal".
    multimodal: { label: 'Öffis', icon: '🚇', matrixCosting: 'pedestrian' }
  };

  // Wandelt unsere Text-Priorität in Zahlen um.
  // Das macht Sortieren einfacher: Hoch = 3, Mittel = 2, Niedrig = 1.
  function priorityValue(priority) {
    if (priority === 'High') return 3;
    if (priority === 'Medium') return 2;
    return 1;
  }

  // Prüft, ob eine Aufgabe brauchbare Koordinaten hat.
  function hasValidCoordinates(task) {
    // Breitengrad darf nur zwischen -90 und 90 liegen.
    // Längengrad darf nur zwischen -180 und 180 liegen.
    return Number.isFinite(task.latitude) && Number.isFinite(task.longitude)
      && Math.abs(task.latitude) <= 90 && Math.abs(task.longitude) <= 180;
  }

  // Gibt den nächsten erlaubten Status zurück.
  function nextTaskStatus(status) {
    if (status === 'Geplant') return 'Auf dem Weg';
    if (status === 'Auf dem Weg') return 'Erledigt';

    // Eine erledigte Aufgabe bleibt erledigt.
    return 'Erledigt';
  }

  // Berechnet die direkte Entfernung zwischen zwei Koordinaten.
  // Das ist NICHT die echte Straßenstrecke, sondern die Entfernung auf der Erdkugel.
  function calculateDistance(lat1, lon1, lat2, lon2) {
    // Ungefährer Radius der Erde in Kilometern.
    const earthRadiusKm = 6371;

    // JavaScript rechnet bei Winkel-Funktionen nicht direkt mit Grad.
    // Deshalb wandeln wir Grad zuerst in Bogenmaß um.
    const toRadians = degrees => degrees * Math.PI / 180;

    // Unterschied zwischen den beiden Breitengraden und Längengraden.
    const latitudeDifference = toRadians(lat2 - lat1);
    const longitudeDifference = toRadians(lon2 - lon1);

    // Haversine-Formel:
    // Sie berechnet den Winkel zwischen zwei Punkten auf einer Kugel.
    const a = Math.sin(latitudeDifference / 2) ** 2
      + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
      * Math.sin(longitudeDifference / 2) ** 2;

    const angle = 2 * Math.asin(Math.sqrt(Math.min(1, a)));

    // Winkel * Erdradius ergibt die ungefähre Entfernung in Kilometern.
    return earthRadiusKm * angle;
  }

  // Sucht aus einer Aufgabenliste genau die Aufgabe,
  // die vom aktuellen Punkt am nächsten liegt.
  function findNearestTask(latitude, longitude, tasks) {
    let nearestTask = null;
    let shortestDistance = Infinity;

    // Jede Aufgabe einmal ansehen.
    for (const task of tasks) {
      // Erledigte Aufgaben oder kaputte Koordinaten ignorieren.
      if (task.status === 'Erledigt' || !hasValidCoordinates(task)) continue;

      // Entfernung vom aktuellen Punkt zu dieser Aufgabe berechnen.
      const distance = calculateDistance(latitude, longitude, task.latitude, task.longitude);

      // Wenn diese Aufgabe näher ist als alle bisherigen, merken wir sie uns.
      if (distance < shortestDistance) {
        nearestTask = task;
        shortestDistance = distance;
      }
    }

    return nearestTask;
  }

  // Einfache Ersatz-Routenplanung ohne Internet.
  // Sie nimmt immer die nächste Aufgabe und arbeitet sich so durch die Liste.
  function optimizeRoute(tasks, startMinutes, startPoint = defaultStart) {
    // Nur offene Aufgaben mit gültigen Koordinaten dürfen eingeplant werden.
    let remaining = tasks.filter(task => task.status !== 'Erledigt' && hasValidCoordinates(task));

    // Wir starten am gewählten Startpunkt.
    let latitude = startPoint.latitude;
    let longitude = startPoint.longitude;
    let currentMinutes = startMinutes;

    // Hier sammeln wir die Gesamtergebnisse.
    let totalDistance = 0;
    let totalDuration = 0;
    const stops = [];

    // Wiederholen, bis keine Aufgabe mehr übrig ist.
    while (remaining.length > 0) {
      // 1. Nächste Aufgabe suchen.
      const task = findNearestTask(latitude, longitude, remaining);

      // Sicherheitsabbruch, falls keine gültige Aufgabe mehr gefunden wurde.
      if (!task) break;

      // 2. Entfernung und Dauer dieser Aufgabe bestimmen.
      const distance = calculateDistance(latitude, longitude, task.latitude, task.longitude);
      const duration = task.estimated_duration_min;

      // 3. Aufgabe zur fertigen Route hinzufügen.
      stops.push({
        task: task,
        distance: distance,
        startMinutes: currentMinutes
      });

      // 4. Gesamtsummen aktualisieren.
      totalDistance += distance;
      totalDuration += duration;
      currentMinutes += duration;

      // 5. Diese Aufgabe wird zum neuen Ausgangspunkt.
      latitude = task.latitude;
      longitude = task.longitude;

      // 6. Bereits eingeplante Aufgabe aus der Restliste entfernen.
      remaining = remaining.filter(other => other.task_id !== task.task_id);
    }

    // Alles zurückgeben, was die Oberfläche später anzeigen muss.
    return {
      stops: stops,
      totalDistance: totalDistance,
      totalDuration: totalDuration,
      endMinutes: currentMinutes
    };
  }

  // Valhalla liefert den genauen Linienverlauf in einer kompakten Textform.
  // Diese Funktion macht daraus wieder normale Koordinaten für Leaflet.
  function decodePolyline6(encoded) {
    const coordinates = [];
    let index = 0;
    let latitude = 0;
    let longitude = 0;

    // Zeichen für Zeichen durch den komprimierten Text gehen.
    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let byte;

      // Breitengrad auslesen.
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      latitude += (result & 1) ? ~(result >> 1) : (result >> 1);

      // Längengrad auslesen.
      result = 0;
      shift = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      longitude += (result & 1) ? ~(result >> 1) : (result >> 1);

      // Valhalla speichert sechs Nachkommastellen als ganze Zahl.
      // Durch 1.000.000 bekommen wir wieder normale Koordinaten.
      coordinates.push([latitude / 1e6, longitude / 1e6]);
    }

    return coordinates;
  }

  // Macht aus "Minuten seit Mitternacht" einen Text,
  // den der Routing-Dienst als Datum und Uhrzeit versteht.
  function localIsoDateTime(totalMinutes) {
    const date = new Date();

    // Zuerst auf den Beginn des heutigen Tages setzen.
    date.setHours(0, 0, 0, 0);

    // Danach die gewünschte Anzahl Minuten dazurechnen.
    date.setMinutes(totalMinutes);

    // Einzelne Teile mit führenden Nullen aufbauen.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return year + '-' + month + '-' + day + 'T' + hours + ':' + minutes;
  }

  // Holt für alle gewählten Orte eine Tabelle mit Wegzeiten und Entfernungen.
  // Dadurch können wir schnell vergleichen, welcher Ort als Nächstes sinnvoll ist.
  async function getTravelMatrix(tasks, mode, startPoint) {
    // Für die Anfrage brauchen wir den Valhalla-Namen des Verkehrsmittels.
    const matrixMode = travelModes[mode].matrixCosting;

    // In der Liste steht zuerst der Startpunkt und danach jede Aufgabe.
    const locations = [
      { lat: startPoint.latitude, lon: startPoint.longitude }
    ].concat(
      tasks.map(task => ({ lat: task.latitude, lon: task.longitude }))
    );

    // Data Layer übernimmt die eigentliche Internet-Anfrage.
    const data = await CampusRouteData.requestRouting('/sources_to_targets', {
      sources: locations,
      targets: locations,
      costing: matrixMode,
      units: 'kilometers',
      verbose: false
    });

    const matrix = data.sources_to_targets;

    // Wenn Valhalla nicht die erwarteten Tabellen zurückgibt,
    // können wir nicht sinnvoll weiterrechnen.
    if (!matrix || !Array.isArray(matrix.durations) || !Array.isArray(matrix.distances)) {
      throw new Error('Routing-Matrix konnte nicht gelesen werden.');
    }

    return matrix;
  }

  // Bestimmt mit den echten Wegzeiten die Reihenfolge der Aufgaben.
  function orderTasksByNetwork(tasks, matrix) {
    // Index 0 gehört in der Tabelle immer zum Startpunkt.
    let currentIndex = 0;

    // Jede Aufgabe bekommt zusätzlich ihren Platz in der Wegzeit-Tabelle.
    const remaining = tasks.map((task, index) => ({
      task: task,
      matrixIndex: index + 1
    }));

    const ordered = [];

    // Solange noch Aufgaben übrig sind, wählen wir die schnellste erreichbare.
    while (remaining.length > 0) {
      let bestPosition = -1;
      let bestDuration = Infinity;

      remaining.forEach((candidate, position) => {
        // Wegzeit vom aktuellen Ort zu diesem Kandidaten aus der Tabelle holen.
        const duration = matrix.durations[currentIndex]
          ? matrix.durations[currentIndex][candidate.matrixIndex]
          : null;

        // Bisher kürzeste Wegzeit merken.
        if (Number.isFinite(duration) && duration < bestDuration) {
          bestDuration = duration;
          bestPosition = position;
        }
      });

      // Kein Kandidat erreichbar = Route kann mit diesem Modus nicht gebaut werden.
      if (bestPosition < 0) {
        throw new Error('Mindestens ein ausgewählter Standort ist mit diesem Verkehrsmittel nicht erreichbar.');
      }

      // Gewählte Aufgabe aus der Restliste nehmen und an die fertige Reihenfolge hängen.
      const chosen = remaining.splice(bestPosition, 1)[0];
      ordered.push(chosen.task);

      // Ab jetzt rechnen wir von diesem neuen Ort weiter.
      currentIndex = chosen.matrixIndex;
    }

    return ordered;
  }

  // Holt den echten Weg zwischen genau zwei Punkten.
  async function fetchRouteLeg(from, to, mode, departureMinutes) {
    const requestedMode = mode;

    // Kleine Hilfsfunktion, damit wir dieselbe Anfrage bei Bedarf
    // auch mit einem anderen Verkehrsmittel wiederholen können.
    async function request(costing) {
      return CampusRouteData.requestRouting('/route', {
        locations: [
          { lat: from.latitude, lon: from.longitude },
          { lat: to.latitude, lon: to.longitude }
        ],
        costing: costing,
        units: 'kilometers',
        language: 'de-DE',
        date_time: {
          type: 1,
          value: localIsoDateTime(departureMinutes)
        },
        directions_options: {
          units: 'kilometers',
          language: 'de-DE'
        }
      });
    }

    let data;
    let usedMode = requestedMode;
    let usedFallback = false;

    try {
      // Zuerst genau das ausgewählte Verkehrsmittel versuchen.
      data = await request(requestedMode);
    } catch (error) {
      // Falls "Öffis" bei diesem öffentlichen Dienst nicht funktioniert,
      // probieren wir zu Fuß weiter, damit die App nicht komplett abbricht.
      if (requestedMode !== 'multimodal') throw error;

      data = await request('pedestrian');
      usedMode = 'pedestrian';
      usedFallback = true;
    }

    // Sicherheitsprüfung: Es muss mindestens ein Routenabschnitt vorhanden sein.
    if (!data.trip || !data.trip.summary || !Array.isArray(data.trip.legs) || data.trip.legs.length === 0) {
      throw new Error('Keine Routendaten erhalten.');
    }

    // Wir brauchen bei zwei Punkten nur den ersten Abschnitt.
    const leg = data.trip.legs[0];
    const summary = leg.summary || data.trip.summary;

    // Für die Oberfläche geben wir nur die wirklich benötigten Werte zurück.
    return {
      distanceKm: Number(summary.length),
      travelMinutes: Math.max(1, Math.round(Number(summary.time) / 60)),
      shape: typeof leg.shape === 'string' ? decodePolyline6(leg.shape) : [],
      usedMode: usedMode,
      usedFallback: usedFallback
    };
  }

  // Genauere Routenplanung mit echten Wegzeiten aus Valhalla.
  async function optimizeNetworkRoute(tasks, startMinutes, mode, startPoint = defaultStart) {
    // Unbekannte Auswahl sofort abfangen.
    if (!travelModes[mode]) {
      throw new Error('Unbekanntes Verkehrsmittel.');
    }

    // 1. Wegzeiten zwischen allen Orten laden.
    const matrix = await getTravelMatrix(tasks, mode, startPoint);

    // 2. Daraus eine sinnvolle Aufgabenreihenfolge bilden.
    const orderedTasks = orderTasksByNetwork(tasks, matrix);

    // 3. Anfangswerte vorbereiten.
    let current = {
      latitude: startPoint.latitude,
      longitude: startPoint.longitude
    };
    let currentMinutes = startMinutes;
    let totalDistance = 0;
    let totalTravelMinutes = 0;
    let totalTaskDuration = 0;
    let transitFallbacks = 0;

    const stops = [];

    // Diese Liste enthält später die Punkte für die gezeichnete Linie auf der Karte.
    const pathCoordinates = [[startPoint.latitude, startPoint.longitude]];

    // 4. Jeden Stop in der bereits berechneten Reihenfolge abarbeiten.
    for (const task of orderedTasks) {
      // Echten Weg vom aktuellen Ort zur nächsten Aufgabe laden.
      const leg = await fetchRouteLeg(current, task, mode, currentMinutes);

      // Ankunft = aktuelle Uhrzeit + Wegzeit.
      const arrivalMinutes = currentMinutes + leg.travelMinutes;

      // Ende = Ankunft + geschätzte Dauer der Aufgabe.
      const finishMinutes = arrivalMinutes + task.estimated_duration_min;

      // Alle Informationen zu diesem Stop merken.
      stops.push({
        task: task,
        distance: leg.distanceKm,
        travelMinutes: leg.travelMinutes,
        arrivalMinutes: arrivalMinutes,
        startMinutes: arrivalMinutes,
        finishMinutes: finishMinutes,
        usedMode: leg.usedMode
      });

      // Wenn Valhalla einen echten Linienverlauf geliefert hat, übernehmen wir ihn.
      if (leg.shape.length > 0) {
        pathCoordinates.push(...leg.shape.slice(1));
      } else {
        // Sonst wenigstens die Zielkoordinate verwenden.
        pathCoordinates.push([task.latitude, task.longitude]);
      }

      // Falls bei Öffis auf Fußweg ausgewichen werden musste, zählen wir das mit.
      if (leg.usedFallback) transitFallbacks++;

      // Gesamtsummen aktualisieren.
      totalDistance += leg.distanceKm;
      totalTravelMinutes += leg.travelMinutes;
      totalTaskDuration += task.estimated_duration_min;

      // Der aktuelle Zeitpunkt und Ort werden auf das Ende dieser Aufgabe gesetzt.
      currentMinutes = finishMinutes;
      current = {
        latitude: task.latitude,
        longitude: task.longitude
      };
    }

    // Fertiges Ergebnis an die Presentation Layer zurückgeben.
    return {
      networkRouting: true,
      mode: mode,
      stops: stops,
      totalDistance: totalDistance,
      totalTravelMinutes: totalTravelMinutes,
      totalDuration: totalTaskDuration,
      endMinutes: currentMinutes,
      pathCoordinates: pathCoordinates,
      transitFallbacks: transitFallbacks
    };
  }

  // Nur diese Werte und Funktionen sind außerhalb dieser Datei sichtbar.
  return {
    defaultStart: defaultStart,
    travelModes: travelModes,
    priorityValue: priorityValue,
    hasValidCoordinates: hasValidCoordinates,
    nextTaskStatus: nextTaskStatus,
    calculateDistance: calculateDistance,
    findNearestTask: findNearestTask,
    optimizeRoute: optimizeRoute,
    orderTasksByNetwork: orderTasksByNetwork,
    optimizeNetworkRoute: optimizeNetworkRoute
  };
})();
