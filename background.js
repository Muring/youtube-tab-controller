// background.js
// MV3 서비스 워커는 비영구적이므로 onStartup 시점에 탭이 아직
// 로딩 중일 수 있다. 재시도 로직으로 보완한다.
// 단, 팝업(popup.js)도 자체 inject 폴백을 가지므로
// background.js가 놓쳐도 팝업을 열면 항상 복구된다.

const YT = 'https://www.youtube.com/*';

async function inject(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'ping' }).catch(() => null);
    if (res?.pong) return true;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch {
    return false;
  }
}

// 재시도 포함 inject (탭이 아직 로딩 중일 수 있으므로)
async function injectWithRetry(tabId, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    const ok = await inject(tabId);
    if (ok) return;
    await new Promise(r => setTimeout(r, delay));
  }
}

async function injectAllYouTubeTabs() {
  const tabs = await chrome.tabs.query({ url: YT });
  for (const tab of tabs) injectWithRetry(tab.id);
}

chrome.runtime.onInstalled.addListener(injectAllYouTubeTabs);
chrome.runtime.onStartup.addListener(injectAllYouTubeTabs);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('https://www.youtube.com/')) return;
  inject(tabId);
});
