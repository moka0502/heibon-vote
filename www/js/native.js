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

// App Storeのレビュー依頼ダイアログ。Web/PWAでは何もしない。
// プラグインはimportせず window.Capacitor.Plugins 経由で呼ぶ(バンドラなし構成のため)。
export async function requestReview() {
  const C = native();
  if (!C || !C.Plugins.InAppReview) return false;
  try {
    await C.Plugins.InAppReview.requestReview();
    return true;
  } catch (err) {
    // 表示できなくても体験を止めない(Appleは年3回の上限を超えると黙って出さない)。
    console.error('in-app review request failed:', err);
    return false;
  }
}

// レビュー依頼を出してよいかの判定。「良い体験の直後」に絞る(RELEASE-KIT 2章)。
// 起動直後や、うまくいかなかった直後に出すのは最悪手。
export const REVIEW_MIN_SCORE_RATIO = 0.8; // 10問中8問以上一致
export const REVIEW_MIN_PLAYS = 3;         // 通算3回以上完走している
export const REVIEW_COOLDOWN_DAYS = 90;    // 前回の依頼から90日以上

export function shouldRequestReview({ matchCount, totalCount, playCount, lastAskedAt, now = Date.now() }) {
  if (!totalCount) return false;
  if (matchCount / totalCount < REVIEW_MIN_SCORE_RATIO) return false;
  if (playCount < REVIEW_MIN_PLAYS) return false;
  if (lastAskedAt && now - lastAskedAt < REVIEW_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return false;
  return true;
}

