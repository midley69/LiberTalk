import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';
import fetch from 'node-fetch';

// Obtenir __dirname en ES6
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);

// Configuration CORS plus permissive pour résoudre les problèmes de connexion
const corsOrigins = process.env.NODE_ENV === 'production'
    ? ['https://libekoo.me', 'https://www.libekoo.me', 'http://libekoo.me', 'http://www.libekoo.me']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

const io = new Server(server, {
    cors: {
        origin: true, // Accepter toutes les origines temporairement pour debug
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type']
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Middleware pour logger les requêtes
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path} - ${req.ip}`);
    next();
});

// Servir les fichiers statiques en production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist'), {
        maxAge: '1d',
        etag: true
    }));
}

// ==========================================
// BASE DE DONNÉES SQLite
// ==========================================
let db;

async function initDatabase() {
    const dbPath = path.join(__dirname, 'libekoo.db');
    console.log('📁 Base de données:', dbPath);

    db = await open({
        filename: dbPath,
        driver: sqlite3.verbose().Database
    });

    // Tables avec support de géolocalisation
    await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      socket_id TEXT,
      is_anonymous BOOLEAN DEFAULT 1,
      city TEXT,
      region TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user1_id TEXT NOT NULL,
      user2_id TEXT NOT NULL,
      distance_km REAL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_users ON chat_sessions(user1_id, user2_id);
    CREATE INDEX IF NOT EXISTS idx_users_socket ON users(socket_id);
    CREATE INDEX IF NOT EXISTS idx_users_location ON users(country, region, city);
  `);

    console.log('✅ Base de données initialisée');
}

// ==========================================
// STOCKAGE IN-MEMORY (Cache)
// ==========================================
const activeUsers = new Map(); // socketId -> userId
const waitingQueues = {
    chat: new Map(), // userId -> {userData, location}
    video: new Map(),
    group: new Map()
};

// ==========================================
// FONCTIONS UTILITAIRES
// ==========================================
const generateId = (prefix = 'id') => {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
};

const sanitizeMessage = (message) => {
    if (!message || typeof message !== 'string') return '';
    return message.slice(0, 1000).replace(/[<>]/g, '');
};

// Calculer la distance entre deux points GPS (formule de Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;

    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance en km
}

// Obtenir la géolocalisation par IP
async function getLocationFromIP(ip) {
    try {
        // Nettoyer l'IP (enlever ::ffff: pour IPv4 mappée)
        const cleanIp = ip.replace(/^::ffff:/, '');

        // Ne pas géolocaliser les IPs locales
        if (cleanIp === '127.0.0.1' || cleanIp === 'localhost' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.')) {
            return {
                city: 'Local',
                region: 'Local',
                country: 'Local',
                latitude: 0,
                longitude: 0
            };
        }

        // Utiliser ipapi.co (gratuit, 1000 requêtes/jour)
        const response = await fetch(`https://ipapi.co/${cleanIp}/json/`);
        if (response.ok) {
            const data = await response.json();
            return {
                city: data.city || 'Unknown',
                region: data.region || 'Unknown',
                country: data.country_name || 'Unknown',
                latitude: data.latitude || 0,
                longitude: data.longitude || 0
            };
        }
    } catch (error) {
        console.error('Erreur géolocalisation IP:', error);
    }

    return null;
}

// ==========================================
// GESTION DES UTILISATEURS
// ==========================================
async function createUser(socketId, username, location, ipAddress) {
    const userId = generateId('user');
    const safeUsername = username || `Anonyme_${Math.floor(Math.random() * 9999)}`;

    // Géolocalisation par IP si pas fournie par le client
    let finalLocation = location || {};
    if (!finalLocation.city && ipAddress) {
        const ipLocation = await getLocationFromIP(ipAddress);
        if (ipLocation) {
            finalLocation = ipLocation;
        }
    }

    await db.run(
        `INSERT INTO users (id, username, socket_id, is_anonymous, city, region, country, latitude, longitude, ip_address) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            safeUsername,
            socketId,
            !username,
            finalLocation.city || null,
            finalLocation.region || null,
            finalLocation.country || null,
            finalLocation.lat || null,
            finalLocation.lon || null,
            ipAddress
        ]
    );

    activeUsers.set(socketId, userId);

    return {
        id: userId,
        username: safeUsername,
        isAnonymous: !username,
        location: finalLocation
    };
}

async function disconnectUser(socketId) {
    const userId = activeUsers.get(socketId);
    if (userId) {
        await db.run(
            'UPDATE users SET socket_id = NULL, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
            [userId]
        );

        // Retirer des files d'attente
        Object.values(waitingQueues).forEach(queue => {
            queue.delete(userId);
        });

        activeUsers.delete(socketId);
    }
}

// ==========================================
// GESTION DES SESSIONS DE CHAT
// ==========================================
async function createChatSession(user1Id, user2Id, distance = null) {
    const sessionId = generateId('session');

    await db.run(
        'INSERT INTO chat_sessions (id, user1_id, user2_id, distance_km) VALUES (?, ?, ?, ?)',
        [sessionId, user1Id, user2Id, distance]
    );

    return sessionId;
}

async function endChatSession(sessionId) {
    await db.run(
        'UPDATE chat_sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['ended', sessionId]
    );
}

async function saveMessage(sessionId, userId, message) {
    const messageId = generateId('msg');
    const safeMessage = sanitizeMessage(message);

    await db.run(
        'INSERT INTO messages (id, session_id, user_id, message) VALUES (?, ?, ?, ?)',
        [messageId, sessionId, userId, safeMessage]
    );

    return { id: messageId, message: safeMessage, timestamp: new Date() };
}

async function getSessionMessages(sessionId, limit = 100) {
    return await db.all(
        `SELECT m.*, u.username 
     FROM messages m 
     JOIN users u ON m.user_id = u.id 
     WHERE m.session_id = ? 
     ORDER BY m.created_at DESC 
     LIMIT ?`,
        [sessionId, limit]
    );
}

// ==========================================
// MATCHING ALGORITHM AVEC GÉOLOCALISATION
// ==========================================
async function attemptMatch(type, userId, userLocation) {
    if (type !== 'chat') return null;

    const queue = waitingQueues[type];
    const userEntry = queue.get(userId);

    if (!userEntry) return null;

    let bestMatch = null;
    let minDistance = Infinity;

    // Parcourir la file pour trouver le meilleur match
    for (const [otherId, otherEntry] of queue.entries()) {
        if (otherId === userId) continue;

        // Calculer la distance si les coordonnées sont disponibles
        let distance = null;
        if (userLocation?.lat && userLocation?.lon && otherEntry.location?.lat && otherEntry.location?.lon) {
            distance = calculateDistance(
                userLocation.lat,
                userLocation.lon,
                otherEntry.location.lat,
                otherEntry.location.lon
            );

            // Prioriser les utilisateurs proches
            if (distance !== null && distance < minDistance) {
                minDistance = distance;
                bestMatch = { id: otherId, data: otherEntry, distance };
            }
        } else {
            // Si pas de coordonnées, matcher par pays/région
            if (userLocation?.country === otherEntry.location?.country) {
                if (userLocation?.region === otherEntry.location?.region) {
                    // Même région
                    bestMatch = { id: otherId, data: otherEntry, distance: 0 };
                    break;
                } else if (!bestMatch) {
                    // Même pays
                    bestMatch = { id: otherId, data: otherEntry, distance: 100 };
                }
            } else if (!bestMatch) {
                // Différent pays, mais on prend si pas d'autre option
                bestMatch = { id: otherId, data: otherEntry, distance: 1000 };
            }
        }
    }

    if (bestMatch) {
        const partnerId = bestMatch.id;
        const distance = bestMatch.distance;

        // Créer la session
        const sessionId = await createChatSession(userId, partnerId, distance);

        // Retirer de la file
        queue.delete(userId);
        queue.delete(partnerId);

        console.log(`💑 Match créé: ${userId} <-> ${partnerId} (${distance ? Math.round(distance) + 'km' : 'proximité inconnue'})`);

        return { sessionId, partnerId, distance };
    }

    return null;
}

// ==========================================
// SOCKET.IO EVENTS
// ==========================================
io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-real-ip'] ||
        socket.handshake.headers['x-forwarded-for']?.split(',')[0] ||
        socket.handshake.address;

    console.log(`✅ Client connecté: ${socket.id} (IP: ${clientIp})`);

    // Test de connexion
    socket.emit('connection-success', { socketId: socket.id });

    // Enregistrement utilisateur avec géolocalisation
    socket.on('user:register', async (userData, callback) => {
        try {
            const user = await createUser(
                socket.id,
                userData.username,
                userData.location,
                clientIp
            );

            console.log(`👤 Utilisateur créé: ${user.username} de ${user.location?.city || 'Unknown'}, ${user.location?.country || 'Unknown'}`);
            callback({ success: true, user });
        } catch (error) {
            console.error('Erreur inscription:', error);
            callback({ success: false, error: 'Erreur lors de l\'inscription' });
        }
    });

    // Rejoindre une file d'attente avec localisation
    socket.on('queue:join', async ({ type, userId, location }, callback) => {
        try {
            if (!['chat', 'video', 'group'].includes(type)) {
                throw new Error('Type invalide');
            }

            // Retirer des autres files
            Object.values(waitingQueues).forEach(queue => {
                queue.delete(userId);
            });

            // Ajouter à la file avec les infos de localisation
            waitingQueues[type].set(userId, {
                socketId: socket.id,
                location: location || {},
                joinedAt: new Date()
            });

            console.log(`📋 ${userId} rejoint la file ${type} (${waitingQueues[type].size} en attente)`);
            callback({ success: true });

            // Tenter un match immédiatement
            const match = await attemptMatch(type, userId, location);
            if (match) {
                // Obtenir les infos des deux utilisateurs
                const user1 = await db.get('SELECT * FROM users WHERE id = ?', userId);
                const user2 = await db.get('SELECT * FROM users WHERE id = ?', match.partnerId);

                // Notifier les deux utilisateurs
                if (user1?.socket_id) {
                    io.to(user1.socket_id).emit('match:found', {
                        sessionId: match.sessionId,
                        partner: {
                            id: match.partnerId,
                            username: user2?.username || 'Anonyme',
                            location: {
                                city: user2?.city,
                                region: user2?.region,
                                country: user2?.country
                            }
                        },
                        distance: match.distance
                    });
                }

                if (user2?.socket_id) {
                    io.to(user2.socket_id).emit('match:found', {
                        sessionId: match.sessionId,
                        partner: {
                            id: userId,
                            username: user1?.username || 'Anonyme',
                            location: {
                                city: user1?.city,
                                region: user1?.region,
                                country: user1?.country
                            }
                        },
                        distance: match.distance
                    });
                }
            }
        } catch (error) {
            console.error('Erreur queue:join:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Quitter la file
    socket.on('queue:leave', ({ userId }, callback) => {
        try {
            Object.values(waitingQueues).forEach(queue => {
                queue.delete(userId);
            });
            callback({ success: true });
        } catch (error) {
            callback({ success: false, error: error.message });
        }
    });

    // Envoyer un message
    socket.on('message:send', async ({ sessionId, userId, message }, callback) => {
        try {
            // Vérifier la session
            const session = await db.get(
                'SELECT * FROM chat_sessions WHERE id = ? AND status = ?',
                [sessionId, 'active']
            );

            if (!session) {
                throw new Error('Session invalide ou terminée');
            }

            // Sauvegarder le message
            const savedMessage = await saveMessage(sessionId, userId, message);

            // Obtenir l'autre utilisateur
            const otherId = session.user1_id === userId ? session.user2_id : session.user1_id;
            const otherUser = await db.get('SELECT * FROM users WHERE id = ?', otherId);
            const sender = await db.get('SELECT * FROM users WHERE id = ?', userId);

            // Envoyer au destinataire
            if (otherUser?.socket_id) {
                io.to(otherUser.socket_id).emit('message:receive', {
                    id: savedMessage.id,
                    userId,
                    username: sender?.username || 'Anonyme',
                    message: savedMessage.message,
                    timestamp: savedMessage.timestamp,
                    isOwn: false
                });
            }

            callback({ success: true, messageId: savedMessage.id });
        } catch (error) {
            console.error('Erreur message:send:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Passer au suivant
    socket.on('chat:skip', async ({ sessionId, userId }, callback) => {
        try {
            await endChatSession(sessionId);

            // Notifier l'autre utilisateur
            const session = await db.get('SELECT * FROM chat_sessions WHERE id = ?', sessionId);
            if (session) {
                const otherId = session.user1_id === userId ? session.user2_id : session.user1_id;
                const otherUser = await db.get('SELECT * FROM users WHERE id = ?', otherId);

                if (otherUser?.socket_id) {
                    io.to(otherUser.socket_id).emit('session:ended', { sessionId });
                }
            }

            // Remettre en file d'attente avec localisation
            const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
            if (user) {
                waitingQueues.chat.set(userId, {
                    socketId: socket.id,
                    location: {
                        city: user.city,
                        region: user.region,
                        country: user.country,
                        lat: user.latitude,
                        lon: user.longitude
                    },
                    joinedAt: new Date()
                });
            }

            callback({ success: true });

            // Tenter un nouveau match
            setTimeout(() => attemptMatch('chat', userId, user), 1000);
        } catch (error) {
            callback({ success: false, error: error.message });
        }
    });

    // Récupérer l'historique
    socket.on('messages:history', async ({ sessionId }, callback) => {
        try {
            const messages = await getSessionMessages(sessionId);
            callback({ success: true, messages: messages.reverse() });
        } catch (error) {
            callback({ success: false, error: error.message });
        }
    });

    // Déconnexion
    socket.on('disconnect', async () => {
        console.log(`❌ Client déconnecté: ${socket.id}`);
        await disconnectUser(socket.id);
    });
});

// ==========================================
// ROUTES API REST
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        environment: process.env.NODE_ENV || 'development',
        socketConnected: io.engine.clientsCount
    });
});

app.get('/api/queue-status', (req, res) => {
    res.json({
        chat: waitingQueues.chat.size,
        video: waitingQueues.video.size,
        group: waitingQueues.group.size
    });
});

// Route SPA en production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

// ==========================================
// DÉMARRAGE DU SERVEUR
// ==========================================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

async function startServer() {
    try {
        await initDatabase();

        server.listen(PORT, HOST, () => {
            console.log(`🚀 Serveur démarré sur ${HOST}:${PORT}`);
            console.log(`📡 Socket.io prêt avec géolocalisation`);
            console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📁 Base de données: ${path.join(__dirname, 'libekoo.db')}`);
        });
    } catch (error) {
        console.error('❌ Erreur de démarrage:', error);
        process.exit(1);
    }
}

startServer();

// Gestion propre de l'arrêt
process.on('SIGTERM', async () => {
    console.log('Arrêt du serveur...');
    if (db) await db.close();
    server.close(() => process.exit(0));
});