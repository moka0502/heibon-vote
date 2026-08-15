import { api } from './api.js';
import {
  getProfile,
  saveProfile,
  getVoterId,
  saveQuizState,
  getQuizState,
  clearQuizState,
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
} from './render.js';

const QUESTIONS_PER_SESSION = 10;
const appEl = document.getElementById('app');

// ブラウザの戻る/スワイプバックと画面遷移を連動させる仕組み(2026-08-15対応)。
// 各画面をmountするとき「戻ったらどの画面に行くか」を渡しておき、popstate発火時に
// それを呼び出す。isPopping中はmountがpushStateしないようにして、履歴を二重に積まない。
let currentBack = null;
let isPopping = false;
let hasPushedInitialState = false;

function mount(node, backTo) {
  node.classList.add('screen-enter');
  appEl.replaceChildren(node);
  currentBack = backTo ?? null;
  if (!isPopping) {
    if (!hasPushedInitialState) {
      history.replaceState({}, '');
      hasPushedInitialState = true;
    } else {
      history.pushState({}, '');
    }
  }
}

window.addEventListener('popstate', () => {
  isPopping = true;
  (currentBack ?? showHome)();
  isPopping = false;
});

async function showHome() {
  try {
    const stats = await api.getSessionStats();
    mount(
      renderHome(stats, {
        onStart: showCategoryPicker,
        onHistory: showHistory,
        onTopics: showTopics,
        onSettings: showSettings,
        onSuggest: showSuggestionForm,
      })
    );
  } catch (err) {
    mount(renderError(err.message, showHome));
  }
}

function showSuggestionForm() {
  mount(
    renderSuggestionForm(async (text) => {
      try {
        await api.postSuggestion(text);
        mount(renderSuggestionThanks(showHome), showHome);
      } catch (err) {
        mount(renderError(err.message, showHome), showHome);
      }
    }, showHome),
    showHome
  );
}

async function showSettings() {
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
    mount(renderError(err.message, showHome), showHome);
  }
}

async function showTopics() {
  try {
    const { topics } = await api.getAllTopics();
    mount(renderTopicList(topics, { onSelect: showTopicBreakdown, onBack: showHome }), showHome);
  } catch (err) {
    mount(renderError(err.message, showHome), showHome);
  }
}

async function showTopicBreakdown(topicId) {
  try {
    const [{ attributes }, { topic, breakdown, realVoteCount, breakdownMinRealVotes }] =
      await Promise.all([api.getAttributes(), api.getTopicBreakdown(topicId)]);
    mount(
      renderTopicBreakdown(
        topic,
        attributes,
        breakdown,
        { realVoteCount, breakdownMinRealVotes },
        showTopics
      ),
      showTopics
    );
  } catch (err) {
    mount(renderError(err.message, showTopics), showTopics);
  }
}

async function showCategoryPicker() {
  try {
    const { categories } = await api.getCategories();
    mount(
      renderCategoryPicker(categories, {
        onSelectRandom: () => startQuiz(),
        onSelectCategory: (categoryId) => startQuiz(categoryId),
        onBack: showHome,
      }),
      showHome
    );
  } catch (err) {
    mount(renderError(err.message, showHome), showHome);
  }
}

async function startQuiz(category) {
  try {
    const profile = getProfile();
    const { topics } = await api.getRandomTopics(QUESTIONS_PER_SESSION, category);
    runQuiz({ topics, profile, index: 0, voteIds: [] });
  } catch (err) {
    mount(renderError(err.message, showHome), showHome);
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
    renderQuizQuestion(topic, state.index, state.topics.length, (optionId) =>
      answerQuestion(state, topic, optionId)
    ),
    showHome
  );
}

async function answerQuestion(state, topic, optionId) {
  try {
    const { voteId, isMajorityMatch, majorityOptionId, percentages } = await api.postVote({
      topicId: topic.id,
      optionId,
      profile: state.profile,
      voterId: getVoterId(),
    });
    const nextState = { ...state, index: state.index + 1, voteIds: [...state.voteIds, voteId] };
    mount(
      renderQuestionFeedback(topic, optionId, isMajorityMatch, majorityOptionId, percentages, () =>
        runQuiz(nextState)
      ),
      showHome
    );
  } catch (err) {
    mount(renderError(err.message, showHome), showHome);
  }
}

async function finishQuiz(state) {
  try {
    const summary = await api.postSession(state.voteIds);
    clearQuizState();
    const [{ votes }, stats] = await Promise.all([
      api.getSession(summary.sessionId),
      api.getSessionStats(),
    ]);
    mount(
      renderResult(summary, votes, stats, {
        onHome: showHome,
        onHistory: showHistory,
        onRetry: () => startQuiz(),
      }),
      showHome
    );
    playResultReveal(appEl, summary);
  } catch (err) {
    mount(renderError(err.message, showHome), showHome);
  }
}

async function showHistory() {
  try {
    const { sessions } = await api.getSessions();
    mount(renderHistoryList(sessions, { onSelect: showHistoryDetail, onBack: showHome }), showHome);
  } catch (err) {
    mount(renderError(err.message, showHome), showHome);
  }
}

async function showHistoryDetail(sessionId) {
  try {
    const { session, votes } = await api.getSession(sessionId);
    mount(renderHistoryDetail(session, votes, showHistory), showHistory);
  } catch (err) {
    mount(renderError(err.message, showHistory), showHistory);
  }
}

async function showProfileSetup() {
  try {
    const { attributes } = await api.getAttributes();
    mount(
      renderProfileForm(attributes, (values) => {
        saveProfile(values);
        showHome();
      })
    );
  } catch (err) {
    mount(renderError(err.message, showProfileSetup));
  }
}

async function init() {
  const profile = getProfile();
  if (!profile) {
    mount(renderIntro(showProfileSetup));
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
