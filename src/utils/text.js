const { maxTextLength, normalizeText } = require('../config');

function toStreamerId(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

function sanitizeForSpeech(text) {
  const cleaned = normalizeText(text)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[@#][\w.-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return '';
  }

  return cleaned.length > maxTextLength
    ? `${cleaned.slice(0, maxTextLength).trimEnd()}...`
    : cleaned;
}

module.exports = {
  toStreamerId,
  sanitizeForSpeech
};