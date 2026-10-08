const swal = Swal.mixin({
  buttonsStyling: false,
  showClass: { popup: 'animate__animated animate__fadeInUp animate__faster' },
  hideClass: { popup: 'animate__animated animate__fadeOutDown animate__faster' }
});

const state = {
  reviews: [],
  reviewIndex: 0,
  chat: {
    stage: 'welcome',
    details: {},
    messages: [],
    sessionId: localStorage.getItem('mahadev-chat-session') || crypto.randomUUID()
  }
};

localStorage.setItem('mahadev-chat-session', state.chat.sessionId);

const galleryData = {
  wash: {
    before: "url('https://images.unsplash.com/photo-1585128903994-9788298939e1?auto=format&fit=crop&w=1600&q=85')",
    after: "url('https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1600&q=85')",
    title: 'Restored with attention to detail.'
  },
  fridge: {
    before: "url('https://images.unsplash.com/photo-1586208958839-06c17cacdf08?auto=format&fit=crop&w=1600&q=85')",
    after: "url('https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=1600&q=85')",
    title: 'A fresher, cooler kitchen again.'
  },
  ro: {
    before: "url('https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1600&q=85')",
    after: "url('https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=1600&q=85')",
    title: 'Clean water care, beautifully done.'
  }
};

function showToast(icon, title) {
  return swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 2800, timerProgressBar: true });
}

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Something went wrong. Please try again.');
  }
  return response.status === 204 ? null : response.json();
}

function openBooking(appliance = '') {
  const modal = document.getElementById('booking-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  if (appliance) document.querySelector('#quick-booking-form [name="appliance"]').value = appliance;
  setTimeout(() => document.querySelector('#quick-booking-form [name="name"]').focus(), 180);
}

function closeBooking() {
  const modal = document.getElementById('booking-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function setComparison(value) {
  document.querySelector('.after-layer').style.width = `${value}%`;
  document.querySelector('.comparison-handle').style.left = `calc(${value}% - 18px)`;
}

function setGallery(galleryKey) {
  const gallery = galleryData[galleryKey];
  const before = document.querySelector('.before-layer');
  const after = document.querySelector('.after-layer');
  before.style.backgroundImage = `linear-gradient(90deg,rgba(15,22,37,.45),transparent),${gallery.before}`;
  after.style.backgroundImage = `linear-gradient(90deg,rgba(12,39,37,.12),transparent),${gallery.after}`;
  document.querySelector('.comparison-caption h3').textContent = gallery.title;
  document.querySelectorAll('.gallery-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.gallery === galleryKey));
}

function renderReview() {
  const review = state.reviews[state.reviewIndex];
  if (!review) return;
  const stars = '★'.repeat(Math.round(review.rating || 5));
  document.getElementById('review-content').innerHTML = `
    <div class="review-stars">${stars}</div>
    <p>${escapeHtml(review.text)}</p>
    <footer><span class="review-avatar">${escapeHtml((review.author || 'M').slice(0, 1))}</span><div><b>${escapeHtml(review.author || 'Mahadev customer')}</b><small>${escapeHtml(review.relativeTimeDescription || 'Google review')}</small></div></footer>`;
  document.getElementById('review-dots').innerHTML = state.reviews.map((_, index) => `<button class="${index === state.reviewIndex ? 'active' : ''}" data-review="${index}" aria-label="Show review ${index + 1}"></button>`).join('');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
}

async function loadReviews() {
  try {
    const result = await request('/api/reviews');
    state.reviews = result.reviews || [];
    document.getElementById('average-rating').textContent = Number(result.averageRating || 4.9).toFixed(1);
    document.getElementById('review-total').textContent = Number(result.totalReviews || 0).toLocaleString('en-IN');
    document.getElementById('review-source').textContent = result.source === 'google' ? '• LIVE FROM GOOGLE' : '• SAMPLE REVIEWS';
    renderReview();
  } catch (_error) {
    document.getElementById('review-source').textContent = '• REVIEWS UNAVAILABLE';
  }
}

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    if (parsed.pathname.includes('/embed/')) return url;
    return `https://www.youtube.com/embed/${parsed.searchParams.get('v')}`;
  } catch (_error) {
    return url;
  }
}

async function loadVideos() {
  const grid = document.getElementById('video-grid');
  try {
    const videos = await request('/api/videos');
    grid.innerHTML = videos.slice(0, 4).map((video, index) => `<article class="video-card" style="--video-cover:url('https://images.unsplash.com/photo-${index % 2 ? '1585128903994-9788298939e1' : '1621905252507-b35492cc74b4'}?auto=format&fit=crop&w=900&q=80')"><div class="video-content"><h3>${escapeHtml(video.title)}</h3><button class="play-video" data-type="${escapeHtml(video.type)}" data-url="${escapeHtml(video.url)}" aria-label="Play ${escapeHtml(video.title)}">▶</button></div></article>`).join('');
  } catch (_error) {
    grid.innerHTML = '<p class="video-loading">Videos are temporarily unavailable. Please check back soon.</p>';
  }
}

function openVideo(type, source) {
  const modal = document.getElementById('video-modal');
  const slot = document.getElementById('video-player-slot');
  slot.innerHTML = type === 'mp4'
    ? `<video src="${escapeHtml(source)}" controls autoplay playsinline></video>`
    : `<iframe src="${escapeHtml(youtubeEmbedUrl(source))}?autoplay=1" title="Service guide video" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeVideo() {
  const modal = document.getElementById('video-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('video-player-slot').innerHTML = '';
}

function chatOpen() {
  document.getElementById('chat-widget').classList.add('open');
  document.getElementById('chat-panel').setAttribute('aria-hidden', 'false');
  if (!state.chat.messages.length) {
    assistantSay('Hi! I’m Mahadev Smart Assistant. I’ll help you find the right service in a minute. What do you need help with?', ['Refrigerator repair', 'Washing machine repair', 'RO service', 'Book a technician']);
  }
  setTimeout(() => document.getElementById('chat-text').focus(), 180);
}

function chatClose() {
  document.getElementById('chat-widget').classList.remove('open');
  document.getElementById('chat-panel').setAttribute('aria-hidden', 'true');
}

function renderChat() {
  const box = document.getElementById('chat-messages');
  box.innerHTML = state.chat.messages.map((message) => `<div class="message ${message.sender}">${escapeHtml(message.text)}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}

function setQuickReplies(replies = []) {
  document.getElementById('chat-quick-replies').innerHTML = replies.map((reply) => `<button class="quick-reply" data-reply="${escapeHtml(reply)}">${escapeHtml(reply)}</button>`).join('');
}

function saveConversation() {
  request('/api/chat/conversations', {
    method: 'POST',
    body: JSON.stringify({ sessionId: state.chat.sessionId, messages: state.chat.messages })
  }).catch(() => undefined);
}

function addMessage(sender, text) {
  state.chat.messages.push({ sender, text, at: new Date().toISOString() });
  renderChat();
  saveConversation();
}

function assistantSay(text, replies = []) {
  const box = document.getElementById('chat-messages');
  const typing = document.createElement('div');
  typing.className = 'message assistant typing';
  typing.innerHTML = '<span class="typing-dots"><i></i><i></i><i></i></span>';
  box.appendChild(typing);
  box.scrollTop = box.scrollHeight;
  setQuickReplies([]);
  window.setTimeout(() => {
    typing.remove();
    addMessage('assistant', text);
    setQuickReplies(replies);
  }, 420);
}

function identifyAppliance(text) {
  const query = text.toLowerCase();
  if (query.includes('refrigerator') || query.includes('fridge')) return 'Refrigerator';
  if (query.includes('washing') || query.includes('washer')) return 'Washing Machine';
  if (query.includes('ro') || query.includes('purifier') || query.includes('water')) return 'RO Water Purifier';
  return '';
}

function askBrand() {
  state.chat.stage = 'brand';
  assistantSay(`Yes, in most cases ${state.chat.details.appliance.toLowerCase()} issues can be repaired. Which brand do you have?`, ['LG', 'Samsung', 'Whirlpool', 'Godrej', 'Other brand']);
}

function askProblem() {
  state.chat.stage = 'problem';
  const appliance = state.chat.details.appliance;
  const options = appliance === 'Refrigerator'
    ? ['Not Cooling', 'Water Leakage', 'Ice Build Up', 'Noise', 'Other']
    : appliance === 'Washing Machine'
      ? ['Not Spinning', 'Not Draining', 'Noise / Vibration', 'Not Starting', 'Other']
      : ['Low Water Flow', 'Water Leakage', 'Filter Change', 'Bad Taste / Odour', 'Other'];
  assistantSay('What problem are you facing?', options);
}

function askName() {
  state.chat.stage = 'name';
  assistantSay('I can arrange a service callback. What is your name? You can skip this if you prefer.', ['Skip name']);
}

function askPhone() {
  state.chat.stage = 'phone';
  assistantSay('Great. Please share the best phone number for our service team to call.', []);
}

function askLocation() {
  state.chat.stage = 'area';
  assistantSay('And which area or locality should our technician visit?', []);
}

async function submitChatLead() {
  state.chat.stage = 'submitting';
  setQuickReplies([]);
  try {
    await request('/api/leads', { method: 'POST', body: JSON.stringify({ ...state.chat.details, source: 'chatbot' }) });
    assistantSay('You’re all set! I’ve created your service request. Our team will contact you shortly to confirm a convenient visit time.', ['Track another issue', 'Book another service']);
    state.chat.stage = 'complete';
    showToast('success', 'Service request created');
  } catch (error) {
    state.chat.stage = 'area';
    assistantSay(`${error.message} Please try again, or use the call button for immediate help.`, []);
  }
}

function handleChat(text) {
  const message = text.trim();
  if (!message) return;
  addMessage('user', message);
  const appliance = identifyAppliance(message);

  if (state.chat.stage === 'welcome') {
    if (appliance) {
      state.chat.details.appliance = appliance;
      askBrand();
    } else if (message.toLowerCase().includes('book')) {
      state.chat.stage = 'appliance';
      assistantSay('Absolutely. Which appliance would you like us to service?', ['Refrigerator', 'Washing Machine', 'RO Water Purifier']);
    } else if (message.toLowerCase().includes('price') || message.toLowerCase().includes('cost')) {
      assistantSay('Pricing depends on the diagnosis and parts needed. We always explain the estimate before work begins. Which appliance needs attention?', ['Refrigerator', 'Washing Machine', 'RO Water Purifier']);
      state.chat.stage = 'appliance';
    } else {
      assistantSay('I can help with refrigerator, washing machine, or RO service. Tell me which appliance needs attention.', ['Refrigerator repair', 'Washing machine repair', 'RO service']);
    }
    return;
  }
  if (state.chat.stage === 'appliance') {
    if (appliance) { state.chat.details.appliance = appliance; askBrand(); } else assistantSay('Please choose one of the appliances so I can guide you correctly.', ['Refrigerator', 'Washing Machine', 'RO Water Purifier']);
    return;
  }
  if (state.chat.stage === 'brand') { state.chat.details.brand = message === 'Other brand' ? '' : message; askProblem(); return; }
  if (state.chat.stage === 'problem') { state.chat.details.problem = message; askName(); return; }
  if (state.chat.stage === 'name') { state.chat.details.name = message === 'Skip name' ? '' : message; askPhone(); return; }
  if (state.chat.stage === 'phone') {
    const number = message.replace(/\D/g, '');
    if (number.length < 8 || number.length > 15) { assistantSay('Please enter a valid phone number so our team can reach you.', []); return; }
    state.chat.details.phone = message; askLocation(); return;
  }
  if (state.chat.stage === 'area') { state.chat.details.area = message; submitChatLead(); return; }
  if (state.chat.stage === 'complete') {
    state.chat.details = {}; state.chat.stage = 'appliance';
    assistantSay('Happy to help again. Which appliance needs service?', ['Refrigerator', 'Washing Machine', 'RO Water Purifier']);
  }
}

async function requestNotifications() {
  const prompt = document.getElementById('notification-prompt');
  if (!('Notification' in window)) {
    showToast('info', 'Browser notifications are not supported here.');
    prompt.classList.add('hidden');
    return;
  }
  const permission = await Notification.requestPermission();
  localStorage.setItem('mahadev-notification-prompt', 'done');
  prompt.classList.add('hidden');
  if (permission === 'granted') showToast('success', 'You’ll receive useful service updates.');
  else showToast('info', 'No problem—you can enable updates later in browser settings.');
}

async function checkNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const after = localStorage.getItem('mahadev-last-notification') || '';
  try {
    const result = await request(`/api/notifications/latest?after=${encodeURIComponent(after)}`);
    if (result.notification) {
      new Notification(result.notification.title, { body: result.notification.body, icon: '/favicon.ico' });
      localStorage.setItem('mahadev-last-notification', result.notification.createdAt);
    }
  } catch (_error) { }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.open-booking').forEach((button) => button.addEventListener('click', () => openBooking()));
  document.querySelectorAll('.close-booking').forEach((button) => button.addEventListener('click', closeBooking));
  document.querySelectorAll('.service-select').forEach((button) => button.addEventListener('click', () => openBooking(button.dataset.appliance)));
  document.querySelectorAll('.open-chat').forEach((button) => button.addEventListener('click', chatOpen));
  document.getElementById('chat-launcher').addEventListener('click', () => document.getElementById('chat-widget').classList.contains('open') ? chatClose() : chatOpen());
  document.querySelector('.close-chat').addEventListener('click', chatClose);

  document.getElementById('quick-booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.innerHTML = 'Sending request…';
    try {
      await request('/api/leads', { method: 'POST', body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), source: 'quick-booking' }) });
      form.reset();
      closeBooking();
      swal.fire({ icon: 'success', title: 'Booking request received!', text: 'Our service team will call you shortly to confirm your visit.', confirmButtonText: 'Perfect' });
    } catch (error) {
      swal.fire({ icon: 'error', title: 'Couldn’t send your request', text: error.message, confirmButtonText: 'Try again' });
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Request a callback <span>→</span>';
    }
  });

  document.getElementById('comparison-range').addEventListener('input', (event) => setComparison(event.target.value));
  document.querySelectorAll('.gallery-tabs button').forEach((button) => button.addEventListener('click', () => setGallery(button.dataset.gallery)));
  document.querySelector('.previous-review').addEventListener('click', () => { if (state.reviews.length) { state.reviewIndex = (state.reviewIndex - 1 + state.reviews.length) % state.reviews.length; renderReview(); } });
  document.querySelector('.next-review').addEventListener('click', () => { if (state.reviews.length) { state.reviewIndex = (state.reviewIndex + 1) % state.reviews.length; renderReview(); } });
  document.getElementById('review-dots').addEventListener('click', (event) => { if (event.target.matches('[data-review]')) { state.reviewIndex = Number(event.target.dataset.review); renderReview(); } });
  document.getElementById('video-grid').addEventListener('click', (event) => { const button = event.target.closest('.play-video'); if (button) openVideo(button.dataset.type, button.dataset.url); });
  document.querySelectorAll('.close-video').forEach((button) => button.addEventListener('click', closeVideo));

  document.getElementById('chat-form').addEventListener('submit', (event) => { event.preventDefault(); const input = document.getElementById('chat-text'); handleChat(input.value); input.value = ''; });
  document.getElementById('chat-quick-replies').addEventListener('click', (event) => { const button = event.target.closest('[data-reply]'); if (button) handleChat(button.dataset.reply); });

  const notificationPrompt = document.getElementById('notification-prompt');
  if (localStorage.getItem('mahadev-notification-prompt') || !('Notification' in window) || Notification.permission === 'granted') notificationPrompt.classList.add('hidden');
  document.querySelector('.allow-notifications').addEventListener('click', requestNotifications);
  document.querySelector('.dismiss-prompt').addEventListener('click', () => { localStorage.setItem('mahadev-notification-prompt', 'done'); notificationPrompt.classList.add('hidden'); });

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeBooking(); closeVideo(); chatClose(); } });
  loadReviews();
  loadVideos();
  checkNotifications();
  window.setInterval(checkNotifications, 30000);
  window.setInterval(() => { if (state.reviews.length > 1) { state.reviewIndex = (state.reviewIndex + 1) % state.reviews.length; renderReview(); } }, 7000);
});
