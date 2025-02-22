// =============================
// GLOBAL LOCK & SEEN KEYS VECTOR
// =============================
let storageLock = false;
let lockTimeout = null; // Safety timeout
let seenKeys = [];

// Constants
const TRADE_GOODS = {
  WINE: 'Wine',
  MARBLE: 'Marble',
  CRYSTAL: 'Crystal',
  sulphur: 'sulphur'
};

// =============================
// HELPER FUNCTIONS
// =============================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

async function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

// =============================
// SEEN KEYS MANAGEMENT
// =============================

// Load seen keys from storage (ALWAYS FRESH)
async function loadSeenKeys() {
  const data = await getStorage(["seenKeys"]);
  seenKeys = Array.isArray(data.seenKeys) ? data.seenKeys : [];
  //console.log("🔄 Loaded seenKeys:", seenKeys);
}

// Save seen keys to storage
async function saveSeenKeys() {
  await setStorage({ seenKeys });
  //console.log("💾 Saved seenKeys:", seenKeys);
}

// Update the seen keys vector (last 10 keys, FIFO)
function updateSeenKeys(newKey) {
  // Remove the key if it exists (to move it to the end)
  const index = seenKeys.indexOf(newKey);
  if (index > -1) {
    seenKeys.splice(index, 1);
  }
  
  // Add new key at the end
  seenKeys.push(newKey);
  
  // Keep only last 10 keys
  if (seenKeys.length > 10) {
    seenKeys.shift(); // Remove oldest key
  }
  //console.log("📊 Updated seenKeys vector:", seenKeys);
}

// ===============================
// ACTION REQUEST HANDLER
// ===============================
async function storeActionRequest(newValue, force = false) {
  // Wait if another process is writing (with safety timeout)
  const start = Date.now();
  while (storageLock) {
    if (Date.now() - start > 5000) { // Safety: Break lock after 5 seconds
      storageLock = false;
      break;
    }
    await sleep(10);
  }

  // Acquire lock
  storageLock = true;

  // Always load seenKeys fresh
  await loadSeenKeys();

  // If not forced, check if key was recently seen
  if (!force && seenKeys.includes(newValue)) {
    console.log(`🚫 Ignored actionRequest: ${newValue}`);
    storageLock = false;
    return;
  }

  // Store the new value
  await setStorage({ actionRequest: newValue });

  // Update seen keys and save
  updateSeenKeys(newValue);
  await saveSeenKeys();

  // Release lock
  storageLock = false;
  return;
}

// ==========================
// INIT: LOAD SEEN KEYS ON STARTUP
// ==========================
loadSeenKeys().then(() => {
    console.log("🚀 Extension started with seenKeys:", seenKeys);
});

// Account management
async function getCurrentUserId() {
  const { ikariamCookie } = await getStorage(['ikariamCookie']);
  if (!ikariamCookie) return null;
  
  const match = ikariamCookie.match(/ikariam=(\d+)_/);
  return match ? match[1] : null;
}

async function getOrCreateAccount(userId) {
  const { accounts } = await getStorage(['accounts']);
  if (!accounts[userId]) {
    accounts[userId] = {
      cities: {},
      server: null,
      availableSmallShips: 0,
      availableLargeShips: 0,
      latestUpdate: 0
    };
    await setStorage({ accounts });
  }
  return accounts[userId];
}

// City management
async function updateCities(userId, newCities) {
  const { accounts } = await getStorage(['accounts']);
  const account = accounts[userId];
  
  if (!account) return false;
  
  // Preserve special trade goods for existing cities
  const updatedCities = {};
  for (const [cityId, cityData] of Object.entries(newCities)) {
    updatedCities[cityId] = {
      ...cityData,
      specialTradeGood: account.cities[cityId]?.specialTradeGood || null
    };
  }
  
  account.cities = updatedCities;
  await setStorage({ accounts });
  return true;
}

async function updateCityTradeGood(userId, cityId, tradeGood) {
  if (!Object.values(TRADE_GOODS).includes(tradeGood)) {
    throw new Error('Invalid trade good type');
  }

  const { accounts } = await getStorage(['accounts']);
  const account = accounts[userId];
  
  if (!account || !account.cities[cityId]) return false;
  
  account.cities[cityId].specialTradeGood = tradeGood;
  await setStorage({ accounts });
  return true;
}

// Data retrieval
async function getCurrentAccountData() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  
  const { accounts } = await getStorage(['accounts']);
  return accounts[userId];
}

async function getAllAccounts() {
  const { accounts = {} } = await getStorage(['accounts']);
  return accounts;
}

// Add this function before the export block
async function updateAccountData(userId, updates) {
  const { accounts } = await getStorage(['accounts']);
  if (!accounts[userId]) {
    accounts[userId] = {
      cities: {},
      server: null,
      availableSmallShips: 0,
      availableLargeShips: 0,
      latestUpdate: 0
    };
  }

  // Deep merge the updates
  accounts[userId] = {
    ...accounts[userId],
    ...updates,
    cities: {
      ...accounts[userId].cities,
      ...(updates.cities || {})
    }
  };

  await setStorage({ accounts });
  return accounts[userId];
}

// Get a specific user's data
async function getUserData(userId) {
  const { accounts } = await getStorage(['accounts']);
  return accounts?.[userId];
}

// Update a specific user's data
export async function updateUserData(userId, data) {
  const { accounts } = await getStorage(['accounts']);
  if (!accounts[userId]) {
    accounts[userId] = {};
  }

  // Update the user data
  accounts[userId] = {
    ...accounts[userId],
    ...data,
    latestUpdate: Date.now()  // Add timestamp on every user data update
  };

  await setStorage({ accounts });
  return accounts[userId];
}

// Add this new function
export async function updateUserTimestamp(userId) {
  const { accounts } = await getStorage(['accounts']);
  if (!accounts[userId]) return;

  accounts[userId].latestUpdate = Date.now();
  await setStorage({ accounts });
  return accounts[userId];
}

// Keep the existing export block
export {
  sleep,
  storeActionRequest,
  getStorage,
  setStorage,
  getUserData,
  TRADE_GOODS,
  getCurrentUserId,
  getOrCreateAccount,
  updateCities,
  updateCityTradeGood,
  getCurrentAccountData,
  getAllAccounts,
  updateAccountData,
}; 