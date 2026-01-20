const axios = require('axios');

const ROADS_API_URL = 'https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/FWS_HQ_Roads_Public/FeatureServer/59/query';
const TRAILS_API_URL = 'https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/FWS_HQ_Trails_Cycle_3_Public_View/FeatureServer/1/query';

/**
 * Fetches roads for a given CCCODE.
 * @param {string} cccode - The CCCODE to filter by (e.g., 'FF02RNBO00').
 * @returns {Promise<object>} - The GeoJSON response.
 */
async function getRoadsByCCCode(cccode) {
  try {
    const response = await axios.get(ROADS_API_URL, {
      params: {
        where: `CCCODE='${cccode}'`,
        outFields: '*',
        f: 'geojson'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching roads for CCCODE ${cccode}:`, error.message);
    throw error;
  }
}

/**
 * Fetches trails for a given MANAGINGORG ID.
 * @param {string|number} managingOrg - The MANAGINGORG ID (e.g., 22520).
 * @param {string[]} [trNumbers] - Optional list of TRNUMBERs to filter by.
 * @returns {Promise<object>} - The GeoJSON response.
 */
async function getTrailsByManagingOrg(managingOrg, trNumbers = []) {
  try {
    let whereClause = `MANAGINGORG=${managingOrg}`;
    
    if (trNumbers.length > 0) {
      const trString = trNumbers.map(t => `'${t}'`).join(',');
      whereClause += ` AND TRNUMBER IN (${trString})`;
    }

    const response = await axios.get(TRAILS_API_URL, {
      params: {
        where: whereClause,
        outFields: '*',
        f: 'geojson'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching trails for MANAGINGORG ${managingOrg}:`, error.message);
    throw error;
  }
}

module.exports = {
  getRoadsByCCCode,
  getTrailsByManagingOrg
};
