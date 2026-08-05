const fs = require('node:fs');
const path = require('node:path');

const ATTRIBUTES_SEED_PATH = path.join(__dirname, 'data', 'attributes-seed.json');
const QUESTIONS_SEED_PATH = path.join(__dirname, 'data', 'questions-seed.json');

function seed(db) {
  seedAttributes(db);
  seedTopics(db);
}

function seedAttributes(db) {
  const attributes = JSON.parse(fs.readFileSync(ATTRIBUTES_SEED_PATH, 'utf8'));
  const insertAttribute = db.prepare('INSERT OR IGNORE INTO attributes (id, label) VALUES (?, ?)');
  const insertValue = db.prepare(
    'INSERT OR IGNORE INTO attribute_values (attribute_id, id, label, sort_order) VALUES (?, ?, ?, ?)'
  );

  const run = db.transaction((attrs) => {
    for (const attribute of attrs) {
      insertAttribute.run(attribute.id, attribute.label);
      attribute.values.forEach((value, index) => {
        insertValue.run(attribute.id, value.id, value.label, index);
      });
    }
  });
  run(attributes);
}

function seedTopics(db) {
  const topics = JSON.parse(fs.readFileSync(QUESTIONS_SEED_PATH, 'utf8'));
  const insertTopic = db.prepare('INSERT OR IGNORE INTO topics (id, question) VALUES (?, ?)');
  const insertOption = db.prepare(
    'INSERT OR IGNORE INTO options (topic_id, id, label, sort_order) VALUES (?, ?, ?, ?)'
  );
  const insertDummyVote = db.prepare(
    'INSERT INTO votes (topic_id, option_id, profile_json, is_dummy) VALUES (?, ?, ?, 1)'
  );
  const countDummyVotes = db.prepare(
    'SELECT COUNT(*) AS count FROM votes WHERE topic_id = ? AND is_dummy = 1'
  );

  const run = db.transaction((topicList) => {
    for (const topic of topicList) {
      insertTopic.run(topic.id, topic.question);
      topic.options.forEach((option, index) => {
        insertOption.run(topic.id, option.id, option.label, index);
      });

      // 既にダミー票が入っていれば再投入しない(再起動のたびに水増しされるのを防ぐ)
      if (countDummyVotes.get(topic.id).count > 0) continue;

      for (const [optionId, count] of Object.entries(topic.dummyVotes)) {
        for (let i = 0; i < count; i += 1) {
          insertDummyVote.run(topic.id, optionId, '{}');
        }
      }
    }
  });
  run(topics);
}

module.exports = { seed };
