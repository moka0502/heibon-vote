const express = require('express');

function createAttributesRouter(db) {
  const router = express.Router();
  const valueStmt = db.prepare(
    'SELECT id, label FROM attribute_values WHERE attribute_id = ? ORDER BY sort_order'
  );

  router.get('/', (req, res) => {
    const attributes = db.prepare('SELECT id, label FROM attributes').all();
    res.json({
      attributes: attributes.map((attribute) => ({
        ...attribute,
        values: valueStmt.all(attribute.id),
      })),
    });
  });

  return router;
}

module.exports = { createAttributesRouter };
