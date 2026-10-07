# CampusRoute – Location-Based Student Task Optimizer

CampusRoute helps students plan an ordered route through selected tasks around FH Technikum Wien. It loads 10 tasks from JSON, displays approximate distances, and plans a route from FH Technikum Wien (48.2390, 16.3777) using a chosen start time. Completed tasks are excluded; dashboard counters reflect the current task statuses.

## Technologies and logical tiers

Technologies: HTML, Vanilla JavaScript, Tailwind CSS via CDN, JSON, Leaflet, OpenStreetMap, and the public Valhalla routing API.

- **Presentation tier:** HTML/Tailwind user interface plus the Leaflet/OpenStreetMap map in `index.html`.
- **Logic tier:** JavaScript data handling, Haversine distance calculation, and the greedy nearest-neighbour route algorithm in `index.html`.
- **Data tier:** `campus_tasks.json`.

These are logical tiers within a static browser application. There is **no application backend or database**. A local HTTP server only serves the files. No npm, framework, or build step is required. Internet access is needed for Tailwind CDN, Google Fonts, Leaflet CDN, and OpenStreetMap map tiles.

## Run the application

Recommended: open the repository folder in Visual Studio Code, install/use the **Live Server** extension, and open `index.html` with Live Server. Use the address shown by the extension (its default port is usually 5500).

Alternative: run this command **from the repository root**, where `index.html` and `campus_tasks.json` are located:

```sh
python3 -m http.server 3000
```

Then open **http://localhost:3000**. Use HTTP rather than opening the HTML file directly, so the JSON fetch works.

Select tasks using the card checkboxes, enter a start time, choose **walking, bicycle, car, or public transport**, and click **Route optimieren**. For walking, bicycle, and car, the greedy stop order is based on Valhalla's network travel-time matrix. Public transport uses pedestrian reachability for the stop order because Valhalla does not provide multimodal matrices; each public-transport leg is then routed with Valhalla's multimodal routing. The result shows routed distance, travel time, task time, approximate arrival times, and totals. Use **Route auf Karte anzeigen** or the **Karte** tab to view the routed path on OpenStreetMap.

## Run the tests

Open **`/tests.html` through the same server** (for Python: http://localhost:3000/tests.html). The page displays PASS/FAIL, expected and actual results, and a summary. Reload to repeat.

The seven browser tests cover identical-coordinate distance, distance symmetry, nearest-task selection, a single-task route, exclusion of completed tasks, an empty route, and safe handling of invalid coordinates. They call the application's actual functions through a hidden iframe; no external test framework is used.

## Algorithm and limitations

The route repeatedly chooses the nearest remaining selected, unfinished task using Haversine distance, advances the clock by the task duration, and continues from that task's coordinates. Invalid coordinates are skipped.

- The primary route uses Valhalla/OpenStreetMap network routing for walking, bicycle, car, and multimodal/public-transport legs. If the public routing service is unavailable, the application falls back to the local Haversine approximation instead of crashing.
- Greedy nearest-neighbour is a heuristic, so the result is not guaranteed globally optimal.
- Public transport uses pedestrian reachability to determine stop order because multimodal matrices are not available; the individual legs are still requested as multimodal routes.
- Deadlines and priorities are currently not part of route optimization.
- Status changes last only for the current browser session and reset on reload.
- No return journey to the start is included.
- The public Valhalla endpoint is a demo service with fair-use/rate limits, so internet access is required for live routing.
