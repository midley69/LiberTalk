# 🧪 Instructions de Test - Connexions Utilisateurs

## ✅ BUILD RÉUSSI
```
✓ 1563 modules transformed
dist/assets/index.js   374.65 kB │ gzip: 103.19 kB
✓ built in 4.46s
```

---

## 🚨 IMPORTANT: Appliquer la Migration SQL D'ABORD !

**AVANT de tester**, vous DEVEZ appliquer la migration critique dans Supabase !

### Étapes pour Appliquer la Migration

1. **Allez sur Supabase Dashboard**
   - https://supabase.com/dashboard
   - Sélectionnez votre projet

2. **Ouvrez SQL Editor**
   - Menu de gauche → "SQL Editor"
   - Cliquez "New query"

3. **Copiez la Migration**
   - Ouvrez le fichier : `supabase/migrations/20251003095000_fix_matching_race_condition.sql`
   - Copiez TOUT le contenu

4. **Exécutez**
   - Collez dans SQL Editor
   - Cliquez "Run" ou Ctrl+Enter

5. **Vérifiez**
   ```sql
   -- Vérifier que la fonction contient le lock atomique
   SELECT prosrc FROM pg_proc WHERE proname = 'find_random_chat_partner';

   -- Devrait contenir "FOR UPDATE SKIP LOCKED"
   ```

**Si vous ne faites PAS cette étape, les connexions NE FONCTIONNERONT PAS !**

---

## 🧪 Test 1: Connexion de 2 Utilisateurs (TEST DE BASE)

### But
Vérifier que 2 utilisateurs peuvent se connecter ensemble.

### Procédure

1. **Démarrer le serveur**
   ```bash
   npm run dev
   ```

2. **Onglet 1** (Chrome)
   - Ouvrez http://localhost:5173
   - Cliquez "Chat Randomisé"
   - Pseudo: "Alice"
   - Cliquez "Démarrer le chat"
   - **Attendez** (vous devriez voir "Recherche partenaire...")

3. **Onglet 2** (Chrome Mode Navigation Privée ou Firefox)
   - Ouvrez http://localhost:5173
   - Cliquez "Chat Randomisé"
   - Pseudo: "Bob"
   - Cliquez "Démarrer le chat"

### Résultat Attendu ✅

**Onglet 1 (Alice)**:
```
Console:
🔍 Recherche partenaire RÉEL - Tentative 1/15
✅ VRAI partenaire trouvé: { partner_user_id: "...", partner_pseudo: "Bob" }
✅ Session créée avec VRAI utilisateur: [uuid]
📨 Nouveau message reçu: "✨ Vous êtes maintenant connectés !"
```

**Onglet 2 (Bob)**:
```
Console:
✅ Correspondance RÉELLE créée
📨 Message système reçu
```

**Interface**:
- Les deux voient le chat
- Un message système "Vous êtes maintenant connectés !"
- Peuvent s'envoyer des messages

**Durée**: ~3-5 secondes max

---

## 🧪 Test 2: 3 Utilisateurs Simultanés

### But
Vérifier que 3 utilisateurs forment 1 paire + 1 en attente.

### Procédure

1. **Ouvrez 3 onglets** (Chrome, Firefox, Edge ou 3 profils Chrome)

2. **Dans les 3 onglets EN MÊME TEMPS** (le plus vite possible):
   - Chat Randomisé
   - Pseudos: "User1", "User2", "User3"
   - Démarrer le chat

### Résultat Attendu ✅

- **2 utilisateurs** se connectent ensemble (ex: User1 ↔ User2)
- **1 utilisateur** reste en recherche (ex: User3)
- Console User3:
  ```
  🔍 Recherche partenaire RÉEL - Tentative 1/15
  ❌ Aucun VRAI partenaire trouvé - Tentative 1/15
  ⏳ Attente avant nouvelle tentative...
  🔍 Recherche partenaire RÉEL - Tentative 2/15
  ...
  ```

3. **User1 ou User2 clique "Next"**
   - Se déconnecte
   - Retourne en recherche

4. **User3 trouve le partenaire qui vient de cliquer "Next"**

---

## 🧪 Test 3: Race Condition (TEST AVANCÉ)

### But
Vérifier que le système gère correctement les conflits simultanés.

### Procédure

1. **Ouvrez 4 onglets**
2. **Préparez les 4** (pseudos saisis, sur page chat)
3. **Cliquez "Démarrer" SIMULTANÉMENT** dans les 4 onglets (même seconde)

### Résultat Attendu ✅

**Option 1** (IDÉAL):
- 2 paires se forment: User1↔User2 ET User3↔User4

**Option 2** (Acceptable):
- 1 paire: User1↔User2
- 1 race condition gérée:
  ```
  User3:
  ✅ VRAI partenaire trouvé: User4
  ❌ Erreur création session (race condition)
  🔄 Le partenaire a été pris par quelqu'un d'autre, nouvelle tentative...
  ```
- User3 et User4 se reconnectent ensemble après retry

**PAS D'ERREUR FATALE** = SUCCESS ✅

---

## 🐛 Debugging

### Console Browser

**Ouvrez TOUJOURS la console** (F12) pendant les tests.

#### Connexion Réussie ✅
```
🔄 Démarrage du chat randomisé...
✅ Utilisateur créé: { user_id: "...", pseudo: "Alice", status: "en_attente" }
🔍 Recherche partenaire RÉEL - Tentative 1/15
✅ VRAI partenaire trouvé
✅ Session créée avec VRAI utilisateur
```

#### Aucun Utilisateur (Normal)
```
🔍 Recherche partenaire RÉEL - Tentative 1/15
❌ Aucun VRAI partenaire trouvé - Tentative 1/15
⏳ Attente avant nouvelle tentative...
```

#### Race Condition Gérée ✅
```
✅ VRAI partenaire trouvé: { partner_user_id: "..." }
❌ Erreur création session (race condition): Un utilisateur n'est plus en attente
🔄 Le partenaire a été pris par quelqu'un d'autre, nouvelle tentative...
```

#### ERREUR (Problème)
```
❌ Erreur création utilisateur: [détails]
→ Problème: .env mal configuré ou migration non appliquée
```

### Vérifier Base de Données

Dans Supabase Dashboard → Table Editor:

#### random_chat_users
```sql
SELECT user_id, pseudo, status, last_seen
FROM random_chat_users
ORDER BY last_seen DESC;
```

**Attendu**: Voir vos utilisateurs avec status 'en_attente' ou 'connecte'

#### random_chat_sessions
```sql
SELECT
  user1_pseudo || ' ↔ ' || user2_pseudo as connection,
  status,
  started_at
FROM random_chat_sessions
WHERE status = 'active'
ORDER BY started_at DESC;
```

**Attendu**: Voir sessions actives entre vos utilisateurs de test

---

## ❌ Problèmes Fréquents

### "Aucun utilisateur disponible" mais j'ai 2 onglets ouverts

**Cause**: Les deux cherchent mais ne se trouvent pas.

**Solution**:
1. Vérifier console → Chercher erreurs
2. Vérifier DB → Les users sont-ils en status 'en_attente' ?
3. Vérifier migration appliquée → La fonction contient-elle `FOR UPDATE SKIP LOCKED` ?

### "Erreur création session" répété

**Cause**: Race condition persistante (migration non appliquée ou partiellement).

**Solution**:
1. Réappliquer la migration SQL complète
2. Vérifier les fonctions:
   ```sql
   SELECT proname, prosrc FROM pg_proc WHERE proname LIKE '%chat%';
   ```

### Un utilisateur reste bloqué en "Recherche"

**Cause**: Utilisateur en base avec mauvais status.

**Solution**:
```sql
-- Nettoyer utilisateurs bloqués
DELETE FROM random_chat_users WHERE last_seen < NOW() - INTERVAL '5 minutes';

-- Ou réinitialiser tous
UPDATE random_chat_users SET status = 'en_attente', search_started_at = NOW();
```

---

## 📊 Métriques de Succès

### ✅ Test Réussi Si:
- [ ] 2 onglets se connectent en moins de 5 secondes
- [ ] Console montre "Session créée avec VRAI utilisateur"
- [ ] Messages système apparaissent
- [ ] Peut envoyer/recevoir messages
- [ ] Aucune erreur rouge dans console
- [ ] DB montre session active

### ❌ Test Échoué Si:
- [ ] Timeout après 15 tentatives
- [ ] Erreur "relation does not exist"
- [ ] Erreur "permission denied"
- [ ] Utilisateurs ne se matchent JAMAIS
- [ ] Erreurs SQL dans console

---

## 🎯 Prochaines Étapes Après Tests Réussis

1. **Déployer** sur Vercel/Netlify avec Supabase production
2. **Monitorer** les logs Supabase
3. **Tester** avec vrais utilisateurs (amis/famille)
4. **Ajuster** délais/tentatives selon usage réel

---

## 📞 Support

### Logs à Partager Si Problème

1. **Console navigateur** (copier tout)
2. **Requête SQL**:
   ```sql
   SELECT * FROM random_chat_users ORDER BY last_seen DESC LIMIT 10;
   SELECT * FROM random_chat_sessions ORDER BY started_at DESC LIMIT 5;
   ```
3. **Version fonction**:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'create_random_chat_session';
   ```

---

## ✅ Checklist Avant Test

- [ ] Migration SQL appliquée dans Supabase
- [ ] Fichier .env configuré (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
- [ ] `npm run dev` en cours
- [ ] Console browser ouverte (F12)
- [ ] 2+ onglets/navigateurs prêts

**TOUT EST PRÊT !** Testez maintenant ! 🚀
