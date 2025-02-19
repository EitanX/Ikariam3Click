document.addEventListener("DOMContentLoaded", () => {
  // =============================
  // Grab DOM elements safely
  // =============================
  const serverElement = document.getElementById("serverName");
  const cityIdElement = document.getElementById("cityIdValue");
  const cookieElement = document.getElementById("cookieValue");
  const actionRequestElement = document.getElementById("actionRequestValue");
  const prevActionRequestElement = document.getElementById("prevActionRequestValue");
  const autoActionRequestElement = document.getElementById("autoActionRequestValue");
  const videoIdElement = document.getElementById("videoIdValue");

  const btnSendRequests = document.getElementById("btnSendRequests");
  const btnTestAndBonus51 = document.getElementById("btnTestAndBonus51");
  const btnTestAndBonus52 = document.getElementById("btnTestAndBonus52");
  const btnTestAndBonus53 = document.getElementById("btnTestAndBonus53");
  const btnSequence = document.getElementById("btnSequence");
  const refreshBtn = document.getElementById("refreshBtn");

    chrome.storage.local.get(["cityId"], (data) => {
    if (!data.cityId) {
      chrome.runtime.sendMessage({ action: "fetchBasicData" });
    }
  });

  // =============================
  // Detect the Ikariam server from the active tab
  // =============================
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const url = new URL(tabs[0].url);
      const subdomainMatch = url.hostname.match(/^(s\d+(?:-[a-z]+)?)\.ikariam\.gameforge\.com$/);
      if (subdomainMatch) {
        const subdomain = subdomainMatch[1];
        if (serverElement) serverElement.textContent = subdomain;
        chrome.storage.local.set({ ikariamSubdomain: subdomain });
      } else {
        if (serverElement) serverElement.textContent = "Not on an Ikariam server.";
      }
    } else {
      if (serverElement) serverElement.textContent = "No active tab detected.";
    }
  });

  // =============================
  // Load & Display Existing Data (Initial Load)
  // =============================
  chrome.storage.local.get(
    ["actionRequest", "autoActionRequest", "prevActionRequest", "ikariamCookie", "videoId", "cityId"],
    (data) => {
      if (actionRequestElement) {
        actionRequestElement.textContent = data.actionRequest || "No current AR.";
      }
      if (autoActionRequestElement) {
        autoActionRequestElement.textContent = data.autoActionRequest || "No auto AR.";
      }
      if (prevActionRequestElement) {
        prevActionRequestElement.textContent = data.prevActionRequest || "No previous AR.";
      }
      if (cookieElement) {
        cookieElement.textContent = data.ikariamCookie || "No cookie captured.";
      }
      if (videoIdElement) {
        videoIdElement.textContent = data.videoId || "No videoId captured.";
      }
      if (cityIdElement) {
        cityIdElement.textContent = data.cityId || "No cityID captured.";
      }
    }
  );

  // =============================
  // Button Event Listeners
  // =============================
  if (btnSendRequests) {
    btnSendRequests.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "sendRequests" });
    });
  }

  if (btnTestAndBonus51) {
    btnTestAndBonus51.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "bonus", bonusId: 51 });
    });
  }

  if (btnTestAndBonus52) {
    btnTestAndBonus52.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "bonus", bonusId: 52 });
    });
  }

  if (btnTestAndBonus53) {
    btnTestAndBonus53.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "bonus", bonusId: 53 });
    });
  }

  if (btnSequence) {
    btnSequence.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "sequenceOfBonuses" });
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "fetchBasicData" });
    });
  }

  // =============================
  // Listen for Changes & Update Display
  // =============================
  chrome.storage.onChanged.addListener((changes) => {
    console.log("📊 chrome.storage changes detected:", changes);
    if (changes.actionRequest && actionRequestElement) {
      actionRequestElement.textContent = changes.actionRequest.newValue || "No current AR.";
    }
    if (changes.prevActionRequest && prevActionRequestElement) {
      prevActionRequestElement.textContent = changes.prevActionRequest.newValue || "No previous AR.";
    }
    if (changes.autoActionRequest && autoActionRequestElement) {
      autoActionRequestElement.textContent = changes.autoActionRequest.newValue || "No auto AR.";
    }
    if (changes.ikariamCookie && cookieElement) {
      cookieElement.textContent = changes.ikariamCookie.newValue || "No cookie.";
    }
    if (changes.videoId && videoIdElement) {
      videoIdElement.textContent = changes.videoId.newValue || "No videoId.";
    }
    if (changes.cityId && cityIdElement) {
      cityIdElement.textContent = changes.cityId.newValue || "No cityID captured.";
    }
  });
});

