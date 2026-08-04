(function exposeFeedbackPolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.saovivoFeedback = policy;
})(typeof window !== 'undefined' ? window : globalThis, function createFeedbackPolicy() {
  const minorPatterns = [
    /pegá un link válido/i,
    /acepta solamente links de youtube/i,
    /primero guardá tu stream key/i,
    /agregá al menos un video/i
  ];

  return {
    destinationFor(message) {
      return minorPatterns.some((pattern) => pattern.test(String(message || ''))) ? 'toast' : 'output';
    }
  };
});
