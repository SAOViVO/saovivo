const state = {
  queue: [],
  streamKey: '',
  loop: true,
  editing: false,
  streaming: false,
  preparing: false,
  ingestingYouTube: false,
  signalLive: false,
  youtubeStudioReminderShown: false,
  readySignature: '',
  activeIndex: -1,
  notifications: []
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  addForm: $('#addForm'), urlInput: $('#urlInput'), addButton: $('#addButton'), addLocalButton: $('#addLocalButton'),
  queueList: $('#queueList'), emptyState: $('#emptyState'),
  queueDuration: $('#queueDuration'), queueFooterCount: $('#queueFooterCount'), modifyButton: $('#modifyButton'), loopButton: $('#loopButton'),
  streamButton: $('#streamButton'), previousButton: $('#previousButton'), nextButton: $('#nextButton'), settingsButton: $('#settingsButton'),
  settingsModal: $('#settingsModal'), closeSettings: $('#closeSettings'), streamKeyInput: $('#streamKeyInput'),
  toggleKey: $('#toggleKey'), saveSettings: $('#saveSettings'), notificationList: $('#notificationList'),
  notificationsEmpty: $('#notificationsEmpty'), clearNotifications: $('#clearNotifications'),
  nowPlaying: $('#nowPlaying'), nowPlayingImage: $('#nowPlayingImage'), nowPlayingPlaceholder: $('#nowPlayingPlaceholder'), nowPlayingTitle: $('#nowPlayingTitle'),
  videoProgress: $('#videoProgress'), videoTime: $('#videoTime'), toast: $('#toast'), openDataFolder: $('#openDataFolder'),
  operationalAlert: $('#operationalAlert'), operationalAlertLabel: $('#operationalAlertLabel'),
  operationalAlertMessage: $('#operationalAlertMessage'), dismissOperationalAlert: $('#dismissOperationalAlert'),
  mediaConfirmModal: $('#mediaConfirmModal'), mediaConfirmTitle: $('#mediaConfirmTitle'), mediaConfirmMessage: $('#mediaConfirmMessage'),
  cancelMedia: $('#cancelMedia'), acceptMedia: $('#acceptMedia'),
  stopConfirmModal: $('#stopConfirmModal'), continueStream: $('#continueStream'), confirmStop: $('#confirmStop'), appVersion: $('#appVersion')
};

function formatDuration(seconds, compact = false) {
  seconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (compact) return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
  if (hours) return `${hours} H ${minutes} MIN`;
  if (minutes) return `${minutes} MIN ${secs ? `${secs} SEG` : ''}`.trim();
  return `${secs} SEG`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function friendlyError(error) {
  return String(error?.message || error || 'Ocurrió un problema.')
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '');
}

function bufferIsReady() {
  const required = state.queue.slice(0, Math.min(3, state.queue.length));
  return required.length > 0 && required.every((item) => item.prepareStatus === 'ready');
}

function maybeNotifyReady() {
  if (state.ingestingYouTube || !state.streamKey || !bufferIsReady()) return;
  const signature = state.queue.slice(0, 3).map((item) => item.id).join('|');
  if (signature === state.readySignature) return;
  state.readySignature = signature;
  addNotification({ type: 'success', message: 'Buffer inicial preparado. Listo para transmitir.', at: new Date().toISOString() });
}

function render() {
  const summary = window.saovivoQueuePolicy.queueSummary(state.queue);
  const total = summary.duration;
  const hasLiveSource = summary.hasLive;
  if (!state.queue.length && state.editing) state.editing = false;
  const requiredCount = Math.min(3, state.queue.length);
  const bufferItems = state.queue.slice(0, requiredCount);
  const readyCount = bufferItems.filter((item) => item.prepareStatus === 'ready').length;
  const hasErrors = bufferItems.some((item) => item.prepareStatus === 'error');
  const ready = bufferIsReady();
  if (hasLiveSource) {
    elements.queueDuration.innerHTML = `<b class="summary-live-plus">+</b><b class="summary-live-badge">LIVE</b><b class="summary-live-separator">-</b><b class="summary-live-time">${window.saovivoQueuePolicy.formatClock(total)}</b>`;
  } else elements.queueDuration.textContent = formatDuration(total);
  elements.queueFooterCount.textContent = `${state.queue.length} ${state.queue.length === 1 ? 'VIDEO' : 'VIDEOS'}`;
  elements.emptyState.classList.toggle('hidden', state.queue.length > 0);
  elements.queueList.style.display = state.queue.length ? 'block' : 'none';
  elements.modifyButton.disabled = state.ingestingYouTube || !state.queue.length;
  elements.modifyButton.classList.toggle('editing', state.editing);
  elements.modifyButton.querySelector('span').textContent = state.editing ? 'DONE' : 'MODIFY STACK';
  elements.urlInput.disabled = state.editing || state.ingestingYouTube;
  elements.addButton.disabled = state.editing || state.ingestingYouTube;
  elements.addLocalButton.disabled = state.editing || state.ingestingYouTube;
  elements.loopButton.disabled = !state.queue.length && !state.streaming;
  elements.loopButton.classList.toggle('active', state.loop);
  elements.loopButton.setAttribute('aria-pressed', String(state.loop));
  elements.loopButton.querySelector('span').textContent = state.loop ? 'LOOP ON' : 'LOOP OFF';
  elements.previousButton.disabled = !state.streaming || state.preparing || state.queue.length < 2;
  elements.nextButton.disabled = !state.streaming || state.preparing || state.queue.length < 2;

  elements.streamButton.disabled = ((!state.queue.length || !ready || state.editing || state.ingestingYouTube) && !state.streaming);
  elements.streamButton.classList.toggle('streaming', state.streaming);
  elements.streamButton.classList.toggle('preparing', state.preparing);
  elements.streamButton.querySelector('span').textContent = state.ingestingYouTube
    ? 'LEYENDO PLAYLIST…'
    : state.preparing
    ? 'CONECTANDO…'
    : state.streaming
      ? 'STOP STREAM'
      : !ready && state.queue.length
        ? hasErrors ? 'REVISAR COLA' : `PREPARANDO ${readyCount}/${requiredCount}`
        : 'START STREAM';

  const queueMarkup = state.queue.map((item, index) => {
    const active = index === state.activeIndex;
    const sourceType = item.sourceType === 'local' ? 'local' : 'youtube';
    const status = item.prepareStatus || 'pending';
    const loading = status === 'pending' || status === 'checking' || status === 'preparing';
    const progressValue = status === 'ready' ? 100 : Math.max(0, Math.min(99, Number(item.prepareProgress) || 0));
    const percentage = `${Math.round(progressValue)}%`;
    const errorCopy = item.prepareErrorCode === 'LOCAL_MISSING' ? 'Archivo local no encontrado' : item.prepareErrorCode === 'LOCAL_UNSUPPORTED' ? 'Formato local no compatible' : 'Necesita atención';
    const preparingCopy = item.preparePhase === 'downloading' ? 'Descargando video' : item.preparePhase === 'adjusting' ? 'Ajustando para el vivo' : 'Preparando para el vivo';
    const statusCopy = { pending: `En espera · ${percentage}`, checking: `Comprobando archivo · ${percentage}`, preparing: `${preparingCopy} · ${percentage}`, ready: 'Listo para transmitir', error: errorCopy }[status] || '';
    const errorAction = sourceType === 'local' && item.prepareErrorCode === 'LOCAL_MISSING' ? 'relink' : 'retry';
    const errorLabel = errorAction === 'relink' ? 'UBICAR ARCHIVO' : 'REINTENTAR';
    const retry = !state.editing && status === 'error' ? `<button class="retry-button" data-action="${errorAction}" data-index="${index}">${errorLabel}</button>` : '';
    const canRemove = !(state.streaming && active);
    const editStart = state.editing ? `<button class="remove-button" data-action="remove" data-index="${index}" aria-label="Borrar video" ${canRemove ? '' : 'disabled title="El video en reproducción se conserva"'}>−</button>` : '';
    const durationLabel = window.saovivoQueuePolicy.durationLabel(item);
    const editControls = `<div class="edit-controls"><button class="up-button" data-action="up" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Subir una posición"><svg viewBox="0 0 24 24"><path d="M12 20V5m-6 6 6-6 6 6"/></svg></button><button class="drag-handle" data-action="drag" data-index="${index}" draggable="true" aria-label="Arrastrar para reordenar"><svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/></svg></button></div>`;
    const right = state.editing
      ? `<div class="editing-end"><span class="duration">${durationLabel}</span>${editControls}</div>`
      : `<span class="duration">${durationLabel}</span>`;
    const thumbnail = item.thumbnail
      ? `<img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">`
      : '<div class="thumbnail-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6.5h7l2 2h9v10H3v-12Z"/><path d="m10 11 5 3-5 3v-6Z"/></svg></div>';
    const sourceLabel = window.saovivoQueuePolicy.sourceLabel(item);
    return `<article class="queue-item ${sourceType} status-${status} ${loading ? 'loading' : ''} ${loading && progressValue > 0 ? 'has-progress' : ''} ${state.editing ? 'editing' : ''} ${active ? 'active' : ''}" data-index="${index}" data-prepare-progress="${progressValue}">
      ${editStart}
      <div class="thumbnail">${thumbnail}${active ? '<span class="playing-badge">REPRODUCIENDO</span>' : ''}</div>
      <div class="item-copy"><span class="item-index">${String(index + 1).padStart(2, '0')} · <b class="source-tag ${item.isLive ? 'live-source' : item.isShort || item.isVertical ? 'short-source' : ''}">${sourceLabel}</b> ${active ? '· AHORA' : ''}</span><p class="item-title">${escapeHtml(item.title)}</p><span class="item-status ${status}">${statusCopy}</span>${retry}</div>
      ${right}
    </article>`;
  }).join('');
  const removeAll = state.editing && state.queue.length ? '<button class="remove-all-button" data-action="remove-all">− REMOVE ALL</button>' : '';
  elements.queueList.innerHTML = queueMarkup + removeAll;
  elements.queueList.querySelectorAll('.queue-item.loading').forEach((element) => {
    const progress = Math.max(0, Math.min(99, Number(element.dataset.prepareProgress) || 0));
    element.style.setProperty('--prepare-progress', `${progress}%`);
  });

  if (state.editing) elements.queueList.querySelectorAll('.queue-item').forEach((item) => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', () => document.querySelectorAll('.dragging,.drag-over').forEach((el) => el.classList.remove('dragging', 'drag-over')));
  });
}

let draggedIndex = null;
function handleDragStart(event) {
  draggedIndex = Number(event.currentTarget.dataset.index);
  event.currentTarget.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
}
function handleDragOver(event) { event.preventDefault(); event.currentTarget.classList.add('drag-over'); }
async function handleDrop(event) {
  event.preventDefault();
  const targetIndex = Number(event.currentTarget.dataset.index);
  if (draggedIndex === null || draggedIndex === targetIndex) return;
  const [moved] = state.queue.splice(draggedIndex, 1);
  state.queue.splice(targetIndex, 0, moved);
  await persistAndSyncQueue({ action: 'REORDER', reason: 'queue_reordered' }); render();
}

function persist() { return window.saovivo.saveState({ queue: state.queue, streamKey: state.streamKey, loop: state.loop }); }

async function persistAndSyncQueue(context = {}) {
  await persist();
  const result = await window.saovivo.updateStreamQueue(state.queue, { origin: 'user', ...context });
  if (Array.isArray(result?.queue)) state.queue = result.queue;
  if (Number.isInteger(result?.activeIndex)) state.activeIndex = result.activeIndex;
}

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  elements.toast.classList.toggle('error', error);
  toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), 4200);
}

let mediaConfirmationResolve = null;
function confirmExceptionalMedia(item) {
  if (!item.isVertical && !item.isLive) return Promise.resolve(true);
  const messages = [];
  if (item.isVertical) messages.push('Estás agregando un video vertical a una salida 16:9. Se mostrará completo, con bandas negras a los costados.');
  if (item.isLive) messages.push('Este enlace está en vivo. Cuando llegue su turno, la cola no avanzará hasta que termine el vivo o elijas SIGUIENTE.');
  elements.mediaConfirmTitle.textContent = item.isLive && item.isVertical ? 'Video vertical y en vivo' : item.isLive ? 'Video de YouTube en vivo' : 'Video vertical';
  elements.mediaConfirmMessage.textContent = `${messages.join(' ')} ¿Querés agregarlo igualmente?`;
  elements.mediaConfirmModal.classList.remove('hidden');
  return new Promise((resolve) => { mediaConfirmationResolve = resolve; });
}

function closeMediaConfirmation(accepted) {
  elements.mediaConfirmModal.classList.add('hidden');
  const resolve = mediaConfirmationResolve;
  mediaConfirmationResolve = null;
  resolve?.(accepted);
}

elements.cancelMedia.addEventListener('click', () => closeMediaConfirmation(false));
elements.acceptMedia.addEventListener('click', () => closeMediaConfirmation(true));

let youtubeItemChain = Promise.resolve();
function queueYouTubeItem(event) {
  youtubeItemChain = youtubeItemChain.then(async () => {
    if (state.queue.some((candidate) => candidate.id === event.item.id)) return;
    const accepted = await confirmExceptionalMedia(event.item);
    if (!accepted) {
      addNotification({ type: 'info', message: `No agregamos “${event.item.title}”.`, at: new Date().toISOString(), source: 'youtube' });
      return;
    }
    const item = { ...event.item, sourceType: 'youtube', prepareStatus: 'pending' };
    state.queue.push(item);
    await persistAndSyncQueue({ action: 'ADD_CONTENT', reason: 'queue_added', sourceType: 'youtube' });
    render();
    const message = item.isLive
      ? 'YouTube Live agregado. La cola esperará a que termine o a que elijas SIGUIENTE.'
      : item.isVertical
        ? 'Video vertical agregado. Se transmitirá completo dentro de la salida 16:9.'
        : event.message;
    addNotification({ ...event, type: item.isLive ? 'warning' : 'download', message });
    prepareItems([item]);
  }).catch((error) => reportYouTubeError(error));
}

function reportYouTubeError(error) {
  const message = friendlyError(error);
  if (window.saovivoFeedback.destinationFor(message) === 'toast') showToast(message, true);
  else addNotification({ type: 'error', message, at: new Date().toISOString(), source: 'youtube' });
}

function addNotification(event) {
  if (event.type === 'progress') return;
  state.notifications.unshift(event);
  state.notifications = state.notifications.slice(0, 60);
  elements.notificationsEmpty.classList.add('hidden');
  elements.notificationList.innerHTML = state.notifications.map((notice) => `<article class="notice ${escapeHtml(notice.type)}"><p>${escapeHtml(notice.message)}</p><time>${new Date(notice.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</time></article>`).join('');
}

function clearOperationalAlert() {
  elements.operationalAlert.classList.add('hidden');
  elements.operationalAlert.classList.remove('warning', 'danger', 'done');
}

function showOperationalAlert(kind, message) {
  const labels = { scheduled: 'FIN PROGRAMADO', stopping: 'CERRANDO TRANSMISIÓN', danger: 'RIESGO DE CORTE', done: 'TRANSMISIÓN FINALIZADA', 'live-source': 'YOUTUBE LIVE EN REPRODUCCIÓN' };
  const visual = kind === 'danger' ? 'danger' : kind === 'done' ? 'done' : 'warning';
  elements.operationalAlert.classList.remove('hidden', 'warning', 'danger', 'done');
  elements.operationalAlert.classList.add(visual);
  elements.operationalAlertLabel.textContent = labels[kind] || 'ATENCIÓN';
  elements.operationalAlertMessage.textContent = message;
}

async function prepareItems(items) {
  if (!items.length) return;
  try {
    const results = await window.saovivo.prepareItems(items);
    for (const result of results) {
      const item = state.queue.find((candidate) => candidate.id === result.id);
      if (item) {
        item.prepareStatus = result.ready ? 'ready' : 'error';
        item.prepareProgress = result.ready ? 100 : item.prepareProgress;
        item.prepareErrorCode = result.errorCode || '';
        item.prepareMessage = result.error || '';
      }
    }
  } catch (error) {
    const message = friendlyError(error);
    for (const candidate of items) {
      const item = state.queue.find((queued) => queued.id === candidate.id);
      if (item && item.prepareStatus !== 'ready') item.prepareStatus = 'error';
    }
    addNotification({ type: 'error', message: `${message} Usá Reintentar en la cola.`, at: new Date().toISOString() });
  }
  await persist();
  render();
  maybeNotifyReady();
}

elements.addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = elements.urlInput.value.trim();
  if (!url) { showToast('Pegá un enlace de YouTube.', true); return; }
  state.ingestingYouTube = true;
  render();
  elements.addButton.querySelector('svg').classList.add('busy-spinner');
  try {
    const result = await window.saovivo.ingestYouTube({ url, knownIds: state.queue.map((item) => item.id) });
    elements.urlInput.value = '';
    if (!result.added && !result.omitted && !result.pending) showToast('Esos videos ya estaban en la cola.');
  } catch (error) { reportYouTubeError(error); }
  finally {
    state.ingestingYouTube = false;
    elements.addButton.querySelector('svg').classList.remove('busy-spinner');
    render(); maybeNotifyReady();
  }
});

elements.addLocalButton.addEventListener('click', async () => {
  elements.addLocalButton.disabled = true;
  try {
    const items = await window.saovivo.selectLocalFiles({ single: false });
    const known = new Set(state.queue.map((item) => item.id));
    const unique = items.filter((item) => !known.has(item.id)).map((item) => ({ ...item, prepareStatus: 'pending' }));
    state.queue.push(...unique);
    await persistAndSyncQueue({ action: 'ADD_CONTENT', reason: 'queue_added', sourceType: 'local' }); render();
    if (items.length && !unique.length) showToast('Esos archivos ya estaban en la cola.');
    if (unique.length) prepareItems(unique);
  } catch (error) { showToast(friendlyError(error), true); }
  finally { render(); }
});

elements.modifyButton.addEventListener('click', () => { state.editing = !state.editing; render(); });
elements.queueList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  let queueContext = {};
  if (button.dataset.action === 'remove') {
    if (state.streaming && index === state.activeIndex) return;
    state.queue.splice(index, 1);
    state.readySignature = '';
    state.editing = window.saovivoQueuePolicy.editingAfterRemoval(state.queue);
    queueContext = { action: 'REMOVE_ITEM', reason: 'queue_removed' };
  }
  if (button.dataset.action === 'up' && index > 0) {
    [state.queue[index - 1], state.queue[index]] = [state.queue[index], state.queue[index - 1]];
    queueContext = { action: 'REORDER', reason: 'queue_reordered' };
  }
  if (button.dataset.action === 'remove-all') {
    state.queue = window.saovivoQueuePolicy.removeAll(state.queue, { streaming: state.streaming, activeIndex: state.activeIndex });
    state.editing = false;
    state.readySignature = '';
    queueContext = { action: 'REMOVE_ALL', reason: 'remove_all' };
    if (state.streaming) {
      state.loop = false;
      await window.saovivo.updateLoop(false);
      const message = 'Quitamos todos los videos pendientes. El vivo terminará cuando finalice el video actual.';
      addNotification({ type: 'warning', message, at: new Date().toISOString(), attention: 'scheduled' });
      showOperationalAlert('scheduled', message);
    }
  }
  if (button.dataset.action === 'retry') {
    const item = state.queue[index];
    item.prepareStatus = 'pending';
    item.prepareProgress = 0;
    item.preparePhase = '';
    item.prepareErrorCode = '';
    item.prepareMessage = '';
    render();
    prepareItems([item]);
    return;
  }
  if (button.dataset.action === 'relink') {
    const selected = await window.saovivo.selectLocalFiles({ single: true });
    if (!selected.length) return;
    const replacement = selected[0];
    if (state.queue.some((candidate, candidateIndex) => candidateIndex !== index && candidate.id === replacement.id)) {
      showToast('Ese archivo ya está en la cola.');
      return;
    }
    state.queue[index] = { ...replacement, id: state.queue[index].id, prepareStatus: 'pending' };
    await persistAndSyncQueue({ action: 'RELINK_CONTENT', reason: 'queue_relinked', sourceType: 'local' }); render();
    prepareItems([state.queue[index]]);
    return;
  }
  await persistAndSyncQueue(queueContext); render();
  maybeNotifyReady();
});

elements.loopButton.addEventListener('click', async () => {
  state.loop = !state.loop;
  await persist();
  if (state.streaming) await window.saovivo.updateLoop(state.loop);
  render();
});
elements.previousButton.addEventListener('click', async () => {
  elements.previousButton.disabled = true;
  elements.nextButton.disabled = true;
  try { await window.saovivo.navigateStream('previous'); }
  catch (error) { addNotification({ type: 'error', message: friendlyError(error), at: new Date().toISOString() }); }
  finally { render(); }
});
elements.nextButton.addEventListener('click', async () => {
  elements.previousButton.disabled = true;
  elements.nextButton.disabled = true;
  try { await window.saovivo.navigateStream('next'); }
  catch (error) { addNotification({ type: 'error', message: friendlyError(error), at: new Date().toISOString() }); }
  finally { render(); }
});
elements.streamButton.addEventListener('click', async () => {
  if (state.preparing) return;
  if (state.streaming) {
    openStopConfirmation();
    return;
  }
  if (!state.streamKey) { openSettings(); showToast('Primero guardá tu stream key de YouTube.', true); return; }
  state.preparing = true; state.editing = false; render();
  try {
    await window.saovivo.startStream({ queue: state.queue, streamKey: state.streamKey, loop: state.loop });
    state.streaming = true;
  } catch (error) {
    const message = friendlyError(error);
    if (window.saovivoFeedback.destinationFor(message) === 'toast') showToast(message, true);
    else addNotification({ type: 'error', message, at: new Date().toISOString() });
  }
  finally { state.preparing = false; render(); }
});

let stopInFlight = false;
function openStopConfirmation() {
  if (!state.streaming || stopInFlight) return;
  elements.stopConfirmModal.classList.remove('hidden');
  setTimeout(() => elements.continueStream.focus(), 30);
}
function closeStopConfirmation() {
  if (stopInFlight) return;
  elements.stopConfirmModal.classList.add('hidden');
}
elements.continueStream.addEventListener('click', closeStopConfirmation);
elements.stopConfirmModal.addEventListener('click', (event) => { if (event.target === elements.stopConfirmModal) closeStopConfirmation(); });
elements.confirmStop.addEventListener('click', async () => {
  if (stopInFlight) return;
  stopInFlight = true;
  elements.continueStream.disabled = true;
  elements.confirmStop.disabled = true;
  try { await window.saovivo.stopStream(); }
  catch (error) { showToast(friendlyError(error), true); }
  finally {
    stopInFlight = false;
    elements.continueStream.disabled = false;
    elements.confirmStop.disabled = false;
    elements.stopConfirmModal.classList.add('hidden');
    render();
  }
});

function openSettings() { elements.streamKeyInput.value = state.streamKey; elements.settingsModal.classList.remove('hidden'); setTimeout(() => elements.streamKeyInput.focus(), 50); }
function closeSettings() { elements.settingsModal.classList.add('hidden'); }
elements.settingsButton.addEventListener('click', openSettings);
elements.closeSettings.addEventListener('click', closeSettings);
elements.settingsModal.addEventListener('click', (event) => { if (event.target === elements.settingsModal) closeSettings(); });
elements.streamKeyInput.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  elements.streamKeyInput.focus();
  window.saovivo.showStreamKeyContextMenu();
});
elements.toggleKey.addEventListener('click', () => {
  const show = elements.streamKeyInput.type === 'password';
  elements.streamKeyInput.type = show ? 'text' : 'password';
  elements.toggleKey.textContent = show ? 'OCULTAR' : 'VER';
});
elements.saveSettings.addEventListener('click', async () => {
  state.streamKey = elements.streamKeyInput.value.trim();
  await persist(); closeSettings();
  addNotification({ type: 'success', message: 'Stream key guardada.', at: new Date().toISOString() });
  maybeNotifyReady();
});
elements.openDataFolder.addEventListener('click', () => window.saovivo.openDataFolder());
elements.dismissOperationalAlert.addEventListener('click', clearOperationalAlert);

elements.clearNotifications.addEventListener('click', () => {
  state.notifications = []; elements.notificationList.innerHTML = ''; elements.notificationsEmpty.classList.remove('hidden');
});

window.saovivo.onEngineEvent((event) => {
  if (event.type === 'attention-clear') { clearOperationalAlert(); return; }
  if (event.type === 'youtube-item') {
    queueYouTubeItem(event);
    return;
  }
  if (event.type === 'progress') {
    const previousIndex = state.activeIndex;
    const reportedIndex = event.activeItemId
      ? state.queue.findIndex((candidate) => candidate.id === event.activeItemId)
      : event.activeIndex;
    state.activeIndex = reportedIndex >= 0 ? reportedIndex : event.activeIndex;
    const item = state.queue[state.activeIndex];
    if (item) {
      elements.nowPlaying.classList.remove('hidden');
      if (item.thumbnail) {
        elements.nowPlayingImage.src = item.thumbnail;
        elements.nowPlayingImage.classList.remove('media-hidden');
        elements.nowPlayingPlaceholder.classList.add('media-hidden');
      } else {
        elements.nowPlayingImage.removeAttribute('src');
        elements.nowPlayingImage.classList.add('media-hidden');
        elements.nowPlayingPlaceholder.classList.remove('media-hidden');
      }
      elements.nowPlayingTitle.textContent = item.title;
      const elapsed = Math.max(0, event.elapsed || 0);
      elements.videoProgress.style.width = item.isLive ? '100%' : `${Math.min(100, (elapsed / Math.max(1, item.duration)) * 100)}%`;
      elements.videoTime.textContent = item.isLive ? `${formatDuration(elapsed, true)} / EN VIVO` : `${formatDuration(elapsed, true)} / ${formatDuration(item.duration, true)}`;
      if (previousIndex !== state.activeIndex) render();
      else document.querySelectorAll('.queue-item').forEach((el, index) => el.classList.toggle('active', index === state.activeIndex));
    }
    return;
  }
  if (event.type === 'prepare') {
    const itemIndex = state.queue.findIndex((candidate) => candidate.id === event.itemId);
    const item = state.queue[itemIndex];
    if (item) {
      item.prepareStatus = event.status;
      item.preparePhase = event.phase || item.preparePhase || '';
      if (event.status === 'ready') item.prepareProgress = 100;
      if (event.status === 'checking') item.prepareProgress = 0;
      if (event.status === 'preparing' && !Number.isFinite(item.prepareProgress)) item.prepareProgress = 0;
      item.prepareErrorCode = event.errorCode || '';
      item.prepareMessage = event.status === 'error' ? event.message : '';
    }
    if (event.status === 'error' && event.permanent && itemIndex >= 0 && item?.sourceType !== 'local') {
      state.queue.splice(itemIndex, 1);
      state.readySignature = '';
      addNotification({ ...event, type: 'warning', message: `${event.message} Se omitió y seguimos con el resto.` });
      persist(); render(); maybeNotifyReady();
      return;
    }
    if (!event.cached) {
      addNotification({ ...event, type: event.status === 'error' ? 'error' : event.status === 'ready' ? 'success' : 'download' });
    }
    persist(); render(); maybeNotifyReady();
    return;
  }
  if (event.type === 'prepare-progress') {
    const item = state.queue.find((candidate) => candidate.id === event.itemId);
    if (item) { item.prepareStatus = 'preparing'; item.preparePhase = event.phase || item.preparePhase || ''; item.prepareProgress = event.progress; render(); }
    return;
  }
  addNotification(event);
  if (event.attention === 'clear') clearOperationalAlert();
  if (event.attention && event.attention !== 'clear') showOperationalAlert(event.attention, event.message);
  if (event.type === 'connecting') { state.streaming = true; state.signalLive = false; clearOperationalAlert(); render(); }
  if (event.type === 'live') {
    state.streaming = true; state.signalLive = true; state.preparing = false;
    if (!state.youtubeStudioReminderShown) {
      state.youtubeStudioReminderShown = true;
      addNotification({
        type: 'info',
        message: 'Si terminás el vivo desde YouTube Studio, usá STOP STREAM también en SAOViVO antes de volver a comenzar.',
        at: new Date().toISOString()
      });
    }
    render();
  }
  if (event.stopped) {
    state.streaming = false; state.signalLive = false; state.preparing = false; state.activeIndex = -1; state.youtubeStudioReminderShown = false;
    stopInFlight = false;
    elements.continueStream.disabled = false;
    elements.confirmStop.disabled = false;
    elements.stopConfirmModal.classList.add('hidden');
    elements.nowPlaying.classList.add('hidden'); render();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeSettings();
  if (!elements.mediaConfirmModal.classList.contains('hidden')) closeMediaConfirmation(false);
  if (!elements.stopConfirmModal.classList.contains('hidden')) closeStopConfirmation();
});

(async function init() {
  const [saved, appVersion] = await Promise.all([window.saovivo.loadState(), window.saovivo.getAppVersion()]);
  elements.appVersion.textContent = `VERSIÓN ${appVersion}`;
  Object.assign(state, saved);
  state.queue = state.queue.map((item) => ({
    ...item,
    sourceType: item.sourceType === 'local' || item.localPath ? 'local' : 'youtube',
    prepareStatus: 'checking',
    prepareProgress: 0,
    preparePhase: ''
  }));
  const status = await window.saovivo.getStreamStatus();
  state.streaming = status.streaming;
  state.activeIndex = Number.isInteger(status.activeIndex) ? status.activeIndex : -1;
  render();
  addNotification({ type: 'info', message: 'SAOViVO está abierto. Comprobando la cola…', at: new Date().toISOString() });
  prepareItems([...state.queue]);
})();
