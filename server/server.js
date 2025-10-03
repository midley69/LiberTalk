import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { query } from './db.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Middlewares de sécurité
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100
});
app.use('/api/', limiter);

// Routes API
import randomChatRoutes from './routes/randomChat.js';
import groupsRoutes from './routes/groups.js';
import statsRoutes from './routes/stats.js';

app.use('/api/random-chat', randomChatRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Gestion WebSocket pour temps réel
const connectedUsers = new Map(); // userId -> socketId
const activeSessions = new Map(); // sessionId -> { user1, user2, socketIds }

io.on('connection', (socket) => {
  console.log('🔌 Client connecté:', socket.id);

  // Enregistrer l'utilisateur
  socket.on('register', (data) => {
    const { userId, sessionId } = data;
    connectedUsers.set(userId, socket.id);
    socket.join(`session_${sessionId}`);

    console.log(`✅ User ${userId} enregistré dans session ${sessionId}`);
  });

  // Envoyer un message
  socket.on('send_message', async (data) => {
    const { sessionId, senderId, senderPseudo, senderGenre, messageText } = data;

    try {
      // Insérer dans la DB
      const result = await query(
        `INSERT INTO random_chat_messages
        (session_id, sender_id, sender_pseudo, sender_genre, message_text, message_type, sent_at)
        VALUES ($1, $2, $3, $4, $5, 'user', NOW())
        RETURNING *`,
        [sessionId, senderId, senderPseudo, senderGenre, messageText]
      );

      const message = result.rows[0];

      // Broadcast à tous les membres de la session
      io.to(`session_${sessionId}`).emit('new_message', message);

      // Mettre à jour last_activity de la session
      await query(
        'UPDATE random_chat_sessions SET last_activity = NOW() WHERE id = $1',
        [sessionId]
      );

      console.log(`📨 Message envoyé dans session ${sessionId}`);
    } catch (error) {
      console.error('❌ Erreur envoi message:', error);
      socket.emit('error', { message: 'Erreur envoi message' });
    }
  });

  // Quitter une session
  socket.on('leave_session', async (data) => {
    const { sessionId, userId, reason } = data;

    try {
      await query(
        'SELECT end_random_chat_session($1, $2, $3)',
        [sessionId, userId, reason || 'user_quit']
      );

      // Notifier l'autre utilisateur
      io.to(`session_${sessionId}`).emit('session_ended', {
        reason,
        endedBy: userId
      });

      socket.leave(`session_${sessionId}`);
      connectedUsers.delete(userId);

      console.log(`🚪 User ${userId} a quitté session ${sessionId}`);
    } catch (error) {
      console.error('❌ Erreur quitter session:', error);
    }
  });

  // Heartbeat pour maintenir la connexion
  socket.on('heartbeat', async (data) => {
    const { userId } = data;

    try {
      await query(
        'UPDATE random_chat_users SET last_seen = NOW() WHERE user_id = $1',
        [userId]
      );
    } catch (error) {
      console.error('❌ Erreur heartbeat:', error);
    }
  });

  // Déconnexion
  socket.on('disconnect', async () => {
    console.log('❌ Client déconnecté:', socket.id);

    // Trouver l'utilisateur associé
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        try {
          // Gérer la déconnexion proprement
          await query(
            'SELECT handle_user_disconnect($1)',
            [userId]
          );

          connectedUsers.delete(userId);
          console.log(`🧹 Nettoyage utilisateur ${userId}`);
        } catch (error) {
          console.error('❌ Erreur nettoyage disconnect:', error);
        }
        break;
      }
    }
  });
});

// Nettoyage périodique des utilisateurs inactifs
setInterval(async () => {
  try {
    const result = await query('SELECT cleanup_inactive_users()');
    console.log(`🧹 Nettoyage: ${result.rows[0].cleanup_inactive_users} utilisateurs supprimés`);
  } catch (error) {
    console.error('❌ Erreur nettoyage automatique:', error);
  }
}, 60000); // Toutes les minutes

// Démarrage du serveur
httpServer.listen(PORT, () => {
  console.log('🚀 Serveur LiberTalk démarré');
  console.log(`📡 API: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV}`);
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

export default app;
