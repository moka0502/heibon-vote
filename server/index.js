const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const { createAttributesRouter } = require('./routes/attributes');
const { createTopicsRouter } = require('./routes/topics');
const { createVotesRouter } = require('./routes/votes');
const { createSessionsRouter } = require('./routes/sessions');

const PORT = 4322;
const db = openDb();

const app = express();
app.use(express.json());
app.use('/api/attributes', createAttributesRouter(db));
app.use('/api/topics', createTopicsRouter(db));
app.use('/api/votes', createVotesRouter(db));
app.use('/api/sessions', createSessionsRouter(db));
app.use(express.static(path.join(__dirname, '..', 'www')));

app.listen(PORT, () => {
  console.log(`heibon-vote server listening on http://localhost:${PORT}`);
});
