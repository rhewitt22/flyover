mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-v9',
    center: [-98.5795, 39.8283],
    zoom: 3
});

const refugeSelector = document.getElementById('refuge-selector');
const pathSelector = document.getElementById('path-selector');
const progressBar = document.getElementById('progress-bar');
const rewindButton = document.getElementById('rewind-button');
const playPauseButton = document.getElementById('play-pause-button');
const fastForwardButton = document.getElementById('fast-forward-button');

let refuges = [];
let flyoverData;
let currentPath;
let currentFrame = 0;
let isPlaying = false;
let animationSpeed = 4;
let marker;
let playbackDirection = 1;

async function loadRefugesData() {
    const response = await fetch('data/refuges.json');
    return await response.json();
}

async function loadFlyoverData(dataFile) {
    const response = await fetch(dataFile);
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
                altitude: parseFloat(altitude) || 1000, // Default altitude if missing
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
    loadPath(pathSelector.value);
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
            zoom: 15,
            pitch: 50,
            bearing: 90,
        });
        
        // Start animation after flying to the start
        map.once('moveend', startAnimation);
    }
}

async function loadRefuge(refuge) {
    // Update URL param without reloading
    const url = new URL(window.location);
    url.searchParams.set('refuge', refuge.id);
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

    // Set initial map view for the refuge
    // Note: We don't flyTo here because selecting a path will do it.
    // However, if we just want to show the refuge generally first:
    // map.flyTo({ center: refuge.center, zoom: refuge.zoom });
    
    // Select first path
    if (pathNames.length > 0) {
        pathSelector.value = pathNames[0];
        loadPath(pathNames[0]);
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

    // Determine initial refuge
    const urlParams = new URLSearchParams(window.location.search);
    const refugeParam = urlParams.get('refuge');
    
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
        loadRefuge(initialRefuge);
    }
}

initialize();
