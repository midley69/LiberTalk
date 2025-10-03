import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// Lister les groupes actifs
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM groups
      WHERE is_active = true
      AND last_activity > NOW() - INTERVAL '15 minutes'
      ORDER BY last_activity DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur liste groupes:', error);
    res.status(500).json({ error: 'Erreur liste groupes' });
  }
});

// Créer un groupe
router.post('/', async (req, res) => {
  const { name, description, createdBy, location } = req.body;

  try {
    const result = await query(
      `INSERT INTO groups
      (name, description, member_count, is_active, category, location, created_by, created_at, last_activity)
      VALUES ($1, $2, 1, true, 'General', $3, $4, NOW(), NOW())
      RETURNING *`,
      [name, description, location, createdBy]
    );

    console.log(`✅ Groupe créé: ${result.rows[0].name}`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Erreur création groupe:', error);
    res.status(500).json({ error: 'Erreur création groupe' });
  }
});

// Rejoindre un groupe
router.post('/:groupId/join', async (req, res) => {
  const { groupId } = req.params;

  try {
    await query(
      `UPDATE groups
      SET member_count = member_count + 1, last_activity = NOW()
      WHERE id = $1`,
      [groupId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur rejoindre groupe:', error);
    res.status(500).json({ error: 'Erreur rejoindre groupe' });
  }
});

// Quitter un groupe
router.post('/:groupId/leave', async (req, res) => {
  const { groupId } = req.params;

  try {
    await query(
      `UPDATE groups
      SET member_count = GREATEST(0, member_count - 1)
      WHERE id = $1`,
      [groupId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur quitter groupe:', error);
    res.status(500).json({ error: 'Erreur quitter groupe' });
  }
});

export default router;
