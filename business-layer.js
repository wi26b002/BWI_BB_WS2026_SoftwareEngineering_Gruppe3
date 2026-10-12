// BUSINESS LAYER
// Enthält die Fachlogik von CampusRoute: Validierung, Statusübergänge,
// Distanzberechnung und Routenoptimierung. Keine DOM-Manipulation.

window.CampusRouteBusiness = (function () {
  'use strict';

  const defaultStart = { latitude: 48.2390, longitude: 16.3777 };

  const travelModes = {
    pedestrian: { label: 'Zu Fuß', icon: '🚶', matrixCosting: 'pedestrian' },
    bicycle: { label: 'Fahrrad', icon: '🚲', matrixCosting: 'bicycle' },
    auto: { label: 'Auto', icon: '🚗', matrixCosting: 'auto' },
    multimodal: { label: 'Öffis', icon: '🚇', matrixCosting: 'pedestrian' }
  };

  function priorityValue(priority) {
    if (priority === 'High') return 3;
    if (priority === 'Medium') return 2;
    return 1;
  }

  function hasValidCoordinates(task) {
    return Number.isFinite(task.latitude) && Number.isFinite(task.longitude)
      && Math.abs(task.latitude) <= 90 && Math.abs(task.longitude) <= 180;
  }

  function nextTaskStatus(status) {
    if (status === 'Geplant') return 'Auf dem Weg';
    if (status === 'Auf dem Weg') return 'Erledigt';
    return 'Erledigt';
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371;
    const toRadians = degrees => degrees * Math.PI / 180;
    const latitudeDifference = toRadians(lat2 - lat1);
    const longitudeDifference = toRadians(lon2 - lon1);

    const a = Math.sin(latitudeDifference / 2) ** 2
      + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
      * Math.sin(longitudeDifference / 2) ** 2;
    const angle = 2 * Math.asin(Math.sqrt(Math.min(1, a)));

    return earthRadiusKm * angle;
  }

  function findNearestTask(latitude, longitude, tasks) {
    let nearestTask = null;
    let shortestDistance = Infinity;

    for (const task of tasks) {
      if (task.status === 'Erledigt' || !hasValidCoordinates(task)) continue;
      const distance = calculateDistance(latitude, longitude, task.latitude, task.longitude);
      if (distance < shortestDistance) {
        nearestTask = task;
        shortestDistance = distance;
      }
    }
    return nearestTask;
  }

  function optimizeRoute(tasks, startMinutes, startPoint = defaultStart) {
    let remaining = tasks.filter(task => task.status !== 'Erledigt' && hasValidCoordinates(task));
    let latitude = startPoint.latitude;
    let longitude = startPoint.longitude;
    let currentMinutes = startMinutes;
    let totalDistance = 0;
    let totalDuration = 0;
    const stops = [];

    while (remaining.length > 0) {
      const task = findNearestTask(latitude, longitude, remaining);
      if (!task) break;

      const distance = calculateDistance(latitude, longitude, task.latitude, task.longitude);
      const duration = task.estimated_duration_min;

      stops.push({ task: task, distance: distance, startMinutes: currentMinutes });
      totalDistance += distance;
      totalDuration += duration;
      currentMinutes += duration;
      latitude = task.latitude;
      longitude = task.longitude;
      remaining = remaining.filter(other => other.task_id !== task.task_id);
    }

    return {
      stops: stops,
      totalDistance: totalDistance,
      totalDuration: totalDuration,
      endMinutes: currentMinutes
    };
  }

  function decodePolyline6(encoded) {
    const coordinates = [];
    let index = 0;
    let latitude = 0;
    let longitude = 0;

    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let byte;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      latitude += (result & 1) ? ~(result >> 1) : (result >> 1);

      result = 0;
      shift = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      longitude += (result & 1) ? ~(result >> 1) : (result >> 1);

      coordinates.push([latitude / 1e6, longitude / 1e6]);
    }

    return coordinates;
  }

  function localIsoDateTime(totalMinutes) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setMinutes(totalMinutes);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return year + '-' + month + '-' + day + 'T' + hours + ':' + minutes;
  }

  async function getTravelMatrix(tasks, mode, startPoint) {
    const matrixMode = travelModes[mode].matrixCosting;
    const locations = [{ lat: startPoint.latitude, lon: startPoint.longitude }]
      .concat(tasks.map(task => ({ lat: task.latitude, lon: task.longitude })));

    const data = await CampusRouteData.requestRouting('/sources_to_targets', {
      sources: locations,
      targets: locations,
      costing: matrixMode,
      units: 'kilometers',
      verbose: false
    });

    const matrix = data.sources_to_targets;
    if (!matrix || !Array.isArray(matrix.durations) || !Array.isArray(matrix.distances)) {
      throw new Error('Routing-Matrix konnte nicht gelesen werden.');
    }
    return matrix;
  }

  function orderTasksByNetwork(tasks, matrix) {
    let currentIndex = 0;
    const remaining = tasks.map((task, index) => ({ task: task, matrixIndex: index + 1 }));
    const ordered = [];

    while (remaining.length > 0) {
      let bestPosition = -1;
      let bestDuration = Infinity;

      remaining.forEach((candidate, position) => {
        const duration = matrix.durations[currentIndex]
          ? matrix.durations[currentIndex][candidate.matrixIndex]
          : null;

        if (Number.isFinite(duration) && duration < bestDuration) {
          bestDuration = duration;
          bestPosition = position;
        }
      });

      if (bestPosition < 0) {
        throw new Error('Mindestens ein ausgewählter Standort ist mit diesem Verkehrsmittel nicht erreichbar.');
      }

      const chosen = remaining.splice(bestPosition, 1)[0];
      ordered.push(chosen.task);
      currentIndex = chosen.matrixIndex;
    }

    return ordered;
  }

  async function fetchRouteLeg(from, to, mode, departureMinutes) {
    const requestedMode = mode;

    async function request(costing) {
      return CampusRouteData.requestRouting('/route', {
        locations: [
          { lat: from.latitude, lon: from.longitude },
          { lat: to.latitude, lon: to.longitude }
        ],
        costing: costing,
        units: 'kilometers',
        language: 'de-DE',
        date_time: { type: 1, value: localIsoDateTime(departureMinutes) },
        directions_options: { units: 'kilometers', language: 'de-DE' }
      });
    }

    let data;
    let usedMode = requestedMode;
    let usedFallback = false;

    try {
      data = await request(requestedMode);
    } catch (error) {
      if (requestedMode !== 'multimodal') throw error;
      data = await request('pedestrian');
      usedMode = 'pedestrian';
      usedFallback = true;
    }

    if (!data.trip || !data.trip.summary || !Array.isArray(data.trip.legs) || data.trip.legs.length === 0) {
      throw new Error('Keine Routendaten erhalten.');
    }

    const leg = data.trip.legs[0];
    const summary = leg.summary || data.trip.summary;

    return {
      distanceKm: Number(summary.length),
      travelMinutes: Math.max(1, Math.round(Number(summary.time) / 60)),
      shape: typeof leg.shape === 'string' ? decodePolyline6(leg.shape) : [],
      usedMode: usedMode,
      usedFallback: usedFallback
    };
  }

  async function optimizeNetworkRoute(tasks, startMinutes, mode, startPoint = defaultStart) {
    if (!travelModes[mode]) throw new Error('Unbekanntes Verkehrsmittel.');

    const matrix = await getTravelMatrix(tasks, mode, startPoint);
    const orderedTasks = orderTasksByNetwork(tasks, matrix);

    let current = { latitude: startPoint.latitude, longitude: startPoint.longitude };
    let currentMinutes = startMinutes;
    let totalDistance = 0;
    let totalTravelMinutes = 0;
    let totalTaskDuration = 0;
    let transitFallbacks = 0;
    const stops = [];
    const pathCoordinates = [[startPoint.latitude, startPoint.longitude]];

    for (const task of orderedTasks) {
      const leg = await fetchRouteLeg(current, task, mode, currentMinutes);
      const arrivalMinutes = currentMinutes + leg.travelMinutes;
      const finishMinutes = arrivalMinutes + task.estimated_duration_min;

      stops.push({
        task: task,
        distance: leg.distanceKm,
        travelMinutes: leg.travelMinutes,
        arrivalMinutes: arrivalMinutes,
        startMinutes: arrivalMinutes,
        finishMinutes: finishMinutes,
        usedMode: leg.usedMode
      });

      if (leg.shape.length > 0) {
        pathCoordinates.push(...leg.shape.slice(1));
      } else {
        pathCoordinates.push([task.latitude, task.longitude]);
      }

      if (leg.usedFallback) transitFallbacks++;
      totalDistance += leg.distanceKm;
      totalTravelMinutes += leg.travelMinutes;
      totalTaskDuration += task.estimated_duration_min;
      currentMinutes = finishMinutes;
      current = { latitude: task.latitude, longitude: task.longitude };
    }

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
