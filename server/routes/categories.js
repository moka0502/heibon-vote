const express = require('express');

function createCategoriesRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const categories = db
      .prepare(
        `SELECT c.id, c.label, COUNT(t.id) AS count
         FROM categories c
         JOIN topics t ON t.category = c.id AND t.status = 'active'
         WHERE c.launched = 1
         GROUP BY c.id
         HAVING count > 0
         ORDER BY c.sort_order`
      )
      .all();
    res.json({ categories });
  });

  return router;
}

module.exports = { createCategoriesRouter };
