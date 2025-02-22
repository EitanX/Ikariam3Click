import { TRADE_GOODS, getStorage, setStorage, getCurrentUserId, getOrCreateAccount, updateCities, updateCityTradeGood, getUserData, updateUserData } from './storage.js';

class CityManager {
  constructor() {
    if (CityManager.instance) {
      console.warn('⚠️ CityManager already instantiated!');
      return CityManager.instance;
    }
    console.log('🔥 CityManager constructor called');
    this.cityCache = new Map();
    CityManager.instance = this;
    this.initializeStorage();
  }

  async initializeStorage() {
    try {
      const { accounts } = await getStorage(['accounts']);
      if (!accounts) {
        console.log('📝 Initializing storage with empty accounts template');
        await setStorage({
          accounts: {},
          seenKeys: [],
          latestUpdate: Date.now()
        });
      }
    } catch (err) {
      console.error('Failed to initialize storage:', err);
    }
  }

  // =============================
  // Cache Management
  // =============================
  async loadCitiesForUser(userId) {
    if (this.cityCache.has(userId)) {
      return this.cityCache.get(userId);
    }

    const { accounts } = await getStorage(['accounts']);
    const cities = accounts[userId]?.cities || null;
    if (cities) {
      this.cityCache.set(userId, cities);
    }
    return cities;
  }

  // =============================
  // Data Retrieval Methods
  // =============================
  async getCitiesForUser(userId) {
    return await this.loadCitiesForUser(userId);
  }

  async getCurrentUserCities() {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    return await this.loadCitiesForUser(userId);
  }

  async getCityData(cityId) {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const cities = await this.loadCitiesForUser(userId);
    return cities?.[cityId] || null;
  }

  // =============================
  // Update Methods
  // =============================
  async handleCitiesUpdate(userId, citiesData) {
    await getOrCreateAccount(userId);
    const { accounts } = await getStorage(['accounts']);
    const currentCities = accounts[userId].cities || {};

    const updatedCities = {
      ...currentCities,
      ...citiesData
    };
    
    for (const cityId of Object.keys(citiesData)) {
      updatedCities[cityId] = {
        ...currentCities[cityId],
        ...citiesData[cityId]
      };
    }

    await updateCities(userId, updatedCities);
    this.cityCache.set(userId, updatedCities);
  }

  async updateCityResources(cityId, resources) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const cities = await this.loadCitiesForUser(userId);
    if (!cities || !cities[cityId]) return;

    const cityUpdate = {
      [cityId]: {
        ...cities[cityId],
        woodAmount: Number(resources.wood) || 0,
        wineAmount: Number(resources.wine) || 0,
        marbleAmount: Number(resources.marble) || 0,
        crystalAmount: Number(resources.crystal) || 0,
        sulphurAmount: Number(resources.sulphur) || 0
      }
    };

    await this.handleCitiesUpdate(userId, cityUpdate);
  }

  async updateAvailableShips(smallShips, largeShips) {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const { accounts } = await getStorage(['accounts']);
    if (!accounts[userId]) return;
    accounts[userId].availableSmallShips = smallShips;
    accounts[userId].availableLargeShips = largeShips;
    await setStorage({ accounts });
  }

  // =============================
  // City Data Processing
  // =============================
  async fetchCityDetails(cityId, refresh = false, subdomain = null) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const { accounts, ikariamCookie } = await getStorage(['accounts', 'ikariamCookie']);
    const account = accounts[userId];
    if ((!account && !subdomain) || !ikariamCookie) return;
    const finalSubdomain = subdomain || account.server;

    try {
      const response = await fetch(`https://${finalSubdomain}.ikariam.gameforge.com/index.php`, {
        method: 'POST',
        headers: { 'Cookie': ikariamCookie },
        body: new URLSearchParams({
          action: 'header',
          function: 'changeCurrentCity',
          oldView: 'city',
          cityId: cityId,
          currentCityId: cityId,
          backgroundView: 'city',
          ajax: '1'
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.text();
      const resourcesMatch = data.match(/"currentResources":(\{[^}]+\})/);

      if (resourcesMatch) {
        const resourcesData = JSON.parse(resourcesMatch[1]);
        const resources = {
          wood: Number(resourcesData.resource) || 0,
          wine: Number(resourcesData['1']) || 0,
          marble: Number(resourcesData['2']) || 0,
          crystal: Number(resourcesData['3']) || 0,
          sulphur: Number(resourcesData['4']) || 0
        };

        if (refresh) {
          await this.updateCityResources(cityId, resources);
        }

        return resources;
      }
      return null;
    } catch (error) {
      console.error(`Failed to fetch details for city ${cityId}:`, error);
      return null;
    }
  }

  async processUserData(responseText, subdomain, currentCityId) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    try {
      let shouldUpdateCities = true;  // Flag to control city updates
      
      // Check last update time
      const userAccount = await getUserData(userId);
      if (userAccount?.latestUpdate) {
        const timeSinceLastUpdate = Date.now() - userAccount.latestUpdate;
        const TIME_SETTING_CHOSEN = 15 * 60 * 1000; // 10 minutes in milliseconds
        
        if (timeSinceLastUpdate < TIME_SETTING_CHOSEN) {
          console.log('🕒 Skipping update - last update was', 
            Math.round(timeSinceLastUpdate / 1000 / 60), 
            'minutes ago'
          );
          shouldUpdateCities = false;  // Skip city updates if less than 10 minutes
          //await this.logStorageState(userId);
        }
      }

      const userData = await this.extractUserData(responseText, userId, subdomain);
      if (!userData) return;

      if (shouldUpdateCities) {
        await this.processAndUpdateCities(responseText, userData, userId, currentCityId);
        await this.logStorageState(userId);
      }

    } catch (err) {
      console.error('Failed to process user data:', err);
    }
  }

  // =============================
  // Helper Methods
  // =============================
  async extractUserData(responseText, userId, subdomain) {
    const userData = {
      userId: userId,
      server: subdomain,
      ships: { small: 0, large: 0 },
      cities: {}
    };

    // Extract ships info
    const smallShipsMatch = responseText.match(/id="js_GlobalMenu_freeTransporters">(\d+)</);
    const largeShipsMatch = responseText.match(/id="js_GlobalMenu_freeFreighters">(\d+)</);
    if (smallShipsMatch || largeShipsMatch) {
      userData.ships.small = smallShipsMatch ? parseInt(smallShipsMatch[1]) : 0;
      userData.ships.large = largeShipsMatch ? parseInt(largeShipsMatch[1]) : 0;
    }

    return userData;
  }

  async processAndUpdateCities(responseText, userData, userId, currentCityId) {
    try {
      const lines = responseText.split('\n');
      const cityDataLine = lines.find(line => line.includes('relatedCityData:'));
      if (!cityDataLine) return;

      const jsonMatch = cityDataLine.match(/JSON\.parse\('(.+)'\)/);
      if (!jsonMatch) return;

      const cityData = JSON.parse(jsonMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      const tradeGoodMap = { 1: 'Wine', 2: 'Marble', 3: 'Crystal', 4: 'sulphur' };
      
      const updatedCities = {};

      // First pass: collect basic city info
      for (const [key, data] of Object.entries(cityData)) {
        if (!key.startsWith('city_')) continue;
        
        updatedCities[data.id] = {
          name: data.name,
          specialTradeGood: tradeGoodMap[data.tradegood]
        };
      }
      // Second pass: fetch and add resource details
      const cityIds = Object.keys(updatedCities);
      // Move current city to the end if it exists
      if (currentCityId && cityIds.includes(currentCityId)) {
        const index = cityIds.indexOf(currentCityId);
        cityIds.splice(index, 1);  // Remove from current position
        cityIds.push(currentCityId);  // Add to end of array
      }

      // Now currentCityId will be processed last
      for (const cityId of cityIds) {
        const resources = await this.fetchCityDetails(cityId, false, userData.server);
        if (resources) {
          updatedCities[cityId] = {
            ...updatedCities[cityId],
            woodAmount: resources.wood,
            wineAmount: resources.wine,
            marbleAmount: resources.marble,
            crystalAmount: resources.crystal,
            sulphurAmount: resources.sulphur
          };
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update all user data at once
      await updateUserData(userId, {
        server: userData.server,
        availableSmallShips: userData.ships.small,
        availableLargeShips: userData.ships.large,
        cities: updatedCities
      });

      return updatedCities;

    } catch (err) {
      console.error('Failed to process and update cities:', err);
      return null;
    }
  }

  // Transform raw city data for a specific user
  transformCityData(userId, rawCityData) {
    const transformedData = {};
    const existingCities = this.cityCache.get(userId) || {};
    
    for (const [cityId, data] of Object.entries(rawCityData)) {
      transformedData[cityId] = {
        name: data.name,
        specialTradeGood: existingCities[cityId]?.specialTradeGood || null,
        woodAmount: existingCities[cityId]?.woodAmount || 0,
        wineAmount: existingCities[cityId]?.wineAmount || 0,
        marbleAmount: existingCities[cityId]?.marbleAmount || 0,
        crystalAmount: existingCities[cityId]?.crystalAmount || 0,
        sulphurAmount: existingCities[cityId]?.sulphurAmount || 0
      };
    }
    
    return transformedData;
  }

  // Update a city's trade good
  async updateCityTradeGood(cityId, tradeGood) {
    if (!this.isValidTradeGood(tradeGood)) {
      throw new Error('Invalid trade good type');
    }

    const userId = await getCurrentUserId();
    if (!userId) return;

    await updateCityTradeGood(cityId, tradeGood);
    
    // Update cache for this user
    const cities = await this.loadCitiesForUser(userId);
    if (cities && cities[cityId]) {
      cities[cityId].specialTradeGood = tradeGood;
    }
  }

  // Validate trade good type
  isValidTradeGood(tradeGood) {
    return Object.values(TRADE_GOODS).includes(tradeGood);
  }

  // Add this new method
  async logStorageState(userId) {
    const { accounts } = await getStorage(['accounts']);
    if (!accounts || !accounts[userId]) return;
    
    const userData = accounts[userId];
    
    console.log('📊 Storage State:', {
      userId,
      server: userData.server,
      lastUpdate: new Date(userData.latestUpdate).toLocaleString(),  // Convert timestamp to readable date
      ships: {
        small: userData.availableSmallShips,
        large: userData.availableLargeShips
      },
      cities: Object.entries(userData.cities || {}).map(([cityId, city]) => ({
        id: cityId,
        name: city.name,
        tradeGood: city.specialTradeGood,
        resources: {
          wood: city.woodAmount,
          wine: city.wineAmount,
          marble: city.marbleAmount,
          crystal: city.crystalAmount,
          sulphur: city.sulphurAmount
        }
      }))
    });
  }
}

// Create and export singleton instance
const cityManager = new CityManager();
export default cityManager; 