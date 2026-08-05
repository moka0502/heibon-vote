// 結果画面の"溜め"演出。gsap未読み込み(何らかの理由でvendorスクリプトが失敗した場合)でも
// 画面自体は静的な最終値のまま表示され続けるよう、gsap不在時は何もしない。
export function playResultReveal(root, { matchCount, totalCount }) {
  if (typeof gsap === 'undefined') return;
  const scoreEl = root.querySelector('.result-score');
  const tierEl = root.querySelector('.result-tier');
  if (!scoreEl || !tierEl) return;

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
    scale: 0.5,
    opacity: 0,
    duration: 0.4,
    delay: 0.5,
    ease: 'back.out(1.7)',
  });
}
