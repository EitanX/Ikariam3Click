document.addEventListener('DOMContentLoaded', () => {
  const statusElement = document.getElementById('status');
  const button = document.getElementById('sendRequests');

  // Check if we are on s*.ikariam.gameforge.com (with optional regional suffix)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const subdomainMatch = url.hostname.match(/^(s\d+(?:-[a-z]+)?)\.ikariam\.gameforge\.com$/);

    if (subdomainMatch) {
      const serverName = subdomainMatch[1]; // e.g., 's69-gr'
      statusElement.textContent = `Connected to server: ${serverName}`;
      button.disabled = false;

      button.addEventListener('click', () => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: sendRequests,
          args: [url.origin]
        }).then(() => {
          // Success: Turn button green
          setButtonState('success');
        }).catch(() => {
          // Failure: Turn button red
          setButtonState('failure');
        });
      });
    } else {
      statusElement.textContent = "Not on an Ikariam server";
      button.disabled = true;
    }
  });
});

// Function to send requests
function sendRequests(baseUrl) {
  const urls = [
    `${baseUrl}/index.php?view=highscore&showMe=1`,
    `${baseUrl}/?view=premium&linkType=2`,
    `${baseUrl}/?view=inventory`
  ];

  (async () => {
    try {
      for (const url of urls) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed request: ${url}`);
        console.log(`Request to ${url} completed with status: ${response.status}`);
      }
      return true; // Success
    } catch (error) {
      console.error('One or more requests failed:', error);
      throw error; // Failure
    }
  })();
}

// Helper to update button color based on result
function setButtonState(state) {
  const button = document.getElementById('sendRequests');
  if (!button) return;

  if (state === 'success') {
    button.style.backgroundColor = '#4CAF50'; // Green
    button.textContent = 'Requests Sent!';
  } else if (state === 'failure') {
    button.style.backgroundColor = '#F44336'; // Red
    button.textContent = 'Request Failed';
  }

  // Reset button after 2 seconds
  setTimeout(() => {
    button.style.backgroundColor = ''; 
    button.textContent = 'Send Requests';
  }, 2000);
}

