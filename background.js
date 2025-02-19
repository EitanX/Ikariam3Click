function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================
// GLOBAL LOCK & SEEN KEYS VECTOR
// =============================
let storageLock = false;
let lockTimeout = null; // Safety timeout
let seenKeys = [];

// =============================
// HELPER FUNCTIONS
// =============================
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
  if (!seenKeys.includes(newKey)) {
    if (seenKeys.length >= 10) {
      seenKeys.shift(); // Remove the oldest key (FIFO)
    }
    seenKeys.push(newKey);
    //console.log("📊 Updated seenKeys vector:", seenKeys);
  }
}

// ===============================
// UNIFIED ACTION REQUEST HANDLER
// ===============================
async function updateActionRequests({ newValue, isAuto = false }) {
  // Wait if another process is writing (with safety timeout)
  const start = Date.now();
  while (storageLock) {
    if (Date.now() - start > 5000) { // Safety: Break lock after 5 seconds
      //console.warn("⚠️ Storage lock timeout - resetting lock.");
      storageLock = false;
      break;
    }
    await sleep(10);
  }

  // Acquire lock
  storageLock = true;

  // Always load seenKeys fresh (fixing stale reads)
  await loadSeenKeys();

  // Ignore if key was recently seen
  if (seenKeys.includes(newValue)) {
    //console.log(`🚫 Ignored duplicate AR: ${newValue}`);
    storageLock = false;
    return;
  }

  const data = await getStorage(["actionRequest", "autoActionRequest", "prevActionRequest"]);
  const current = data.actionRequest;
  const auto = data.autoActionRequest;
  const prev = data.prevActionRequest;

  //console.log(`Incoming ${isAuto ? "Auto" : "Manual"} AR: ${newValue}`);
  //console.log(`Stored: curr=${current}, auto=${auto}, prev=${prev}`);

  const updates = {};
  if (isAuto) {
    if (newValue && newValue !== auto && newValue !== prev) {
      updates.actionRequest = newValue;
      updates.autoActionRequest = newValue;
      updates.prevActionRequest = current;
      //console.log("✅ Auto AR updated:", newValue);
    }
  } else {
    if (newValue && newValue !== current) {
      updates.prevActionRequest = current;
      updates.actionRequest = newValue;
      //console.log("✅ Manual AR updated:", newValue);
    }
  }

  if (Object.keys(updates).length > 0) {
    // Store the updates
    await setStorage(updates);
    //console.log("💾 Storage updated:", updates);

    // Add new value to seen keys and save
    updateSeenKeys(newValue);
    await saveSeenKeys();
  } else {
    //console.log("ℹ️ No updates needed.");
  }

  // Release lock
  storageLock = false;
}

// =============================
// WRAPPER FUNCTIONS
// =============================
async function storeActionRequest(newValue) {
  return updateActionRequests({ newValue, isAuto: false });
}

async function storeAutoActionRequest(newValue) {
  return updateActionRequests({ newValue, isAuto: true });
}

/***************************************************
 * 1. Capture 'ikariam' cookie from request headers
 ***************************************************/
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.requestHeaders) {
      const cookieHeader = details.requestHeaders.find(
        (header) =>
          header.name.toLowerCase() === "cookie" &&
          header.value.includes("ikariam=")
      );
      if (cookieHeader) {
        const match = cookieHeader.value.match(/(ikariam=[^;]+)/);
        if (match) {
          const ikariamCookie = match[1];
          chrome.storage.local.set({ ikariamCookie });
        }
      }
    }
  },
  {
    urls: ["https://*.ikariam.gameforge.com/*"],
    types: ["xmlhttprequest"]
  },
  ["requestHeaders", "extraHeaders"]
);

/***************************************************
 * 2. Capture actionRequest from URL parameters
 ***************************************************/
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const url = new URL(details.url);
    const params = new URLSearchParams(url.search);
    const actionRequest = params.get("actionRequest");

    if (actionRequest) {
      //console.log("🌐 Captured actionRequest from URL:", actionRequest);
      storeAutoActionRequest(actionRequest);
    }
  },
  {
    urls: ["https://*.ikariam.gameforge.com/*"],
    types: ["xmlhttprequest"]
  }
);

/***************************************************
 * 3. fetchBasicData:
 *    Fetch the cinema page, parse out videoID & cityID
 ***************************************************/
async function fetchBasicData() {
  const { ikariamCookie, ikariamSubdomain } = await getStorage([
    "ikariamCookie",
    "ikariamSubdomain"
  ]);
  if (!ikariamCookie) {
    console.error("No ikariamCookie stored!");
    return;
  }

  const url = `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=cinema&visit=1`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        cookie: ikariamCookie
      }
    });

    const responseText = await response.text();
    const cityIdMatch = responseText.match(/\\"cityID\\":(\d+)/);
    const videoIdMatch = responseText.match(/\\"videoID\\":(\d+)/);

    if (videoIdMatch) {
      chrome.storage.local.set({ videoId: videoIdMatch[1] });
    }

    if (cityIdMatch) {
      chrome.storage.local.set({ cityId: cityIdMatch[1] });
    }
  } catch (err) {
    console.error("Failed to fetch cinema page:", err);
  }
}

/***************************************************
 * 4. watchVideo (End Video)
 ***************************************************/
async function watchVideo() {
  const { actionRequest, ikariamCookie, cityId, videoId, ikariamSubdomain } = await getStorage([
    "actionRequest",
    "ikariamCookie",
    "cityId",
    "videoId",
    "ikariamSubdomain"
  ]);

  if (!ikariamCookie || !ikariamSubdomain || !actionRequest) {
    console.error("Missing data. Cannot watch video.");
    return;
  }

  const url = `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=noViewChange&action=AdVideoRewardAction&function=watchVideo&videoId=${videoId}&backgroundView=city&currentCityId=${cityId}&templateView=cinema&actionRequest=${actionRequest}&ajax=1`;

  const bodyParams = new URLSearchParams({
    view: "noViewChange",
    action: "AdVideoRewardAction",
    function: "watchVideo",
    videoId,
    backgroundView: "city",
    currentCityId: cityId,
    templateView: "cinema",
    actionRequest,
    ajax: "1"
  });

  console.log("🎁 2nd half with AR:", actionRequest);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { cookie: ikariamCookie },
      body: bodyParams.toString()
    });

    const text = await response.text();
    const newActionMatch = text.match(/"actionRequest"\s*:\s*"([^"]+)"/);
    if (newActionMatch) {
      storeActionRequest(newActionMatch[1]);
    }
  } catch (err) {
    console.error("watchVideo failed:", err);
  }
}

/***************************************************
 * 5. requestBonus (Start Video)
 ***************************************************/
async function requestBonus(bonusId) {
  const { actionRequest, ikariamCookie, cityId, videoId, ikariamSubdomain } = await getStorage([
    "actionRequest",
    "ikariamCookie",
    "cityId",
    "videoId",
    "ikariamSubdomain"
  ]);

  if (!ikariamCookie || !ikariamSubdomain || !actionRequest) {
    console.error("Missing data. Cannot request bonus.");
    return;
  }

  const url = `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=noViewChange&action=AdVideoRewardAction&function=requestBonus&bonusId=${bonusId}&videoId=${videoId}&backgroundView=city&currentCityId=${cityId}&templateView=cinema&actionRequest=${actionRequest}&ajax=1`;

  const bodyParams = new URLSearchParams({
    view: "noViewChange",
    action: "AdVideoRewardAction",
    function: "requestBonus",
    bonusId,
    videoId,
    backgroundView: "city",
    currentCityId: cityId,
    templateView: "cinema",
    actionRequest,
    ajax: "1"
  });

  console.log("▶️ 1st half with AR:", actionRequest);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { cookie: ikariamCookie },
      body: bodyParams.toString()
    });

    const text = await response.text();
    const newActionMatch = text.match(/"actionRequest"\s*:\s*"([^"]+)"/);
    if (newActionMatch) {
      storeActionRequest(newActionMatch[1]);
    }
  } catch (err) {
    console.error("requestBonus failed:", err);
  }
}

/***************************************************
 * 6. Additional Flow Functions
 ***************************************************/
async function testAndBonusFlow(bonusId) {
  await fetchBasicData();
  await requestBonus(bonusId);
  await sleep(25000);
  await watchVideo();
}

async function sequenceOfBonusesFlow() {
  await testAndBonusFlow(51);
  await testAndBonusFlow(52);
  await testAndBonusFlow(53);
  console.log("✅ Sequence completed!");
}

/***************************************************
 * 7. Handle messages from popup
 ***************************************************/
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "sendRequests") {
    sendRequests();
  } else if (message.action === "bonus") {
    testAndBonusFlow(message.bonusId);
  } else if (message.action === "sequenceOfBonuses") {
    sequenceOfBonusesFlow();
  } else if (message.action === "fetchBasicData") {
    fetchBasicData();
  }
});

// ==========================
// INIT: LOAD SEEN KEYS ON STARTUP
// ==========================
loadSeenKeys().then(() => {
  console.log("🚀 Extension started with seenKeys:", seenKeys);
});

