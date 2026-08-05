import { api } from './api.js';
import { getProfile, saveProfile } from './storage.js';
import { playResultReveal } from './effects.js';
import {
  renderProfileForm,
  renderHome,
  renderQuizQuestion,
  renderResult,
  renderHistoryList,
  renderHistoryDetail,
  renderTopicList,
  renderTopicBreakdown,
  renderError,
} from './render.js';

const QUESTIONS_PER_SESSION = 10;
const appEl = document.getElementById('app');

function mount(node) {
  node.classList.add('screen-enter');
  appEl.replaceChildren(node);
}

async function showHome() {
  try {
    const stats = await api.getSessionStats();
    mount(
      renderHome(stats, { onStart: startQuiz, onHistory: showHistory, onTopics: showTopics })
    );
  } catch (err) {
    mount(renderError(err.message, showHome));
  }
}

async function showTopics() {
  try {
    const { topics } = await api.getAllTopics();
    mount(renderTopicList(topics, { onSelect: showTopicBreakdown, onBack: showHome }));
  } catch (err) {
    mount(renderError(err.message, showHome));
  }
}

async function showTopicBreakdown(topicId) {
  try {
    const [{ attributes }, { topic, breakdown }] = await Promise.all([
      api.getAttributes(),
      api.getTopicBreakdown(topicId),
    ]);
    mount(renderTopicBreakdown(topic, attributes, breakdown, showTopics));
  } catch (err) {
    mount(renderError(err.message, showTopics));
  }
}

async function startQuiz() {
  try {
    const profile = getProfile();
    const { topics } = await api.getRandomTopics(QUESTIONS_PER_SESSION);
    runQuiz({ topics, profile, index: 0, voteIds: [] });
  } catch (err) {
    mount(renderError(err.message, showHome));
  }
}

function runQuiz(state) {
  if (state.index >= state.topics.length) {
    finishQuiz(state);
    return;
  }
  const topic = state.topics[state.index];
  mount(
    renderQuizQuestion(topic, state.index, state.topics.length, (optionId) =>
      answerQuestion(state, topic, optionId)
    )
  );
}

async function answerQuestion(state, topic, optionId) {
  try {
    const { voteId } = await api.postVote({
      topicId: topic.id,
      optionId,
      profile: state.profile,
    });
    runQuiz({ ...state, index: state.index + 1, voteIds: [...state.voteIds, voteId] });
  } catch (err) {
    mount(renderError(err.message, showHome));
  }
}

async function finishQuiz(state) {
  try {
    const summary = await api.postSession(state.voteIds);
    const [{ votes }, stats] = await Promise.all([
      api.getSession(summary.sessionId),
      api.getSessionStats(),
    ]);
    mount(renderResult(summary, votes, stats, { onHome: showHome, onHistory: showHistory }));
    playResultReveal(appEl, summary);
  } catch (err) {
    mount(renderError(err.message, showHome));
  }
}

async function showHistory() {
  try {
    const { sessions } = await api.getSessions();
    mount(renderHistoryList(sessions, { onSelect: showHistoryDetail, onBack: showHome }));
  } catch (err) {
    mount(renderError(err.message, showHome));
  }
}

async function showHistoryDetail(sessionId) {
  try {
    const { session, votes } = await api.getSession(sessionId);
    mount(renderHistoryDetail(session, votes, showHistory));
  } catch (err) {
    mount(renderError(err.message, showHistory));
  }
}

async function init() {
  const profile = getProfile();
  if (profile) {
    showHome();
    return;
  }
  try {
    const { attributes } = await api.getAttributes();
    mount(
      renderProfileForm(attributes, (values) => {
        saveProfile(values);
        showHome();
      })
    );
  } catch (err) {
    mount(renderError(err.message, init));
  }
}

init();
