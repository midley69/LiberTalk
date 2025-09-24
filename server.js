import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);

// Configuration CORS
const io = new Server(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['polling', 'websocket']
});

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Servir les fichiers statiques en production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
}

// ==========================================
// STOCKAGE IN-MEMORY
// ==========================================
const users = new Map(); // userId -> userData
const activeSockets = new Map(); // socketId -> userId  
const chatSessions = new Map(); // sessionId -> sessionData
const waitingQueues = {
    chat: new Set(),
    video: new Set(),
    groups: new Map() // groupId -> Set of userIds
};
const activeGroups = new Map(); // groupId -> groupData

// ==========================================
// FONCTIONS UTILITAIRES
// ==========================================
function generateId(prefix = '') {
    return `${prefix}${prefix ? '_' : ''}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sanitizeMessage(message) {
    return String(message).trim().slice(0, 500);
}

// ==========================================
// API REST ENDPOINTS
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        users: users.size,
        activeSockets: activeSockets.size,
        chatSessions: chatSessions.size,
        groups: activeGroups.size
    });
});

// Get stats
app.get('/api/stats', (req, res) => {
    res.json({
        onlineUsers: users.size,
        activeChats: chatSessions.size,
        activeGroups: activeGroups.size,
        waitingChat: waitingQueues.chat.size,
        waitingVideo: waitingQueues.video.size
    });
});

// ==========================================
// GESTION SOCKET.IO
// ==========================================

io.on('connection', (socket) => {
    console.log('🔌 Nouvelle connexion:', socket.id);

    // Enregistrement utilisateur
    socket.on('user:register', (data, callback) => {
        try {
            const userId = generateId('user');
            const username = data?.username || `Anonyme_${Math.floor(Math.random() * 9999)}`;

            const user = {
                id: userId,
                username,
                socketId: socket.id,
                isAnonymous: !data?.username,
                location: data?.location || 'Non spécifié',
                createdAt: new Date(),
                status: 'online'
            };

            users.set(userId, user);
            activeSockets.set(socket.id, userId);
            socket.userId = userId;

            // Joindre la room de l'utilisateur
            socket.join(`user_${userId}`);

            // Broadcast du nombre d'utilisateurs
            io.emit('stats:update', {
                onlineUsers: users.size
            });

            callback({ success: true, user });
            console.log(`✅ Utilisateur enregistré: ${username} (${userId})`);
        } catch (error) {
            console.error('❌ Erreur registration:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Chat Aléatoire - Recherche de partenaire
    socket.on('chat:findPartner', async (data, callback) => {
        try {
            const userId = activeSockets.get(socket.id);
            if (!userId) {
                return callback({ success: false, error: 'Non authentifié' });
            }

            const user = users.get(userId);

            // Vérifier si déjà en attente
            if (waitingQueues.chat.has(userId)) {
                return callback({ success: false, error: 'Déjà en recherche' });
            }

            // Chercher un partenaire disponible
            const availablePartner = Array.from(waitingQueues.chat).find(partnerId => partnerId !== userId);

            if (availablePartner) {
                // Match trouvé!
                waitingQueues.chat.delete(availablePartner);

                const sessionId = generateId('chat');
                const partner = users.get(availablePartner);

                const session = {
                    id: sessionId,
                    user1: { id: userId, username: user.username },
                    user2: { id: availablePartner, username: partner.username },
                    messages: [],
                    createdAt: new Date(),
                    status: 'active'
                };

                chatSessions.set(sessionId, session);

                // Joindre les deux utilisateurs à la room de chat
                const partnerSocket = Array.from(activeSockets.entries())
                    .find(([sId, uId]) => uId === availablePartner)?.[0];

                if (partnerSocket) {
                    socket.join(`chat_${sessionId}`);
                    io.sockets.sockets.get(partnerSocket).join(`chat_${sessionId}`);

                    // Notifier les deux utilisateurs
                    io.to(`chat_${sessionId}`).emit('chat:matched', {
                        sessionId,
                        partner: userId === session.user1.id ? session.user2 : session.user1
                    });

                    callback({
                        success: true,
                        sessionId,
                        partner: partner.username
                    });

                    console.log(`💑 Match: ${user.username} <-> ${partner.username}`);
                }
            } else {
                // Ajouter à la file d'attente
                waitingQueues.chat.add(userId);
                callback({ success: true, waiting: true });
                console.log(`⏳ ${user.username} en attente...`);
            }
        } catch (error) {
            console.error('❌ Erreur findPartner:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Envoi de message
    socket.on('chat:sendMessage', (data, callback) => {
        try {
            const userId = activeSockets.get(socket.id);
            const { sessionId, message } = data;

            if (!userId || !sessionId || !message) {
                return callback({ success: false, error: 'Données invalides' });
            }

            const session = chatSessions.get(sessionId);
            if (!session) {
                return callback({ success: false, error: 'Session introuvable' });
            }

            const user = users.get(userId);
            const messageData = {
                id: generateId('msg'),
                userId,
                username: user.username,
                message: sanitizeMessage(message),
                timestamp: new Date()
            };

            session.messages.push(messageData);

            // Envoyer à tous dans la room
            io.to(`chat_${sessionId}`).emit('chat:message', messageData);

            callback({ success: true, messageId: messageData.id });
        } catch (error) {
            console.error('❌ Erreur sendMessage:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Skip utilisateur
    socket.on('chat:skip', (data) => {
        const userId = activeSockets.get(socket.id);
        const { sessionId } = data;

        if (sessionId) {
            const session = chatSessions.get(sessionId);
            if (session) {
                session.status = 'ended';
                io.to(`chat_${sessionId}`).emit('chat:ended', { reason: 'skip' });

                // Nettoyer
                socket.leave(`chat_${sessionId}`);

                // Libérer l'autre utilisateur
                const otherId = session.user1.id === userId ? session.user2.id : session.user1.id;
                const otherSocket = Array.from(activeSockets.entries())
                    .find(([sId, uId]) => uId === otherId)?.[0];

                if (otherSocket) {
                    io.sockets.sockets.get(otherSocket)?.leave(`chat_${sessionId}`);
                }

                // Supprimer la session après un délai
                setTimeout(() => chatSessions.delete(sessionId), 5000);
            }
        }
    });

    // Créer un groupe
    socket.on('group:create', (data, callback) => {
        try {
            const userId = activeSockets.get(socket.id);
            if (!userId) {
                return callback({ success: false, error: 'Non authentifié' });
            }

            const user = users.get(userId);
            const groupId = generateId('group');

            const group = {
                id: groupId,
                name: data.name || `Groupe #${Math.floor(Math.random() * 9999)}`,
                description: data.description || 'Discussion de groupe',
                createdBy: userId,
                createdByUsername: user.username,
                members: new Set([userId]),
                messages: [],
                createdAt: new Date(),
                maxMembers: 10
            };

            activeGroups.set(groupId, group);
            waitingQueues.groups.set(groupId, new Set([userId]));

            socket.join(`group_${groupId}`);

            callback({
                success: true, group: {
                    id: group.id,
                    name: group.name,
                    description: group.description,
                    memberCount: group.members.size
                }
            });

            // Broadcast nouveau groupe
            io.emit('group:new', {
                id: group.id,
                name: group.name,
                description: group.description,
                memberCount: 1
            });

            console.log(`👥 Groupe créé: ${group.name} par ${user.username}`);
        } catch (error) {
            console.error('❌ Erreur création groupe:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Rejoindre un groupe
    socket.on('group:join', (data, callback) => {
        try {
            const userId = activeSockets.get(socket.id);
            const { groupId } = data;

            if (!userId || !groupId) {
                return callback({ success: false, error: 'Données invalides' });
            }

            const group = activeGroups.get(groupId);
            if (!group) {
                return callback({ success: false, error: 'Groupe introuvable' });
            }

            if (group.members.size >= group.maxMembers) {
                return callback({ success: false, error: 'Groupe complet' });
            }

            const user = users.get(userId);
            group.members.add(userId);
            socket.join(`group_${groupId}`);

            // Notifier les membres
            io.to(`group_${groupId}`).emit('group:userJoined', {
                userId,
                username: user.username,
                memberCount: group.members.size
            });

            callback({
                success: true,
                group: {
                    id: group.id,
                    name: group.name,
                    memberCount: group.members.size
                }
            });

            console.log(`👤 ${user.username} a rejoint ${group.name}`);
        } catch (error) {
            console.error('❌ Erreur join groupe:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Message de groupe
    socket.on('group:sendMessage', (data, callback) => {
        try {
            const userId = activeSockets.get(socket.id);
            const { groupId, message } = data;

            if (!userId || !groupId || !message) {
                return callback({ success: false, error: 'Données invalides' });
            }

            const group = activeGroups.get(groupId);
            if (!group || !group.members.has(userId)) {
                return callback({ success: false, error: 'Accès refusé' });
            }

            const user = users.get(userId);
            const messageData = {
                id: generateId('gmsg'),
                userId,
                username: user.username,
                message: sanitizeMessage(message),
                timestamp: new Date()
            };

            group.messages.push(messageData);

            // Envoyer à tous les membres
            io.to(`group_${groupId}`).emit('group:message', messageData);

            callback({ success: true, messageId: messageData.id });
        } catch (error) {
            console.error('❌ Erreur message groupe:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Liste des groupes actifs
    socket.on('group:list', (data, callback) => {
        try {
            const groupsList = Array.from(activeGroups.values()).map(g => ({
                id: g.id,
                name: g.name,
                description: g.description,
                memberCount: g.members.size,
                createdBy: g.createdByUsername
            }));

            callback({ success: true, groups: groupsList });
        } catch (error) {
            console.error('❌ Erreur liste groupes:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Déconnexion
    socket.on('disconnect', () => {
        const userId = activeSockets.get(socket.id);

        if (userId) {
            const user = users.get(userId);
            console.log(`👋 Déconnexion: ${user?.username || 'Inconnu'}`);

            // Nettoyer les files d'attente
            waitingQueues.chat.delete(userId);
            waitingQueues.video.delete(userId);

            // Retirer des groupes
            activeGroups.forEach((group, groupId) => {
                if (group.members.has(userId)) {
                    group.members.delete(userId);
                    io.to(`group_${groupId}`).emit('group:userLeft', {
                        userId,
                        username: user?.username,
                        memberCount: group.members.size
                    });

                    // Supprimer le groupe s'il est vide
                    if (group.members.size === 0) {
                        activeGroups.delete(groupId);
                    }
                }
            });

            // Nettoyer les sessions de chat
            chatSessions.forEach((session, sessionId) => {
                if (session.user1.id === userId || session.user2.id === userId) {
                    session.status = 'ended';
                    io.to(`chat_${sessionId}`).emit('chat:ended', { reason: 'disconnect' });
                    setTimeout(() => chatSessions.delete(sessionId), 5000);
                }
            });

            // Supprimer l'utilisateur
            users.delete(userId);
            activeSockets.delete(socket.id);

            // Broadcast stats
            io.emit('stats:update', {
                onlineUsers: users.size
            });
        }
    });
});

// Route catch-all pour le SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════╗
    ║     🚀 SERVEUR LEBEKOO DÉMARRÉ       ║
    ║     Port: ${PORT}                         ║
    ║     Mode: ${process.env.NODE_ENV || 'development'}            ║
    ║     URL: http://localhost:${PORT}       ║
    ╚══════════════════════════════════════╝
    `);
});