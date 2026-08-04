(function exposeQueuePolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.saovivoQueuePolicy = policy;
})(typeof window !== 'undefined' ? window : globalThis, function createQueuePolicy() {
  return {
    editingAfterRemoval(queue) {
      return Array.isArray(queue) && queue.length > 0;
    },
    removeAll(queue, { streaming = false, activeIndex = -1 } = {}) {
      if (!streaming) return [];
      const active = Array.isArray(queue) ? queue[activeIndex] : null;
      return active ? [active] : [];
    },
    sourceLabel(item = {}) {
      if (item.sourceType === 'local' || item.localPath) return 'LOCAL';
      if (item.isLive) return 'YOUTUBE LIVE';
      if (item.isShort || item.isVertical) return 'YOUTUBE SHORT';
      return 'YOUTUBE';
    },
    formatClock(seconds) {
      const total = Math.max(0, Math.round(Number(seconds) || 0));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      return hours
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${minutes}:${String(secs).padStart(2, '0')}`;
    },
    durationLabel(item = {}) {
      return item.isLive ? 'VIVO' : this.formatClock(item.duration);
    },
    queueSummary(queue = []) {
      const items = Array.isArray(queue) ? queue : [];
      return {
        hasLive: items.some((item) => item.isLive),
        duration: items.reduce((sum, item) => sum + (Number(item.duration) || 0), 0)
      };
    }
  };
});
