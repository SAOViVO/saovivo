const test = require('node:test');
const assert = require('node:assert/strict');

// Electron is not loaded in this focused unit test; these cases document the
// URL boundary used by the desktop app.
function isYouTube(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return ['http:', 'https:'].includes(url.protocol) &&
      (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be');
  } catch { return false; }
}

test('accepts video and playlist links from YouTube', () => {
  assert.equal(isYouTube('https://youtu.be/dQw4w9WgXcQ'), true);
  assert.equal(isYouTube('https://www.youtube.com/playlist?list=PL123'), true);
  assert.equal(isYouTube('https://music.youtube.com/watch?v=abc'), true);
});

test('rejects lookalike and unrelated hosts', () => {
  assert.equal(isYouTube('https://youtube.com.example.test/watch?v=abc'), false);
  assert.equal(isYouTube('https://example.com/video'), false);
  assert.equal(isYouTube('not a url'), false);
});
