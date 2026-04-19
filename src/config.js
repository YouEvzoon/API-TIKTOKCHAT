function normalizeText(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

function readNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

module.exports = {
  normalizeText,
  port: readNumber('PORT', 3000),
  apiKey: normalizeText(process.env.API_KEY),
  chatPollIntervalMs: readNumber('CHAT_POLL_INTERVAL_MS', 8000),
  autoBootstrapUsers: String(process.env.AUTO_BOOTSTRAP_USERS || '').trim().toLowerCase() === 'true',
  speechRate: readNumber('SPEECH_RATE', 1.0),
  maxTextLength: readNumber('MAX_TEXT_LENGTH', 120),
  maxRecentMessages: readNumber('MAX_RECENT_MESSAGES', 100),
  manualSpeakCooldownMs: readNumber('MANUAL_SPEAK_COOLDOWN_MS', 1500),
  reconnectBaseMs: readNumber('RECONNECT_BASE_MS', 15000),
  reconnectMaxMs: readNumber('RECONNECT_MAX_MS', 600000),
  maxRetriesBeforePause: readNumber('MAX_RETRIES_BEFORE_PAUSE', 8),
  pauseAfterMaxRetriesMs: readNumber('PAUSE_AFTER_MAX_RETRIES_MS', 1800000),
  reconnectJitterRatio: readNumber('RECONNECT_JITTER_RATIO', 0.2),
  initialUsernames: normalizeText(process.env.TIKTOK_USERNAMES),
  initialUsername: normalizeText(process.env.TIKTOK_USERNAME || process.argv[2])
};