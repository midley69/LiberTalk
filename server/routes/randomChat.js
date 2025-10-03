import express from 'express';
import { query, getClient } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Créer un utilisateur
router.post('/users', async (req, res) => {
  const { pseudo, genre, autoswitchEnabled, preferredGender } = req.body;

  try {
    const userId = `random_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const result = await query(
      `INSERT INTO random_chat_users
      (user_id, pseudo, genre, status, autoswitch_enabled, preferred_gender, last_seen, search_started_at)
      VALUES ($1, $2, $3, 'en_attente', $4, $5, NOW(), NOW())
      RETURNING *`,
      [userId, pseudo, genre, autoswitchEnabled, preferredGender || 'tous']
    );

    console.log(`✅ Utilisateur créé: ${userId} (${pseudo})`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Erreur création utilisateur:', error);
    res.status(500).json({ error: 'Erreur création utilisateur' });
  }
});

// Chercher un partenaire
router.post('/find-partner', async (req, res) => {
  const { userId, locationFilter } = req.body;

  try {
    const result = await query(
      'SELECT * FROM find_random_chat_partner($1, $2)',
      [userId, locationFilter || null]
    );

    if (result.rows.length > 0) {
      console.log(`✅ Partenaire trouvé pour ${userId}: ${result.rows[0].partner_pseudo}`);
      res.json(result.rows[0]);
    } else {
      console.log(`❌ Aucun partenaire pour ${userId}`);
      res.json(null);
    }
  } catch (error) {
    console.error('❌ Erreur recherche partenaire:', error);
    res.status(500).json({ error: 'Erreur recherche partenaire' });
  }
});

// Créer une session
router.post('/sessions', async (req, res) => {
  const { user1Id, user1Pseudo, user1Genre, user2Id, user2Pseudo, user2Genre } = req.body;

  try {
    const result = await query(
      'SELECT create_random_chat_session($1, $2, $3, $4, $5, $6) as session_id',
      [user1Id, user1Pseudo, user1Genre, user2Id, user2Pseudo, user2Genre]
    );

    const sessionId = result.rows[0].session_id;

    // Charger la session créée
    const sessionResult = await query(
      'SELECT * FROM random_chat_sessions WHERE id = $1',
      [sessionId]
    );

    console.log(`✅ Session créée: ${sessionId}`);
    res.json(sessionResult.rows[0]);
  } catch (error) {
    console.error('❌ Erreur création session:', error);

    // Race condition gérée
    if (error.message.includes('n\'est plus en attente')) {
      res.status(409).json({ error: 'race_condition', message: 'Partenaire déjà pris' });
    } else {
      res.status(500).json({ error: 'Erreur création session' });
    }
  }
});

// Charger les messages d'une session
router.get('/sessions/:sessionId/messages', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const result = await query(
      `SELECT * FROM random_chat_messages
      WHERE session_id = $1
      ORDER BY sent_at ASC`,
      [sessionId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur chargement messages:', error);
    res.status(500).json({ error: 'Erreur chargement messages' });
  }
});

// Terminer une session
router.post('/sessions/:sessionId/end', async (req, res) => {
  const { sessionId } = req.params;
  const { userId, reason } = req.body;

  try {
    await query(
      'SELECT end_random_chat_session($1, $2, $3)',
      [sessionId, userId, reason || 'user_quit']
    );

    console.log(`✅ Session terminée: ${sessionId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur fin session:', error);
    res.status(500).json({ error: 'Erreur fin session' });
  }
});

// Obtenir les statistiques
router.get('/stats', async (req, res) => {
  try {
    const result = await query('SELECT get_random_chat_stats() as stats');
    res.json(result.rows[0].stats);
  } catch (error) {
    console.error('❌ Erreur stats:', error);
    res.status(500).json({ error: 'Erreur stats' });
  }
});

// Compter utilisateurs en attente (sans détails)
router.get('/waiting-count', async (req, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as count
      FROM random_chat_users
      WHERE status = 'en_attente'
      AND last_seen > NOW() - INTERVAL '2 minutes'`
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('❌ Erreur count:', error);
    res.status(500).json({ error: 'Erreur count' });
  }
});

export default router;
