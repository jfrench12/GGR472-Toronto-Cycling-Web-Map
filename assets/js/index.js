/*--------------------------------------------------------------------
GGR472 LAB 4: Incorporating GIS Analysis into web maps using Turf.js
--------------------------------------------------------------------*/

/*--------------------------------------------------------------------
Step 1: INITIALIZE MAP
--------------------------------------------------------------------*/
// Define access token
mapboxgl.accessToken = "pk.eyJ1IjoiamZyZW5jaDUiLCJhIjoiY201eGVlNG42MDg5bjJub25nZjF3b3Y5eiJ9.i1clyXkpZVVJQ_iy-Jt7DQ"; // Mapbox public map token

// Default map location data so we can reuse it on the reset button
const defCenter = [-79.35, 43.7]; // Downtown Toronto [long, lat]
const defZoom = 11;

// Initialize map
const map = new mapboxgl.Map({
	container: "map", // container id in HTML
	style: "mapbox://styles/jfrench5/cm6vcs0z1002m01s3cfz02880", // Custom style using satellite image
	center: defCenter, // starting point
	zoom: defZoom, // starting zoom level
});

// Add geocoder and controls
map.addControl(new mapboxgl.NavigationControl());
map.addControl(new mapboxgl.FullscreenControl());
const geocoder = new MapboxGeocoder({
	accessToken: mapboxgl.accessToken,
	mapboxgl: mapboxgl,
	countries: "ca",
	bbox: [-79.6393, 43.6511, -79.1166, 43.8554], // Only allow searching within Toronto
	proximity: [-79.3832, 43.6532], // Prioritize entries based on proximity to downtown
});

document.getElementById("geocoder").appendChild(geocoder.onAdd(map));

/*--------------------------------------------------------------------
Step 2: VIEW GEOJSON POINT DATA ON MAP
--------------------------------------------------------------------*/
let collisionJsonPromise = fetch(
	"https://raw.githubusercontent.com/smith-lg/ggr472-lab4/refs/heads/main/data/pedcyc_collision_06-21.geojson"
).then((res) => res.json());

map.on("load", async () => {
	/*--------------------------------------------------------------------
		Step 3: CREATE BOUNDING BOX AND HEXGRID
	--------------------------------------------------------------------*/
	const collisionData = await collisionJsonPromise;
	const envelope = turf.envelope(collisionData);

	const bboxscaled = turf.bbox(turf.transformScale(envelope, 1.1));
	const hexGrid = turf.hexGrid(bboxscaled, 0.5, { units: "kilometers" });

	/*--------------------------------------------------------------------
	    Step 4: AGGREGATE COLLISIONS BY HEXGRID
	--------------------------------------------------------------------*/
	const hexGridWithCollisions = turf.collect(hexGrid, collisionData, "_id", "collision_ids");
	let maxCollisions = 0;
	hexGridWithCollisions.features.forEach((feat, i) => {
		feat.properties.count = feat.properties.collision_ids.length;
		feat.id = i; // Need this for the hover transparency
		if (feat.properties.count > maxCollisions) {
			maxCollisions = feat.properties.count;
		}
	});

	// For the popups for the points we need to ensure the underlying collision data has an id. They have ids
	// in the geojson properties but mapbox needs it to be a top level property on the feature
	collisionData.features.forEach((feat) => (feat.id = feat.properties._id));

	/*--------------------------------------------------------------------
		Step 5: FINALIZE YOUR WEB MAP
	--------------------------------------------------------------------*/
	// Add the hexgrid as a GeoJSON source.
	map.addSource("hexgrid", {
		type: "geojson",
		data: hexGridWithCollisions,
	});

	// Add a layer for the hexgrid with a fill color expression based on the 'count' property.
	map.addLayer({
		id: "hexgrid-layer",
		type: "fill",
		source: "hexgrid",
		paint: {
			// Colour interpolated between yellow and red based on number of collisions relative to max
			"fill-color": [
				"interpolate",
				["linear"],
				["get", "count"],
				0,
				"#fef0d9",
				maxCollisions * 0.25,
				"#fdcc8a",
				maxCollisions * 0.5,
				"#fc8d59",
				maxCollisions * 0.75,
				"#e34a33",
				maxCollisions,
				"#d7301f",
			],
			// Make the hovered hexagon more transparent
			// Also make everything more transparent as you zoom in (to better see detail)
			"fill-opacity": [
				"interpolate",
				["linear"],
				["zoom"],
				10,
				["case", ["boolean", ["feature-state", "hover"], false], 0.5, 0.7],
				12,
				["case", ["boolean", ["feature-state", "hover"], false], 0.3, 0.5],
				14,
				["case", ["boolean", ["feature-state", "hover"], false], 0.1, 0.2],
				16,
				["case", ["boolean", ["feature-state", "hover"], false], 0.05, 0.1],
			],
			"fill-outline-color": "#ffffff", // White outline on hexagons
		},
		filter: ["!=", "count", 0], // Hide hexagons with no collisions
	});

	// Show the collision points as circles.
	map.addSource("collisions", {
		type: "geojson",
		data: collisionData,
	});
	map.addLayer({
		id: "collisions-layer",
		type: "circle",
		source: "collisions",
		paint: {
			// When hovering a point make it bigger
			"circle-radius": [
				"case",
				["boolean", ["feature-state", "hover"], false],
				8, // radius when hovered
				4, // default radius
			],
			// when hovering a point make it red instead of blue
			"circle-color": [
				"case",
				["boolean", ["feature-state", "hover"], false],
				"#ff0000", // color when hovered
				"#0000ff", // default color
			],
		},
	});
});

/*--------------------------------------------------------------------
	Panel and opacity change when hovering the hexagons
--------------------------------------------------------------------*/
let hoveredHexId = null;

// Since having 2 popups was confusing, we show the collision count for the hovered hex in a panel
const hexPanel = document.getElementById("hex-panel");

// When hovering over a hexagon, show the popup and change the transparency of the hovered hex
map.on("mousemove", "hexgrid-layer", (e) => {
	if (e.features.length === 0) {
		return;
	}
	// Reset the previously hovered hexagon's state
	if (hoveredHexId !== null) {
		map.setFeatureState({ source: "hexgrid", id: hoveredHexId }, { hover: false });
	}
	// Get the feature under the cursor and mark it as hovered
	hoveredHexId = e.features[0].id;
	map.setFeatureState({ source: "hexgrid", id: hoveredHexId }, { hover: true });

	hexPanel.innerHTML = "<b>Collisions in this area:</b> " + e.features[0].properties.count;
	// Show the hex info panel (using opacity for nicer animation)
	hexPanel.style.opacity = 1;
});

// Reset the feature state and remove the popup when the mouse leaves the hexgrid layer.
map.on("mouseleave", "hexgrid-layer", () => {
	if (hoveredHexId !== null) {
		map.setFeatureState({ source: "hexgrid", id: hoveredHexId }, { hover: false });
	}
	hoveredHexId = null;
	// Hide the hex info panel (using opacity for nicer animation)
	hexPanel.style.opacity = 0;
});

/*--------------------------------------------------------------------
	Popup with info when for accident point
--------------------------------------------------------------------*/
// Track the currently hovered collision point's id
let hoveredCollisionId = null;

// Change cursor when hovering over points
map.on("mousemove", "collisions-layer", () => {
	map.getCanvas().style.cursor = "pointer";
});
map.on("mouseleave", "collisions-layer", () => {
	map.getCanvas().style.cursor = "";
});

// Create a popup for collision details
const collisionPopup = new mapboxgl.Popup({
	closeButton: false,
	closeOnClick: false,
});


// Highlight collision point on hover.
map.on("mousemove", "collisions-layer", (e) => {
	if (e.features.length === 0) {
		return;
	}
	const collisionId = e.features[0].properties._id;
	if (hoveredCollisionId !== collisionId) {
		if (hoveredCollisionId !== null) {
			map.setFeatureState({ source: "collisions", id: hoveredCollisionId }, { hover: false });
		}
		hoveredCollisionId = collisionId;
		map.setFeatureState({ source: "collisions", id: hoveredCollisionId }, { hover: true });
	}
	// Some properties may be undefined, in which case we should show "Unknown" instead of "undefined"
	const content = `<strong>Accident Number:</strong> ${e.features[0].properties.ACCNUM || "Unknown"}<br>
        <strong>Year:</strong> ${e.features[0].properties.YEAR || "Unknown"}<br>
        <strong>Visibility:</strong> ${e.features[0].properties.VISIBILITY || "Unknown"}<br>
        <strong>Light:</strong> ${e.features[0].properties.LIGHT || "Unknown"}<br>
        <strong>Road Surface:</strong> ${e.features[0].properties.RDSFCOND || "Unknown"}<br>
        <strong>Accident Class:</strong> ${e.features[0].properties.ACCCLASS || "Unknown"}<br>
        <strong>Injury:</strong> ${e.features[0].properties.INJURY || "Unknown"}<br>
        <strong>Type:</strong> ${e.features[0].properties.INVTYPE || "Unknown"}<br>
        <strong>Neighbourhood:</strong> ${e.features[0].properties.NEIGHBOURHOOD_158 || "Unknown"}`;
	collisionPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
});

// Remove hover effect and popup when leaving the layer.
map.on("mouseleave", "collisions-layer", () => {
	if (hoveredCollisionId !== null) {
		map.setFeatureState({ source: "collisions", id: hoveredCollisionId }, { hover: false });
		hoveredCollisionId = null;
	}
	collisionPopup.remove();
});

/*--------------------------------------------------------------------
	Map interactivity elements
--------------------------------------------------------------------*/
// Add event listener which returns map view to full screen on button click using flyTo method
document.getElementById("returnbutton").addEventListener("click", () => {
	map.flyTo({
		center: defCenter,
		zoom: defZoom,
		essential: true,
	});
});

// Change display of legend based on checkbox
let legendcheck = document.getElementById("legendcheck");
legendcheck.addEventListener("change", (e) => (legend.style.display = e.target.checked ? "block" : "none"));

// Change display of collision points based on checkbox
document.getElementById("collisioncheck").addEventListener("change", (e) => {
	map.setLayoutProperty("collisions-layer", "visibility", e.target.checked ? "visible" : "none");
});

// Change display of collision hex areas based on checkbox
document.getElementById("hexcheck").addEventListener("change", (e) => {
	map.setLayoutProperty("hexgrid-layer", "visibility", e.target.checked ? "visible" : "none");
});
