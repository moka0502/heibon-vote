// ネイティブ(iOS Capacitor WebView)実行時のみ有効になる薄いブリッジ。
// このアプリはバンドラを使わない素のESM構成のため、npmパッケージ(@capacitor/haptics等)を
// 直接importせず、ネイティブランタイムが実行時に注入する window.Capacitor.Plugins.* を参照する。
// Web/PWAでは window.Capacitor.isNativePlatform() が false(または未定義)なので、全て安全にno-op。
// 実際の挙動(振動・ステータスバー)はiOSビルド後のTestFlightでのみ確認できる(2026-08-18追加、
// App Store Guideline 4.2「ネイティブらしさ」対策)。

function native() {
  const C = window.Capacitor;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
  return C;
}

export function isNative() {
  return !!native();
}

// 回答タップ時の軽い触覚フィードバック(iOS SafariのVibration API非対応を、ネイティブで補う)。
export async function hapticLight() {
  const C = native();
  if (!C) return;
  try {
    await C.Plugins.Haptics?.impact({ style: 'LIGHT' });
  } catch (_) {
    // ハプティクス非搭載端末等では静かに無視(体験を止めない)
  }
}

// 結果表示など「達成」の瞬間の成功フィードバック。
export async function hapticSuccess() {
  const C = native();
  if (!C) return;
  try {
    await C.Plugins.Haptics?.notification({ type: 'SUCCESS' });
  } catch (_) {}
}

// ステータスバーをアプリ配色に合わせる。近白背景(#faf9f7)なのでアイコン/文字は濃色(Dark)。
// setBackgroundColorはAndroidのみ有効(iOSは無視)だが、両対応のため呼んでおく。
// ※Style値(Dark/Light)の見え方はTestFlightで最終調整する。
export async function initStatusBar() {
  const C = native();
  if (!C || !C.Plugins.StatusBar) return;
  try {
    await C.Plugins.StatusBar.setStyle({ style: 'DARK' });
    await C.Plugins.StatusBar.setBackgroundColor?.({ color: '#faf9f7' });
  } catch (_) {}
}
