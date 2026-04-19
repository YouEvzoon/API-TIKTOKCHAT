const { WebcastPushConnection } = require('tiktok-live-connector');
const {
  maxRecentMessages,
  reconnectBaseMs,
  reconnectMaxMs,
  maxRetriesBeforePause,
  pauseAfterMaxRetriesMs,
  reconnectJitterRatio,
  normalizeText
} = require('../config');
const { toStreamerId } = require('../utils/text');

function nowIso() {
  return new Date().toISOString();
}

function getReconnectDelayMs(attempt) {
  const exponential = Math.min(reconnectMaxMs, reconnectBaseMs * (2 ** Math.max(attempt - 1, 0)));
  const jitterRange = Math.floor(exponential * reconnectJitterRatio);
  const jitter = jitterRange > 0 ? Math.floor((Math.random() * (jitterRange * 2 + 1)) - jitterRange) : 0;
  return Math.max(reconnectBaseMs, exponential + jitter);
}

function isFatalConnectError(error) {
  const message = String(error && error.message ? error.message : error || '').toLowerCase();
  return (
    message.includes('user_not_found')
    || message.includes('failed to retrieve room_id from page source')
    || message.includes('api error 19881007')
  );
}

class StreamerManager {
  constructor() {
    this.streamers = new Map();
    this.chatListeners = new Set();
    this.likeListeners = new Set();
  }

  onChat(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    this.chatListeners.add(listener);
    return () => {
      this.chatListeners.delete(listener);
    };
  }

  emitChatMessage(message) {
    for (const listener of this.chatListeners) {
      try {
        listener(message);
      } catch (error) {
        console.error('[socket] Error en listener de chat:', error.message || error);
      }
    }
  }

  onLike(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    this.likeListeners.add(listener);
    return () => {
      this.likeListeners.delete(listener);
    };
  }

  emitLikeMessage(message) {
    for (const listener of this.likeListeners) {
      try {
        listener(message);
      } catch (error) {
        console.error('[socket] Error en listener de like:', error.message || error);
      }
    }
  }

  list() {
    return Array.from(this.streamers.values()).map(streamer => this.toSummary(streamer));
  }

  get(id) {
    return this.streamers.get(id) || null;
  }

  getDefault() {
    return this.streamers.values().next().value || null;
  }

  create(payload = {}) {
    const username = normalizeText(payload.username).replace(/^@+/, '');
    if (!username) {
      return { error: 'username is required' };
    }

    const id = toStreamerId(payload.id || username);
    if (!id) {
      return { error: 'invalid id' };
    }

    if (this.streamers.has(id)) {
      return { error: 'streamer already exists' };
    }

    const connection = new WebcastPushConnection(username);
    const streamer = {
      id,
      username,
      connection,
      recentMessages: [],
      topTaps: new Map(),
      connected: false,
      reconnectTimer: null,
      reconnectAttempt: 0,
      pausedUntil: 0,
      lastError: null,
      lastEventAt: nowIso()
    };

    this.attachEvents(streamer);
    this.streamers.set(id, streamer);
    return { streamer };
  }

  attachEvents(streamer) {
    streamer.connection.on('chat', data => {
      const user = normalizeText(data.nickname || data.displayName || data.uniqueId || 'anon');
      const text = normalizeText(data.comment);
      if (!text) {
        return;
      }

      const message = {
        streamerId: streamer.id,
        type: 'chat',
        user,
        text,
        createdAt: nowIso()
      };

      this.pushRecentMessage(streamer, message);
      this.emitChatMessage(message);
      streamer.lastEventAt = nowIso();
      console.log(`[${streamer.id}] ${user}: ${text}`);
    });

    streamer.connection.on('like', data => {
      const user = normalizeText(data.nickname || data.displayName || data.uniqueId || data.user?.nickname || data.user?.uniqueId || 'anon');
      const likeCount = Number(data.likeCount || 1);
      if (!Number.isFinite(likeCount) || likeCount <= 0) {
        return;
      }

      this.recordTap(streamer, user, likeCount);

      const message = {
        streamerId: streamer.id,
        type: 'like',
        user,
        likes: likeCount,
        totalLikes: Number(data.totalLikeCount) || null,
        createdAt: nowIso()
      };

      this.emitLikeMessage(message);
      streamer.lastEventAt = nowIso();
      console.log(`[${streamer.id}] ${user} dio ${likeCount} tap(s).`);
    });

    streamer.connection.on('disconnected', () => {
      streamer.connected = false;
      streamer.lastEventAt = nowIso();
      console.warn(`[${streamer.id}] TikTok desconectado.`);
      this.scheduleReconnect(streamer, 'event-disconnected');
    });

    streamer.connection.on('streamEnd', () => {
      streamer.connected = false;
      streamer.lastEventAt = nowIso();
      console.warn(`[${streamer.id}] El directo termino o se cerro la conexion.`);
      this.scheduleReconnect(streamer, 'event-streamEnd');
    });
  }

  pushRecentMessage(streamer, message) {
    streamer.recentMessages.push(message);
    if (streamer.recentMessages.length > maxRecentMessages) {
      streamer.recentMessages.shift();
    }
  }

  recordTap(streamer, user, likeCount) {
    const key = user || 'anon';
    const current = streamer.topTaps.get(key) || { user: key, likes: 0, lastAt: null };
    current.likes += likeCount;
    current.lastAt = nowIso();
    streamer.topTaps.set(key, current);
    return current;
  }

  getTopTaps(streamer, limit = 10) {
    return Array.from(streamer.topTaps.values())
      .sort((left, right) => {
        if (right.likes !== left.likes) {
          return right.likes - left.likes;
        }

        return String(right.lastAt || '').localeCompare(String(left.lastAt || ''));
      })
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        user: entry.user,
        likes: entry.likes,
        lastAt: entry.lastAt
      }));
  }

  clearReconnectTimer(streamer) {
    if (!streamer.reconnectTimer) {
      return;
    }
    clearTimeout(streamer.reconnectTimer);
    streamer.reconnectTimer = null;
  }

  scheduleReconnect(streamer, reason) {
    if (streamer.reconnectTimer) {
      return;
    }

    const now = Date.now();
    if (streamer.pausedUntil && streamer.pausedUntil > now) {
      const pauseMs = streamer.pausedUntil - now;
      console.warn(`[${streamer.id}] En pausa por bloqueos. Reintento en ${Math.round(pauseMs / 1000)}s.`);
      streamer.reconnectTimer = setTimeout(() => {
        streamer.reconnectTimer = null;
        this.connect(streamer, 'pause-ended');
      }, pauseMs);
      return;
    }

    streamer.reconnectAttempt += 1;
    if (streamer.reconnectAttempt >= maxRetriesBeforePause) {
      streamer.pausedUntil = now + pauseAfterMaxRetriesMs;
      streamer.reconnectAttempt = 0;
      console.warn(
        `[${streamer.id}] Se alcanzo el maximo de reintentos. ` +
        `Pausa activa por ${Math.round(pauseAfterMaxRetriesMs / 1000)}s.`
      );
      streamer.reconnectTimer = setTimeout(() => {
        streamer.reconnectTimer = null;
        this.connect(streamer, 'pause-ended');
      }, pauseAfterMaxRetriesMs);
      return;
    }

    const delayMs = getReconnectDelayMs(streamer.reconnectAttempt);
    console.warn(`[${streamer.id}] Reintento #${streamer.reconnectAttempt} en ${Math.round(delayMs / 1000)}s. Motivo: ${reason}`);
    streamer.reconnectTimer = setTimeout(() => {
      streamer.reconnectTimer = null;
      this.connect(streamer, 'scheduled-retry');
    }, delayMs);
  }

  async connect(streamer, reason = 'manual') {
    this.clearReconnectTimer(streamer);

    const now = Date.now();
    if (streamer.pausedUntil && streamer.pausedUntil > now) {
      this.scheduleReconnect(streamer, `still-paused:${reason}`);
      return;
    }

    if (streamer.connected) {
      streamer.lastEventAt = nowIso();
      streamer.lastError = null;
      console.log(`[${streamer.id}] Ya estaba conectado (${reason}).`);
      return;
    }

    console.log(`[${streamer.id}] Conectando a TikTok Live como: ${streamer.username} (${reason})`);

    try {
      const state = await streamer.connection.connect();
      streamer.connected = true;
      streamer.reconnectAttempt = 0;
      streamer.pausedUntil = 0;
      streamer.lastError = null;
      streamer.lastEventAt = nowIso();
      console.log(`[${streamer.id}] Conectado. roomId=${state.roomId}`);
    } catch (error) {
      if (/already connected/i.test(error.message || '')) {
        streamer.connected = true;
        streamer.reconnectAttempt = 0;
        streamer.pausedUntil = 0;
        streamer.lastError = null;
        streamer.lastEventAt = nowIso();
        console.log(`[${streamer.id}] TikTok ya estaba conectado (${reason}).`);
        return;
      }

      if (isFatalConnectError(error)) {
        streamer.connected = false;
        streamer.lastError = error.message || String(error);
        streamer.lastEventAt = nowIso();
        streamer.reconnectAttempt = 0;
        streamer.pausedUntil = 0;
        console.error(`[${streamer.id}] No se pudo conectar a TikTok Live:`, streamer.lastError);
        console.error(
          `[${streamer.id}] Se detuvieron los reintentos automáticos porque el usuario no existe, ` +
          `no es accesible o TikTok devolvio un error fatal.`
        );
        return;
      }

      streamer.connected = false;
      streamer.lastError = error.message || String(error);
      streamer.lastEventAt = nowIso();
      console.error(`[${streamer.id}] No se pudo conectar a TikTok Live:`, streamer.lastError);
      this.scheduleReconnect(streamer, `connect-failed:${reason}`);
    }
  }

  async disconnect(streamer, reason = 'manual') {
    this.clearReconnectTimer(streamer);
    streamer.pausedUntil = 0;
    streamer.reconnectAttempt = 0;

    try {
      await streamer.connection.disconnect();
    } catch (error) {
      console.warn(`[${streamer.id}] Error al desconectar:`, error.message || error);
    }

    streamer.connected = false;
    streamer.lastEventAt = nowIso();
    console.log(`[${streamer.id}] Desconectado (${reason}).`);
  }

  async remove(id) {
    const streamer = this.streamers.get(id);
    if (!streamer) {
      return null;
    }

    await this.disconnect(streamer, 'remove');
    this.streamers.delete(id);
    return streamer;
  }

  async connectById(id, reason = 'manual') {
    const streamer = this.get(id);
    if (!streamer) {
      return null;
    }

    await this.connect(streamer, reason);
    return streamer;
  }

  async disconnectById(id, reason = 'manual') {
    const streamer = this.get(id);
    if (!streamer) {
      return null;
    }

    await this.disconnect(streamer, reason);
    return streamer;
  }

  speakManual(streamer, text) {
    if (!text || !String(text).trim()) {
      return { error: 'text is required' };
    }

    return { error: 'tts moved to frontend' };
  }

  toSummary(streamer) {
    return {
      id: streamer.id,
      username: streamer.username,
      connected: streamer.connected,
      recentMessages: streamer.recentMessages.length,
      topTaps: this.getTopTaps(streamer, 3),
      reconnectAttempt: streamer.reconnectAttempt,
      pausedUntil: streamer.pausedUntil ? new Date(streamer.pausedUntil).toISOString() : null,
      lastError: streamer.lastError,
      lastEventAt: streamer.lastEventAt
    };
  }

  bootstrap(usernames = []) {
    for (const username of usernames) {
      const result = this.create({ username });
      if (result.error) {
        console.error(`No se pudo crear streamer ${username}: ${result.error}`);
        continue;
      }
      this.connect(result.streamer, 'bootstrap');
    }
  }
}

module.exports = {
  StreamerManager
};