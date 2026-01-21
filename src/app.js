import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import refugesData from './data/refuges.json';
// Import all CSV files as URLs. Parcel glob import returns an object where keys are filenames.
// Note: Parcel 2 glob imports might require a specific plugin or syntax depending on version,
// but usually `import * as x` works or we use `new URL` dynamically.
// Let's use a simpler approach: Map the IDs to require/import statements if glob isn't set up.
// Actually, since we have a fixed list in refuges.json, we can rely on the static file copy we just set up.
// But the user said static file copy FAILED.
// So we MUST let Parcel handle the URL generation.

// Since glob imports can be tricky without config, let's just use the `new URL` syntax for the file path.
// But `new URL` needs a static base. 
// `new URL('./data/' + filename, import.meta.url)` often works in Parcel for dynamic paths if they are statically analyzable enough.
// But the filenames come from the JSON.

// Workaround: We will manually map the IDs to the `new URL` for each known file.
// This is tedious but 100% reliable without complex glob configs.

const csvUrls = {
    'data/bosque_del_apache.csv': new URL('data/bosque_del_apache.csv', import.meta.url).href,
    'data/quivira.csv': new URL('data/quivira.csv', import.meta.url).href,
    'data/tamarac.csv': new URL('data/tamarac.csv', import.meta.url).href,
    'data/santee.csv': new URL('data/santee.csv', import.meta.url).href,
    'data/des_lacs.csv': new URL('data/des_lacs.csv', import.meta.url).href,
    'data/national_elk.csv': new URL('data/national_elk.csv', import.meta.url).href,
    'data/ridgefield.csv': new URL('data/ridgefield.csv', import.meta.url).href,
    'data/wichita_mountains.csv': new URL('data/wichita_mountains.csv', import.meta.url).href,
    'data/kenai.csv': new URL('data/kenai.csv', import.meta.url).href,
    'data/bombay_hook.csv': new URL('data/bombay_hook.csv', import.meta.url).href,
    'data/rocky_mountain_arsenal.csv': new URL('data/rocky_mountain_arsenal.csv', import.meta.url).href,
    'data/j_n_ding_darling.csv': new URL('data/j_n_ding_darling.csv', import.meta.url).href,
    'data/lower_klamath.csv': new URL('data/lower_klamath.csv', import.meta.url).href,
    'data/tule_lake.csv': new URL('data/tule_lake.csv', import.meta.url).href,
    'data/merritt_island.csv': new URL('data/merritt_island.csv', import.meta.url).href,
};

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    center: [-98.5795, 39.8283],
    zoom: 3
});

// Add zoom and rotation controls to the map.
map.addControl(new mapboxgl.NavigationControl({
    visualizePitch: true
}), 'top-right');

const refugeSelector = document.getElementById('refuge-selector');
const pathSelector = document.getElementById('path-selector');
const styleSelector = document.getElementById('style-selector');
const progressBar = document.getElementById('progress-bar');
const rewindButton = document.getElementById('rewind-button');
const playPauseButton = document.getElementById('play-pause-button');
const fastForwardButton = document.getElementById('fast-forward-button');
const toggleSettingsButton = document.getElementById('toggle-settings-button');
const settingsPanel = document.getElementById('settings-panel');

toggleSettingsButton.addEventListener('click', () => {
    const isCollapsed = settingsPanel.classList.toggle('collapsed');
    toggleSettingsButton.classList.toggle('collapsed', isCollapsed);
    toggleSettingsButton.setAttribute('aria-expanded', !isCollapsed);
});

let refuges = [];
let flyoverData;
let currentPath;
let currentFrame = 0;
let isPlaying = false;
let animationSpeed = 4;
let marker;
let playbackDirection = 1;

async function loadRefugesData() {
    return refugesData;
}

async function loadFlyoverData(dataFile) {
    // Resolve the correct URL using our map
    const url = csvUrls[dataFile] || dataFile;
    const response = await fetch(url);
    const csvData = await response.text();
    const lines = csvData.split('\n').slice(1);
    const parsedData = {};

    for (const line of lines) {
        const [path_name, longitude, latitude, altitude, timestamp] = line.split(',');
        if (path_name && longitude && latitude) {
            if (!parsedData[path_name]) {
                parsedData[path_name] = [];
            }
            parsedData[path_name].push({
                longitude: parseFloat(longitude),
                latitude: parseFloat(latitude),
                altitude: parseFloat(altitude) || 300, // Default altitude if missing
                timestamp: parseInt(timestamp) || 0
            });
        }
    }

    for (const path_name in parsedData) {
        parsedData[path_name].sort((a, b) => a.timestamp - b.timestamp);
    }

    return parsedData;
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);
    const deltaLambda = toRadians(lon2 - lon1);
    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
        Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    const bearing = toDegrees(Math.atan2(y, x));
    return (bearing + 360) % 360;
}

function animate() {
    if (!isPlaying) return;

    const currentPoint = currentPath[currentFrame];

    // Calculate next frame based on direction, handling wrap-around
    let nextFrameIndex = currentFrame + playbackDirection;
    if (nextFrameIndex >= currentPath.length) nextFrameIndex = 0;
    if (nextFrameIndex < 0) nextFrameIndex = currentPath.length - 1;

    const nextPoint = currentPath[nextFrameIndex];

    marker.setLngLat([currentPoint.longitude, currentPoint.latitude]);

    const targetBearing = calculateBearing(
        currentPoint.latitude,
        currentPoint.longitude,
        nextPoint.latitude,
        nextPoint.longitude
    );

    const startBearing = map.getBearing();
    let bearingDiff = targetBearing - startBearing;

    // Normalize the difference to find the shortest rotation path
    if (bearingDiff > 180) bearingDiff -= 360;
    if (bearingDiff < -180) bearingDiff += 360;

    const startTime = performance.now();
    const duration = 3000 / animationSpeed;

    function frame(currentTime) {
        if (!isPlaying) return;

        const elapsed = currentTime - startTime;
        let t = elapsed / duration;

        if (t >= 1) {
            t = 1;
            currentFrame += playbackDirection;

            // Handle wrap-around
            if (currentFrame >= currentPath.length) {
                currentFrame = 0;
            } else if (currentFrame < 0) {
                currentFrame = currentPath.length - 1;
            }

            // Trigger next segment
            animate();
            return;
        }

        // Linear Interpolation (Lerp)
        const lng = currentPoint.longitude + (nextPoint.longitude - currentPoint.longitude) * t;
        const lat = currentPoint.latitude + (nextPoint.latitude - currentPoint.latitude) * t;
        const alt = currentPoint.altitude + (nextPoint.altitude - currentPoint.altitude) * t;
        const currentBearing = startBearing + bearingDiff * t;

        marker.setLngLat([lng, lat]);

        map.jumpTo({
            center: [lng, lat],
            altitude: alt,
            bearing: currentBearing,
            pitch: 50
        });

        progressBar.value = ((currentFrame + t * playbackDirection) / currentPath.length) * 100;

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

// Remove the old moveend listener as it conflicts with the new loop
// map.on('moveend', ...);


function startAnimation() {
    if (isPlaying || !currentPath) return;
    isPlaying = true;
    document.querySelector('.play-icon').style.display = 'none';
    document.querySelector('.pause-icon').style.display = 'block';
    playPauseButton.setAttribute('aria-label', 'Pause flyover');
    animate();
}

function stopAnimation() {
    if (!isPlaying) return;
    isPlaying = false;
    document.querySelector('.play-icon').style.display = 'block';
    document.querySelector('.pause-icon').style.display = 'none';
    playPauseButton.setAttribute('aria-label', 'Play flyover');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
        playbackDirection = -1;
        if (!isPlaying) startAnimation();
    } else if (e.key === 'ArrowRight') {
        if (playbackDirection === -1) {
            playbackDirection = 1;
        } else {
            animationSpeed *= 2;
        }
        if (!isPlaying) startAnimation();
    }
});

playPauseButton.addEventListener('click', () => {
    if (isPlaying) {
        stopAnimation();
    } else {
        startAnimation();
    }
});

fastForwardButton.addEventListener('click', () => {
    animationSpeed *= 2;
});

rewindButton.addEventListener('click', () => {
    animationSpeed /= 2;
});

progressBar.addEventListener('input', () => {
    const frame = Math.round((progressBar.value / 100) * currentPath.length);
    currentFrame = frame;
    const point = currentPath[currentFrame];
    marker.setLngLat([point.longitude, point.latitude]);
    map.flyTo({
        center: [point.longitude, point.latitude],
        altitude: point.altitude,
        duration: 0
    });
});

pathSelector.addEventListener('change', () => {
    const selectedPath = pathSelector.value;
    loadPath(selectedPath);

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('flyover', selectedPath);
    window.history.pushState({}, '', url);
});

refugeSelector.addEventListener('change', () => {
    const refugeId = refugeSelector.value;
    const refuge = refuges.find(r => r.id === refugeId);
    if (refuge) {
        loadRefuge(refuge);
    }
});

function loadPath(pathName) {
    currentPath = flyoverData[pathName];
    currentFrame = 0;
    animationSpeed = 4;
    stopAnimation();

    if (currentPath && currentPath.length > 0) {
        const point = currentPath[0];
        marker.setLngLat([point.longitude, point.latitude]);

        map.flyTo({
            center: [point.longitude, point.latitude],
            altitude: point.altitude,
            zoom: 18,
            pitch: 50,
            bearing: 90,
        });

        // Start animation after flying to the start
        map.once('moveend', startAnimation);
    }
}

async function loadRefuge(refuge, initialPath = null) {
    // Update URL param without reloading
    const url = new URL(window.location);
    url.searchParams.set('refuge', refuge.id);
    if (initialPath) {
        url.searchParams.set('flyover', initialPath);
    } else {
        url.searchParams.delete('flyover');
    }
    window.history.pushState({}, '', url);

    // Load data
    flyoverData = await loadFlyoverData(refuge.file);

    // Populate path selector
    pathSelector.innerHTML = '';
    const pathNames = Object.keys(flyoverData);
    for (const pathName of pathNames) {
        const option = document.createElement('option');
        option.value = pathName;
        option.innerText = pathName;
        pathSelector.appendChild(option);
    }

    // Determine which path to load
    let pathTimestampToLoad = pathNames[0];
    if (initialPath && pathNames.includes(initialPath)) {
        pathTimestampToLoad = initialPath;
    }

    // Select path
    if (pathTimestampToLoad) {
        pathSelector.value = pathTimestampToLoad;
        loadPath(pathTimestampToLoad);
    }

    // Load facilities points
    if (refuge.cccode) {
        loadFacilities(refuge.cccode);
    }
}

async function loadFacilities(cccode) {
    const sourceId = 'facilities-source';
    const circleLayerId = 'facilities-points-circle';
    const labelLayerId = 'facilities-points-label';

    // Clean up existing layer/source
    if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
    if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    try {
        const url = `https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/FWS_HQ_Fac_Property_Pt_PublicView/FeatureServer/0/query?where=CCCODE='${cccode}'&f=pgeojson&outFields=*`;
        const response = await fetch(url);
        const data = await response.json();

        map.addSource(sourceId, {
            type: 'geojson',
            data: data
        });

        // Add a circle layer for the point itself
        map.addLayer({
            id: circleLayerId,
            type: 'circle',
            source: sourceId,
            paint: {
                'circle-radius': 6,
                'circle-color': '#ffeb3b', // Bright yellow
                'circle-stroke-width': 2,
                'circle-stroke-color': '#000000'
            }
        });

        // Add a symbol layer for the text label
        map.addLayer({
            id: labelLayerId,
            type: 'symbol',
            source: sourceId,
            layout: {
                'text-field': ['get', 'Prop_Name'],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 12,
                'text-offset': [0, 1.25],
                'text-anchor': 'top'
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#000000',
                'text-halo-width': 2
            }
        });
    } catch (e) {
        console.error('Error loading facilities:', e);
    }
}

async function initialize() {
    refuges = await loadRefugesData();

    // Populate refuge selector
    for (const refuge of refuges) {
        const option = document.createElement('option');
        option.value = refuge.id;
        option.innerText = refuge.name;
        refugeSelector.appendChild(option);
    }

    const el = document.createElement('div');
    el.className = 'eagle-marker';
    el.innerText = '🦅';

    marker = new mapboxgl.Marker({
        element: el,
        rotationAlignment: 'viewport',
        pitchAlignment: 'viewport'
    })
        .setLngLat([0, 0])
        .addTo(map);

    // Determine initial refuge and flyover path
    const urlParams = new URLSearchParams(window.location.search);
    const refugeParam = urlParams.get('refuge');
    const flyoverParam = urlParams.get('flyover');

    let initialRefuge;
    if (refugeParam) {
        initialRefuge = refuges.find(r => r.id === refugeParam);
    }

    if (!initialRefuge && refuges.length > 0) {
        // Random refuge
        const randomIndex = Math.floor(Math.random() * refuges.length);
        initialRefuge = refuges[randomIndex];
    }

    if (initialRefuge) {
        refugeSelector.value = initialRefuge.id;
        loadRefuge(initialRefuge, flyoverParam);
    }
}

initialize();

styleSelector.addEventListener('change', () => {
    map.setStyle(styleSelector.value);
});