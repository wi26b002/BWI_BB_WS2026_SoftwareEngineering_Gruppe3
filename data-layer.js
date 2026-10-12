// DATA LAYER
// Verantwortlich für Datenquellen, Browser-Persistenz und externe Routing-Daten.
// Keine DOM-Manipulation und keine UI-Logik.

window.CampusRouteData = (function () {
  'use strict';

  const storageKey = 'campusroute-state-v2';
  const routingApiBase = 'https://valhalla1.openstreetmap.de';
  const routingCache = new Map();

  async function loadTasks() {
    const response = await fetch('./campus_tasks.json');
    if (!response.ok) {
      throw new Error('HTTP Status ' + response.status + ' beim Laden der JSON-Datei');
    }

    const tasks = await response.json();
    if (!Array.isArray(tasks)) {
      throw new Error('Die JSON-Datei muss eine Aufgabenliste enthalten.');
    }
    return tasks;
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildRoutingUrl(action, payload) {
    return routingApiBase + action + '?json=' + encodeURIComponent(JSON.stringify(payload));
  }

  async function requestRouting(action, payload) {
    const cacheKey = action + '|' + JSON.stringify(payload);
    if (routingCache.has(cacheKey)) {
      return routingCache.get(cacheKey);
    }

    const response = await fetch(buildRoutingUrl(action, payload));
    if (!response.ok) {
      let message = 'HTTP ' + response.status;
      try {
        const errorData = await response.json();
        message = errorData.error || errorData.status_message || message;
      } catch (_) {}
      throw new Error(message);
    }

    const data = await response.json();
    routingCache.set(cacheKey, data);
    return data;
  }

  return {
    storageKey: storageKey,
    loadTasks: loadTasks,
    loadState: loadState,
    saveState: saveState,
    requestRouting: requestRouting
  };
})();
