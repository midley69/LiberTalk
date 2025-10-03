/**
 * Service de Sécurité - LiberTalk
 *
 * Gère la validation, sanitization, rate limiting et protection XSS
 */

class SecurityService {
  private static instance: SecurityService;
  private rateLimitMap: Map<string, { count: number; timestamp: number }> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_REQUESTS = 20; // 20 requêtes par minute

  static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  /**
   * Sanitize input pour prévenir XSS
   */
  sanitizeText(text: string): string {
    if (!text) return '';

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .trim();
  }

  /**
   * Valider pseudo
   */
  validatePseudo(pseudo: string): { valid: boolean; error?: string } {
    if (!pseudo || pseudo.trim().length === 0) {
      return { valid: false, error: 'Le pseudo ne peut pas être vide' };
    }

    const cleaned = this.sanitizeText(pseudo.trim());

    if (cleaned.length < 2) {
      return { valid: false, error: 'Le pseudo doit contenir au moins 2 caractères' };
    }

    if (cleaned.length > 15) {
      return { valid: false, error: 'Le pseudo ne peut pas dépasser 15 caractères' };
    }

    // Seulement lettres, chiffres et underscore
    if (!/^[a-zA-Z0-9_]+$/.test(cleaned)) {
      return { valid: false, error: 'Le pseudo ne peut contenir que des lettres, chiffres et _' };
    }

    // Vérifier les mots interdits
    const forbiddenWords = ['admin', 'mod', 'moderator', 'system', 'bot', 'libekoo', 'libertalk'];
    const lowerPseudo = cleaned.toLowerCase();

    if (forbiddenWords.some(word => lowerPseudo.includes(word))) {
      return { valid: false, error: 'Ce pseudo contient des mots réservés' };
    }

    return { valid: true };
  }

  /**
   * Valider message
   */
  validateMessage(message: string): { valid: boolean; error?: string } {
    if (!message || message.trim().length === 0) {
      return { valid: false, error: 'Le message ne peut pas être vide' };
    }

    const cleaned = this.sanitizeText(message.trim());

    if (cleaned.length < 1) {
      return { valid: false, error: 'Le message est trop court' };
    }

    if (cleaned.length > 500) {
      return { valid: false, error: 'Le message ne peut pas dépasser 500 caractères' };
    }

    // Vérifier spam (caractères répétés)
    if (/(.)\1{9,}/.test(cleaned)) {
      return { valid: false, error: 'Message considéré comme spam (caractères répétés)' };
    }

    // Vérifier majuscules excessives
    const uppercaseRatio = (cleaned.match(/[A-Z]/g) || []).length / cleaned.length;
    if (cleaned.length > 10 && uppercaseRatio > 0.7) {
      return { valid: false, error: 'Évitez d\'écrire entièrement en majuscules' };
    }

    return { valid: true };
  }

  /**
   * Valider nom de groupe
   */
  validateGroupName(name: string): { valid: boolean; error?: string } {
    if (!name || name.trim().length === 0) {
      return { valid: false, error: 'Le nom du groupe ne peut pas être vide' };
    }

    const cleaned = this.sanitizeText(name.trim());

    if (cleaned.length < 3) {
      return { valid: false, error: 'Le nom doit contenir au moins 3 caractères' };
    }

    if (cleaned.length > 50) {
      return { valid: false, error: 'Le nom ne peut pas dépasser 50 caractères' };
    }

    return { valid: true };
  }

  /**
   * Valider description de groupe
   */
  validateGroupDescription(description: string): { valid: boolean; error?: string } {
    if (!description || description.trim().length === 0) {
      return { valid: false, error: 'La description ne peut pas être vide' };
    }

    const cleaned = this.sanitizeText(description.trim());

    if (cleaned.length < 10) {
      return { valid: false, error: 'La description doit contenir au moins 10 caractères' };
    }

    if (cleaned.length > 200) {
      return { valid: false, error: 'La description ne peut pas dépasser 200 caractères' };
    }

    return { valid: true };
  }

  /**
   * Rate limiting - Vérifier si l'utilisateur peut effectuer une action
   */
  checkRateLimit(userId: string): { allowed: boolean; remainingTime?: number } {
    const now = Date.now();
    const userLimit = this.rateLimitMap.get(userId);

    if (!userLimit) {
      this.rateLimitMap.set(userId, { count: 1, timestamp: now });
      return { allowed: true };
    }

    const timeSinceFirst = now - userLimit.timestamp;

    if (timeSinceFirst > this.RATE_LIMIT_WINDOW) {
      this.rateLimitMap.set(userId, { count: 1, timestamp: now });
      return { allowed: true };
    }

    if (userLimit.count >= this.MAX_REQUESTS) {
      const remainingTime = Math.ceil((this.RATE_LIMIT_WINDOW - timeSinceFirst) / 1000);
      return { allowed: false, remainingTime };
    }

    userLimit.count++;
    return { allowed: true };
  }

  /**
   * Détecter contenu inapproprié
   */
  detectInappropriateContent(text: string): boolean {
    const inappropriatePatterns = [
      // Insultes courantes
      /\b(con|pute|salope|enculé|connard|bâtard|fdp)\b/i,

      // Contenu sexuel explicite
      /\b(sexe|nudes?|penis|vagin|seins?|cul)\b/i,

      // URLs suspectes
      /\b(https?:\/\/|www\.)[^\s]+/i,

      // Numéros de téléphone
      /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,

      // Emails
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    ];

    return inappropriatePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Filtrer message potentiellement inapproprié
   */
  filterMessage(message: string): { filtered: string; flagged: boolean } {
    const flagged = this.detectInappropriateContent(message);

    if (!flagged) {
      return { filtered: this.sanitizeText(message), flagged: false };
    }

    // Masquer les contenus inappropriés
    let filtered = this.sanitizeText(message);

    // Masquer URLs
    filtered = filtered.replace(/https?:\/\/[^\s]+/gi, '[LIEN]');

    // Masquer emails
    filtered = filtered.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, '[EMAIL]');

    // Masquer numéros de téléphone
    filtered = filtered.replace(/\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[TEL]');

    return { filtered, flagged: true };
  }

  /**
   * Générer un token sécurisé
   */
  generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';

    for (let i = 0; i < length; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return token;
  }

  /**
   * Vérifier la force d'un mot de passe (pour comptes utilisateurs)
   */
  validatePasswordStrength(password: string): {
    valid: boolean;
    score: number;
    feedback: string[]
  } {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (password.length < 8) {
      feedback.push('Minimum 8 caractères requis');
    }
    if (!/[a-z]/.test(password)) {
      feedback.push('Ajoutez des minuscules');
    }
    if (!/[A-Z]/.test(password)) {
      feedback.push('Ajoutez des majuscules');
    }
    if (!/[0-9]/.test(password)) {
      feedback.push('Ajoutez des chiffres');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      feedback.push('Ajoutez des caractères spéciaux');
    }

    return {
      valid: score >= 4,
      score,
      feedback
    };
  }

  /**
   * Nettoyer périodiquement la map de rate limiting
   */
  cleanupRateLimitMap(): void {
    const now = Date.now();

    for (const [userId, limit] of this.rateLimitMap.entries()) {
      if (now - limit.timestamp > this.RATE_LIMIT_WINDOW * 2) {
        this.rateLimitMap.delete(userId);
      }
    }
  }

  /**
   * Logger une activité suspecte
   */
  logSuspiciousActivity(userId: string, activity: string, details?: any): void {
    const log = {
      timestamp: new Date().toISOString(),
      userId,
      activity,
      details: details || {},
      userAgent: navigator.userAgent
    };

    console.warn('🚨 Activité suspecte détectée:', log);

    // En production, envoyer à un service de monitoring
    // ou sauvegarder dans une table de logs
  }
}

export default SecurityService;
