document.addEventListener("DOMContentLoaded", () => {
  // =============================
  // Grab DOM elements safely
  // =============================
  const serverElement = document.getElementById("serverName");
  const cityIdElement = document.getElementById("cityIdValue");
  const cookieElement = document.getElementById("cookieValue");
  const actionRequestElement = document.getElementById("actionRequestValue");
  const videoIdElement = document.getElementById("videoIdValue");

  const btnSendRequests = document.getElementById("btnSendRequests");
  const btnTestAndBonus51 = document.getElementById("btnTestAndBonus51");
  const btnTestAndBonus52 = document.getElementById("btnTestAndBonus52");
  const btnTestAndBonus53 = document.getElementById("btnTestAndBonus53");
  const btnSequence = document.getElementById("btnSequence");
  const refreshBtn = document.getElementById("refreshBtn");

    chrome.storage.local.get(["cityId"], (data) => {
    if (!data.cityId) {
      chrome.runtime.sendMessage({ action: "prepVideo" });
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
    ["actionRequest", "ikariamCookie", "videoId", "cityId"],
    (data) => {
      if (actionRequestElement) {
        actionRequestElement.textContent = data.actionRequest || "No current AR.";
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
      startSingleBonusTimer(btnTestAndBonus51, 51);
    });
  }

  if (btnTestAndBonus52) {
    btnTestAndBonus52.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "bonus", bonusId: 52 });
      startSingleBonusTimer(btnTestAndBonus52, 52);
    });
  }

  if (btnTestAndBonus53) {
    btnTestAndBonus53.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "bonus", bonusId: 53 });
      startSingleBonusTimer(btnTestAndBonus53, 53);
    });
  }

  if (btnSequence) {
    btnSequence.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "sequenceOfBonuses" });
      startBonusSequenceTimer(btnSequence);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "prepVideo" });
    });
  }

  // =============================
  // Listen for Changes & Update Display
  // =============================
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.actionRequest && actionRequestElement) {
      actionRequestElement.textContent = changes.actionRequest.newValue || "No current AR.";
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

function startBonusSequenceTimer(button) {
  const originalText = button.textContent;
  button.disabled = true;
  
  let timeLeft = 80;
  const timer = setInterval(() => {
    button.textContent = `${originalText} (${timeLeft}s)`;
    timeLeft--;
    
    if (timeLeft < 0) {
      clearInterval(timer);
      button.textContent = originalText;
      button.disabled = false;
      button.classList.remove('running');
    }
  }, 1000);
  
  button.classList.add('running');
  
  // Listen for sequence completion
  chrome.runtime.onMessage.addListener(function listener(message) {
    if (message.type === 'sequenceComplete') {
      button.classList.add('completed');
      setTimeout(() => {
        button.classList.remove('completed');
      }, 3000); // Remove green color after 3 seconds
      chrome.runtime.onMessage.removeListener(listener);
    }
  });
}

function startSingleBonusTimer(button, bonusId) {
  const originalText = button.textContent;
  button.disabled = true;
  
  let timeLeft = 25;
  const timer = setInterval(() => {
    button.textContent = `${originalText} (${timeLeft}s)`;
    timeLeft--;
    
    if (timeLeft < 0) {
      clearInterval(timer);
      button.textContent = originalText;
      button.disabled = false;
      button.classList.remove('running');
    }
  }, 1000);
  
  button.classList.add('running');
  
  // Listen for bonus completion with matching bonusId
  chrome.runtime.onMessage.addListener(function listener(message) {
    if (message.type === 'bonusComplete' && message.bonusId === bonusId) {
      button.classList.add('completed');
      setTimeout(() => {
        button.classList.remove('completed');
      }, 3000);
      chrome.runtime.onMessage.removeListener(listener);
    }
  });
}

