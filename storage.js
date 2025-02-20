// =============================
// GLOBAL LOCK & SEEN KEYS VECTOR
// =============================
let storageLock = false;
let lockTimeout = null; // Safety timeout
let seenKeys = [];

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

async function setStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
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

// Export functions that need to be accessible from background.js
export {
  sleep,
  storeActionRequest,
  getStorage,
  setStorage
}; 