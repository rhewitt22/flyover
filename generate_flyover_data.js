const fs = require('fs');
const path = require('path');
const { getRoadsByCCCode, getTrailsByManagingOrg } = require('./src/fwsClient');

const refugesToProcess = [
    { name: 'Bosque del Apache National Wildlife Refuge', cccode: 'FF02RNBO00' },
    { name: 'Merritt Island National Wildlife Refuge', cccode: '41570' },
    { name: 'Tamarac National Wildlife Refuge', cccode: 'FF03RTMC00' },
    { name: 'Santee National Wildlife Refuge', cccode: 'FF04RSST00' },
    { name: 'Des Lacs National Wildlife Refuge', cccode: 'FF06RDSL00' },
    { name: 'National Elk Refuge', cccode: 'FF06RNER00' },
    { name: 'Ridgefield National Wildlife Refuge', cccode: 'FF01RRDG00' },
    { name: 'Wichita Mountains Wildlife Refuge', cccode: 'FF02RKWM00' },
    { name: 'Kenai National Wildlife Refuge', cccode: 'FF07RKNA00' },
    { name: 'Bombay Hook National Wildlife Refuge', cccode: 'FF05RBMH00' },
    { name: 'Rocky Mountain Arsenal National Wildlife Refuge', cccode: 'FF06RRKM00' },
    { name: 'J.N. “Ding” Darling National Wildlife Refuge', cccode: 'FF04RFDD00' },
    { name: 'Lower Klamath National Wildlife Refuge', cccode: 'FF08RLKL00' },
    { name: 'Tule Lake National Wildlife Refuge', cccode: 'FF08RTUL00' }
];

function generateId(name) {
    return name.toLowerCase()
        .replace(/ national wildlife refuge/g, '')
        .replace(/ wildlife refuge/g, '')
        .replace(/ refuge/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, ''); // Trim underscores
}

async function processRefuge(refugeInfo) {
    console.log(`Processing ${refugeInfo.name} (${refugeInfo.cccode})...`);

    try {
        let data;
        // Basic check: if code starts with FF, it's a CCCODE for roads. 
        // If it's numeric (like 41570), treat it as a Managing Org ID for trails.
        if (refugeInfo.cccode.startsWith('FF')) {
            data = await getRoadsByCCCode(refugeInfo.cccode);
        } else {
            data = await getTrailsByManagingOrg(refugeInfo.cccode);
        }

        if (!data || !data.features || data.features.length === 0) {
            console.warn(`  No data found for ${refugeInfo.name}.`);
            return null;
        }

        const csvLines = ['path_name,longitude,latitude,altitude,timestamp'];
        let centerLat = 0;
        let centerLon = 0;
        let totalPoints = 0;

        for (const feature of data.features) {
            // Priority: ROUTE_NAME (Roads) -> TRNAME (Trails) -> NAT_RTE_ID -> Fallback
            const pathName = feature.properties.ROUTE_NAME || feature.properties.TRNAME || feature.properties.NAT_RTE_ID || 'Unknown Path';
            // Clean path name to avoid comma issues in CSV
            const cleanPathName = pathName.replace(/,/g, ' ');

            let coordinates = [];
            if (feature.geometry.type === 'LineString') {
                coordinates = feature.geometry.coordinates;
            } else if (feature.geometry.type === 'MultiLineString') {
                feature.geometry.coordinates.forEach(line => {
                    coordinates = coordinates.concat(line);
                });
            }

            // Downsample slightly if needed, or just keep all. Let's keep all for smooth animation.
            let timestamp = 1;
            for (const coord of coordinates) {
                const lon = coord[0];
                const lat = coord[1];
                const alt = 300; // Default altitude

                csvLines.push(`${cleanPathName},${lon},${lat},${alt},${timestamp}`);
                timestamp++;

                centerLon += lon;
                centerLat += lat;
                totalPoints++;
            }
        }

        if (totalPoints === 0) {
            console.warn(`  No coordinates found for ${refugeInfo.name}.`);
            return null;
        }

        const refugeId = generateId(refugeInfo.name);
        const fileName = `${refugeId}.csv`;
        const filePath = path.join(__dirname, 'src', 'data', fileName);

        fs.writeFileSync(filePath, csvLines.join('\n'));
        console.log(`  Saved ${filePath}`);

        // Calculate simple center
        centerLon /= totalPoints;
        centerLat /= totalPoints;

        return {
            id: refugeId,
            name: refugeInfo.name.replace('National Wildlife Refuge', 'NWR').replace('Wildlife Refuge', 'NWR').replace('Refuge', 'NWR'),
            cccode: refugeInfo.cccode,
            file: `data/${fileName}`,
            center: [parseFloat(centerLon.toFixed(4)), parseFloat(centerLat.toFixed(4))],
            zoom: 11 // Default zoom
        };

    } catch (error) {
        console.error(`  Error processing ${refugeInfo.name}:`, error.message);
        return null;
    }
}

async function main() {
    const refugesFile = path.join(__dirname, 'src', 'data', 'refuges.json');
    let existingRefuges = [];
    try {
        existingRefuges = JSON.parse(fs.readFileSync(refugesFile, 'utf8'));
    } catch (e) {
        console.log('  No existing refuges.json found or invalid.');
    }

    const newRefugeEntries = [];

    for (const refugeInfo of refugesToProcess) {
        const entry = await processRefuge(refugeInfo);
        if (entry) {
            // Check if already exists, replace if so
            const existingIndex = existingRefuges.findIndex(r => r.id === entry.id);
            if (existingIndex >= 0) {
                existingRefuges[existingIndex] = entry;
            } else {
                existingRefuges.push(entry);
            }
        }
    }

    fs.writeFileSync(refugesFile, JSON.stringify(existingRefuges, null, 2));
    console.log('Updated data/refuges.json');
}

main();