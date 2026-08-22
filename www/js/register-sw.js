// ネイティブ(Capacitor)ではローカル配信のためService Workerは不要で、
// 入れると更新の挙動が読みにくくなるだけ(RELEASE-KIT 4章)。Web/PWAのみ登録する。
const isNative = !!(
  window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform()
);

if (!isNative && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('service worker registration failed', err);
    });
  });
}
