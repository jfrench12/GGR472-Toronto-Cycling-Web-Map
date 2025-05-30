/*--------------------------------------------------------------------
	GGR472 Project
--------------------------------------------------------------------*/
// Define access token
mapboxgl.accessToken = "pk.eyJ1IjoiamZyZW5jaDUiLCJhIjoiY201eGVlNG42MDg5bjJub25nZjF3b3Y5eiJ9.i1clyXkpZVVJQ_iy-Jt7DQ"; // Mapbox public map token

// Default map location data so we can reuse it on the reset button
const defCenter = [-79.39, 43.72]; // Downtown Toronto [long, lat]
const defZoom = 10.3;

const MAP_QUARTILE_COLOURS = ["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#d7301f"];
const CLUSTER_COLORS = ["#fbb4ae", "#ccebc5", "#ffffcc", "#fed9a6"];
const NEIGHBOURHOOD_FIXED_COLOUR = "grey"; // Default neighbourhood colour when not colour coding
const STYLE_SATELLITE = "mapbox://styles/jfrench5/cm6vcs0z1002m01s3cfz02880";
const STYLE_DEFAULT = "mapbox://styles/jfrench5/cm94m3n2w008601qt62bf163d";

// Features which you can colour by, along with their names in the dropdown
const NEIGHBOURHOOD_FEATURES = {
	None: "No colour",
	Capacity: "Bikeshare station capacity",
	BikeCapN_1: "Capacity of stations per capita",
	BikeNetAre: "Cycling network coverage",
	CLUSTER_ID: "K-means cluster analysis",
	Median_tot: "Median total income",
	Join_Count: "Number of bikeshare stations",
	BikeWalkPe: "Percentage of commuters using biking/walking",
	CarPerc: "Percentage of commuters using cars",
	Commute15: "Percentage of commutes under 15 minutes",
	Age15to24: "Percentage population aged 15-24",
	Age65plus: "Percentage population aged 65+",
};

// Initialize map
const satelliteCheck = document.getElementById("satellitecheck"); // Need this to know which style to use to start
const map = new mapboxgl.Map({
	container: "map", // container id in HTML
	style: satelliteCheck.checked ? STYLE_SATELLITE : STYLE_DEFAULT,
	minZoom: 10, // Minimum zoom level
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
	Load data
--------------------------------------------------------------------*/
const bikeStationJsonPromise = fetch(
	"https://jfrench12.github.io/GGR472-Toronto-Cycling-Web-Map/assets/geojson/bike-share-stations.geojson"
).then((res) => res.json());
const neighbourhoodJsonPromise = fetch(
	"https://jfrench12.github.io/GGR472-Toronto-Cycling-Web-Map/assets/geojson/NeighbourhoodsWithCluster.geojson"
).then(async (res) => {
	const json = await res.json();
	json.features.forEach((feature, index) => {
		feature.id = index;
	});
	return json;
});

// Returns the colours for mapbox to colour by quartile values
function getQuartileColours(values) {
	const sorted = values.toSorted((a, b) => a - b);
	const quartiles = [
		sorted[0],
		sorted[Math.floor(sorted.length * 0.25)],
		sorted[Math.floor(sorted.length * 0.5)],
		sorted[Math.floor(sorted.length * 0.75)],
		sorted[sorted.length - 1],
	];
	// Mapbox doesn't show correctly if any of the values are the same so only include colours where they are bigger
	// than the previous quartile
	const colours = [quartiles[0], MAP_QUARTILE_COLOURS[0]];
	for (let i = 1; i < quartiles.length; i++) {
		if (quartiles[i] > quartiles[i - 1]) {
			colours.push(quartiles[i]);
			colours.push(MAP_QUARTILE_COLOURS[i]);
		}
	}
	return colours;
}

// Sets the colour for the neighbourhoods to use a given feature
async function setNeighbourhoodsFeature(featureName) {
	// Update the legend key
	updateLegendForNeighbourhoodsFeature(featureName);

	// For constant just use a fixed colour
	if (featureName === "None") {
		map.setPaintProperty("neighbourhoods-layer", "fill-color", NEIGHBOURHOOD_FIXED_COLOUR);
		return;
	}

	// For clusters, use 4 fixed colours
	if (featureName === "CLUSTER_ID") {
		map.setPaintProperty("neighbourhoods-layer", "fill-color", [
			"match",
			["get", featureName],
			1,
			CLUSTER_COLORS[0],
			2,
			CLUSTER_COLORS[1],
			3,
			CLUSTER_COLORS[2],
			4,
			CLUSTER_COLORS[3],
			"transparent", // Default if no cluster ID
		]);
		return;
	}

	map.setPaintProperty("neighbourhoods-layer", "fill-color", [
		"interpolate",
		["linear"],
		["get", featureName],
		...getQuartileColours((await neighbourhoodJsonPromise).features.map((feat) => feat.properties[featureName])),
	]);
}

// Adds neighbourhoods from neighbourhoodJson to the map
function loadNeighbourhoodLayers(neighbourhoodJson) {
	map.addSource("neighbourhoods", {
		type: "geojson",
		data: neighbourhoodJson,
	});

	// Fill for the neighboorhood polygons (bottom layer)
	map.addLayer({
		id: "neighbourhoods-layer",
		type: "fill",
		source: "neighbourhoods",
		layout: {},
		paint: {
			// By default neighbourhoods aren't coloured
			"fill-color": NEIGHBOURHOOD_FIXED_COLOUR,
			// Make the hovered neighbourhood more transparent
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
		},
	});
	// Outline for neighbourhood polygons (2nd layer)
	map.addLayer({
		id: "neighbourhoods-outline",
		type: "line",
		source: "neighbourhoods",
		layout: {},
		paint: {
			"line-color": "#000000", // Outline color
			"line-width": 1, // Outline width
		},
	});
}

// Gets the feature collection for the buffers around the stations using turf.buffer
function bufferedStations(stationData, bufferSize) {
	return {
		type: "FeatureCollection",
		features: stationData.features.map((station) =>
			// Buffer size is meters so need to divide by 1000
			turf.buffer(station, bufferSize / 1000, { units: "kilometers" })
		),
	};
}

// Code to initialize the map on load, kept in a separate function so we can also call it when the style changes
async function loadMapLayers() {
	/* Neighbourhoods */
	// Wait to finish downloading the neighboorhood geojson
	const neighbourhoodJson = await neighbourhoodJsonPromise;
	// Only try to show neighbourhoods if they loaded ok, otherwise don't add layers so at least you can see
	// the rest of the map
	if (neighbourhoodJson) {
		loadNeighbourhoodLayers(neighbourhoodJson);
	}

	/* Bike station data (required for hex) */
	const stationData = await bikeStationJsonPromise;
	// For the popups for the points we need to ensure the underlying station data has an id. They have ids
	// in the geojson properties but mapbox needs it to be a top level property on the feature
	stationData.features.forEach((feat) => (feat.id = feat.properties.ID));

	/* Hexgrid using turfjs */
	const envelope = turf.envelope(stationData);

	const bboxscaled = turf.bbox(turf.transformScale(envelope, 1.1));
	const hexGrid = turf.hexGrid(bboxscaled, 0.5, { units: "kilometers" });

	const hexGridWithstations = turf.collect(hexGrid, stationData, "ID", "station_ids");
	let maxStations = 0;
	hexGridWithstations.features.forEach((feat, i) => {
		feat.properties.capacity = 0;
		// Add the capacities of all stations in this area
		if (feat.properties.station_ids.length) {
			stationData.features.forEach((dataFeat) => {
				if (feat.properties.station_ids.indexOf(dataFeat.properties.ID) !== -1) {
					feat.properties.capacity += dataFeat.properties.Capacity;
				}
			});
		}
		feat.properties.count = feat.properties.station_ids.length;
		feat.id = i; // Need this for the hover transparency
		if (feat.properties.count > maxStations) {
			maxStations = feat.properties.count;
		}
	});

	// Add the hexgrid as a GeoJSON source.
	map.addSource("hexgrid", {
		type: "geojson",
		data: hexGridWithstations,
	});

	// Add a layer for the hexgrid with a fill color expression based on the 'count' property.
	map.addLayer({
		id: "hexgrid-layer",
		type: "fill",
		source: "hexgrid",
		paint: {
			// Colour interpolated between yellow and red based on number of stations relative to max
			"fill-color": [
				"interpolate",
				["linear"],
				["get", "count"],
				// We don't show hexes with 0 capacity so don't include them in the quartile claculation
				...getQuartileColours(
					hexGridWithstations.features.map((feat) => feat.properties.count).filter((val) => val !== 0)
				),
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
		filter: ["!=", "count", 0], // Hide hexagons with no stations
		layout: {
			visibility: "none", // Default to neighbourhoods view
		},
	});

	/* Station service area */
	map.addSource("service-area", {
		type: "geojson",
		data: "https://jfrench12.github.io/GGR472-Toronto-Cycling-Web-Map/assets/geojson/StationServiceAreas.geojson",
	});

	// Fill for the station service areas
	map.addLayer({
		id: "service-area-layer",
		type: "fill",
		source: "service-area",
		layout: {},
		paint: {
			// There are 2 possible station service areas, 5-minute walk (400) and 10-minute walk (800)
			"fill-color": [
				"match",
				["get", "ToBreak"],
				400,
				"#b3e5fc",
				800,
				"#00796b",
				"transparent", // Default if not in service area
			],
			"fill-opacity": 0.5,
		},
	});

	/* Cycling network */
	map.addSource("cycling-network", {
		type: "geojson",
		data: "https://jfrench12.github.io/GGR472-Toronto-Cycling-Web-Map/assets/geojson/m-cycling-network.geojson",
	});
	map.addLayer({
		id: "cycling-network-layer",
		type: "line", // Network consists of lines
		source: "cycling-network",
		layout: {
			"line-join": "round",
			"line-cap": "round",
		},
		paint: {
			"line-color": "#FCE803",
			"line-width": 2,
		},
	});

	// Add the buffered stations as a new source to map
	map.addSource("stations-buffer", {
		type: "geojson",
		data: bufferedStations(stationData, bufferSizeText.innerHTML),
	});

	// Add a layer to visualize the buffers
	map.addLayer({
		id: "stations-buffer-layer",
		type: "fill",
		source: "stations-buffer",
		paint: {
			"fill-color": "#00CCCC",
			"fill-opacity": 0.2,
		},
		// Hide if buffer size 0
		layout: {
			visibility: bufferSizeText.innerHTML == 0 ? "none" : "visible",
		},
	});

	/* Bike stations on map */
	map.addSource("stations", {
		type: "geojson",
		data: stationData,
	});
	map.addLayer({
		id: "stations-layer",
		type: "circle",
		source: "stations",
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

	// Since the checkboxes don't reset on page load, set the map options based on their current values
	// Need to do this in the map load since these settings modify map layers
	setOverlayEnabled(overlayCheck.checked);
	setOverlayMode(neighbourhoodsRadio.checked ? "neighbourhoods" : "hex");
	setServiceAreaVisible(serviceAreaCheck.checked);
	setStationsVisible(stationCheck.checked);
	setCyclingNetworkVisible(cyclingNetworkCheck.checked);
	// The dropdown does reset on page load, but when changing styles the dropdown may have changed
	// so ensure the neighbourhood colouring matches the dropdown selection
	setNeighbourhoodsFeature(neighbourhoodFeatSelect.value);
}

map.on("load", loadMapLayers);
// Since changing the map style clears the layers we need to re-load them
map.on("style.load", loadMapLayers);

/*--------------------------------------------------------------------
	Panel and opacity change when hovering the hexagons
--------------------------------------------------------------------*/
const infoPanel = document.getElementById("infoPanel");
let hoveredHexId = null;

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
	infoPanel.innerHTML = `<b>Stations in this area</b>:  ${e.features[0].properties.count}<br><b>Capacity</b>: ${e.features[0].properties.capacity}`;
	// Show the hex info panel (using opacity for nicer animation)
	infoPanel.style.opacity = 1;
});

// Reset the feature state and remove the popup when the mouse leaves the hexgrid layer.
map.on("mouseleave", "hexgrid-layer", () => {
	if (hoveredHexId !== null) {
		map.setFeatureState({ source: "hexgrid", id: hoveredHexId }, { hover: false });
	}
	hoveredHexId = null;
	// Hide the hex info panel (using opacity for nicer animation)
	infoPanel.style.opacity = 0;
});

/*--------------------------------------------------------------------
	Panel and opacity change when hovering the neighbourhoods
--------------------------------------------------------------------*/
let hoveredNeighbourhoodId = null;

// When hovering over a hexagon, show the popup and change the transparency of the hovered hex
map.on("mousemove", "neighbourhoods-layer", (e) => {
	if (e.features.length === 0) {
		return;
	}
	// Reset the previously hovered hexagon's state
	if (hoveredNeighbourhoodId !== null) {
		map.setFeatureState({ source: "neighbourhoods", id: hoveredNeighbourhoodId }, { hover: false });
	}
	// Get the feature under the cursor and mark it as hovered
	hoveredNeighbourhoodId = e.features[0].id;
	map.setFeatureState({ source: "neighbourhoods", id: hoveredNeighbourhoodId }, { hover: true });
	infoPanel.innerHTML = `<h5 class="center mb-1">${e.features[0].properties.AREA_NA7}</h5><b>${
		NEIGHBOURHOOD_FEATURES.Capacity
	}</b>: ${e.features[0].properties.Capacity || 0}<br><b>${NEIGHBOURHOOD_FEATURES.Join_Count}</b>: ${
		e.features[0].properties.Join_Count || 0
	}`;
	const selectedFeature = document.getElementById("neighbourhoodcolourselect").value;
	// Show the selected feature if there is one and it's not one we always show
	if (selectedFeature != "None" && selectedFeature != "Capacity" && selectedFeature !== "Join_Count") {
		infoPanel.innerHTML += `<br><b>${NEIGHBOURHOOD_FEATURES[selectedFeature]}</b>: ${
			e.features[0].properties[selectedFeature] ?? "Unknown"
		}`;
		// For clusters also show the info about the neighbourhood's cluster
		if (selectedFeature === "CLUSTER_ID") {
			infoPanel.innerHTML += ` (${e.features[0].properties.ClusterInf})`;
		}
	}

	// Show the info panel (using opacity for nicer animation)
	infoPanel.style.opacity = 1;
});

// Reset the feature state and remove the popup when the mouse leaves the hexgrid layer.
map.on("mouseleave", "neighbourhoods-layer", () => {
	if (hoveredNeighbourhoodId !== null) {
		map.setFeatureState({ source: "neighbourhoods", id: hoveredNeighbourhoodId }, { hover: false });
	}
	hoveredNeighbourhoodId = null;
	// Hide the info panel (using opacity for nicer animation)
	infoPanel.style.opacity = 0;
});

/*--------------------------------------------------------------------
	Popup with info when for bike station point
--------------------------------------------------------------------*/
// Track the currently hovered station point's id
let hoveredStationId = null;

// Change cursor when hovering over points
map.on("mousemove", "stations-layer", () => {
	map.getCanvas().style.cursor = "pointer";
});
map.on("mouseleave", "stations-layer", () => {
	map.getCanvas().style.cursor = "";
});

// Create a popup for station details
const stationPopup = new mapboxgl.Popup({
	closeButton: false,
	closeOnClick: false,
});

// Highlight station point on hover.
map.on("mousemove", "stations-layer", (e) => {
	if (e.features.length === 0) {
		return;
	}
	const stationId = e.features[0].properties.ID;
	if (hoveredStationId !== stationId) {
		if (hoveredStationId !== null) {
			map.setFeatureState({ source: "stations", id: hoveredStationId }, { hover: false });
		}
		hoveredStationId = stationId;
		map.setFeatureState({ source: "stations", id: hoveredStationId }, { hover: true });
	}
	// Some properties may be undefined, in which case we should show "Unknown" instead of "undefined"
	const content = `<strong>Name:</strong> ${e.features[0].properties.Name || "Unknown"}<br>
        <strong>Capacity:</strong> ${e.features[0].properties.Capacity || "Unknown"}`;
	stationPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
});

// Remove hover effect and popup when leaving the layer.
map.on("mouseleave", "stations-layer", () => {
	if (hoveredStationId !== null) {
		map.setFeatureState({ source: "stations", id: hoveredStationId }, { hover: false });
		hoveredStationId = null;
	}
	stationPopup.remove();
});

/*--------------------------------------------------------------------
	Map setting elements and functions
--------------------------------------------------------------------*/
const overlayCheck = document.getElementById("overlaycheck");
const radioButtons = document.querySelectorAll('input[name="mapType"]');
const serviceAreaCheck = document.getElementById("serviceareacheck");
const legendCheck = document.getElementById("legendcheck");
const stationCheck = document.getElementById("stationcheck");
const neighbourhoodsRadio = document.getElementById("neighbourhoodsRadio");
const neighbourhoodFeatSelect = document.getElementById("neighbourhoodcolourselect");
const cyclingNetworkCheck = document.getElementById("cyclingnetworkcheck");
const legend = document.getElementById("legend");
const serviceAreaLegend = document.getElementById("serviceAreaLegend");
const neighbourhoodsLegend = document.getElementById("neighbourhoodsKey");
const clusterLegend = document.getElementById("clusterLegend");
const stationsLegend = document.getElementById("stationsLegend");
const cyclingNetworkLegend = document.getElementById("cyclingNetworkLegend");
const neighbourhoodsLegendPropertyNames = [...document.querySelectorAll(".neighbourhoods-property-name")];
const bufferSizeText = document.getElementById("bufferSizeText");
const bufferLegend = document.getElementById("bufferLegend");
const bufferSizeSlider = document.getElementById("bufferSizeSlider");
let instructionsModal = null; // Loaded when page loads
let modalOpenedManually = false; // Whether the modal was opened via the navbar button
let helpTooltip;

// Create neighbourhood colour select dropdown items
Object.entries(NEIGHBOURHOOD_FEATURES).forEach(([feature, name]) => {
	const option = document.createElement("option");
	option.value = feature;
	option.innerHTML = name;
	// Default None
	if (feature === "None") {
		option.selected = true;
	}
	neighbourhoodFeatSelect.appendChild(option);
});

// Updates the overlay settings eg disable irrelevant options and update legend
function updateOverlaySettings() {
	const enableOverlay = overlayCheck.checked;
	const mode = neighbourhoodsRadio.checked ? "neighbourhoods" : "hex";
	// When overlay disabled, disable the other options
	radioButtons.forEach((radio) => {
		radio.disabled = !enableOverlay;
	});
	// Also make the text darker for the labels for the disabled options
	[...document.querySelectorAll(".overlay-option-label")].forEach((overlayOptionLabel) => {
		if (enableOverlay) {
			overlayOptionLabel.classList.remove("text-secondary");
		} else {
			overlayOptionLabel.classList.add("text-secondary");
		}
	});
	// Disable neighbourhood colour option when overlay disabled or in hex mode
	neighbourhoodFeatSelect.disabled = !enableOverlay || mode === "hex";
	if (mode === "hex" || !enableOverlay) {
		document.getElementById("neighbourhoodColourLabel").classList.add("text-secondary");
		neighbourhoodFeatSelect.style.opacity = 0.5;
	} else {
		document.getElementById("neighbourhoodColourLabel").classList.remove("text-secondary");
		neighbourhoodFeatSelect.style.opacity = 1;
	}
	if (enableOverlay) {
		updateLegendForNeighbourhoodsFeature(neighbourhoodsRadio.checked ? neighbourhoodFeatSelect.value : "hex");
	} else {
		updateLegendForNeighbourhoodsFeature("None");
	}
}

// Sets whether to enable the overlay, disabling/enabling other overlay settings as required
function setOverlayEnabled(enableOverlay) {
	const neighbourhoodsSelected = neighbourhoodsRadio.checked;
	map.setLayoutProperty(
		"neighbourhoods-layer",
		"visibility",
		enableOverlay && neighbourhoodsSelected ? "visible" : "none"
	);
	map.setLayoutProperty(
		"neighbourhoods-outline",
		"visibility",
		enableOverlay && neighbourhoodsSelected ? "visible" : "none"
	);
	map.setLayoutProperty("hexgrid-layer", "visibility", enableOverlay && !neighbourhoodsSelected ? "visible" : "none");
	updateOverlaySettings();
}

// Set the overlay mode to "hex" or "neighbourhoods", disabling neighbourhoods settings as required
function setOverlayMode(mode) {
	map.setLayoutProperty("neighbourhoods-layer", "visibility", mode === "neighbourhoods" ? "visible" : "none");
	map.setLayoutProperty("neighbourhoods-outline", "visibility", mode === "neighbourhoods" ? "visible" : "none");
	map.setLayoutProperty("hexgrid-layer", "visibility", mode === "hex" ? "visible" : "none");
	updateOverlaySettings();
}

// Sets whether the bikeshare station points are visible on the map
function setStationsVisible(visible) {
	map.setLayoutProperty("stations-layer", "visibility", visible ? "visible" : "none");
	stationsLegend.style.display = visible ? "block" : "none";
}

// Sets whether the cycling network is visible
function setCyclingNetworkVisible(visible) {
	map.setLayoutProperty("cycling-network-layer", "visibility", visible ? "visible" : "none");
	cyclingNetworkLegend.style.display = visible ? "block" : "none";
}

// Sets whether the legend is visible
function setLegendVisible(visible) {
	legend.style.display = visible ? "block" : "none";
}

// Sets whether the service area layer is visible on the map
function setServiceAreaVisible(visible) {
	map.setLayoutProperty("service-area-layer", "visibility", visible ? "visible" : "none");
	serviceAreaLegend.style.display = visible ? "block" : "none";
}

// Updates the legend for the selected neighbourhoods feature
function updateLegendForNeighbourhoodsFeature(featureName) {
	neighbourhoodsLegend.style.display = featureName === "None" || featureName === "CLUSTER_ID" ? "none" : "block";
	// Clusters have their own legend
	if (featureName === "CLUSTER_ID") {
		clusterLegend.style.display = "block";
	} else {
		// Otherwise use the normal legend
		clusterLegend.style.display = "none";
		// For hex, the feature name is "station capacity"
		// For non-hex, find the feature name from the NEIGHBOURHOOD_FEATURES
		const label =
			featureName === "hex"
				? "station capacity"
				: Object.entries(NEIGHBOURHOOD_FEATURES)
						.find(([key]) => key === featureName)[1]
						.toLowerCase();
		neighbourhoodsLegendPropertyNames.forEach((legendProperty) => (legendProperty.innerHTML = label));
	}
}

// Updates the buffer size text and the buffer layer in the map
async function setBufferSize(bufferSize) {
	// Update the buffer size text
	bufferSizeText.innerHTML = bufferSize;
	// Update the existing mapbox source with the new buffered data
	map.getSource("stations-buffer").setData(bufferedStations(await bikeStationJsonPromise, bufferSize));
	// Calling the setLayoutProperty every time the slider changes was making it lag so only do it if visibility changed
	const visibility = bufferSize == 0 ? "none" : "visible";
	if (map.getLayoutProperty("stations-buffer-layer", "visibility") !== visibility) {
		map.setLayoutProperty("stations-buffer-layer", "visibility", visibility);
	}
	bufferLegend.style.display = bufferSize == 0 ? "none" : "block";
}

/*--------------------------------------------------------------------
	Add event listeners
--------------------------------------------------------------------*/
// After the page loads add bootstrap tooltips and update UI
document.addEventListener("DOMContentLoaded", () => {
	[...document.querySelectorAll('[data-bs-toggle="tooltip"]')].forEach((tooltipTriggerEl) => {
		// For the help button in the navbar, set the tooltip trigger to not show on hover since we will manually
		// show it when they dismiss the modal
		// Need to save it in a variable to manually show it later
		if (tooltipTriggerEl.id === "helpTooltip") {
			helpTooltip = new bootstrap.Tooltip(tooltipTriggerEl, { trigger: "manual" });
		} else {
			// Other tooltips have default bootstrap tooltip behaviour
			new bootstrap.Tooltip(tooltipTriggerEl);
		}
	});
	setLegendVisible(legendCheck.checked);
	updateOverlaySettings();
	// Only show service area legend keys if service area enabled
	serviceAreaLegend.style.display = serviceAreaCheck.checked ? "block" : "none";
	updateLegendForNeighbourhoodsFeature(neighbourhoodsRadio.checked ? neighbourhoodFeatSelect.value : "hex");
	// Hide the legend option here before the map loads so the legend doesn't look glitchy
	cyclingNetworkLegend.style.display = cyclingNetworkCheck.checked ? "block" : "none";
	bufferSizeText.innerHTML = bufferSizeSlider.value;
	bufferLegend.style.display = bufferSizeSlider.value == 0 ? "none" : "block";

	instructionsModal = new bootstrap.Modal(document.getElementById("instructionsModal"));

	// Only show instructions first time
	if (!localStorage.getItem("instructionsShown")) {
		instructionsModal.show();
		localStorage.setItem("instructionsShown", "true");
	}
});

// Add event listener which toggles overlay
overlayCheck.addEventListener("change", (e) => setOverlayEnabled(e.target.checked));

// Make radio buttons switch between overlay hex and neighbourhoods
radioButtons.forEach((radio) => radio.addEventListener("change", (evt) => setOverlayMode(evt.target.value)));

// Add event listener which returns map view to full screen on button click using flyTo method
document.getElementById("returnbutton").addEventListener("click", () => {
	map.flyTo({
		center: defCenter,
		zoom: defZoom,
		essential: true,
	});
});

// Change display of legend based on checkbox
legendCheck.addEventListener("change", (e) => setLegendVisible(e.target.checked));

// Change display of station points based on checkbox
stationCheck.addEventListener("change", (e) => setStationsVisible(e.target.checked));

// Change display of service areas based on checkbox
serviceAreaCheck.addEventListener("change", (e) => setServiceAreaVisible(e.target.checked));

// Change neighbourhood colouring based on select
neighbourhoodFeatSelect.addEventListener("change", (evt) => setNeighbourhoodsFeature(evt.target.value));

// Change display of cycling network based on checkbox
cyclingNetworkCheck.addEventListener("change", (e) => setCyclingNetworkVisible(e.target.checked));

// When changing the buffer size, update the map
bufferSizeSlider.addEventListener("input", (evt) => setBufferSize(evt.target.value));

document.getElementById("helpButton").addEventListener("click", () => {
	instructionsModal.show();
	modalOpenedManually = true;
});

satelliteCheck.addEventListener("change", (e) => map.setStyle(e.target.checked ? STYLE_SATELLITE : STYLE_DEFAULT));

// When the instructions are dismissed and weren't opened manually, show a tooltip that they can be reopened
document.getElementById("instructionsModal").addEventListener("hidden.bs.modal", () => {
	if (!modalOpenedManually) {
		helpTooltip.show();
		// Hide the tooltip after 3 seconds
		setTimeout(() => helpTooltip.hide(), 3000);
	}
});
