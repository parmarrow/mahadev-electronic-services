const adminState = { token: localStorage.getItem('mahadev-admin-token') || '', dashboard: null };
const swal = Swal.mixin({ buttonsStyling: false });

async function adminRequest(url, options = {}) {
  const headers = { 'x-admin-token': adminState.token, ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Request failed.');
  }
  return response.status === 204 ? null : response.json();
}

function displayDate(value) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function ratingStars(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
}

function renderDashboard(data) {
  adminState.dashboard = data;
  const metrics = data.metrics || {};
  document.getElementById('total-orders').textContent = metrics.totalOrders || 0;
  document.getElementById('monthly-orders').textContent = metrics.monthlyOrders || 0;
  document.getElementById('monthly-income').textContent = formatCurrency(metrics.monthlyIncome);
  document.getElementById('income-note').textContent = `${formatCurrency(metrics.visitCharge || 250)} × this month’s orders`;
  document.getElementById('average-rating').textContent = metrics.totalRatings ? Number(metrics.averageRating).toFixed(1) : '—';
  document.getElementById('rating-total').textContent = metrics.totalRatings ? `${metrics.totalRatings} customer rating${metrics.totalRatings === 1 ? '' : 's'}` : 'No ratings yet';
  document.getElementById('new-count').textContent = data.counts['New Lead'] || 0;
  document.getElementById('contacted-count').textContent = data.counts.Contacted || 0;
  document.getElementById('progress-count').textContent = data.counts['In Progress'] || 0;
  document.getElementById('completed-count').textContent = data.counts.Completed || 0;
  document.getElementById('conversation-count').textContent = data.conversations || 0;
  const leadTable = document.getElementById('lead-table');
  leadTable.innerHTML = data.leads.length ? data.leads.map((lead) => `<tr>
    <td><b>${escapeHtml(lead.name || 'Name not shared')}</b><small>${escapeHtml(lead.phone)}</small></td>
    <td class="lead-service"><b>${escapeHtml(lead.appliance)}</b><small>${escapeHtml([lead.brand, lead.problem].filter(Boolean).join(' · ') || 'General service request')}</small></td>
    <td>${escapeHtml(lead.area)}</td><td>${displayDate(lead.createdAt)}</td><td><span class="source-pill">${escapeHtml(lead.source)}</span></td>
    <td><select class="status-select" data-lead-id="${lead.id}" data-current-status="${escapeHtml(lead.status)}"><option ${lead.status === 'New Lead' ? 'selected' : ''}>New Lead</option><option ${lead.status === 'Contacted' ? 'selected' : ''}>Contacted</option><option ${lead.status === 'In Progress' ? 'selected' : ''}>In Progress</option><option ${lead.status === 'Completed' ? 'selected' : ''}>Completed</option></select></td></tr>`).join('') : '<tr><td colspan="6" class="empty-row">No customer leads yet. New chat and booking requests will appear here.</td></tr>';
  document.getElementById('notification-list').innerHTML = data.notifications.length ? data.notifications.map((notification) => `<li><b>${escapeHtml(notification.title)}</b> — ${escapeHtml(notification.body)}</li>`).join('') : '<li>Nothing sent yet.</li>';
  document.getElementById('video-list').innerHTML = data.videos.length ? data.videos.map((video) => `<li><b>${escapeHtml(video.title)}</b> · ${escapeHtml(video.type.toUpperCase())}</li>`).join('') : '<li>No uploaded videos yet.</li>';
  const areas = data.areaBreakdown || [];
  document.getElementById('area-report').innerHTML = areas.length ? areas.map((item) => `<div class="area-row"><span>${escapeHtml(item.area)}</span><b>${item.orders}</b></div>`).join('') : '<p class="empty-row">No order areas yet.</p>';
  const ratings = data.ratings || [];
  document.getElementById('rating-badge').textContent = `${metrics.totalRatings || 0} rating${metrics.totalRatings === 1 ? '' : 's'}`;
  document.getElementById('rating-list').innerHTML = ratings.length ? ratings.map((rating) => `<li><div><b>${escapeHtml(rating.name)}</b><span class="rating-stars">${ratingStars(rating.rating)}</span></div><p>${escapeHtml(rating.text || 'No comment shared.')}</p><small>${displayDate(rating.createdAt)}</small></li>`).join('') : '<li>No customer ratings yet.</li>';
}

async function loadDashboard() {
  const refresh = document.getElementById('refresh-dashboard');
  if (refresh) { refresh.disabled = true; refresh.textContent = 'Refreshing…'; }
  try {
    const data = await adminRequest('/api/admin/dashboard');
    renderDashboard(data);
    return true;
  } catch (error) {
    if (error.message.includes('Admin access')) {
      localStorage.removeItem('mahadev-admin-token');
      document.getElementById('dashboard').hidden = true;
      document.getElementById('login-shell').hidden = false;
      document.getElementById('admin-username').focus();
    } else swal.fire({ icon: 'error', title: 'Dashboard unavailable', text: error.message, confirmButtonText: 'Okay' });
    return false;
  } finally {
    if (refresh) { refresh.disabled = false; refresh.textContent = '↻ Refresh'; }
  }
}

function showDashboard(load = true) {
  document.getElementById('login-shell').hidden = true;
  document.getElementById('dashboard').hidden = false;
  if (load) loadDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button');
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.getElementById('admin-username').value.trim(), password: document.getElementById('admin-password').value }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Login failed.');
      adminState.token = data.token;
      localStorage.setItem('mahadev-admin-token', adminState.token);
      showDashboard(false);
      const success = await loadDashboard();
      if (success) swal.fire({ icon: 'success', title: 'Dashboard unlocked', text: 'Your latest service requests are ready.', timer: 1800, showConfirmButton: false });
      else { document.getElementById('dashboard').hidden = true; document.getElementById('login-shell').hidden = false; localStorage.removeItem('mahadev-admin-token'); adminState.token = ''; }
    } catch (error) {
      localStorage.removeItem('mahadev-admin-token');
      adminState.token = '';
      swal.fire({ icon: 'error', title: 'Login failed', text: error.message, confirmButtonText: 'Try again' });
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Open dashboard <span>→</span>';
    }
  });
  document.getElementById('logout').addEventListener('click', async () => {
    const result = await swal.fire({ icon: 'question', title: 'Sign out?', text: 'You will need your admin username and password to access this dashboard again.', showCancelButton: true, confirmButtonText: 'Sign out', cancelButtonText: 'Stay here' });
    if (result.isConfirmed) { localStorage.removeItem('mahadev-admin-token'); adminState.token = ''; document.getElementById('dashboard').hidden = true; document.getElementById('login-shell').hidden = false; document.getElementById('login-form').reset(); document.getElementById('admin-username').focus(); }
  });
  document.getElementById('refresh-dashboard').addEventListener('click', loadDashboard);
  document.getElementById('lead-table').addEventListener('change', async (event) => {
    const select = event.target.closest('.status-select');
    if (!select || select.value === select.dataset.currentStatus) return;
    const result = await swal.fire({ icon: 'question', title: 'Update lead status?', text: `Move this request to “${select.value}”?`, showCancelButton: true, confirmButtonText: 'Update', cancelButtonText: 'Cancel' });
    if (!result.isConfirmed) { select.value = select.dataset.currentStatus; return; }
    try {
      await adminRequest(`/api/admin/leads/${select.dataset.leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: select.value }) });
      swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Lead status updated', showConfirmButton: false, timer: 1800 });
      loadDashboard();
    } catch (error) { swal.fire({ icon: 'error', title: 'Couldn’t update lead', text: error.message, confirmButtonText: 'Okay' }); select.value = select.dataset.currentStatus; }
  });
  document.getElementById('notification-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button');
    submit.disabled = true; submit.textContent = 'Sending…';
    try {
      await adminRequest('/api/admin/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      form.reset();
      swal.fire({ icon: 'success', title: 'Notification sent!', text: 'Opted-in visitors will receive it during their next update check.', confirmButtonText: 'Great' });
      loadDashboard();
    } catch (error) { swal.fire({ icon: 'error', title: 'Couldn’t send notification', text: error.message, confirmButtonText: 'Okay' }); }
    finally { submit.disabled = false; submit.innerHTML = 'Send notification <span>→</span>'; }
  });
  const videoType = document.getElementById('video-type');
  videoType.addEventListener('change', () => { const isMp4 = videoType.value === 'mp4'; document.getElementById('youtube-field').hidden = isMp4; document.getElementById('mp4-field').hidden = !isMp4; });
  document.getElementById('video-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button');
    submit.disabled = true; submit.textContent = 'Adding video…';
    try {
      await adminRequest('/api/admin/videos', { method: 'POST', body: new FormData(form) });
      form.reset(); videoType.value = 'youtube'; videoType.dispatchEvent(new Event('change'));
      swal.fire({ icon: 'success', title: 'Video added', text: 'It is now available in the public service guides section.', confirmButtonText: 'Done' });
      loadDashboard();
    } catch (error) { swal.fire({ icon: 'error', title: 'Couldn’t add video', text: error.message, confirmButtonText: 'Okay' }); }
    finally { submit.disabled = false; submit.innerHTML = 'Add video <span>→</span>'; }
  });
  if (adminState.token) showDashboard();
});
