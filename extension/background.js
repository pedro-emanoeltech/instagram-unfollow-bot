const prefix = 'ig-local-pause-';
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || !sender.url?.startsWith('https://www.instagram.com/')) return;
  const name = prefix + sender.tab.id;
  if (message.kind === 'ig-local-schedule-wake' && Number.isFinite(message.when)) {
    chrome.alarms.create(name, { when: Math.max(Date.now() + 1, message.when) }).then(() => reply({ok:true}), () => reply({ok:false}));
    return true;
  }
  if (message.kind === 'ig-local-clear-wake') {
    chrome.alarms.clear(name).then(() => reply({ok:true}), () => reply({ok:false}));
    return true;
  }
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(prefix)) return;
  const tabId = Number(alarm.name.slice(prefix.length));
  if (!Number.isSafeInteger(tabId)) return;
  try { await chrome.tabs.sendMessage(tabId, {kind:'ig-local-wake'}); } catch { /* Tab closed or reloaded: no action is restarted. */ }
});
