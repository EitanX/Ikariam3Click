import { sleep, storeActionRequest, getStorage, setStorage } from './storage.js';


/***************************************************
 * 1. Monitor game server traffic
 ***************************************************/
// Capture very first load of the site
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const url = new URL(details.url);
    const serverMatch = url.hostname.match(/^(s\d+(?:-[a-z]+)?)\.ikariam\.gameforge.com$/);
    if (serverMatch) {
      const subdomain = serverMatch[1];
      //console.log("🌐 Server detected:", subdomain);
      chrome.storage.local.set({ ikariamSubdomain: subdomain });
    }
    // Look for cookie in request headers
    if (details.requestHeaders) {
      const cookieHeader = details.requestHeaders.find(
        header => header.name.toLowerCase() === "cookie"
      );
      if (cookieHeader) {
        const match = cookieHeader.value.match(/ikariam=(\d+_[a-f0-9]+)/);
        if (match) {
          const ikariamCookie = `ikariam=${match[1]}`;
          //console.log("🍪 Extracted cookie:", ikariamCookie);
          chrome.storage.local.set({ ikariamCookie });
        }
      
      }
    }
  },
  {
    urls: ["https://*.ikariam.gameforge.com/*"],
    types: ["main_frame", "xmlhttprequest"]
  },
  ["requestHeaders", "extraHeaders"]
);

// Capture data when loading site + view click
chrome.webRequest.onResponseStarted.addListener(
  async (details) => {
    const url = new URL(details.url);
    // Check if this is a view request
    if (url.searchParams.get('view')) {
      try {
        const response = await fetch(details.url);
        const text = await response.text();
        const actionRequestMatch = text.match(/actionRequest:\s*"([a-zA-Z0-9]+)"/);
        const cityMatch = text.match(/JSON\.parse\('\{\\\"city_(\d+)/);
        if (actionRequestMatch) {
          console.log("🌐 Captured actionRequest:", actionRequestMatch[1]);
          storeActionRequest(actionRequestMatch[1]);
        }
        if (cityMatch) {
          const cityId = cityMatch[1];
          console.log("🌐 Captured city ID:", cityId);
          chrome.storage.local.set({ cityId });
        }
      } catch (err) {
        console.error('Failed to capture view response:', err);
      }
    }
  },
  {
    urls: ["https://*.ikariam.gameforge.com/*"],
    types: ["main_frame"]
  }
);

// Capture actionRequest from URL parameters for updateGlobalData
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const url = new URL(details.url);
    const params = new URLSearchParams(url.search);
    const paramUpdateGlobalData = params.get("view");
    const actionRequest = params.get("actionRequest");
    if (actionRequest && paramUpdateGlobalData === "updateGlobalData") {
      console.log(`🌐 Captured actionRequest from updateGlobalData:`, actionRequest);
      storeActionRequest(actionRequest);
    } else {
      //console.log("🚫 NOT UPDATEGLOBALDATA");
      //console.log(url);
      //console.log(params);
    }
  },
  {
    urls: ["https://*.ikariam.gameforge.com/*"],
    types: ["xmlhttprequest"]
  }
);

// Capture data from changing the city /index.php update
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = new URL(details.url);
    if (url.pathname === "/index.php") {
      if (details.method === "POST" && details.requestBody) {
          //console.log("📝 POST form data:", details.requestBody.formData);
          const cityId = details.requestBody.formData.cityId?.[0];
          const actionRequest = details.requestBody.formData.actionRequest?.[0];
          
          if (actionRequest) {
            console.log("🌐 Captured actionRequest from /index.php:", actionRequest);
            storeActionRequest(actionRequest);
          }
          if (cityId) {
            console.log("🌐 Captured city ID from /index.php:", cityId);
            chrome.storage.local.set({ cityId });
          }
      }
    }
  },
  {
    urls: ["https://*.ikariam.gameforge.com/*"],
    types: ["xmlhttprequest", "main_frame"]
  },
  ["requestBody"]
);

/***************************************************
 * 2. prepVideo:
 *    Fetch the cinema page, parse out videoID & cityID
 ***************************************************/
async function prepVideo() {
  try {
    const { ikariamCookie, ikariamSubdomain } = await getStorage([
      "ikariamCookie",
      "ikariamSubdomain"
    ]);
    if (!ikariamCookie) {
      console.error("No ikariamCookie stored!");
      return false;
    }

    const url = `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=cinema&visit=1`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        cookie: ikariamCookie
      }
    });
    const responseText = await response.text();
    
    const videoIdMatch = responseText.match(/\\"videoID\\":(\d+)/);
    if (videoIdMatch) {
      console.log("Video ID:", videoIdMatch[1]);
      await setStorage({ videoId: videoIdMatch[1] });
    }

    const actionRequestMatch = responseText.match(/actionRequest:\s*"([a-zA-Z0-9]+)"/);
    if (actionRequestMatch) {
      console.log("🌐 Primary AR from prepVideo:", actionRequestMatch[1]);
      // Force store the action request from prepVideo
      await storeActionRequest(actionRequestMatch[1], true);
    } else {
      console.error("❌ No actionRequest found in prepVideo response!");
      return false;
    }
    
    // const cityIdMatch = responseText.match(/\\"cityID\\":(\d+)/);
    // if (cityIdMatch) {
    //   await setStorage({ cityId: cityIdMatch[1] });
    // }
    return actionRequestMatch[1];
  } catch (err) {
    console.error("Failed to fetch cinema page:", err);
    return false;
  }
}

/***************************************************
 * 3. watchVideo (End Video)
 ***************************************************/
async function watchVideo(ARkey) {
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

  //const url = `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=noViewChange&action=AdVideoRewardAction&function=watchVideo&videoId=${videoId}&backgroundView=city&currentCityId=${cityId}&templateView=cinema&actionRequest=${actionRequest}&ajax=1`;
  const url = `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=noViewChange&action=AdVideoRewardAction&function=watchVideo&videoId=${videoId}&backgroundView=city&currentCityId=${cityId}&templateView=cinema&actionRequest=${ARkey}&ajax=1`;

  const bodyParams = new URLSearchParams({
    view: "noViewChange",
    action: "AdVideoRewardAction",
    function: "watchVideo",
    videoId: videoId,
    backgroundView: "city",
    currentCityId: cityId,
    templateView: "cinema",
    actionRequest: ARkey,
    ajax: "1"
  });

  //console.log("🎁 2nd half with AR:", actionRequest);
  console.log("🎁 2nd half with AR:", ARkey);


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
    return newActionMatch[1];
  } catch (err) {
    console.error("watchVideo failed:", err);
  }
}

/***************************************************
 * 4. requestBonus (Start Video)
 ***************************************************/
async function requestBonus(bonusId, ARkey) {
  const { actionRequest, ikariamCookie, cityId, videoId, ikariamSubdomain } = await getStorage([
    "actionRequest",
    "ikariamCookie",
    "cityId",
    "videoId",
    "ikariamSubdomain"
  ]);

  if (!ikariamCookie || !ikariamSubdomain || !actionRequest || !ARkey) {
    console.error("Missing data. Cannot request bonus.");
    return;
  }

  //const url = `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=noViewChange&action=AdVideoRewardAction&function=requestBonus&bonusId=${bonusId}&videoId=${videoId}&backgroundView=city&currentCityId=${cityId}&templateView=cinema&actionRequest=${actionRequest}&ajax=1`;
  const url = `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=noViewChange&action=AdVideoRewardAction&function=requestBonus&bonusId=${bonusId}&videoId=${videoId}&backgroundView=city&currentCityId=${cityId}&templateView=cinema&actionRequest=${ARkey}&ajax=1`;

  const bodyParams = new URLSearchParams({
    view: "noViewChange",
    action: "AdVideoRewardAction",
    function: "requestBonus",
    bonusId: bonusId,
    videoId: videoId,
    backgroundView: "city",
    currentCityId: cityId,
    templateView: "cinema",
    actionRequest: ARkey,
    ajax: "1"
  });

  //console.log("▶️ 1st half with AR:", actionRequest);
  console.log("▶️ 1st half with AR:", ARkey);

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
    return newActionMatch[1];
  } catch (err) {
    console.error("requestBonus failed:", err);
  }
}


/***************************************************
 * 5. Highscore, Shop, Inventory
 ***************************************************/
async function sendRequests() {
  try {
    // Get stored cookie and subdomain
    const { ikariamCookie, ikariamSubdomain } = await getStorage([
      "ikariamCookie",
      "ikariamSubdomain"
    ]);

    if (!ikariamCookie || !ikariamSubdomain) {
      console.error("Missing cookie or subdomain. Cannot send requests.");
      return;
    }

    // Define the URLs using the stored subdomain
    const urls = [
      `https://${ikariamSubdomain}.ikariam.gameforge.com/index.php?view=highscore&showMe=1`,
      `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=premium&linkType=2`,
      `https://${ikariamSubdomain}.ikariam.gameforge.com/?view=inventory`
    ];

    // Send requests in parallel
    const requests = urls.map(url => 
      fetch(url, {
        method: 'GET',
        headers: {
          'cookie': ikariamCookie
        }
      })
    );

    // Wait for all requests to complete
    const responses = await Promise.all(requests);
    
    // Process responses to extract actionRequest if present
    for (const response of responses) {
      const text = await response.text();
      const actionRequestMatch = text.match(/actionRequest:\s*"([a-zA-Z0-9]+)"/);
      if (actionRequestMatch) {
        console.log("🌐 Captured actionRequest from sendRequests:", actionRequestMatch[1]);
        storeActionRequest(actionRequestMatch[1]);
      }
    }

    console.log("✅ All requests completed successfully");

  } catch (error) {
    console.error("Error in sendRequests:", error);
  }
}

/***************************************************
 * 6. Additional Flow Functions
 ***************************************************/
async function testAndBonusFlow(bonusId) {
  try {
    const key1 = await prepVideo();
    const key2 = await requestBonus(bonusId, key1);
    await sleep(25000);
    const key3 = await watchVideo(key2);
    chrome.runtime.sendMessage({ type: 'bonusComplete', bonusId: bonusId });
  } catch (error) {
    console.error('Error in testAndBonusFlow:', error);
  }
}

async function sequenceOfBonusesFlow() {
  await testAndBonusFlow(51);
  await testAndBonusFlow(52);
  await testAndBonusFlow(53);
  console.log("✅ Sequence completed!");
  // Send message to popup about completion
  chrome.runtime.sendMessage({ type: 'sequenceComplete' });
}

/***************************************************
 * 7. Handle messages from popup
 ***************************************************/
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Create an async function to handle the message
  const handleMessage = async () => {
    try {
      if (message.action === "sendRequests") {
        await sendRequests();
      } else if (message.action === "bonus") {
        await testAndBonusFlow(message.bonusId);
      } else if (message.action === "sequenceOfBonuses") {
        await sequenceOfBonusesFlow();
      } else if (message.action === "prepVideo") {
        await prepVideo();
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  };

  // Execute the async function and keep service worker alive
  handleMessage();
  
  // Return true to indicate we'll handle the response asynchronously
  return true;
});

