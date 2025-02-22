document.addEventListener("DOMContentLoaded", () => {
  console.log('🎬 DOM Content Loaded');

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
  const tasksRefreshBtn = document.getElementById("tasksRefreshBtn");

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
      startSequenceBonusTimer(btnSequence);
    });
  }

  // Initialize refresh button text based on initial tab
  updateRefreshButtonText('actions');

  // Tab switching logic
  document.querySelectorAll('.tab-button').forEach(button => {
    const tabName = button.getAttribute('data-tab');
    console.log(`🔄 Setting up listener for ${tabName} tab`);
    
    button.addEventListener('click', async () => {
      console.log(`👆 Clicked ${tabName} tab`);
      
      // Update button states
      document.querySelectorAll('.tab-button').forEach(btn => 
        btn.classList.toggle('active', btn === button)
      );
      
      // Update tab visibility
      Object.entries(tabs).forEach(([id, element]) => {
        if (element) {
          const isActive = id === tabName;
          element.classList.toggle('active', isActive);
          console.log(`${id} tab visibility:`, isActive);
        }
      });

      // Update refresh button text
      updateRefreshButtonText(tabName);
      
      // Update city data when switching to cities tab
      if (tabName === 'cities') {
        console.log('🏰 Initializing cities tab');
        await updateCityManagerTab();
      }

      await updateShipCounts();  // Update ships when switching tabs
    });
  });

  // Unified refresh button handler
  if (tasksRefreshBtn) {
    tasksRefreshBtn.addEventListener('click', async () => {
      const activeTab = document.querySelector('.tab-button.active').getAttribute('data-tab');
      
      if (activeTab === 'actions') {
        chrome.runtime.sendMessage({ action: "prepVideo" });
      } else if (activeTab === 'cities') {
        await refreshCityDetails();
      }
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

  // Initialize tabs
  const tabs = {
    actions: document.getElementById('actions'),
    cities: document.getElementById('citiesTab')
  };

  console.log('📑 Available tabs:', Object.keys(tabs));

  // Set initial active tab
  const initialTab = 'actions';
  document.querySelector(`[data-tab="${initialTab}"]`).classList.add('active');
  document.getElementById(initialTab).classList.add('active');

  // Initial update of ship counts when popup opens
  updateShipCounts();
});

function startSequenceBonusTimer(button) {
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

// New function to update ship counts
async function updateShipCounts() {
  const { accounts, ikariamCookie } = await chrome.storage.local.get(['accounts', 'ikariamCookie']);
  if (!accounts || !ikariamCookie) return;

  const match = ikariamCookie.match(/ikariam=(\d+)_/);
  const currentUserId = match ? match[1] : null;
  if (!currentUserId || !accounts[currentUserId]) return;

  const accountData = accounts[currentUserId];
  
  // Update fleet info in header
  document.querySelectorAll('.smallShips').forEach(el => 
    el.textContent = accountData.availableSmallShips || 0
  );
  document.querySelectorAll('.largeShips').forEach(el => 
    el.textContent = accountData.availableLargeShips || 0
  );
}

// Modify the updateCityManagerTab function
async function updateCityManagerTab() {
  const accountsList = document.getElementById('accountsList');
  if (!accountsList) return;
  accountsList.innerHTML = '';

  const { accounts, ikariamCookie } = await chrome.storage.local.get(['accounts', 'ikariamCookie']);
  if (!accounts || !ikariamCookie) return;

  const match = ikariamCookie.match(/ikariam=(\d+)_/);
  const currentUserId = match ? match[1] : null;
  if (!currentUserId || !accounts[currentUserId]) return;

  const accountData = accounts[currentUserId];
  
  // Update ship counts
  await updateShipCounts();

  // Add cities
  for (const [cityId, cityData] of Object.entries(accountData.cities)) {
    const cityElement = cityTemplate.content.cloneNode(true);
    
    // Add click handler for the city header
    const cityHeader = cityElement.querySelector('.city-header');
    const cityControls = cityElement.querySelector('.city-controls');
    
    if (cityHeader && cityControls) {
      cityHeader.addEventListener('click', (e) => {
        // Close any other open controls first
        document.querySelectorAll('.city-controls').forEach(control => {
          if (control !== cityControls && control.classList.contains('expanded')) {
            control.classList.remove('expanded');
          }
        });
        
        // Toggle this city's controls
        cityControls.classList.toggle('expanded');
      });

      // Close controls when clicking outside
      document.addEventListener('click', (e) => {
        if (!cityHeader.contains(e.target) && 
            !cityControls.contains(e.target) && 
            cityControls.classList.contains('expanded')) {
          cityControls.classList.remove('expanded');
        }
      });
    }

    // Set city name
    const cityNameElement = cityElement.querySelector('.city-name');
    if (cityNameElement) {
      const maxLength = 15;
      const cityName = cityData.name;
      cityNameElement.textContent = cityName.length > maxLength ? 
        cityName.substring(0, maxLength - 3) + '...' : 
        cityName;
    }
    
    // Update trade good badge
    const tradeGoodBadge = cityElement.querySelector('.trade-good-badge');
    if (tradeGoodBadge) {
      const tradeGood = cityData.specialTradeGood;
      const tradeGoodIcon = tradeGoodBadge.querySelector('.trade-good-icon');
      const tradeGoodText = tradeGoodBadge.querySelector('.trade-good-text');
      
      if (tradeGood) {
        tradeGoodIcon.src = `images/${tradeGood.toLowerCase()}.png`;
        tradeGoodText.textContent = tradeGood;
        tradeGoodBadge.style.display = 'flex';
      } else {
        tradeGoodBadge.style.display = 'none';
      }
    }
    
    // Update resource amounts
    const woodElement = cityElement.querySelector('.wood.resource-value');
    if (woodElement) woodElement.textContent = cityData.woodAmount?.toLocaleString() || '0';
    
    const wineElement = cityElement.querySelector('.wine.resource-value');
    if (wineElement) wineElement.textContent = cityData.wineAmount?.toLocaleString() || '0';
    
    const marbleElement = cityElement.querySelector('.marble.resource-value');
    if (marbleElement) marbleElement.textContent = cityData.marbleAmount?.toLocaleString() || '0';
    
    const crystalElement = cityElement.querySelector('.crystal.resource-value');
    if (crystalElement) crystalElement.textContent = cityData.crystalAmount?.toLocaleString() || '0';
    
    const sulphurElement = cityElement.querySelector('.sulphur.resource-value');
    if (sulphurElement) sulphurElement.textContent = cityData.sulphurAmount?.toLocaleString() || '0';

    accountsList.appendChild(cityElement);
  }
}

// Helper function to update refresh button text
function updateRefreshButtonText(activeTab) {
  const tasksRefreshBtn = document.getElementById('tasksRefreshBtn');
  const refreshText = tasksRefreshBtn.querySelector('.refresh-text');
  
  if (activeTab === 'actions') {
    refreshText.textContent = 'Refresh VideoID';
  } else if (activeTab === 'cities') {
    refreshText.textContent = 'Refresh Resources';
  }
}

// Update the refreshCityDetails function
async function refreshCityDetails() {
  const tasksRefreshBtn = document.getElementById('tasksRefreshBtn');
  const refreshText = tasksRefreshBtn.querySelector('.refresh-text');
  if (!tasksRefreshBtn) return;

  try {
    tasksRefreshBtn.disabled = true;
    refreshText.textContent = 'Updating...';

    // Get current user's data
    const { accounts, ikariamCookie } = await chrome.storage.local.get(['accounts', 'ikariamCookie']);
    if (!accounts || !ikariamCookie) return;

    const match = ikariamCookie.match(/ikariam=(\d+)_/);
    const currentUserId = match ? match[1] : null;
    if (!currentUserId || !accounts[currentUserId]) return;

    // Get current cityId
    const { cityId } = await chrome.storage.local.get(['cityId']);

    // Get cityManager instance and storage functions
    const [cityManager, { updateUserTimestamp }] = await Promise.all([
      import('./cityManager.js').then(m => m.default),
      import('./storage.js')
    ]);

    // Update each city
    const cities = accounts[currentUserId].cities;
    // Filter out current city and process others first
    const cityIds = Object.keys(cities).filter(id => id !== cityId);
    // Add current city at the end if it exists
    if (cityId && cities[cityId]) {
      cityIds.push(cityId);
    }

    for (const id of cityIds) {
      await cityManager.fetchCityDetails(id, true);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update the user's timestamp
    await updateUserTimestamp(currentUserId);

    // Refresh the display
    await updateCityManagerTab();

  } catch (error) {
    console.error('Failed to refresh city details:', error);
  } finally {
    tasksRefreshBtn.disabled = false;
    refreshText.textContent = 'Refresh Resources';
  }
}

