const crypto = require('node:crypto');
const path = require('node:path');

const SUPPORTED_LOCAL_EXTENSIONS = new Set(['.mp4']);

function sourceTypeOf(item = {}) {
  if (item.sourceType === 'local' || item.localPath) return 'local';
  return 'youtube';
}

function normalizeQueueItem(item = {}) {
  const sourceType = sourceTypeOf(item);
  const normalized = { ...item, sourceType };
  if (sourceType === 'youtube') delete normalized.localPath;
  return normalized;
}

function isSupportedLocalPath(filePath) {
  return SUPPORTED_LOCAL_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function localItemId(filePath) {
  const canonical = path.resolve(filePath).toLowerCase();
  return `local-${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 20)}`;
}

module.exports = {
  SUPPORTED_LOCAL_EXTENSIONS,
  sourceTypeOf,
  normalizeQueueItem,
  isSupportedLocalPath,
  localItemId
};
