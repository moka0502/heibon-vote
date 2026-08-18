import { api } from './api.js';
import {
  getProfile,
  saveProfile,
  getVoterId,
  saveQuizState,
  getQuizState,
  clearQuizState,
  getPlayedParts,
  markPlayed,
} from './storage.js';
import { playResultReveal } from './effects.js';
import {
  renderIntro,
  renderProfileForm,
  renderHome,
  renderCategoryPicker,
  renderQuizQuestion,
  renderResult,
  renderHistoryList,
  renderHistoryDetail,
  renderTopicList,
  renderTopicBreakdown,
  renderQuestionFeedback,
  renderSuggestionForm,
  renderSuggestionThanks,
  renderError,
  renderOffline,
  renderLoading,
} from './render.js';

const QUESTIONS_PER_SESSION = 10;
const appEl = document.getElementById('app');

// ブラウザの戻る/スワイプバックと画面遷移を連動させる仕組み(2026-08-15対応)。
// 各画面をmountするとき「戻ったらどの画面に行くか」を渡しておき、popstate発火時に
// それを呼び出す。
//
// pendingDirectionは「次のmount()呼び出しがpopstate起因かどうか」を表す。
// 多くのshow*()関数はmount()の前にawait api.X()を挟むため、popstateハンドラの
// 同期処理が終わった後(=isPoppingを同期的にfalseへ戻した後)にmount()が実行される
// ことがある。そのため真偽値をpopstateハンドラ内だけで完結させず、mount()が実際に
// 消費するまで保持し続ける設計にしている(mount()呼び出し時にfalseへ戻す)。
let currentBack = null;
let pendingDirection = null; // null=通常の遷移(進む)、'back'=popstate起因(戻る)
let hasPushedInitialState = false;

function mount(node, backTo) {
  // 最初の画面が描画された時点で起動スプラッシュ(Native#9)を消す。
  document.getElementById('splash')?.remove();
  // 進む(pushState)は右から、戻る(popstate)は左からスライドインさせ、
  // 階層のどちら向きに動いたか方向性を感じられるようにする(Native#3)。
  const isBack = pendingDirection === 'back';
  node.classList.add(isBack ? 'screen-enter-back' : 'screen-enter-forward');
  appEl.replaceChildren(node);
  window.scrollTo(0, 0);
  currentBack = backTo ?? null;
  if (!isBack) {
    if (!hasPushedInitialState) {
      history.replaceState({}, '');
      hasPushedInitialState = true;
    } else {
      history.pushState({}, '');
    }
  }
  pendingDirection = null;
}

// タップ位置に応じて波紋が広がるリップルエフェクト(Material You深掘り分M2)。
// ボタンはmount()のたびに作り直されるため、要素ごとにリスナーを付けるのではなく
// documentへの委譲で全画面共通に対応する。
document.addEventListener(
  'click',
  (event) => {
    const btn = event.target.closest('.btn');
    if (!btn || btn.classList.contains('btn-link') || btn.disabled) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  },
  { capture: true }
);

window.addEventListener('popstate', () => {
  pendingDirection = 'back';
  (currentBack ?? showHome)();
});

// API待ちの画面遷移中、通信が遅いと固まって見えるのを防ぐための一時表示。
// mount()と違い履歴には触れない(実データが届いたら通常通りmount()で置き換える)。
function showLoading() {
  appEl.replaceChildren(renderLoading());
}

// オフライン時は「通信エラー」ではなく専用の案内を出す(Native#5)。
function mountError(message, onRetry, backTo) {
  const node = navigator.onLine ? renderError(message, onRetry) : renderOffline(onRetry);
  mount(node, backTo);
}

async function showHome() {
  showLoading();
  try {
    // Homeに来る経路はどこであれ、進行中クイズへの復帰を意味しない
    // (実際に再開させたい場合はinit()がrunQuiz()を直接呼ぶ)。
    // クリアしないと、クイズ中に戻るボタンでHomeへ離脱した後リロードすると
    // 中断したクイズへ強制的に戻されてしまう。
    clearQuizState();
    const stats = await api.getSessionStats(getVoterId());
    mount(
      renderHome(stats, {
        onStart: showCategoryPicker,
        onHistory: showHistory,
        onTopics: showTopics,
        onSettings: showSettings,
        onSuggest: showSuggestionForm,
        profileEmpty: Object.keys(getProfile() ?? {}).length === 0,
      })
    );
  } catch (err) {
    mountError(err.message, showHome);
  }
}

function showSuggestionForm() {
  mount(
    renderSuggestionForm(async (text) => {
      try {
        await api.postSuggestion(text);
        mount(renderSuggestionThanks(text, showHome), showHome);
      } catch (err) {
        mountError(err.message, showHome, showHome);
      }
    }, showHome),
    showHome
  );
}

async function showSettings() {
  showLoading();
  try {
    const { attributes } = await api.getAttributes();
    const currentValues = getProfile();
    mount(
      renderProfileForm(
        attributes,
        (values) => {
          saveProfile(values);
          showHome();
        },
        {
          currentValues,
          title: 'あなたについての設定',
          submitLabel: '保存する',
          onCancel: showHome,
        }
      ),
      showHome
    );
  } catch (err) {
    mountError(err.message, showHome, showHome);
  }
}

async function showTopics() {
  showLoading();
  try {
    const { topics } = await api.getAllTopics();
    mount(renderTopicList(topics, { onSelect: showTopicBreakdown, onBack: showHome }), showHome);
  } catch (err) {
    mountError(err.message, showHome, showHome);
  }
}

async function showTopicBreakdown(topicId) {
  showLoading();
  try {
    const [
      { attributes },
      { topic, breakdown, realVoteCount, breakdownMinRealVotes, percentages, majorityOptionId, totalVotes },
    ] = await Promise.all([api.getAttributes(), api.getTopicBreakdown(topicId)]);
    mount(
      renderTopicBreakdown(
        topic,
        attributes,
        breakdown,
        { realVoteCount, breakdownMinRealVotes, percentages, majorityOptionId, totalVotes },
        showTopics
      ),
      showTopics
    );
  } catch (err) {
    mountError(err.message, showTopics, showTopics);
  }
}

async function showCategoryPicker() {
  showLoading();
  try {
    const { categories } = await api.getCategories();
    mount(
      renderCategoryPicker(categories, {
        onSelectRandom: () => startQuiz(),
        onSelectCategory: (categoryId, categoryLabel, part) => startQuiz(categoryId, categoryLabel, part),
        onBack: showHome,
        playedParts: getPlayedParts(),
      }),
      showHome
    );
  } catch (err) {
    mountError(err.message, showHome, showHome);
  }
}

async function startQuiz(category, categoryLabel, part) {
  showLoading();
  try {
    const profile = getProfile();
    const { topics } = await api.getRandomTopics(QUESTIONS_PER_SESSION, category, part);
    markPlayed(category, part);
    const fullCategoryLabel = categoryLabel && part ? `${categoryLabel} Part${part}` : categoryLabel;
    // category/part/categoryLabelBase を state に持たせ、結果画面の「もう一度挑戦」で
    // 同じお題種類を即再挑戦できるようにする(2026-08-18、実プレイFB: 毎回カテゴリ選択に戻るのが面倒)。
    runQuiz({
      topics,
      profile,
      index: 0,
      voteIds: [],
      categoryLabel: fullCategoryLabel,
      category,
      part,
      categoryLabelBase: categoryLabel,
    });
  } catch (err) {
    mountError(err.message, showHome, showHome);
  }
}

function runQuiz(state) {
  if (state.index >= state.topics.length) {
    finishQuiz(state);
    return;
  }
  saveQuizState(state);
  const topic = state.topics[state.index];
  mount(
    renderQuizQuestion(
      topic,
      state.index,
      state.topics.length,
      (optionId) => answerQuestion(state, topic, optionId),
      showHome
    ),
    showHome
  );
}

async function answerQuestion(state, topic, optionId) {
  try {
    const { voteId, isMajorityMatch, majorityOptionId, percentages, totalVotes, isNearTie } =
      await api.postVote({
        topicId: topic.id,
        optionId,
        profile: state.profile,
        voterId: getVoterId(),
      });
    const nextState = { ...state, index: state.index + 1, voteIds: [...state.voteIds, voteId] };
    mount(
      renderQuestionFeedback(
        topic,
        optionId,
        isMajorityMatch,
        majorityOptionId,
        percentages,
        totalVotes,
        isNearTie,
        () => runQuiz(nextState)
      ),
      showHome
    );
  } catch (err) {
    // 送信失敗(レート制限等)でHomeへ飛ばすとclearQuizState()で進行状況が消えるため、
    // 再読み込みは同じ問題への再挑戦にする(戻るボタンでの意図的な離脱時のみクリアされる)。
    mountError(err.message, () => runQuiz(state), showHome);
  }
}

async function finishQuiz(state) {
  showLoading();
  try {
    const voterId = getVoterId();
    const summary = await api.postSession(state.voteIds, voterId);
    clearQuizState();
    const [{ votes }, stats] = await Promise.all([
      api.getSession(summary.sessionId, voterId),
      api.getSessionStats(voterId),
    ]);
    mount(
      renderResult({ ...summary, categoryLabel: state.categoryLabel }, votes, stats, {
        onHome: showHome,
        onHistory: showHistory,
        // 「もう一度挑戦」は同じお題種類で即再挑戦(ランダム挑戦時はランダム再開)。
        onRetry: () => startQuiz(state.category, state.categoryLabelBase, state.part),
        // カテゴリを変えたい人向けの副導線。
        onPickCategory: () => showCategoryPicker(),
      }),
      showHome
    );
    playResultReveal(appEl, summary);
  } catch (err) {
    mountError(err.message, showHome, showHome);
  }
}

async function showHistory() {
  showLoading();
  try {
    const { sessions } = await api.getSessions(getVoterId());
    mount(renderHistoryList(sessions, { onSelect: showHistoryDetail, onBack: showHome }), showHome);
  } catch (err) {
    mountError(err.message, showHome, showHome);
  }
}

async function showHistoryDetail(sessionId) {
  showLoading();
  try {
    const { session, votes } = await api.getSession(sessionId, getVoterId());
    mount(renderHistoryDetail(session, votes, showHistory), showHistory);
  } catch (err) {
    mountError(err.message, showHistory, showHistory);
  }
}

async function showProfileSetup() {
  showLoading();
  try {
    const { attributes } = await api.getAttributes();
    mount(
      renderProfileForm(attributes, (values) => {
        saveProfile(values);
        showHome();
      })
    );
  } catch (err) {
    mountError(err.message, showProfileSetup);
  }
}

async function init() {
  const profile = getProfile();
  if (!profile) {
    // 初手で属性フォームを強制せず、まず遊べるようにする(2026-08-18、マーケ/CX指摘の離脱対策)。
    // イントロ後は空プロフィールを保存してホームへ。属性は任意で、Home→設定や結果画面の誘導から
    // いつでも入力できる。空でも真値になるので次回起動でイントロが再表示されない。
    mount(
      renderIntro(() => {
        saveProfile({});
        showHome();
      })
    );
    return;
  }

  // クイズ途中でアプリが強制終了/バックグラウンド化された場合、続きから再開する。
  const savedQuiz = getQuizState();
  if (savedQuiz?.topics?.length && savedQuiz.index < savedQuiz.topics.length) {
    runQuiz(savedQuiz);
    return;
  }

  showHome();
}

init();
