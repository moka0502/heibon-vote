// 結果画面の"溜め"演出。gsap未読み込み(何らかの理由でvendorスクリプトが失敗した場合)でも
// 画面自体は静的な最終値のまま表示され続けるよう、gsap不在時は何もしない。
export function playResultReveal(root, { matchCount, totalCount }) {
  if (typeof gsap === 'undefined') return;
  const scoreEl = root.querySelector('.result-score');
  const tierEl = root.querySelector('.result-tier');
  if (!scoreEl || !tierEl) return;

  // アニメーションを控える設定のユーザーには最終値を即表示する(2026-08-17、a11yレビューで
  // 指摘: CSS側やカウントアップは対応済みだが、最重要画面のこの演出だけ未対応だった)。
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  // 満点(真の平凡)だけ特別な瞬間として演出を強めにする(Tinder/Bumble深掘り分B3:
  // 演出強度が常に一定だった指摘への対応)。それ以外は従来どおりの控えめな演出のまま。
  const isPerfect = matchCount === totalCount;

  const counter = { value: 0 };
  scoreEl.textContent = `0 / ${totalCount}`;

  gsap.to(counter, {
    value: matchCount,
    duration: 0.6,
    ease: 'power1.out',
    onUpdate: () => {
      scoreEl.textContent = `${Math.round(counter.value)} / ${totalCount}`;
    },
  });

  gsap.from(tierEl, {
    scale: isPerfect ? 0.3 : 0.5,
    opacity: 0,
    duration: isPerfect ? 0.6 : 0.4,
    delay: 0.5,
    ease: isPerfect ? 'elastic.out(1, 0.5)' : 'back.out(1.7)',
  });

  const heroEl = root.querySelector('.card-hero');
  if (isPerfect && heroEl) {
    gsap.fromTo(
      heroEl,
      { boxShadow: '0 0 0 0 rgba(91, 91, 214, 0.35)' },
      { boxShadow: '0 0 0 16px rgba(91, 91, 214, 0)', duration: 1, delay: 0.5, ease: 'power1.out' }
    );
  }
}
