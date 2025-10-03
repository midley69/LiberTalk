# 🚀 Migration Complète - SANS Supabase (Option B)

## Vue d'Ensemble

Cette migration remplace **COMPLÈTEMENT** Supabase par une architecture locale:
- **Backend**: Node.js + Express
- **Base de données**: PostgreSQL local
- **Temps réel**: Socket.io
- **Frontend**: React (modifié pour appeler l'API locale)

---

## 📋 Prérequis

### 1. PostgreSQL
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS
brew install postgresql
brew services start postgresql

# Windows
# Télécharger: https://www.postgresql.org/download/windows/
```

### 2. Node.js 18+
```bash
node --version  # Doit être >= 18
```

---

## 🗄️ ÉTAPE 1: Configuration PostgreSQL

### Créer Base de Données et Utilisateur

```bash
# Se connecter à PostgreSQL
sudo -u postgres psql

# Dans le prompt PostgreSQL:
```

```sql
-- Créer utilisateur
CREATE USER libekoo_user WITH PASSWORD 'votre_mot_de_passe_securise';

-- Créer base de données
CREATE DATABASE libekoo_db OWNER libekoo_user;

-- Donner tous les droits
GRANT ALL PRIVILEGES ON DATABASE libekoo_db TO libekoo_user;

-- Se connecter à la nouvelle DB
\c libekoo_db

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Quitter
\q
```

### Vérifier la Connexion

```bash
psql -h localhost -U libekoo_user -d libekoo_db -c "SELECT version();"
```

---

## 🛠️ ÉTAPE 2: Appliquer les Migrations SQL

### Toutes les Migrations

Les migrations sont dans `supabase/migrations/`. Appliquez-les **dans l'ordre**:

```bash
cd /tmp/cc-agent/50089688/project

# Appliquer TOUTES les migrations
for file in supabase/migrations/*.sql; do
  echo "Applying: $file"
  psql -h localhost -U libekoo_user -d libekoo_db -f "$file"
done
```

### Vérifier les Tables

```bash
psql -h localhost -U libekoo_user -d libekoo_db -c "\dt"
```

Devrait afficher:
- random_chat_users
- random_chat_sessions
- random_chat_messages
- deleted_messages_archive
- online_users
- groups
- user_reports
- moderators
- moderation_actions

---

## 📦 ÉTAPE 3: Installer le Backend

### Installation

```bash
cd server

# Installer les dépendances
npm install
```

### Configuration

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer .env
nano .env
```

**Configurer `.env`**:
```env
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=libekoo_db
DB_USER=libekoo_user
DB_PASSWORD=votre_mot_de_passe

# Serveur
PORT=3001
NODE_ENV=development

# Sécurité
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)

# CORS
FRONTEND_URL=http://localhost:5173

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000
```

### Tester le Backend

```bash
npm run dev
```

Devrait afficher:
```
✅ Connexion PostgreSQL établie
🚀 Serveur LiberTalk démarré
📡 API: http://localhost:3001
🔌 WebSocket: ws://localhost:3001
```

**Test API**:
```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"..."}
```

---

## ⚛️ ÉTAPE 4: Modifier le Frontend

### Créer un Client API Local

Créez `src/lib/localApi.ts`:

```typescript
import io from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Client Socket.io
export const socket = io(API_URL);

// API Client
export const api = {
  // Random Chat
  async createUser(data: { pseudo: string; genre: string; autoswitchEnabled: boolean; preferredGender?: string }) {
    const res = await fetch(`${API_URL}/api/random-chat/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async findPartner(userId: string, locationFilter?: string) {
    const res = await fetch(`${API_URL}/api/random-chat/find-partner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, locationFilter })
    });
    return res.json();
  },

  async createSession(data: any) {
    const res = await fetch(`${API_URL}/api/random-chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.status === 409) {
      throw new Error('race_condition');
    }

    return res.json();
  },

  async loadMessages(sessionId: string) {
    const res = await fetch(`${API_URL}/api/random-chat/sessions/${sessionId}/messages`);
    return res.json();
  },

  async endSession(sessionId: string, userId: string, reason: string) {
    const res = await fetch(`${API_URL}/api/random-chat/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason })
    });
    return res.json();
  },

  async getWaitingCount() {
    const res = await fetch(`${API_URL}/api/random-chat/waiting-count`);
    return res.json();
  },

  // Groups
  async getGroups() {
    const res = await fetch(`${API_URL}/api/groups`);
    return res.json();
  },

  async createGroup(data: any) {
    const res = await fetch(`${API_URL}/api/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async joinGroup(groupId: string) {
    const res = await fetch(`${API_URL}/api/groups/${groupId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  },

  async leaveGroup(groupId: string) {
    const res = await fetch(`${API_URL}/api/groups/${groupId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  }
};

// WebSocket helpers
export const socketManager = {
  register(userId: string, sessionId: string) {
    socket.emit('register', { userId, sessionId });
  },

  sendMessage(data: any) {
    socket.emit('send_message', data);
  },

  onNewMessage(callback: (message: any) => void) {
    socket.on('new_message', callback);
  },

  onSessionEnded(callback: (data: any) => void) {
    socket.on('session_ended', callback);
  },

  leaveSession(sessionId: string, userId: string, reason: string) {
    socket.emit('leave_session', { sessionId, userId, reason });
  },

  heartbeat(userId: string) {
    socket.emit('heartbeat', { userId });
  },

  disconnect() {
    socket.disconnect();
  }
};
```

### Installer Socket.io Client

```bash
npm install socket.io-client
```

### Modifier RandomChatPage pour utiliser l'API locale

Remplacez tous les appels `supabase.rpc()` par `api.xxx()`:

```typescript
// AVANT
const { data, error } = await supabase.rpc('find_random_chat_partner', {...});

// APRÈS
const partner = await api.findPartner(userId, locationFilter);
```

---

## 🔧 ÉTAPE 5: Configuration Finale

### Frontend .env

```env
VITE_API_URL=http://localhost:3001
```

### Package.json Scripts

Ajoutez dans `package.json` racine:
```json
{
  "scripts": {
    "dev:server": "cd server && npm run dev",
    "dev:client": "vite",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "build": "vite build"
  }
}
```

Installez `concurrently`:
```bash
npm install --save-dev concurrently
```

---

## 🧪 ÉTAPE 6: Tests

### Démarrer TOUT

```bash
# Terminal 1: Backend
cd server
npm run dev

# Terminal 2: Frontend
npm run dev
```

### Test de Connexion

1. **Onglet 1**: http://localhost:5173
   - Chat Randomisé
   - Pseudo: "Alice"
   - Démarrer

2. **Onglet 2**: http://localhost:5173
   - Chat Randomisé
   - Pseudo: "Bob"
   - Démarrer

**Résultat attendu**: Alice ↔ Bob connectés en 3-5s !

### Vérifier WebSocket

Console browser devrait montrer:
```
🔌 Client connecté: [socket-id]
✅ User [id] enregistré dans session [session-id]
📨 Message envoyé dans session [session-id]
```

### Vérifier DB

```sql
-- Voir utilisateurs
SELECT user_id, pseudo, status FROM random_chat_users;

-- Voir sessions
SELECT user1_pseudo || ' ↔ ' || user2_pseudo as connection, status
FROM random_chat_sessions;

-- Voir messages
SELECT sender_pseudo, message_text, sent_at
FROM random_chat_messages
ORDER BY sent_at DESC LIMIT 10;
```

---

## 🚀 ÉTAPE 7: Production

### Build Frontend

```bash
npm run build
# Fichiers dans dist/
```

### Servir avec Nginx

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    # Frontend (React)
    location / {
        root /var/www/libekoo/dist;
        try_files $uri /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

### PM2 pour le Backend

```bash
npm install -g pm2

cd server
pm2 start server.js --name libekoo-backend
pm2 save
pm2 startup
```

---

## 📊 Monitoring

### Logs Backend

```bash
pm2 logs libekoo-backend
```

### Logs PostgreSQL

```bash
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Stats Temps Réel

```bash
curl http://localhost:3001/api/stats
```

---

## ✅ Checklist Migration

### Backend
- [ ] PostgreSQL installé et configuré
- [ ] Base de données créée
- [ ] Migrations SQL appliquées
- [ ] Tables vérifiées (\dt)
- [ ] Fonctions vérifiées (\df)
- [ ] Backend Node.js installé
- [ ] .env configuré
- [ ] Backend démarre sans erreur
- [ ] API répond à /health

### Frontend
- [ ] socket.io-client installé
- [ ] src/lib/localApi.ts créé
- [ ] RandomChatPage modifié
- [ ] .env VITE_API_URL configuré
- [ ] Build compile

### Tests
- [ ] 2 onglets se connectent
- [ ] Messages temps réel fonctionnent
- [ ] WebSocket actif
- [ ] DB enregistre les messages
- [ ] Déconnexion propre

---

## 🎉 Résultat

**APPLICATION 100% LOCALE !**

- ✅ Aucune dépendance Supabase
- ✅ Contrôle total de la base de données
- ✅ Temps réel avec Socket.io
- ✅ Déployable n'importe où
- ✅ Gratuit, pas de limites

**Vous êtes maintenant complètement indépendant !** 🚀
