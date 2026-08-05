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

function formatDate(sqliteDatetime) {
  // SQLiteのdatetime('now')はUTCの 'YYYY-MM-DD HH:MM:SS' 形式で返る
  const date = new Date(`${sqliteDatetime}Z`);
  return date.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderVoteBreakdownRow(vote) {
  const isMatch = vote.optionId === vote.majorityOptionId;
  const row = el('div', { class: 'question-row' });
  row.appendChild(el('p', { class: 'question-text', text: vote.question }));
  row.appendChild(
    el('p', {
      class: isMatch ? 'match' : 'mismatch',
      text: `あなた: ${vote.optionLabel} / 多数派: ${vote.majorityOptionLabel ?? '不明'}${isMatch ? '(一致)' : ''}`,
    })
  );
  return row;
}

export function renderProfileForm(attributes, onSubmit) {
  const form = el('form', { class: 'card' });
  form.appendChild(el('h2', { text: 'はじめに、あなたについて教えてください' }));

  const selects = {};
  for (const attribute of attributes) {
    const field = el('div', { class: 'field' });
    field.appendChild(el('label', { text: attribute.label, for: `attr-${attribute.id}` }));
    const select = el('select', { id: `attr-${attribute.id}`, name: attribute.id });
    for (const value of attribute.values) {
      select.appendChild(el('option', { value: value.id, text: value.label }));
    }
    selects[attribute.id] = select;
    field.appendChild(select);
    form.appendChild(field);
  }

  form.appendChild(el('button', { class: 'btn btn-primary', type: 'submit', text: 'はじめる' }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = {};
    for (const [id, select] of Object.entries(selects)) {
      values[id] = select.value;
    }
    onSubmit(values);
  });

  return form;
}

export function renderHome(stats, { onStart, onHistory }) {
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
  card.appendChild(el('button', { class: 'btn btn-primary', text: '挑戦する', onclick: onStart }));
  wrap.appendChild(card);
  wrap.appendChild(el('button', { class: 'btn-link', text: '履歴を見る', onclick: onHistory }));
  return wrap;
}

export function renderQuizQuestion(topic, index, total, onAnswer) {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('p', { class: 'progress', text: `${index + 1} / ${total} 問目` }));
  wrap.appendChild(el('h2', { text: topic.question }));
  for (const option of topic.options) {
    wrap.appendChild(
      el('button', { class: 'btn', text: option.label, onclick: () => onAnswer(option.id) })
    );
  }
  return wrap;
}

export function renderResult(summary, detailVotes, stats, { onHome, onHistory }) {
  const wrap = el('div');

  const card = el('div', { class: 'card' });
  card.appendChild(
    el('div', { class: 'result-score', text: `${summary.matchCount} / ${summary.totalCount}` })
  );
  card.appendChild(el('div', { class: 'result-tier', text: summary.tier }));
  if (stats.lifetimeTitle) {
    card.appendChild(
      el('p', { style: 'text-align:center' }, [
        el('span', { class: 'badge', text: `通算称号: ${stats.lifetimeTitle}` }),
      ])
    );
  }
  card.appendChild(el('p', { class: 'progress', text: `通算満点: ${stats.perfectCount}回` }));
  wrap.appendChild(card);

  const detailCard = el('div', { class: 'card' });
  detailCard.appendChild(el('h3', { text: '内訳' }));
  for (const vote of detailVotes) {
    detailCard.appendChild(renderVoteBreakdownRow(vote));
  }
  wrap.appendChild(detailCard);

  wrap.appendChild(el('button', { class: 'btn btn-primary', text: 'ホームに戻る', onclick: onHome }));
  wrap.appendChild(el('button', { class: 'btn-link', text: '履歴を見る', onclick: onHistory }));
  return wrap;
}

export function renderHistoryList(sessions, { onSelect, onBack }) {
  const wrap = el('div');
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', { text: '履歴' }));
  if (sessions.length === 0) {
    card.appendChild(el('p', { class: 'progress', text: 'まだ挑戦履歴がありません。' }));
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

  const card = el('div', { class: 'card' });
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

export function renderError(message, onRetry) {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('p', { class: 'error', text: `エラーが発生しました: ${message}` }));
  if (onRetry) wrap.appendChild(el('button', { class: 'btn', text: '再読み込み', onclick: onRetry }));
  return wrap;
}
