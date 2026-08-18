function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

// バーは0%で描画してから目標幅へアニメーションさせる(Slido/Mentimeter的な「結果が伸びてくる」演出)。
// 1回のrAFだとブラウザが0%とtarget%を同一フレームでまとめてしまい、
// 遷移(transition)が発火しないことがあるため2段にしている。
function animateBarWidth(barEl, pct) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      barEl.style.width = `${pct}%`;
    });
  });
}

// バーの伸びと歩調を合わせて数字もカウントアップさせる(Robinhood深掘り分R1: バーの幅は
// アニメーションするのに隣の数字が瞬間表示だと不自然、という指摘への対応)。
function animateCountUp(el, target, { duration = 600, suffix = '' } = {}) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = `${target}${suffix}`;
    return;
  }
  const start = performance.now();
  function tick(now) {
    const elapsed = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - elapsed) ** 3;
    el.textContent = `${Math.round(target * eased)}${suffix}`;
    if (elapsed < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// 通算称号(server/tiers.jsのlifetimeTitleForと同じ閾値)まで、あと何回満点が要るかを示す。
// 称号システムに「次のランクまでの距離感」がなかったことへの対応(Robinhood深掘り分R2)。
const LIFETIME_TITLE_THRESHOLDS = [
  { count: 1, title: '平凡の卵' },
  { count: 3, title: '平凡上級者' },
  { count: 10, title: '真の平凡' },
];

function nextLifetimeTitleHint(perfectCount) {
  const next = LIFETIME_TITLE_THRESHOLDS.find((t) => perfectCount < t.count);
  if (!next) return null;
  return `あと${next.count - perfectCount}回満点で「${next.title}」`;
}

// 通算称号バッジの色調をランクごとに変える(server/tiers.jsのlifetimeTitleForと対応、UI#15)。
const LIFETIME_TITLE_BADGE_CLASS = {
  平凡の卵: 'badge badge-tier-1',
  平凡上級者: 'badge badge-tier-2',
  真の平凡: 'badge badge-tier-3',
};

function lifetimeTitleBadgeClass(title) {
  return LIFETIME_TITLE_BADGE_CLASS[title] ?? 'badge';
}

// Homeの副次リンクをテキストだけでなくアイコンでも識別できるようにする(UI#18)。
// 外部アイコンライブラリは追加せず、ローカルの最小限のインラインSVGで完結させる。
const ICONS = {
  history:
    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l3 2"/></svg>',
  chart:
    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16V9M10 16V4M16 16v-6"/></svg>',
  person:
    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="3"/><path d="M4 17c0-3 2.5-5 6-5s6 2 6 5"/></svg>',
  bulb:
    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z"/><path d="M8 17h4"/></svg>',
};

function icon(name) {
  const span = el('span', { class: 'icon' });
  span.innerHTML = ICONS[name] ?? '';
  return span;
}

function formatDate(sqliteDatetime) {
  // SQLiteのdatetime('now')はUTCの 'YYYY-MM-DD HH:MM:SS' 形式で返る
  const date = new Date(`${sqliteDatetime}Z`);
  return date.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderVoteBreakdownRow(vote) {
  const row = el('div', { class: 'question-row' });
  row.appendChild(el('p', { class: 'question-text', text: vote.question }));

  if (!vote.options || !vote.percentages) {
    // 古いレスポンス形状(options/percentagesなし)への保険。通常はここには来ない。
    const isMatch = vote.optionId === vote.majorityOptionId;
    row.appendChild(
      el('p', {
        class: isMatch ? 'match' : 'mismatch',
        text: `あなた: ${vote.optionLabel} / 多数派: ${vote.majorityOptionLabel ?? '不明'}${isMatch ? '(一致)' : ''}`,
      })
    );
    return row;
  }

  const bars = [];
  for (const option of vote.options) {
    const pct = vote.percentages[option.id] ?? 0;
    const tags = [
      option.id === vote.optionId ? 'あなた' : null,
      option.id === vote.majorityOptionId ? '多数派' : null,
    ].filter(Boolean);
    const label = tags.length ? `${option.label}(${tags.join('・')})` : option.label;

    const bar = el('div', { class: option.id === vote.optionId ? 'bar' : 'bar bar-muted' });
    const countEl = el('span', { class: 'bar-count', text: '0%' });
    const line = el('div', { class: 'bar-line' });
    line.appendChild(el('span', { class: 'bar-option-label', text: label }));
    line.appendChild(el('div', { class: 'bar-track' }, [bar]));
    line.appendChild(countEl);
    row.appendChild(line);
    bars.push([bar, countEl, pct]);
  }
  for (const [bar, countEl, pct] of bars) {
    animateBarWidth(bar, pct);
    animateCountUp(countEl, pct, { suffix: '%' });
  }
  return row;
}

export function renderLoading() {
  const wrap = el('div', { class: 'card loading-card' });
  wrap.appendChild(el('div', { class: 'spinner' }));
  return wrap;
}

export function renderIntro(onNext) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: '「平凡」は、実はすごい' }));
  card.appendChild(
    el('p', {
      text: 'このアプリは、二択のお題に答えて「世間の多数派」とどれだけ一致できるかを競うクイズです。10問中、何問"平凡"でいられるか試してみましょう。',
    })
  );
  card.appendChild(
    el('p', {
      text: '一致すれば「平凡」、外れれば「平凡じゃない」。どちらも面白い結果です。少数派だったお題ほど、あなたの個性が見えてきます。',
    })
  );
  card.appendChild(
    el('p', {
      class: 'progress',
      text: '次に、年代・性別・血液型・利き手を聞きます。これは「A型の人はこう答えがち」のような属性別の傾向を見せるためだけに使い、多数派の判定自体には影響しません。',
    })
  );
  card.appendChild(el('button', { class: 'btn btn-primary', text: 'はじめる', onclick: onNext }));
  wrap.appendChild(card);
  return wrap;
}

export function renderProfileForm(attributes, onSubmit, options = {}) {
  const {
    currentValues = null,
    title = 'はじめに、あなたについて教えてください',
    submitLabel = 'はじめる',
    onCancel = null,
  } = options;

  const form = el('form', { class: 'card' });
  form.appendChild(el('h2', { text: title }));
  if (currentValues) {
    form.appendChild(
      el('p', {
        class: 'progress',
        text: 'ここで変更しても、これまでの挑戦履歴やスコアは変わりません。次回以降の回答に使われます。',
      })
    );
  }

  // ネイティブselect依存から、Duolingo風の大きくタップできる選択肢ボタンへ(D3)。
  // 未選択のまま送信すると、その属性はプロフィールに含めない(2026-08-17、
  // App Store審査官/CX担当ペルソナレビューで発覚: 先頭選択肢が常に選択済み扱いになり、
  // 実際は未入力のユーザーの属性まで事実と異なる値で保存されていた。
  // www/privacy.htmlの「未入力の場合は取得しません」という記述と実装を一致させる)。
  const selectedValues = { ...currentValues };
  for (const attribute of attributes) {
    const field = el('div', { class: 'field' });
    field.appendChild(el('span', { class: 'field-label', text: attribute.label }));

    const optionButtons = [];
    const optionsWrap = el('div', { class: 'attribute-options' });
    for (const value of attribute.values) {
      const isSelected = value.id === selectedValues[attribute.id];
      const optionBtn = el('button', {
        type: 'button',
        class: `btn btn-outline attribute-option${isSelected ? ' is-selected' : ''}`,
        text: value.label,
      });
      optionBtn.addEventListener('click', () => {
        selectedValues[attribute.id] = value.id;
        for (const b of optionButtons) b.classList.remove('is-selected');
        optionBtn.classList.add('is-selected');
      });
      optionButtons.push(optionBtn);
      optionsWrap.appendChild(optionBtn);
    }
    field.appendChild(optionsWrap);
    form.appendChild(field);
  }

  form.appendChild(el('button', { class: 'btn btn-primary', type: 'submit', text: submitLabel }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit({ ...selectedValues });
  });

  if (!onCancel) return form;

  const wrap = el('div');
  wrap.appendChild(form);
  wrap.appendChild(el('button', { class: 'btn-link', text: '戻る', onclick: onCancel }));
  return wrap;
}

export function renderHome(stats, { onStart, onHistory, onTopics, onSettings, onSuggest }) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: '挑戦しよう' }));
  card.appendChild(
    el('p', { text: '色々なカテゴリの10問に答えて、世間の多数派とどれだけ一致できるか試そう。' })
  );
  if (stats.lifetimeTitle) {
    card.appendChild(
      el('p', {}, [el('span', { class: lifetimeTitleBadgeClass(stats.lifetimeTitle), text: stats.lifetimeTitle })])
    );
  }
  // 「満点」「称号」が何を指すか初見では伝わらないため、一言添える(初回ユーザーレビュー)。
  card.appendChild(
    el('p', { class: 'progress', text: `通算満点(10問すべて多数派と一致): ${stats.perfectCount}回` })
  );
  const nextTitleHint = nextLifetimeTitleHint(stats.perfectCount);
  if (nextTitleHint) {
    card.appendChild(el('p', { class: 'progress', text: `${nextTitleHint}(満点を重ねると称号がもらえます)` }));
  }
  card.appendChild(el('button', { class: 'btn btn-primary', text: '挑戦する', onclick: onStart }));
  wrap.appendChild(card);
  wrap.appendChild(
    el('button', { class: 'btn-link btn-link-emphasis', onclick: onHistory }, [icon('history'), '履歴を見る'])
  );
  wrap.appendChild(el('button', { class: 'btn-link', onclick: onTopics }, [icon('chart'), 'お題の内訳を見る']));
  wrap.appendChild(
    el('button', { class: 'btn-link', onclick: onSettings }, [icon('person'), 'あなたについての設定'])
  );
  wrap.appendChild(el('button', { class: 'btn-link', onclick: onSuggest }, [icon('bulb'), 'お題を提案する']));
  wrap.appendChild(el('a', { class: 'btn-link', href: 'privacy.html', text: 'プライバシーポリシー' }));
  return wrap;
}

export function renderCategoryPicker(categories, { onSelectRandom, onSelectCategory, onBack }) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: 'お題を選ぶ' }));
  card.appendChild(
    el('p', {
      class: 'progress',
      text: '気になるジャンルで挑戦してもいいし、まずはランダムに10問答えてみてもOK。',
    })
  );
  // 「Part1/Part2」が何かは画面上で説明がないと初見では分からない(初回ユーザーレビュー)。
  if (categories.some((c) => Math.floor(c.count / 10) >= 2)) {
    card.appendChild(
      el('p', {
        class: 'progress',
        text: '「Part1」「Part2」は同じカテゴリ内の別々の10問です(問題は重複しません)。',
      })
    );
  }
  card.appendChild(
    el('button', {
      class: 'btn btn-primary',
      text: 'ランダム(全部から10問)',
      onclick: onSelectRandom,
    })
  );
  for (const category of categories) {
    // 「食事(11問)」のような半端な数を見せず、常に10問ぴったりの「Part」単位で選ばせる。
    // Part1は固定10問、Part2は残りが10問貯まったカテゴリだけに出す(2026-08-16)。
    const parts = Math.floor(category.count / 10);
    if (parts >= 1) {
      card.appendChild(
        el('button', {
          class: 'btn btn-outline category-option',
          text: `${category.label} Part1`,
          onclick: () => onSelectCategory(category.id, category.label, 1),
        })
      );
    }
    if (parts >= 2) {
      card.appendChild(
        el('button', {
          class: 'btn btn-outline category-option',
          text: `${category.label} Part2`,
          onclick: () => onSelectCategory(category.id, category.label, 2),
        })
      );
    }
  }
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn-link', text: 'ホームに戻る', onclick: onBack }));
  return wrap;
}

export function renderTopicList(topics, { onSelect, onBack }) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: 'お題の内訳を見る' }));
  card.appendChild(
    el('p', {
      class: 'progress',
      text: '気になるお題を選ぶと、選択肢ごとの割合や年代・血液型などの属性別の傾向が見られます。',
    })
  );
  let currentCategory = null;
  for (const topic of topics) {
    if (topic.category !== currentCategory) {
      currentCategory = topic.category;
      card.appendChild(el('h3', { class: 'topic-list-category', text: topic.categoryLabel }));
    }
    const item = el('button', {
      type: 'button',
      class: 'session-list-item',
      onclick: () => onSelect(topic.id),
    });
    item.appendChild(el('span', { class: 'session-list-item-main', text: topic.question }));
    item.appendChild(el('span', { class: 'session-list-item-chevron', 'aria-hidden': 'true', text: '›' }));
    card.appendChild(item);
  }
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn-link', text: 'ホームに戻る', onclick: onBack }));
  return wrap;
}

export function renderTopicBreakdown(
  topic,
  attributes,
  breakdown,
  { realVoteCount, breakdownMinRealVotes, percentages = {}, majorityOptionId = null, totalVotes = 0 },
  onBack
) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: topic.question }));

  // 選択肢ごとの全体%は、実データが100件に届いていなくても常に見せる(2026-08-17、
  // マーケレビュー: %まで隠すとローンチ初期は「何も見せない機能」に見える)。
  if (typeof totalVotes === 'number' && totalVotes > 0) {
    card.appendChild(el('p', { class: 'progress', text: `${totalVotes}件の回答から算出` }));
    const overallBars = [];
    for (const option of topic.options) {
      const pct = percentages[option.id] ?? 0;
      const isMajority = option.id === majorityOptionId;
      const label = isMajority ? `${option.label}(多数派)` : option.label;
      const bar = el('div', { class: isMajority ? 'bar' : 'bar bar-muted' });
      const countEl = el('span', { class: 'bar-count', text: '0%' });
      const line = el('div', { class: 'bar-line' });
      line.appendChild(el('span', { class: 'bar-option-label', text: label }));
      line.appendChild(el('div', { class: 'bar-track' }, [bar]));
      line.appendChild(countEl);
      card.appendChild(line);
      overallBars.push([bar, countEl, pct]);
    }
    for (const [bar, countEl, pct] of overallBars) {
      animateBarWidth(bar, pct);
      animateCountUp(countEl, pct, { suffix: '%' });
    }
  }

  // 属性別のクロス集計だけは、サンプルが少ないと誤読を招くため100件ゲートを維持する。
  card.appendChild(el('h3', { class: 'breakdown-attr-heading', text: '属性別の傾向' }));
  if (realVoteCount < breakdownMinRealVotes) {
    card.appendChild(
      el('p', {
        class: 'progress',
        text: `属性別の傾向はまだ表示できません(実際の回答 ${realVoteCount} / ${breakdownMinRealVotes}件)。もっとみんなが挑戦すると見られるようになります。`,
      })
    );
    const pct = Math.min(100, Math.round((realVoteCount / breakdownMinRealVotes) * 100));
    const bar = el('div', { class: 'bar' });
    card.appendChild(el('div', { class: 'bar-track' }, [bar]));
    animateBarWidth(bar, pct);
    wrap.appendChild(card);
    wrap.appendChild(el('button', { class: 'btn-link', text: '戻る', onclick: onBack }));
    return wrap;
  }

  const select = el('select');
  for (const attribute of attributes) {
    select.appendChild(el('option', { value: attribute.id, text: attribute.label }));
  }
  card.appendChild(el('div', { class: 'field' }, [select]));

  const rowsContainer = el('div');
  card.appendChild(rowsContainer);

  function renderRows(attributeId) {
    rowsContainer.replaceChildren();
    const attribute = attributes.find((a) => a.id === attributeId);
    const counts = breakdown[attributeId] ?? {};
    let hasData = false;

    const bars = [];
    for (const value of attribute.values) {
      const perOption = counts[value.id] ?? {};
      const total = topic.options.reduce((sum, o) => sum + (perOption[o.id] ?? 0), 0);
      if (total > 0) hasData = true;

      const row = el('div', { class: 'bar-row' });
      row.appendChild(
        el('p', { class: 'bar-row-label', text: `${value.label}(${total}件)` })
      );
      for (const option of topic.options) {
        const count = perOption[option.id] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const bar = el('div', { class: 'bar' });
        const countEl = el('span', { class: 'bar-count', text: '0' });
        const line = el('div', { class: 'bar-line' });
        line.appendChild(el('span', { class: 'bar-option-label', text: option.label }));
        line.appendChild(el('div', { class: 'bar-track' }, [bar]));
        line.appendChild(countEl);
        row.appendChild(line);
        bars.push([bar, countEl, pct, count]);
      }
      rowsContainer.appendChild(row);
    }
    for (const [bar, countEl, pct, count] of bars) {
      animateBarWidth(bar, pct);
      animateCountUp(countEl, count);
    }

    if (!hasData) {
      rowsContainer.appendChild(
        el('p', {
          class: 'progress',
          text: 'この属性ではまだ十分なデータがありません。みんなが挑戦するほど、傾向がくっきり見えてきます。',
        })
      );
    }
  }

  select.addEventListener('change', () => renderRows(select.value));
  renderRows(attributes[0]?.id);

  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn-link', text: '戻る', onclick: onBack }));
  return wrap;
}

export function renderQuizQuestion(topic, index, total, onAnswer) {
  const wrap = el('div', { class: 'card' });

  // 残り問題数を「カードの厚み」で物理的に感じさせる(Tinder/Bumble深掘り分B1)。
  // 最後の1問では後ろに積むカードがないので省く。
  const hasNext = index + 1 < total;
  const stack = hasNext
    ? el('div', { class: 'quiz-card-stack' }, [
        el('div', { class: 'quiz-card-stack-shadow quiz-card-stack-shadow-2' }),
        el('div', { class: 'quiz-card-stack-shadow quiz-card-stack-shadow-1' }),
        wrap,
      ])
    : wrap;

  // Stories式に問題ごとに区切られたセグメント表示にする(2026-08-15、IG1対応)。
  const segments = [];
  for (let i = 0; i < total; i++) {
    segments.push(el('div', { class: i <= index ? 'quiz-progress-segment is-filled' : 'quiz-progress-segment' }));
  }
  const progressTrack = el('div', { class: 'quiz-progress-track' }, segments);
  wrap.appendChild(progressTrack);
  wrap.appendChild(el('p', { class: 'progress', text: `${index + 1} / ${total} 問目` }));
  wrap.appendChild(el('h2', { class: 'question-heading', text: topic.question }));

  const buttons = [];
  for (const option of topic.options) {
    const btn = el('button', { class: 'btn', text: option.label });
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      // 選んだ選択肢を一瞬ハイライトしてから次へ進む(タップした実感を持たせる)。
      for (const b of buttons) b.disabled = true;
      btn.classList.add('btn-selected');
      setTimeout(() => onAnswer(option.id), 180);
    });
    buttons.push(btn);
    wrap.appendChild(btn);
  }

  return stack;
}

export function renderQuestionFeedback(
  topic,
  chosenOptionId,
  isMajorityMatch,
  majorityOptionId,
  percentages,
  totalVotes,
  onNext
) {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(
    el('div', { class: `feedback-banner ${isMajorityMatch ? 'is-match' : 'is-mismatch'}` }, [
      el('span', { class: 'feedback-icon', text: isMajorityMatch ? '○' : '✕' }),
      el('span', {
        text: isMajorityMatch ? '平凡! 多数派と一致でした' : '平凡じゃない! 多数派とは不一致でした',
      }),
    ])
  );
  wrap.appendChild(el('h2', { class: 'question-heading', text: topic.question }));
  if (typeof totalVotes === 'number') {
    wrap.appendChild(el('p', { class: 'progress', text: `${totalVotes}件の回答から算出` }));
  }

  const bars = [];
  for (const option of topic.options) {
    const pct = percentages[option.id] ?? 0;
    const isYours = option.id === chosenOptionId;
    const tags = [
      isYours ? 'あなた' : null,
      option.id === majorityOptionId ? '多数派' : null,
    ].filter(Boolean);
    const label = tags.length ? `${option.label}(${tags.join('・')})` : option.label;

    const bar = el('div', { class: isYours ? 'bar' : 'bar bar-muted' });
    const countEl = el('span', { class: 'bar-count', text: '0%' });
    // 自分の一票が反映された行だけ、着地の瞬間を一度だけ強調する演出(Slido深掘り分S3)。
    const line = el('div', { class: isYours ? 'bar-line bar-line-you' : 'bar-line' });
    line.appendChild(el('span', { class: 'bar-option-label', text: label }));
    line.appendChild(el('div', { class: 'bar-track' }, [bar]));
    line.appendChild(countEl);
    wrap.appendChild(line);
    bars.push([bar, countEl, pct]);
  }

  wrap.appendChild(el('button', { class: 'btn btn-primary', text: '次へ', onclick: onNext }));
  for (const [bar, countEl, pct] of bars) {
    animateBarWidth(bar, pct);
    animateCountUp(countEl, pct, { suffix: '%' });
  }
  return wrap;
}

function shareText(summary) {
  const categoryPart = summary.categoryLabel ? `「${summary.categoryLabel}」で` : '';
  return `平凡投票アプリで${categoryPart}${summary.matchCount}/${summary.totalCount}問「${summary.tier}」でした。あなたは世間の多数派と何問一致できる?`;
}

// テキストのみのシェアだと拡散力が弱いという指摘を受け、結果を画像化する
// (2026-08-16)。SNS(X等)はビジュアル付きの投稿の方が反応率が高いため。
// 2026-08-17、マーケ/UIレビュー(白背景+文字だけで地味・空白が多い)を受けてブランド強化:
// インディゴ地+アプリと同じ「平」ロゴ+平凡メーター(矢印)を足してTLで埋もれにくくする。
function drawShareCard(summary) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';

  // 背景: ブランドカラーのインディゴgrad(白背景よりTLで目を引く)
  const bg = ctx.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, '#5b5bd6');
  bg.addColorStop(1, '#4646b8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1080);

  // 白カード(インディゴ地の上に浮かせて情報を締める)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(70, 70, 940, 940, 48);
  ctx.fill();

  // ロゴ: アプリアイコンと同じ「平」のインディゴ角丸バッジ
  ctx.fillStyle = '#5b5bd6';
  ctx.beginPath();
  ctx.roundRect(475, 150, 130, 130, 32);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 84px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('平', 540, 219);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#6b6b76';
  ctx.font = '600 38px system-ui, sans-serif';
  ctx.fillText('平凡投票アプリ', 540, 340);

  if (summary.categoryLabel) {
    ctx.font = '400 34px system-ui, sans-serif';
    ctx.fillText(`「${summary.categoryLabel}」に挑戦`, 540, 400);
  }

  // スコア
  ctx.fillStyle = '#1f1f24';
  ctx.font = '700 160px system-ui, sans-serif';
  ctx.fillText(`${summary.matchCount} / ${summary.totalCount}`, 540, 590);

  // 段階ラベル
  ctx.fillStyle = '#5b5bd6';
  ctx.font = '600 72px system-ui, sans-serif';
  ctx.fillText(summary.tier, 540, 690);

  // 平凡メーター(横帯+スコア位置の矢印)。空白が目立つという指摘への情報密度up。
  const trackX = 160;
  const trackW = 760;
  const trackY = 780;
  const trackH = 24;
  ctx.fillStyle = '#eceaf7';
  ctx.beginPath();
  ctx.roundRect(trackX, trackY, trackW, trackH, 12);
  ctx.fill();
  const ratio = summary.totalCount > 0 ? summary.matchCount / summary.totalCount : 0;
  const fillW = Math.max(trackH, trackW * ratio);
  ctx.fillStyle = '#5b5bd6';
  ctx.beginPath();
  ctx.roundRect(trackX, trackY, fillW, trackH, 12);
  ctx.fill();
  // 矢印マーカー
  const arrowX = trackX + trackW * ratio;
  ctx.fillStyle = '#1f1f24';
  ctx.beginPath();
  ctx.moveTo(arrowX, trackY - 6);
  ctx.lineTo(arrowX - 16, trackY - 30);
  ctx.lineTo(arrowX + 16, trackY - 30);
  ctx.closePath();
  ctx.fill();
  // メーター両端ラベル
  ctx.fillStyle = '#9a9aa5';
  ctx.font = '400 28px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('唯一無二', trackX, trackY + 66);
  ctx.textAlign = 'right';
  ctx.fillText('真の平凡', trackX + trackW, trackY + 66);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#6b6b76';
  ctx.font = '400 34px system-ui, sans-serif';
  ctx.fillText('あなたは世間の多数派と何問一致できる?', 540, 940);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function renderShareButton(summary) {
  const btn = el('button', { class: 'btn btn-outline', text: '結果をシェアする' });
  btn.addEventListener('click', async () => {
    const text = shareText(summary);
    const blob = await canvasToBlob(drawShareCard(summary));
    const file = blob ? new File([blob], 'heibon-vote-result.png', { type: 'image/png' }) : null;

    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
      } catch {
        // ユーザーがシェアをキャンセルしただけの場合もあるため、静かに無視する
      }
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // 同上
      }
      return;
    }
    // Web Share API非対応のブラウザ向けフォールバック: 画像をダウンロードしてもらう。
    // ダウンロード・コピーそれぞれ独立にtry/catchする(2026-08-17、App Store審査官
    // ペルソナレビューで発覚: a.click()が例外を投げる環境だと後続のクリップボード
    // コピーごと止まり、ボタンの見た目も無反応のまま何も起きていないように見えていた)。
    let downloadOk = false;
    if (file) {
      try {
        const url = URL.createObjectURL(file);
        const a = el('a', { href: url, download: file.name });
        a.click();
        URL.revokeObjectURL(url);
        downloadOk = true;
      } catch (err) {
        console.error('share image download failed:', err);
      }
    }
    let copyOk = false;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        copyOk = true;
      } catch (err) {
        console.error('share text copy failed:', err);
      }
    }
    const original = btn.textContent;
    if (downloadOk && copyOk) {
      btn.textContent = '画像を保存・テキストをコピーしました!';
    } else if (downloadOk) {
      btn.textContent = '画像を保存しました!';
    } else if (copyOk) {
      btn.textContent = 'テキストをコピーしました!';
    } else {
      btn.textContent = 'シェアに失敗しました。もう一度お試しください。';
    }
    setTimeout(() => {
      btn.textContent = original;
    }, 2000);
  });
  return btn;
}

// 満点・最下位ランクだけ、淡々とした事実提示に少し意外性のある一言を添える
// (Spotify Wrapped深掘り分SW2)。中間ランクは狙いすぎると嘘っぽくなるため据え置き。
function resultFlavorText(tier) {
  if (tier === '真の平凡') return '実はあなたは、"普通"を体現する才能の持ち主かもしれません。';
  if (tier === '唯一無二') return '実はあなたは、かなり個性的な選択をする人でした。';
  return null;
}

// 段階ラベル(sessionTierFor)だけだと8/10と9/10が同じ枠に入り粗く感じるため、
// 実際のスコアに応じて連続的に動く矢印で位置を補う(server/tiers.jsと同じ閾値0.3/0.5/0.8)。
function renderTierMeter(matchCount, totalCount) {
  const track = el('div', { class: 'tier-meter-track' });
  const labels = el('div', { class: 'tier-meter-labels' }, [
    el('span', { text: '唯一無二' }),
    el('span', { text: '個性派' }),
    el('span', { text: '個性あり' }),
    el('span', { text: '平凡寄り' }),
    el('span', { text: '真の平凡' }),
  ]);
  const ratio = totalCount === 0 ? 0 : matchCount / totalCount;
  const marker = el('div', { class: 'tier-meter-marker' });
  marker.style.left = `${Math.min(98, Math.max(2, ratio * 100))}%`;
  track.appendChild(marker);
  return el('div', { class: 'tier-meter' }, [track, labels]);
}

export function renderResult(summary, detailVotes, stats, { onHome, onHistory, onRetry }) {
  const wrap = el('div');

  const card = el('div', { class: 'card card-hero' });
  // カテゴリを選んで挑戦した場合だけ、そのカテゴリ名を振り返りとして添える(CX#17)。
  if (summary.categoryLabel) {
    card.appendChild(
      el('p', { class: 'progress', style: 'text-align:center', text: `「${summary.categoryLabel}」のお題に挑戦しました` })
    );
  }
  card.appendChild(
    el('div', { class: 'result-score', text: `${summary.matchCount} / ${summary.totalCount}` })
  );
  // 段階ラベルは素の「真の平凡」で保存・履歴表示する(履歴で"(今回)"が残るのを解消。
  // 2026-08-18、CX担当ペルソナ指摘)。結果画面だけは、同画面に出る通算称号「真の平凡」との
  // 混同を避けるため、満点の段階ラベルに"(今回)"を添えて表示する。
  const tierDisplay = summary.tier === '真の平凡' ? '真の平凡(今回)' : summary.tier;
  card.appendChild(el('div', { class: 'result-tier', text: tierDisplay }));
  card.appendChild(renderTierMeter(summary.matchCount, summary.totalCount));
  const flavorText = resultFlavorText(summary.tier);
  if (flavorText) {
    card.appendChild(el('p', { style: 'text-align:center', text: flavorText }));
  }
  if (typeof summary.moreCommonCount === 'number') {
    card.appendChild(
      el('p', {
        class: 'progress',
        style: 'text-align:center',
        text: `これまでの挑戦者${summary.totalSessions}人中、あなたより「共感性が高く、定番を理解し、万人受けする王道」だった人は${summary.moreCommonCount}人でした`,
      })
    );
  }
  if (stats.lifetimeTitle) {
    card.appendChild(
      el('p', { style: 'text-align:center' }, [
        el('span', {
          class: lifetimeTitleBadgeClass(stats.lifetimeTitle),
          text: `通算称号: ${stats.lifetimeTitle}`,
        }),
      ])
    );
  }
  card.appendChild(
    el('p', { class: 'progress', text: `通算満点(10問すべて多数派と一致): ${stats.perfectCount}回` })
  );
  const nextTitleHint = nextLifetimeTitleHint(stats.perfectCount);
  if (nextTitleHint) {
    card.appendChild(el('p', { class: 'progress', text: `${nextTitleHint}(満点を重ねると称号がもらえます)` }));
  }
  card.appendChild(el('button', { class: 'btn btn-primary', text: 'もう一度挑戦する', onclick: onRetry }));
  card.appendChild(renderShareButton(summary));
  wrap.appendChild(card);

  const detailCard = el('div', { class: 'card' });
  detailCard.appendChild(el('h3', { text: 'くわしい内訳' }));
  for (const vote of detailVotes) {
    detailCard.appendChild(renderVoteBreakdownRow(vote));
  }
  wrap.appendChild(detailCard);

  wrap.appendChild(el('button', { class: 'btn-link', text: 'ホームに戻る', onclick: onHome }));
  wrap.appendChild(el('button', { class: 'btn-link', text: '履歴を見る', onclick: onHistory }));
  return wrap;
}

export function renderHistoryList(sessions, { onSelect, onBack }) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: '履歴' }));
  if (sessions.length === 0) {
    card.appendChild(
      el('p', {
        class: 'progress',
        text: 'まだ挑戦履歴がありません。最初の10問で、世間の多数派とどれだけ「平凡」でいられるか試してみましょう。',
      })
    );
  }
  for (const session of sessions) {
    const item = el('button', {
      type: 'button',
      class: 'session-list-item',
      onclick: () => onSelect(session.id),
    });
    item.appendChild(el('span', { class: 'session-list-item-main', text: formatDate(session.createdAt) }));
    item.appendChild(
      el('span', { text: `${session.matchCount}/${session.totalCount} (${session.sessionTier})` })
    );
    item.appendChild(el('span', { class: 'session-list-item-chevron', 'aria-hidden': 'true', text: '›' }));
    card.appendChild(item);
  }
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn-link', text: 'ホームに戻る', onclick: onBack }));
  return wrap;
}

export function renderHistoryDetail(session, votes, onBack) {
  const wrap = el('div');

  const card = el('div', { class: 'card card-hero' });
  card.appendChild(
    el('div', { class: 'result-score', text: `${session.matchCount} / ${session.totalCount}` })
  );
  card.appendChild(el('div', { class: 'result-tier', text: session.sessionTier }));
  card.appendChild(el('p', { class: 'progress', text: formatDate(session.createdAt) }));
  wrap.appendChild(card);

  const detailCard = el('div', { class: 'card' });
  detailCard.appendChild(el('h3', { text: 'くわしい内訳' }));
  for (const vote of votes) {
    detailCard.appendChild(renderVoteBreakdownRow(vote));
  }
  wrap.appendChild(detailCard);

  wrap.appendChild(el('button', { class: 'btn-link', text: '履歴一覧に戻る', onclick: onBack }));
  return wrap;
}

export function renderSuggestionForm(onSubmit, onCancel) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: 'お題を提案する' }));
  card.appendChild(
    el('p', { text: '「こんな二択のお題を入れてほしい」というアイデアを送ってください。' })
  );

  const form = el('form');
  const textarea = el('textarea', {
    rows: '4',
    maxlength: '500',
    placeholder: '例: エスカレーターで歩く派? 立ち止まる派?',
  });
  textarea.style.width = '100%';
  form.appendChild(textarea);
  const validationError = el('p', { class: 'error', style: 'display:none', text: '入力してから送ってください。' });
  form.appendChild(validationError);
  const submitBtn = el('button', { class: 'btn btn-primary', type: 'submit', text: '送る' });
  form.appendChild(submitBtn);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submitBtn.disabled) return;
    const text = textarea.value.trim();
    if (!text) {
      validationError.style.display = 'block';
      textarea.focus();
      return;
    }
    validationError.style.display = 'none';
    // onSubmitはAPI呼び出し完了(サンクス画面への遷移)まで非同期のため、連打・二重タップで
    // 同じ提案が2回送信されてしまう(2026-08-16、「よくあるバグ100項目」チェックで発見)。
    submitBtn.disabled = true;
    onSubmit(text);
  });

  card.appendChild(form);
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn-link', text: '戻る', onclick: onCancel }));
  return wrap;
}

export function renderSuggestionThanks(text, onBack) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: 'ありがとうございます!' }));
  // 汎用文言だけでなく、実際に送った内容を引用して「ちゃんと届いた」実感を持たせる(T3)。
  const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  card.appendChild(
    el('p', { text: `「${preview}」、確かに届きました。お題の追加時に参考にさせてもらいます。` })
  );
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn btn-primary', text: 'ホームに戻る', onclick: onBack }));
  return wrap;
}

export function renderOffline(onRetry) {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('p', { class: 'error', text: 'オフラインのようです。通信環境を確認してから、もう一度お試しください。' }));
  if (onRetry) wrap.appendChild(el('button', { class: 'btn btn-outline', text: '再読み込み', onclick: onRetry }));
  return wrap;
}

export function renderError(message, onRetry) {
  // ユーザーには技術的な詳細(HTTPステータス等)を出さず、常に同じやさしい文言にする。
  // 原因調査用に生のメッセージはconsoleへ残す。
  console.error('renderError:', message);
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(
    el('p', { class: 'error', text: '通信がうまくいきませんでした。もう一度お試しください。' })
  );
  if (onRetry) wrap.appendChild(el('button', { class: 'btn btn-outline', text: '再読み込み', onclick: onRetry }));
  return wrap;
}
