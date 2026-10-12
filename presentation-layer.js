// PRESENTATION LAYER = ANZEIGE-EBENE
    // Diese Datei kümmert sich um alles, was der Benutzer sieht oder anklickt.
    // Rechnen und Entscheiden übernimmt business-layer.js.
    // Laden und Speichern von Daten übernimmt data-layer.js.
    // Hier liegen während der Laufzeit alle Aufgaben, damit wir sie auf der Seite anzeigen können.
    let globalTasks = [];
    // In dieser Liste stehen nur die IDs der Aufgaben, die der Benutzer für die Route ausgewählt hat.
    let selectedTaskIds = [];
    // Diese Variablen merken sich die Karte, Marker und die gezeichnete Route.
    let campusMap = null;
    let taskMarkersLayer = null;
    let routeLayer = null;
    // Hier merken wir uns das letzte Routenergebnis und die aktuell geöffnete Aufgabe.
    let lastPlannedRoute = null;
    let currentDetailTaskId = null;

    // Startwerte kommen aus den anderen Ebenen, damit wir sie nicht an mehreren Stellen doppelt eintragen.
    const storageKey = CampusRouteData.storageKey;
    const startLatitude = CampusRouteBusiness.defaultStart.latitude;
    const startLongitude = CampusRouteBusiness.defaultStart.longitude;
    let routeStartLatitude = startLatitude;
    let routeStartLongitude = startLongitude;
    let routeStartLabel = 'FH Technikum Wien';

    const travelModes = CampusRouteBusiness.travelModes;
    // Diese kurzen Verweise machen Funktionen aus der Business Layer hier einfacher benutzbar.
    const priorityValue = CampusRouteBusiness.priorityValue;
    const hasValidCoordinates = CampusRouteBusiness.hasValidCoordinates;
    const calculateDistance = CampusRouteBusiness.calculateDistance;
    const findNearestTask = CampusRouteBusiness.findNearestTask;

    // Diese kleine Brücken-Funktion startet die einfache Ersatz-Routenberechnung und übergibt dabei unseren aktuell gewählten Startpunkt.
    function optimizeRoute(tasks, startMinutes) {
      return CampusRouteBusiness.optimizeRoute(tasks, startMinutes, {
        latitude: routeStartLatitude,
        longitude: routeStartLongitude
      });
    }

    // Diese Brücken-Funktion startet die genauere Online-Routenberechnung und gibt ebenfalls den aktuell gewählten Startpunkt mit.
    async function optimizeNetworkRoute(tasks, startMinutes, mode) {
      return CampusRouteBusiness.optimizeNetworkRoute(tasks, startMinutes, mode, {
        latitude: routeStartLatitude,
        longitude: routeStartLongitude
      });
    }

    // Diese drei Funktionen machen wir zusätzlich am Browser-Fenster sichtbar.
    // So kann tests.html genau dieselben Funktionen testen, die auch die App verwendet.
    window.calculateDistance = calculateDistance;
    window.findNearestTask = findNearestTask;
    window.optimizeRoute = optimizeRoute;


    // Zeigt unten kurz eine kleine Meldung an, z. B. 'Aufgabe gespeichert'. Nach kurzer Zeit verschwindet sie wieder.
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.remove('hidden');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(function () { toast.classList.add('hidden'); }, 2400);
    }

    // Übersetzt die internen englischen Prioritäten in deutsche Wörter für die Oberfläche.
    function priorityLabel(priority) {
      if (priority === 'High') return 'Hoch';
      if (priority === 'Medium') return 'Mittel';
      return 'Niedrig';
    }

    // Formatiert ein gespeichertes Datum so, dass es für Benutzer gut lesbar ist.
    function formatDeadline(deadline) {
      if (!deadline) return 'Keine Deadline';
      const date = new Date(deadline);
      if (Number.isNaN(date.getTime())) return 'Ungültige Deadline';
      return new Intl.DateTimeFormat('de-AT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(date);
    }

    // Prüft, ob eine Deadline schon vorbei ist, heute/morgen kommt oder noch weiter entfernt ist.
    function deadlineState(deadline) {
      if (!deadline) return { text: 'Keine Deadline', className: 'text-on-surface-variant' };
      const date = new Date(deadline);
      if (Number.isNaN(date.getTime())) return { text: 'Deadline prüfen', className: 'text-error' };
      const diff = date.getTime() - Date.now();
      if (diff < 0) return { text: 'Überfällig', className: 'text-error' };
      if (diff < 24 * 60 * 60 * 1000) return { text: 'Heute fällig', className: 'text-secondary' };
      if (diff < 48 * 60 * 60 * 1000) return { text: 'Morgen fällig', className: 'text-secondary' };
      return { text: formatDeadline(deadline), className: 'text-on-surface-variant' };
    }

    // Trägt beim ersten Öffnen automatisch die aktuelle Uhrzeit als Startzeit ein.
    function setDefaultStartTime() {
      const input = document.getElementById('start-time');
      if (!input || input.value) return;
      const now = new Date();
      input.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    // Schreibt das heutige Datum oben ins Dashboard.
    function updateTodayLabel() {
      const label = document.getElementById('today-label');
      if (!label) return;
      label.textContent = new Intl.DateTimeFormat('de-AT', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
      }).format(new Date()) + ' • FH Technikum Wien';
    }

    // Sammelt den aktuellen Zustand der App und gibt ihn an die Data Layer zum Speichern weiter.
    function persistState() {
      const statuses = {};
      globalTasks.forEach(task => { statuses[task.task_id] = task.status; });
      const travelMode = document.getElementById('travel-mode')?.value || 'pedestrian';

      CampusRouteData.saveState({
        statuses: statuses,
        selectedTaskIds: selectedTaskIds,
        travelMode: travelMode,
        startMode: document.getElementById('start-mode')?.value || 'fh',
        localTasks: globalTasks.filter(task => task.is_local === true)
      });
    }

    // Liest gespeicherte Browserdaten ein und stellt Status, Auswahl und eigene Aufgaben wieder her.
    function restoreState() {
      try {
        const state = CampusRouteData.loadState();
        if (Array.isArray(state.localTasks)) {
          const knownIds = new Set(globalTasks.map(task => task.task_id));
          state.localTasks.forEach(task => {
            if (!knownIds.has(task.task_id)) globalTasks.push(task);
          });
        }
        if (state.statuses) {
          globalTasks.forEach(task => {
            if (typeof state.statuses[task.task_id] === 'string') task.status = state.statuses[task.task_id];
          });
        }
        if (Array.isArray(state.selectedTaskIds)) {
          selectedTaskIds = state.selectedTaskIds.filter(id => globalTasks.some(task => task.task_id === id));
        }
        if (state.travelMode && travelModes[state.travelMode]) {
          document.getElementById('travel-mode').value = state.travelMode;
        }
      } catch (_) {}
    }

    // Setzt den Startpunkt wieder auf die FH Technikum Wien zurück.
    function resetStartPoint() {
      routeStartLatitude = startLatitude;
      routeStartLongitude = startLongitude;
      routeStartLabel = 'FH Technikum Wien';
      document.getElementById('start-location-label').textContent = routeStartLabel;
      document.getElementById('start-location-coords').textContent = routeStartLatitude.toFixed(4) + ', ' + routeStartLongitude.toFixed(4);
      document.getElementById('location-message').textContent = '';
      clearRouteResult();
      if (campusMap) {
        refreshMapMarkers();
        campusMap.setView([routeStartLatitude, routeStartLongitude], 15);
      }
    }

    // Reagiert darauf, ob der Benutzer die FH oder den eigenen Standort als Startpunkt auswählt.
    function changeStartMode(mode) {
      if (mode === 'current') useCurrentLocation();
      else resetStartPoint();
      persistState();
    }

    // Fragt den Browser nach dem aktuellen Standort des Benutzers und verwendet ihn als Startpunkt.
    function useCurrentLocation() {
      const message = document.getElementById('location-message');
      if (!navigator.geolocation) {
        message.textContent = 'Standortzugriff wird von diesem Browser nicht unterstützt.';
        document.getElementById('start-mode').value = 'fh';
        return;
      }

      message.textContent = 'Standort wird ermittelt …';
      navigator.geolocation.getCurrentPosition(function (position) {
        routeStartLatitude = position.coords.latitude;
        routeStartLongitude = position.coords.longitude;
        routeStartLabel = 'Mein Standort';
        document.getElementById('start-mode').value = 'current';
        document.getElementById('start-location-label').textContent = routeStartLabel;
        document.getElementById('start-location-coords').textContent = routeStartLatitude.toFixed(5) + ', ' + routeStartLongitude.toFixed(5);
        message.textContent = 'Aktueller Standort wird als Startpunkt verwendet.';
        clearRouteResult();
        persistState();
        if (campusMap) {
          refreshMapMarkers();
          campusMap.setView([routeStartLatitude, routeStartLongitude], 15);
        }
      }, function () {
        message.textContent = 'Standort konnte nicht gelesen werden. FH Technikum bleibt Startpunkt.';
        document.getElementById('start-mode').value = 'fh';
        resetStartPoint();
      }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    }

    // Öffnet das Formular, mit dem eine neue eigene Aufgabe angelegt werden kann.
    function openTaskModal() {
      const modal = document.getElementById('task-modal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      document.getElementById('new-title').focus();
    }

    // Schließt das Formular für neue Aufgaben und leert die Eingabefelder.
    function closeTaskModal() {
      const modal = document.getElementById('task-modal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      document.getElementById('task-form').reset();
      document.getElementById('new-location-message').textContent = '';
    }

    // Übernimmt den aktuellen Browser-Standort direkt in die Koordinatenfelder einer neuen Aufgabe.
    function fillTaskLocationFromBrowser() {
      const message = document.getElementById('new-location-message');
      if (!navigator.geolocation) {
        message.textContent = 'Standortzugriff wird von diesem Browser nicht unterstützt.';
        return;
      }
      message.textContent = 'Standort wird ermittelt …';
      navigator.geolocation.getCurrentPosition(function (position) {
        document.getElementById('new-latitude').value = position.coords.latitude.toFixed(6);
        document.getElementById('new-longitude').value = position.coords.longitude.toFixed(6);
        message.textContent = 'Aktuelle Position wurde übernommen.';
      }, function () {
        message.textContent = 'Standort konnte nicht gelesen werden. Koordinaten bitte manuell eingeben.';
      }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    }

    // Liest das Formular aus, prüft die Pflichtfelder und legt danach eine neue lokale Aufgabe an.
    function createTask(event) {
      event.preventDefault();
      const title = document.getElementById('new-title').value.trim();
      const description = document.getElementById('new-description').value.trim();
      const category = document.getElementById('new-category').value;
      const priority = document.getElementById('new-priority').value;
      const duration = Number(document.getElementById('new-duration').value);
      const deadline = document.getElementById('new-deadline').value;
      const locationName = document.getElementById('new-location-name').value.trim();
      const latitude = Number(document.getElementById('new-latitude').value);
      const longitude = Number(document.getElementById('new-longitude').value);

      if (!title || !locationName || !Number.isFinite(latitude) || !Number.isFinite(longitude)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
          || !Number.isInteger(duration) || duration < 0) {
        document.getElementById('new-location-message').textContent = 'Bitte alle Pflichtfelder und Koordinaten prüfen.';
        return;
      }

      const task = {
        task_id: Date.now(),
        title: title,
        description: description || 'Eigene Aufgabe',
        latitude: latitude,
        longitude: longitude,
        location_name: locationName,
        category: category,
        priority: priority,
        deadline: deadline || null,
        estimated_duration_min: duration,
        status: 'Geplant',
        attachment_file: null,
        is_local: true
      };

      globalTasks.push(task);
      selectedTaskIds.push(task.task_id);
      populateCategoryFilter();
      persistState();
      closeTaskModal();
      renderTasks();
      showToast('Aufgabe gespeichert und zur Route hinzugefügt.');
      if (campusMap) refreshMapMarkers();
    }

    // Löscht eine selbst angelegte Aufgabe nach einer Sicherheitsabfrage wieder.
    function deleteDetailTask() {
      if (!currentDetailTaskId) return;
      const task = globalTasks.find(task => task.task_id === currentDetailTaskId);
      if (!task || task.is_local !== true) return;
      if (!confirm('Diese eigene Aufgabe wirklich löschen?')) return;

      globalTasks = globalTasks.filter(task => task.task_id !== currentDetailTaskId);
      selectedTaskIds = selectedTaskIds.filter(id => id !== currentDetailTaskId);
      currentDetailTaskId = null;
      populateCategoryFilter();
      persistState();
      renderTasks();
      showToast('Eigene Aufgabe gelöscht.');
      switchScreen('errands');
    }

    // Ändert den kleinen Informationstext über der Karte.
    function updateMapStatus(text) {
      const status = document.getElementById('map-status');
      if (status) status.textContent = text;
    }

    // Erstellt die Leaflet-Karte nur dann, wenn sie noch nicht erstellt wurde.
    function ensureMap() {
      if (campusMap || typeof L === 'undefined') return;

      campusMap = L.map('campus-map').setView([routeStartLatitude, routeStartLongitude], 15);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(campusMap);

      taskMarkersLayer = L.layerGroup().addTo(campusMap);
      routeLayer = L.layerGroup().addTo(campusMap);
      refreshMapMarkers();

      if (lastPlannedRoute) drawRouteOnMap(lastPlannedRoute);
      setTimeout(() => campusMap.invalidateSize(), 50);
    }

    // Zeichnet die Marker aller Aufgaben neu auf die Karte und färbt sie passend zum Status.
    function refreshMapMarkers() {
      if (!campusMap || !taskMarkersLayer) return;
      taskMarkersLayer.clearLayers();

      L.circleMarker([routeStartLatitude, routeStartLongitude], {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#3525cd',
        fillOpacity: 1
      }).addTo(taskMarkersLayer).bindPopup('<strong>Start: ' + routeStartLabel + '</strong><br>' + routeStartLatitude.toFixed(5) + ', ' + routeStartLongitude.toFixed(5));

      for (const task of globalTasks) {
        if (!hasValidCoordinates(task)) continue;
        const isCompleted = task.status === 'Erledigt';
        const isSelected = selectedTaskIds.includes(task.task_id);
        const markerColor = isCompleted ? '#006e4c' : (isSelected ? '#fe932c' : '#4f46e5');

        L.circleMarker([task.latitude, task.longitude], {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: markerColor,
          fillOpacity: 0.95
        }).addTo(taskMarkersLayer).bindPopup(
          '<strong>' + task.title + '</strong><br>'
          + task.category + ' · ' + task.status + '<br>'
          + 'Dauer: ' + task.estimated_duration_min + ' min'
        );
      }

      const completed = globalTasks.filter(task => task.status === 'Erledigt').length;
      updateMapStatus(globalTasks.length + ' Aufgaben · ' + selectedTaskIds.length
        + ' ausgewählt · ' + completed + ' erledigt');
    }

    // Zeichnet die zuletzt berechnete Route als Linie auf die Karte.
    function drawRouteOnMap(route) {
      if (!campusMap || !routeLayer) return;
      routeLayer.clearLayers();

      if (!route || route.stops.length === 0) {
        refreshMapMarkers();
        return;
      }

      const fallbackPoints = [[routeStartLatitude, routeStartLongitude]];
      for (const stop of route.stops) fallbackPoints.push([stop.task.latitude, stop.task.longitude]);
      const points = route.pathCoordinates && route.pathCoordinates.length > 1
        ? route.pathCoordinates
        : fallbackPoints;

      L.polyline(points, {
        color: '#3525cd',
        weight: 5,
        opacity: 0.85,
        dashArray: route.networkRouting ? null : '10 8'
      }).addTo(routeLayer);

      route.stops.forEach((stop, index) => {
        const numberIcon = L.divIcon({
          className: '',
          html: '<div style="width:26px;height:26px;border-radius:9999px;background:#3525cd;color:white;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 1px 5px rgba(0,0,0,.35)">' + (index + 1) + '</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([stop.task.latitude, stop.task.longitude], {
          icon: numberIcon,
          interactive: false
        }).addTo(routeLayer);
      });

      campusMap.fitBounds(L.latLngBounds(points).pad(0.12), { maxZoom: 17 });
      const mode = travelModes[route.mode] || travelModes.pedestrian;
      const travelText = Number.isFinite(route.totalTravelMinutes)
        ? ' · ' + route.totalTravelMinutes + ' min unterwegs'
        : '';
      updateMapStatus(mode.icon + ' ' + mode.label + ' · ' + route.stops.length
        + ' Stopps · ' + route.totalDistance.toFixed(2) + ' km' + travelText);
    }


    // Liest aus dem Auswahlfeld, welches Verkehrsmittel der Benutzer gewählt hat.
    function getTravelMode() {
      const select = document.getElementById('travel-mode');
      return select && travelModes[select.value] ? select.value : 'pedestrian';
    }

    // Schaltet den Routen-Button während einer Berechnung auf 'Bitte warten', damit nicht mehrfach geklickt wird.
    function setRouteLoading(isLoading) {
      const button = document.getElementById('optimize-route');
      if (!button) return;
      button.disabled = isLoading;
      button.textContent = isLoading ? 'Route wird berechnet …' : 'Route optimieren';
    }

    // Start der App: Aufgaben laden und danach auf dem Bildschirm anzeigen.
    // Lädt beim Start die Aufgaben über die Data Layer und baut danach die erste Ansicht auf.
    async function initDataset() {
      const container = document.getElementById('json-task-container');
      try {
        globalTasks = await CampusRouteData.loadTasks();
        restoreState();
        populateCategoryFilter();
        setDefaultStartTime();
        updateTodayLabel();
        renderTasks();
      } catch (err) {
        container.textContent = 'Fehler beim Laden von campus_tasks.json: ' + err.message
          + '. Bitte alle Projektdateien über denselben lokalen HTTP-Server öffnen.';
      }
    }

    // Zählt offene, ausgewählte, erledigte und gesamte Aufgaben und aktualisiert die Zahlen im Dashboard.
    function updateCounters() {
      const completed = globalTasks.filter(task => task.status === 'Erledigt').length;
      const open = globalTasks.length - completed;
      document.getElementById('json-record-count').innerText = globalTasks.length;
      document.getElementById('badge-total-tasks').innerText = globalTasks.length + ' Aufgaben';
      document.getElementById('nav-badge-count').innerText = open;
      document.getElementById('open-task-count').innerText = open;
      document.getElementById('dashboard-open-count').innerText = open;
      document.getElementById('selected-task-count').innerText = selectedTaskIds.length;
      document.getElementById('planner-selection-chip').innerText = selectedTaskIds.length + ' ausgewählt';
      document.getElementById('completed-task-count').innerText = completed;
    }

    // Sammelt alle vorhandenen Kategorien und trägt sie in das Kategorie-Auswahlfeld ein.
    function populateCategoryFilter() {
      const select = document.getElementById('filter-category');
      if (!select) return;
      const categories = [...new Set(globalTasks.map(task => task.category).filter(Boolean))].sort();
      select.innerHTML = '<option value="">Alle Kategorien</option>'
        + categories.map(category => '<option value="' + category + '">' + category + '</option>').join('');
    }

    // Wendet Suche, Filter und Sortierung an und gibt nur die Aufgaben zurück, die gerade sichtbar sein sollen.
    function getVisibleTasks() {
      const search = (document.getElementById('task-search')?.value || '').trim().toLowerCase();
      const category = document.getElementById('filter-category')?.value || '';
      const status = document.getElementById('filter-status')?.value || '';
      const sortBy = document.getElementById('sort-tasks')?.value || 'deadline';

      const tasks = globalTasks.filter(task => {
        const searchText = [task.title, task.description, task.category, task.location_name, task.status]
          .filter(Boolean).join(' ').toLowerCase();
        return (!search || searchText.includes(search))
          && (!category || task.category === category)
          && (!status || task.status === status);
      });

      tasks.sort((a, b) => {
        if (sortBy === 'priority') return priorityValue(b.priority) - priorityValue(a.priority);
        if (sortBy === 'title') return a.title.localeCompare(b.title, 'de');
        const aTime = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bTime = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return aTime - bTime;
      });

      return tasks;
    }

    // Wählt alle aktuell sichtbaren und noch offenen Aufgaben für die Routenplanung aus.
    function selectVisibleTasks() {
      const visible = getVisibleTasks().filter(task => task.status !== 'Erledigt' && hasValidCoordinates(task));
      visible.forEach(task => {
        if (!selectedTaskIds.includes(task.task_id)) selectedTaskIds.push(task.task_id);
      });
      persistState();
      clearRouteResult();
      renderTasks();
    }

    // Entfernt alle Aufgaben aus der aktuellen Routenauswahl.
    function clearSelection() {
      selectedTaskIds = [];
      persistState();
      clearRouteResult();
      renderTasks();
    }

    // Baut die sichtbaren Aufgaben-Karten neu auf. Diese Funktion bestimmt also, was in der Aufgabenliste zu sehen ist.
    function renderTasks() {
      updateCounters();
      const container = document.getElementById('json-task-container');
      const visibleTasks = getVisibleTasks();
      document.getElementById('filter-summary').textContent = visibleTasks.length + ' von ' + globalTasks.length + ' Aufgaben sichtbar';
      if (visibleTasks.length === 0) {
        container.innerHTML = '<div class="xl:col-span-2 app-card rounded-2xl p-10 text-center">'
          + '<span class="material-symbols-outlined text-[42px] text-outline">search_off</span>'
          + '<h3 class="font-bold mt-2">Keine Aufgaben gefunden</h3>'
          + '<p class="text-sm text-on-surface-variant mt-1">Passe Suche oder Filter an – oder lege eine neue Aufgabe an.</p>'
          + '<button type="button" onclick="openTaskModal()" class="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold">Neue Aufgabe</button>'
          + '</div>';
        if (campusMap) refreshMapMarkers();
        return;
      }
      // Für jede sichtbare Aufgabe wird jetzt eine eigene Karte aus HTML gebaut.
      container.innerHTML = visibleTasks.map((task, index) => {
        const validCoordinates = hasValidCoordinates(task);
        const distanceText = validCoordinates
          ? calculateDistance(startLatitude, startLongitude, task.latitude, task.longitude).toFixed(2) + ' km (ca. Luftlinie)'
          : 'nicht verfügbar – ungültige Koordinaten';
        const isHigh = task.priority === 'High';
        const isMed = task.priority === 'Medium';
        const deadlineInfo = deadlineState(task.deadline);
        const locationText = task.location_name || 'Standort aus Koordinaten';
        const priorityBadge = isHigh
          ? 'bg-error-container text-error'
          : (isMed ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container text-on-surface-variant');

        return `
          <article class="task-card app-card flex flex-col p-3.5 bg-surface-container-lowest rounded-2xl transition-all" data-id="${task.task_id}">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-start gap-2.5 min-w-0">
                <span class="w-6 h-6 rounded-full bg-primary-container text-on-primary text-xs font-bold flex items-center justify-center shrink-0">
                  ${index + 1}
                </span>
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-2 py-0.5 rounded-full ${priorityBadge} text-[10px] font-bold">
                      ${priorityLabel(task.priority)} Prio
                    </span>
                    <span class="px-2 py-0.5 rounded-full bg-surface-container-high text-primary text-[10px] font-semibold">
                      ${task.category}
                    </span>
                    ${task.is_local ? '<span class="px-2 py-0.5 rounded-full bg-tertiary-fixed text-tertiary text-[10px] font-semibold">Eigene Aufgabe</span>' : ''}
                    <span class="text-[10px] text-on-surface-variant font-mono">
                      Dauer: ${task.estimated_duration_min} min
                    </span>
                  </div>

                  <h3 class="text-sm font-semibold text-on-surface mt-1 truncate ${task.status === 'Erledigt' ? 'line-through' : ''}">${task.title}</h3>
                  <p class="text-xs text-on-surface-variant mt-0.5 line-clamp-1">${task.description}</p>
                  <p class="text-[11px] text-on-surface-variant mt-1 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">location_on</span>${locationText}
                  </p>
                  <div class="flex items-center gap-3 mt-2 text-on-surface-variant text-[11px]">
                    <span class="flex items-center gap-1">
                      <span class="material-symbols-outlined text-[14px] text-primary">pin_drop</span>
                      ${validCoordinates ? task.latitude.toFixed(4) + ', ' + task.longitude.toFixed(4) : 'Ungültige Koordinaten'}
                    </span>
                    <span class="flex items-center gap-1 text-tertiary-container font-medium">
                      <span class="material-symbols-outlined text-[14px]">task_alt</span>
                      ${task.status}
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                    <span class="${deadlineInfo.className} font-semibold">⏱ ${deadlineInfo.text}</span>
                    <span class="text-on-surface-variant">• ${formatDeadline(task.deadline)}</span>
                  </div>
                </div>
              </div>

              <button type="button" onclick="advanceTaskStatus(${task.task_id})" aria-label="Status ändern" ${task.status === 'Erledigt' ? 'disabled' : ''} class="check-btn min-w-9 h-9 px-2 rounded-lg bg-surface-container flex items-center justify-center text-outline hover:bg-tertiary-container hover:text-white transition-all shrink-0" title="${task.status === 'Geplant' ? 'Aufgabe starten' : (task.status === 'Auf dem Weg' ? 'Als erledigt markieren' : 'Erledigt')}">
                <span class="material-symbols-outlined text-[18px]">${task.status === 'Geplant' ? 'play_arrow' : 'check'}</span>
              </button>
            </div>

            <label class="flex items-center gap-2 mt-2 text-xs text-primary font-semibold">
              <input type="checkbox" class="task-selection" data-id="${task.task_id}" ${selectedTaskIds.includes(task.task_id) ? 'checked' : ''} onchange="selectTask(${task.task_id}, this.checked)"/>
              Für Route auswählen
            </label>
            <div class="flex items-center justify-between mt-2.5 pt-2 border-t border-surface-container-high">
              <span class="text-[11px] text-on-surface-variant truncate">
                ${task.attachment_file ? '📎 ' + task.attachment_file : 'Kein Anhang'}
              </span>
              <button onclick="showTaskDetail(${task.task_id})" class="px-2 py-0.5 bg-surface-container hover:bg-surface-container-high text-primary rounded-lg text-xs font-semibold flex items-center gap-1">
                <span>Details</span>
                <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          </article>
        `;
      }).join('');

      if (campusMap) refreshMapMarkers();
    }

    // Entfernt ein altes Routenergebnis, wenn sich eine wichtige Eingabe geändert hat.
    function clearRouteResult() {
      document.getElementById('route-result').textContent = '';
      lastPlannedRoute = null;
      if (routeLayer) routeLayer.clearLayers();
    }

    // Fügt genau eine Aufgabe zur Routenauswahl hinzu oder entfernt sie wieder.
    function selectTask(taskId, checked) {
      if (checked && !selectedTaskIds.includes(taskId)) selectedTaskIds.push(taskId);
      if (!checked) selectedTaskIds = selectedTaskIds.filter(id => id !== taskId);
      persistState();
      clearRouteResult();
      renderTasks();
      if (campusMap) refreshMapMarkers();
    }

    // Setzt eine Aufgabe direkt auf 'Erledigt' und aktualisiert anschließend die Oberfläche.
    function completeTask(taskId) {
      const task = globalTasks.find(task => task.task_id === taskId);
      if (!task) return;
      task.status = 'Erledigt';
      selectedTaskIds = selectedTaskIds.filter(id => id !== taskId);
      persistState();
      renderTasks();
      clearRouteResult();
      if (currentDetailTaskId === taskId) showTaskDetail(taskId);
    }

    // Schiebt eine Aufgabe einen Schritt weiter: von 'Geplant' zu 'Auf dem Weg' und danach zu 'Erledigt'.
    function advanceTaskStatus(taskId) {
      const task = globalTasks.find(task => task.task_id === taskId);
      if (!task || task.status === 'Erledigt') return;
      task.status = CampusRouteBusiness.nextTaskStatus(task.status);
      showToast(task.status === 'Auf dem Weg' ? 'Aufgabe gestartet.' : 'Aufgabe als erledigt markiert.');
      if (task.status === 'Erledigt') selectedTaskIds = selectedTaskIds.filter(id => id !== taskId);
      persistState();
      clearRouteResult();
      renderTasks();
      if (currentDetailTaskId === taskId) showTaskDetail(taskId);
    }

    // Macht aus einer Minutenzahl eine Uhrzeit wie 13:40.
    function formatTime(minutes) {
      const days = Math.floor(minutes / 1440);
      const hours = Math.floor(minutes / 60) % 24;
      const remainder = minutes % 60;
      return String(hours).padStart(2, '0') + ':' + String(remainder).padStart(2, '0')
        + (days > 0 ? ' (+' + days + ' Tag/e)' : '');
    }

    // Das ist der Hauptablauf beim Klick auf 'Route optimieren': Eingaben prüfen, Business Layer aufrufen und Ergebnis anzeigen.
    async function planRoute() {
      const output = document.getElementById('route-result');
      const selectedTasks = globalTasks.filter(task => selectedTaskIds.includes(task.task_id));
      if (selectedTasks.length === 0) {
        output.textContent = 'Bitte mindestens eine Aufgabe auswählen.';
        return;
      }
      const time = document.getElementById('start-time').value;
      if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        output.textContent = 'Bitte eine gültige Startzeit eingeben.';
        return;
      }
      const openTasks = selectedTasks.filter(task => task.status !== 'Erledigt');
      if (openTasks.length === 0) {
        output.textContent = 'Alle ausgewählten Aufgaben sind bereits erledigt.';
        return;
      }
      const validTasks = openTasks.filter(hasValidCoordinates);
      const invalidCount = openTasks.length - validTasks.length;
      if (validTasks.length === 0) {
        output.textContent = 'Keine planbare Aufgabe: Koordinaten fehlen oder sind ungültig.';
        return;
      }
      // Wenn eine Aufgabendauer fehlt oder falsch ist, stoppen wir lieber statt eine falsche Uhrzeit zu zeigen.
      if (validTasks.some(task => !Number.isInteger(task.estimated_duration_min) || task.estimated_duration_min < 0)) {
        output.textContent = 'Bitte die Aufgabendauer prüfen: Sie muss eine ganze, nicht negative Minutenzahl sein.';
        return;
      }
      const parts = time.split(':');
      const startMinutes = Number(parts[0]) * 60 + Number(parts[1]);
      const mode = getTravelMode();

      setRouteLoading(true);
      output.innerHTML = '<span class="text-primary font-semibold">Route wird berechnet …</span>';

      try {
        const route = await optimizeNetworkRoute(validTasks, startMinutes, mode);
        lastPlannedRoute = route;
        renderRoute(route, startMinutes, selectedTasks.length - openTasks.length, invalidCount);
        if (campusMap) drawRouteOnMap(route);
      } catch (error) {
        const fallback = optimizeRoute(validTasks, startMinutes);
        fallback.networkRouting = false;
        fallback.mode = mode;
        fallback.totalTravelMinutes = null;
        fallback.routingError = error.message;
        lastPlannedRoute = fallback;
        renderRoute(fallback, startMinutes, selectedTasks.length - openTasks.length, invalidCount);
        if (campusMap) drawRouteOnMap(fallback);
      } finally {
        setRouteLoading(false);
      }
    }

    // Baut aus dem berechneten Routenergebnis die sichtbare Liste mit Stopps, Zeiten und Summen.
    function renderRoute(route, startMinutes, completedCount, invalidCount) {
      const output = document.getElementById('route-result');
      output.textContent = '';
      const mode = travelModes[route.mode] || travelModes.pedestrian;

      const heading = document.createElement('p');
      heading.className = 'font-bold text-primary';
      heading.textContent = mode.icon + ' ' + mode.label + ' · Start ' + routeStartLabel + ' – ' + formatTime(startMinutes);
      output.appendChild(heading);

      if (!route.networkRouting) {
        const warning = document.createElement('div');
        warning.className = 'mt-2 p-2 rounded-lg bg-error-container text-error text-xs';
        warning.textContent = 'Der Online-Routendienst ist gerade nicht erreichbar (' + (route.routingError || 'unbekannter Fehler')
          + '). Deshalb wird ersatzweise nur die direkte Distanz geschätzt.';
        output.appendChild(warning);
      }

      const list = document.createElement('div');
      list.className = 'mt-3 space-y-0';
      route.stops.forEach(function (stop, index) {
        const row = document.createElement('div');
        row.className = 'grid grid-cols-[32px_1fr] gap-3';
        const rail = document.createElement('div');
        rail.className = 'flex flex-col items-center';
        rail.innerHTML = '<div class="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-[11px] font-bold shadow-sm">'
          + (index + 1) + '</div>'
          + (index < route.stops.length - 1 ? '<div class="route-stop-line flex-1 min-h-8 my-1"></div>' : '');
        const card = document.createElement('div');
        card.className = 'pb-3';
        const title = document.createElement('p');
        title.className = 'font-semibold text-sm text-on-surface';
        title.textContent = stop.task.title;
        const info = document.createElement('p');
        info.className = 'text-[11px] text-on-surface-variant mt-1 leading-relaxed';
        if (route.networkRouting) {
          info.textContent = stop.distance.toFixed(2) + ' km · ' + stop.travelMinutes + ' min Fahrt'
            + ' · Ankunft ' + formatTime(stop.arrivalMinutes)
            + ' · ' + stop.task.estimated_duration_min + ' min vor Ort';
        } else {
          info.textContent = stop.distance.toFixed(2) + ' km direkte Distanz'
            + ' · ' + stop.task.estimated_duration_min + ' min vor Ort';
        }
        card.appendChild(title);
        card.appendChild(info);
        row.appendChild(rail);
        row.appendChild(card);
        list.appendChild(row);
      });
      output.appendChild(list);

      const summary = document.createElement('div');
      summary.className = 'mt-3 grid grid-cols-2 gap-2 text-xs';
      const travelMinutes = route.networkRouting ? route.totalTravelMinutes : '–';
      summary.innerHTML =
        '<div class="p-3 rounded-xl bg-surface-container-low border border-surface-container-high"><span class="text-on-surface-variant">Strecke</span><br><strong class="text-sm">'
        + route.totalDistance.toFixed(2) + ' km</strong></div>'
        + '<div class="p-3 rounded-xl bg-surface-container-low border border-surface-container-high"><span class="text-on-surface-variant">Wegzeit</span><br><strong class="text-sm">'
        + travelMinutes + (route.networkRouting ? ' min' : '') + '</strong></div>'
        + '<div class="p-3 rounded-xl bg-surface-container-low border border-surface-container-high"><span class="text-on-surface-variant">Aufgaben</span><br><strong class="text-sm">'
        + route.totalDuration + ' min</strong></div>'
        + '<div class="p-3 rounded-xl bg-surface-container-low border border-surface-container-high"><span class="text-on-surface-variant">Fertig ca.</span><br><strong class="text-sm">'
        + formatTime(route.endMinutes) + '</strong></div>';
      output.appendChild(summary);

      const note = document.createElement('p');
      note.className = 'text-xs text-on-surface-variant mt-2';
      if (route.networkRouting) {
        note.textContent = 'Routenberechnung über Valhalla/OpenStreetMap. '
          + (route.mode === 'multimodal'
              ? 'Bei Öffis wird die Stoppreihenfolge über die Fuß-Erreichbarkeit angenähert; die einzelnen Wege werden multimodal geroutet. '
              : 'Die Stoppreihenfolge wird anhand realer Wegzeiten des gewählten Verkehrsmittels berechnet. ')
          + (route.transitFallbacks > 0
              ? route.transitFallbacks + ' Öffi-Abschnitt(e) konnten nicht multimodal berechnet werden und wurden als Fußweg geroutet. '
              : '')
          + 'Kein Rückweg zum Start. ';
      } else {
        note.textContent = 'Ersatzberechnung ohne Online-Routendienst. Kein Rückweg zum Start. ';
      }
      note.textContent += completedCount + ' erledigte und ' + invalidCount
        + ' Aufgaben mit ungültigen Koordinaten übersprungen.';
      output.appendChild(note);

      const mapButton = document.createElement('button');
      mapButton.type = 'button';
      mapButton.className = 'mt-3 w-full px-4 py-2.5 bg-on-surface text-white rounded-xl text-xs font-bold hover:bg-primary';
      mapButton.textContent = 'Route auf Karte anzeigen';
      mapButton.onclick = function () { switchScreen('map'); };
      output.appendChild(mapButton);
    }

    // Hier werden die Felder der Detailansicht mit der gewählten Aufgabe gefüllt.
    // Füllt die Detailansicht mit den Daten der angeklickten Aufgabe.
    function showTaskDetail(taskId) {
      const task = globalTasks.find(t => t.task_id === taskId);
      if (!task) return;
      currentDetailTaskId = taskId;

      document.getElementById('detail-task-id').innerText = 'ID: #' + task.task_id;
      document.getElementById('detail-title').innerText = task.title;
      document.getElementById('detail-desc').innerText = task.description;
      document.getElementById('detail-status').innerText = task.status;
      document.getElementById('detail-priority').innerText = priorityLabel(task.priority);
      document.getElementById('detail-category').innerText = task.category || '—';
      document.getElementById('detail-duration').innerText = task.estimated_duration_min + ' min';
      document.getElementById('detail-location').innerText = task.location_name || 'Standort aus Koordinaten';
      document.getElementById('detail-deadline').innerText = formatDeadline(task.deadline);
      document.getElementById('detail-coords').innerText = task.latitude + ', ' + task.longitude;
      document.getElementById('detail-file').innerText = task.attachment_file || 'Kein Anhang vorhanden';

      const routeButton = document.getElementById('detail-route-button');
      const selected = selectedTaskIds.includes(taskId);
      routeButton.textContent = selected ? 'Aus Route entfernen' : 'Für Route auswählen';
      routeButton.disabled = task.status === 'Erledigt';
      routeButton.classList.toggle('opacity-50', task.status === 'Erledigt');

      const statusButton = document.getElementById('detail-status-button');
      statusButton.textContent = task.status === 'Geplant' ? 'Aufgabe starten'
        : (task.status === 'Auf dem Weg' ? 'Als erledigt markieren' : 'Erledigt');
      statusButton.disabled = task.status === 'Erledigt';
      statusButton.classList.toggle('opacity-50', task.status === 'Erledigt');

      const deleteButton = document.getElementById('detail-delete-button');
      deleteButton.classList.toggle('hidden', task.is_local !== true);

      switchScreen('details');
    }

    // Wählt die geöffnete Aufgabe für die Route aus oder entfernt sie wieder.
    function toggleDetailTaskSelection() {
      if (!currentDetailTaskId) return;
      const task = globalTasks.find(task => task.task_id === currentDetailTaskId);
      if (!task || task.status === 'Erledigt') return;
      const selected = selectedTaskIds.includes(currentDetailTaskId);
      selectTask(currentDetailTaskId, !selected);
      showTaskDetail(currentDetailTaskId);
    }

    // Ändert den Status der Aufgabe, die gerade in der Detailansicht geöffnet ist.
    function advanceDetailTaskStatus() {
      if (!currentDetailTaskId) return;
      advanceTaskStatus(currentDetailTaskId);
    }

    // Diese Funktion zeigt immer genau den gewünschten Bereich der App.
    // Wechselt zwischen Aufgabenansicht, Detailansicht und Kartenansicht.
    function switchScreen(screenName) {
      document.querySelectorAll('.screen-container').forEach(el => el.classList.remove('active'));
      const targetScreen = document.getElementById('screen-' + screenName);
      if (targetScreen) targetScreen.classList.add('active');

      document.querySelectorAll('.nav-tab').forEach(tab => {
        if (tab.getAttribute('data-target') === screenName) {
          tab.classList.add('text-primary', 'font-bold');
          tab.classList.remove('text-on-surface-variant', 'font-medium');
        } else {
          tab.classList.remove('text-primary', 'font-bold');
          tab.classList.add('text-on-surface-variant', 'font-medium');
        }
      });

      const subtitle = document.getElementById('screen-subtitle');
      if (screenName === 'map') {
        subtitle.innerText = 'Kartenansicht';
        setTimeout(function () {
          ensureMap();
          if (campusMap) {
            campusMap.invalidateSize();
            refreshMapMarkers();
            if (lastPlannedRoute) drawRouteOnMap(lastPlannedRoute);
          }
        }, 0);
      } else if (screenName === 'errands') subtitle.innerText = 'Aufgaben & JSON-Daten';
      else if (screenName === 'details') subtitle.innerText = 'Aufgabendetails';

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Wenn jemand die Escape-Taste drückt, schließen wir das Aufgabenformular.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeTaskModal();
    });

    // Klickt man neben das offene Formular auf den dunklen Hintergrund, wird es ebenfalls geschlossen.
    document.getElementById('task-modal').addEventListener('click', function (event) {
      if (event.target === this) closeTaskModal();
    });

    // Ganz am Ende starten wir die App und laden die Aufgaben.
    initDataset();
