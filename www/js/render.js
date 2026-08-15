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

  const selects = {};
  for (const attribute of attributes) {
    const field = el('div', { class: 'field' });
    field.appendChild(el('label', { text: attribute.label, for: `attr-${attribute.id}` }));
    const select = el('select', { id: `attr-${attribute.id}`, name: attribute.id });
    for (const value of attribute.values) {
      select.appendChild(el('option', { value: value.id, text: value.label }));
    }
    if (currentValues?.[attribute.id]) {
      select.value = currentValues[attribute.id];
    }
    selects[attribute.id] = select;
    field.appendChild(select);
    form.appendChild(field);
  }

  form.appendChild(el('button', { class: 'btn btn-primary', type: 'submit', text: submitLabel }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = {};
    for (const [id, select] of Object.entries(selects)) {
      values[id] = select.value;
    }
    onSubmit(values);
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
    el('p', { text: 'ランダムな10問に答えて、世間の多数派とどれだけ一致できるか試そう。' })
  );
  if (stats.lifetimeTitle) {
    card.appendChild(el('p', {}, [el('span', { class: 'badge', text: stats.lifetimeTitle })]));
  }
  card.appendChild(el('p', { class: 'progress', text: `通算満点: ${stats.perfectCount}回` }));
  const nextTitleHint = nextLifetimeTitleHint(stats.perfectCount);
  if (nextTitleHint) {
    card.appendChild(el('p', { class: 'progress', text: nextTitleHint }));
  }
  card.appendChild(el('button', { class: 'btn btn-primary', text: '挑戦する', onclick: onStart }));
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn-link btn-link-emphasis', text: '履歴を見る', onclick: onHistory }));
  wrap.appendChild(el('button', { class: 'btn-link', text: 'お題の内訳を見る', onclick: onTopics }));
  wrap.appendChild(el('button', { class: 'btn-link', text: 'あなたについての設定', onclick: onSettings }));
  wrap.appendChild(el('button', { class: 'btn-link', text: 'お題を提案する', onclick: onSuggest }));
  return wrap;
}

export function renderCategoryPicker(categories, { onSelectRandom, onSelectCategory, onBack }) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: 'お題を選ぶ' }));
  card.appendChild(
    el('button', {
      class: 'btn btn-primary',
      text: 'ランダム(全部から10問)',
      onclick: onSelectRandom,
    })
  );
  for (const category of categories) {
    card.appendChild(
      el('button', {
        class: 'btn btn-outline',
        text: `${category.label}(${category.count}問)`,
        onclick: () => onSelectCategory(category.id),
      })
    );
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
  for (const topic of topics) {
    const item = el('div', { class: 'session-list-item', onclick: () => onSelect(topic.id) });
    item.appendChild(el('span', { text: topic.question }));
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
  { realVoteCount, breakdownMinRealVotes },
  onBack
) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: topic.question }));

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

  return wrap;
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
  return `平凡投票アプリで${summary.matchCount}/${summary.totalCount}問「${summary.tier}」でした。あなたは世間の多数派と何問一致できる?`;
}

function renderShareButton(summary) {
  const btn = el('button', { class: 'btn', text: '結果をシェアする' });
  btn.addEventListener('click', async () => {
    const text = shareText(summary);
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // ユーザーがシェアをキャンセルしただけの場合もあるため、静かに無視する
      }
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'コピーしました!';
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    }
  });
  return btn;
}

// 満点・最下位ランクだけ、淡々とした事実提示に少し意外性のある一言を添える
// (Spotify Wrapped深掘り分SW2)。中間ランクは狙いすぎると嘘っぽくなるため据え置き。
function resultFlavorText(tier) {
  if (tier === '真の平凡(今回)') return '実はあなたは、"普通"を体現する才能の持ち主かもしれません。';
  if (tier === '唯一無二') return '実はあなたは、かなり個性的な選択をする人でした。';
  return null;
}

export function renderResult(summary, detailVotes, stats, { onHome, onHistory, onRetry }) {
  const wrap = el('div');

  const card = el('div', { class: 'card card-hero' });
  card.appendChild(
    el('div', { class: 'result-score', text: `${summary.matchCount} / ${summary.totalCount}` })
  );
  card.appendChild(el('div', { class: 'result-tier', text: summary.tier }));
  const flavorText = resultFlavorText(summary.tier);
  if (flavorText) {
    card.appendChild(el('p', { style: 'text-align:center', text: flavorText }));
  }
  if (typeof summary.percentile === 'number') {
    card.appendChild(
      el('p', {
        class: 'progress',
        style: 'text-align:center',
        text: `これまでの挑戦者${summary.totalSessions}人中、あなたと同じかそれ以上「平凡」だったのは${summary.percentile}%`,
      })
    );
  }
  if (stats.lifetimeTitle) {
    card.appendChild(
      el('p', { style: 'text-align:center' }, [
        el('span', { class: 'badge', text: `通算称号: ${stats.lifetimeTitle}` }),
      ])
    );
  }
  card.appendChild(el('p', { class: 'progress', text: `通算満点: ${stats.perfectCount}回` }));
  const nextTitleHint = nextLifetimeTitleHint(stats.perfectCount);
  if (nextTitleHint) {
    card.appendChild(el('p', { class: 'progress', text: nextTitleHint }));
  }
  card.appendChild(el('button', { class: 'btn btn-primary', text: 'もう一度挑戦する', onclick: onRetry }));
  card.appendChild(renderShareButton(summary));
  wrap.appendChild(card);

  const detailCard = el('div', { class: 'card' });
  detailCard.appendChild(el('h3', { text: '内訳' }));
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
    const item = el('div', { class: 'session-list-item', onclick: () => onSelect(session.id) });
    item.appendChild(el('span', { text: formatDate(session.createdAt) }));
    item.appendChild(
      el('span', { text: `${session.matchCount}/${session.totalCount} (${session.sessionTier})` })
    );
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
  detailCard.appendChild(el('h3', { text: '内訳' }));
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
  form.appendChild(el('button', { class: 'btn btn-primary', type: 'submit', text: '送る' }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text) {
      validationError.style.display = 'block';
      textarea.focus();
      return;
    }
    validationError.style.display = 'none';
    onSubmit(text);
  });

  card.appendChild(form);
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn-link', text: '戻る', onclick: onCancel }));
  return wrap;
}

export function renderSuggestionThanks(onBack) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: 'ありがとうございます!' }));
  card.appendChild(el('p', { text: '届いたアイデアはお題の追加時に参考にさせてもらいます。' }));
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn btn-primary', text: 'ホームに戻る', onclick: onBack }));
  return wrap;
}

export function renderOffline(onRetry) {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('p', { class: 'error', text: 'オフラインのようです。通信環境を確認してから、もう一度お試しください。' }));
  if (onRetry) wrap.appendChild(el('button', { class: 'btn', text: '再読み込み', onclick: onRetry }));
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
  if (onRetry) wrap.appendChild(el('button', { class: 'btn', text: '再読み込み', onclick: onRetry }));
  return wrap;
}
