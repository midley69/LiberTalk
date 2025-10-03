import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// Stats générales (SANS détails utilisateurs)
router.get('/', async (req, res) => {
  try {
    // Compter SANS révéler les détails
    const waitingResult = await query(
      `SELECT COUNT(*) as count
      FROM random_chat_users
      WHERE status = 'en_attente'
      AND last_seen > NOW() - INTERVAL '2 minutes'`
    );

    const chattingResult = await query(
      `SELECT COUNT(*) as count
      FROM random_chat_users
      WHERE status = 'connecte'
      AND last_seen > NOW() - INTERVAL '2 minutes'`
    );

    const sessionsResult = await query(
      `SELECT COUNT(*) as count
      FROM random_chat_sessions
      WHERE status = 'active'`
    );

    res.json({
      waiting: parseInt(waitingResult.rows[0].count),
      chatting: parseInt(chattingResult.rows[0].count),
      activeSessions: parseInt(sessionsResult.rows[0].count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur stats:', error);
    res.status(500).json({ error: 'Erreur stats' });
  }
});

export default router;
