/**
 * History / Audit Log routes for ASA Management
 */

const express = require('express');
const router = express.Router();
const { db } = require('./utils');

/**
 * GET /asa/history
 * Get change history
 */
router.get('/', async (req, res) => {
  try {
    const {
      entity_type,
      entity_id,
      change_type,
      source,
      from,
      to,
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM asa_change_history WHERE 1=1';
    const params = [];

    if (entity_type) {
      params.push(entity_type);
      query += ` AND entity_type = $${params.length}`;
    }

    if (entity_id) {
      params.push(entity_id);
      query += ` AND entity_id = $${params.length}`;
    }

    if (change_type) {
      params.push(change_type);
      query += ` AND change_type = $${params.length}`;
    }

    if (source) {
      params.push(source);
      query += ` AND source = $${params.length}`;
    }

    if (from) {
      params.push(from);
      query += ` AND changed_at >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      query += ` AND changed_at <= $${params.length}`;
    }

    query += ` ORDER BY changed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/history/entity/:type/:id
 * Get history for specific entity
 */
router.get('/entity/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    const result = await db.query(`
      SELECT * FROM asa_change_history
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY changed_at DESC
      LIMIT 100
    `, [type, id]);

    res.json({
      entityType: type,
      entityId: id,
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
