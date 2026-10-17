/**
 * Service worker registration. A new deploy activates immediately (skipWaiting + clientsClaim);
 * we then reload into it, but only while no photo is loaded so nobody loses their crop.
 * If a photo is in progress, the new version simply applies on the next visit.
 */
let workInProgress = false;

export function setWorkInProgress(v: boolean) {
  workInProgress = v;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const hadController = !!navigator.serviceWorker.controller; // false on the very first install
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded && !workInProgress) {
      reloaded = true;
      location.reload();
    }
  });
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Offline support is a bonus; the tool works without it.
  });
}
