// De app zelf: schermen tekenen en reageren op klikken.

const $ = id => document.getElementById(id);

const state = {
  user: null,
  clients: [],
  receipts: [],                 // altijd gesorteerd: nieuwste datum eerst
  clientsById: new Map(),
  selectedClientId: null,       // gekozen cliënt bij "Nieuw bonnetje"
  newPhoto: null,               // verkleinde foto (Blob) bij "Nieuw bonnetje"
  newPhotoUrl: null,
  searchLimit: 50,
};

// Voert een async actie uit en laat een nette foutmelding zien als het misgaat.
function guard(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      toast(e.message || 'Er ging iets mis.', 'error');
    }
  };
}

function busy(on) { $('loading').classList.toggle('show', on); }

// =====================================================================
//  Automatisch uitloggen na een uur niets doen
// =====================================================================
const Idle = (() => {
  const KEY = 'bonnetjes-last-activity';
  const LIMIT = (window.APP_CONFIG?.INACTIVITY_MINUTES || 60) * 60000;
  const WARN = 5 * 60000;
  let memLast = Date.now(), lastWrite = 0, timer = null;

  function last() {
    try { return Number(localStorage.getItem(KEY)) || memLast; } catch { return memLast; }
  }

  function mark(force = false) {
    const now = Date.now();
    memLast = now;
    if (force || now - lastWrite > 10000 || !$('idle-warning').hidden) {
      lastWrite = now;
      try { localStorage.setItem(KEY, String(now)); } catch { /* geblokkeerd: geheugen volstaat */ }
      $('idle-warning').hidden = true;
    }
  }

  function expired() {
    let stored = 0;
    try { stored = Number(localStorage.getItem(KEY)) || 0; } catch { /* */ }
    return stored > 0 && Date.now() - stored > LIMIT;
  }

  function check() {
    if (!state.user) return;
    const idle = Date.now() - last();
    if (idle >= LIMIT) {
      logout(true);
    } else if (idle >= LIMIT - WARN) {
      const min = Math.max(1, Math.ceil((LIMIT - idle) / 60000));
      $('idle-warning').textContent = `Je wordt over ${min} ${min === 1 ? 'minuut' : 'minuten'} automatisch uitgelogd. Tik ergens om ingelogd te blijven.`;
      $('idle-warning').hidden = false;
    }
  }

  function start() {
    mark(true);
    clearInterval(timer);
    timer = setInterval(check, 15000);
  }

  function stop() {
    clearInterval(timer);
    $('idle-warning').hidden = true;
  }

  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
    window.addEventListener(ev, () => { if (state.user) mark(); }, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });

  return { start, stop, expired, mark, LIMIT };
})();

// =====================================================================
//  Inloggen / uitloggen
// =====================================================================
function showLogin(message) {
  $('app-view').hidden = true;
  $('login-view').hidden = false;
  $('login-demo-note').hidden = !Api.isDemo;
  $('login-error').hidden = !message;
  $('login-error').textContent = message || '';
  $('login-pass').value = '';
}

async function logout(automatic = false) {
  Idle.stop();
  closeModal();
  await Api.signOut();
  state.user = null;
  state.clients = [];
  state.receipts = [];
  state.clientsById = new Map();
  resetNewForm();
  try { localStorage.removeItem('bonnetjes-last-activity'); } catch { /* */ }
  showLogin(automatic ? `Je bent automatisch uitgelogd na ${Idle.LIMIT / 60000} minuten zonder activiteit.` : '');
}

async function enterApp(user) {
  state.user = user;
  $('login-view').hidden = true;
  $('app-view').hidden = false;
  $('demo-banner').hidden = !Api.isDemo;
  $('user-label').textContent = user.displayName || user.email;
  $('p-name').value = user.displayName || '';
  Idle.start();
  busy(true);
  try {
    await reloadData();
  } finally {
    busy(false);
  }
  setTab('nieuw');
}

async function reloadData() {
  const [clients, receipts] = await Promise.all([Api.listClients(), Api.listReceipts()]);
  state.clients = clients;
  state.receipts = receipts;
  indexClients();
  renderAll();
}

function indexClients() {
  state.clients.sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
  state.clientsById = new Map(state.clients.map(c => [c.id, c]));
}

function sortReceipts() {
  state.receipts.sort((a, b) => b.receipt_date.localeCompare(a.receipt_date)
    || String(b.created_at).localeCompare(String(a.created_at)));
}

function upsertReceipt(r) {
  const i = state.receipts.findIndex(x => x.id === r.id);
  if (i >= 0) state.receipts[i] = r; else state.receipts.push(r);
  sortReceipts();
}

function upsertClient(c) {
  const i = state.clients.findIndex(x => x.id === c.id);
  if (i >= 0) state.clients[i] = c; else state.clients.push(c);
  indexClients();
}

function clientName(id) { return state.clientsById.get(id)?.name || '(verwijderde cliënt)'; }

function renderAll() {
  renderClientChips();
  renderMonthStrip();
  renderRecent();
  renderDescSuggestions();
  fillClientSelects();
  renderSearch();
  renderClients();
  renderReport();
}

// =====================================================================
//  Tabbladen en venster
// =====================================================================
function setTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.id !== `tab-${name}`; });
  window.scrollTo({ top: 0 });
  if (name === 'zoeken') renderSearch();
  if (name === 'uitdraaien') renderReport();
}

// Het venster krijgt een eigen stap in de browsergeschiedenis, zodat de
// terugknop van een (Android-)telefoon het venster sluit in plaats van de app.
function openModal(html) {
  const wasOpen = !$('modal').hidden;
  $('modal-body').innerHTML = html;
  $('modal').hidden = false;
  document.body.classList.add('modal-open');
  $('modal').querySelector('.modal-box').scrollTop = 0;
  loadThumbs($('modal-body'));
  if (!wasOpen) history.pushState({ modal: true }, '');
}

function hideModal() {
  $('modal').hidden = true;
  $('modal-body').innerHTML = '';
  document.body.classList.remove('modal-open');
}

function closeModal() {
  const wasOpen = !$('modal').hidden;
  hideModal();
  if (wasOpen && history.state?.modal) history.back();
}

// =====================================================================
//  Lijstjes met bonnetjes (gedeeld door alle tabbladen)
// =====================================================================
function receiptRow(r, { pdfButton = false, showClient = true } = {}) {
  const thumb = r.photo_path
    ? `<img data-photo="${esc(r.photo_path)}" alt="">`
    : '<span class="no-photo">geen<br>foto</span>';
  return `
    <div class="receipt-row" data-receipt="${esc(r.id)}" role="button" tabindex="0">
      <div class="thumb">${thumb}</div>
      <div class="r-main">
        <div class="r-title">${esc(r.description)}</div>
        <div class="r-sub">${fmtDate(r.receipt_date)}${showClient ? ` · ${esc(clientName(r.client_id))}` : ''}</div>
      </div>
      <div class="r-amount">${fmtEUR(toCents(r.amount))}</div>
      ${pdfButton ? `<button class="btn ghost small" type="button" data-receipt-pdf="${esc(r.id)}">PDF</button>` : ''}
    </div>`;
}

// Zet de echte (tijdelijke) foto-links in de miniatuurtjes.
async function loadThumbs(container) {
  const imgs = [...container.querySelectorAll('img[data-photo]')];
  if (!imgs.length) return;
  try {
    const urls = await Api.photoUrls(imgs.map(i => i.dataset.photo));
    for (const img of imgs) if (urls[img.dataset.photo]) img.src = urls[img.dataset.photo];
  } catch (e) {
    console.warn(e);
  }
}

function emptyState(text) { return `<p class="empty">${esc(text)}</p>`; }

// =====================================================================
//  Tabblad: Nieuw bonnetje
// =====================================================================
function renderClientChips() {
  const q = norm($('nb-client-filter').value);
  const active = state.clients.filter(c => c.active);
  const list = active.filter(c => !q || norm(`${c.name} ${c.client_number || ''}`).includes(q));
  if (!active.length) {
    $('nb-client-grid').innerHTML = `<p class="empty">Nog geen cliënten. <button type="button" class="link" data-goto="clienten">Voeg eerst cliënten toe</button>.</p>`;
    return;
  }
  if (!list.length) {
    $('nb-client-grid').innerHTML = emptyState('Geen cliënt gevonden.');
    return;
  }
  $('nb-client-grid').innerHTML = list.map(c => `
    <button type="button" class="chip${c.id === state.selectedClientId ? ' selected' : ''}" data-pick-client="${esc(c.id)}">
      ${esc(c.name)}${c.has_guardian ? ' <span class="badge">B</span>' : ''}
    </button>`).join('');
}

function selectClient(id) {
  state.selectedClientId = id;
  renderClientChips();
}

async function handlePhoto(file) {
  if (!file) return;
  busy(true);
  try {
    const blob = await compressImage(file);
    if (state.newPhotoUrl) URL.revokeObjectURL(state.newPhotoUrl);
    state.newPhoto = blob;
    state.newPhotoUrl = URL.createObjectURL(blob);
    $('nb-preview').querySelector('img').src = state.newPhotoUrl;
    $('nb-preview').hidden = false;
    $('nb-photo-buttons').hidden = true;
    if (!$('nb-amount').value) $('nb-amount').focus();
  } finally {
    busy(false);
  }
}

function clearNewPhoto() {
  if (state.newPhotoUrl) URL.revokeObjectURL(state.newPhotoUrl);
  state.newPhoto = null;
  state.newPhotoUrl = null;
  $('nb-preview').hidden = true;
  $('nb-preview').querySelector('img').removeAttribute('src');
  $('nb-photo-buttons').hidden = false;
  $('nb-camera').value = '';
  $('nb-gallery').value = '';
}

function resetNewForm() {
  clearNewPhoto();
  state.selectedClientId = null;
  $('nb-client-filter').value = '';
  $('nb-amount').value = '';
  $('nb-desc').value = '';
  $('nb-date').value = todayISO();
  $('nb-date').max = todayISO();
  $('nb-error').hidden = true;
  renderClientChips();
}

function formError(id, message) {
  $(id).textContent = message;
  $(id).hidden = !message;
  return !message;
}

// Controleert de invoer van een bonnetje; geeft een foutmelding of null terug.
function validateReceipt({ client_id, amount, description, receipt_date }) {
  if (!client_id) return 'Kies eerst een cliënt.';
  if (!(amount > 0)) return 'Vul een geldig bedrag in, bijvoorbeeld 4,50.';
  if (amount >= 100000) return 'Dat bedrag is wel heel hoog. Klopt het?';
  if (!receipt_date) return 'Vul een datum in.';
  if (receipt_date > todayISO()) return 'De datum ligt in de toekomst.';
  if (!description) return 'Vul een korte omschrijving in.';
  return null;
}

async function saveNewReceipt(e) {
  e.preventDefault();
  const receipt = {
    client_id: state.selectedClientId,
    amount: parseAmount($('nb-amount').value),
    description: $('nb-desc').value.trim(),
    receipt_date: $('nb-date').value,
  };
  if (!formError('nb-error', validateReceipt(receipt))) return;
  if (!state.newPhoto && !confirm('Je hebt geen foto toegevoegd. Toch opslaan?')) return;

  const btn = $('nb-save');
  btn.disabled = true;
  btn.textContent = 'Bezig met opslaan…';
  try {
    const saved = await Api.saveReceipt(receipt, state.newPhoto || undefined);
    upsertReceipt(saved);
    toast(`Opgeslagen: ${fmtEUR(toCents(saved.amount))} voor ${clientName(saved.client_id)}`);
    resetNewForm();
    renderAfterReceiptChange();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    formError('nb-error', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Opslaan';
  }
}

function renderAfterReceiptChange() {
  renderMonthStrip();
  renderRecent();
  renderDescSuggestions();
  renderSearch();
  renderClients();
  renderReport();
}

function renderMonthStrip() {
  const ym = currentMonth();
  const prev = (() => {
    const [y, m] = ym.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
  })();
  const inMonth = month => state.receipts.filter(r => r.receipt_date.startsWith(month));
  const cur = inMonth(ym), old = inMonth(prev);
  $('month-strip').innerHTML = `
    <div><span class="muted">${esc(monthLabel(ym))}</span><strong>${fmtEUR(sumCents(cur))}</strong><span class="muted">${cur.length} bonnetjes</span></div>
    <div><span class="muted">${esc(monthLabel(prev))}</span><strong>${fmtEUR(sumCents(old))}</strong><span class="muted">${old.length} bonnetjes</span></div>`;
}

function renderRecent() {
  const recent = [...state.receipts]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 5);
  $('recent-list').innerHTML = recent.length
    ? recent.map(r => receiptRow(r)).join('')
    : emptyState('Nog geen bonnetjes ingevoerd.');
  loadThumbs($('recent-list'));
}

function renderDescSuggestions() {
  const counts = new Map();
  for (const r of state.receipts) {
    const d = r.description.trim();
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  $('desc-suggestions').innerHTML = top.map(([d]) => `<option value="${esc(d)}">`).join('');
}

// =====================================================================
//  Tabblad: Zoeken
// =====================================================================
function clientOptions(selectedId, { includeAll = false, allLabel = 'Alle cliënten', onlyActive = false } = {}) {
  const list = state.clients.filter(c => !onlyActive || c.active || c.id === selectedId);
  const opts = list.map(c => `<option value="${esc(c.id)}"${c.id === selectedId ? ' selected' : ''}>${esc(c.name)}${c.active ? '' : ' (gearchiveerd)'}</option>`);
  if (includeAll) opts.unshift(`<option value="">${esc(allLabel)}</option>`);
  return opts.join('');
}

function fillClientSelects() {
  const s = $('s-client').value, p = $('p-client').value;
  $('s-client').innerHTML = clientOptions(s, { includeAll: true });
  $('p-client').innerHTML = clientOptions(p, { includeAll: true, allLabel: 'Kies een cliënt…' });
}

function searchResults() {
  const tokens = norm($('s-text').value).split(/\s+/).filter(Boolean);
  const clientId = $('s-client').value;
  const from = $('s-from').value, to = $('s-to').value;
  return state.receipts.filter(r => {
    if (clientId && r.client_id !== clientId) return false;
    if (!inPeriod(r, from, to)) return false;
    if (!tokens.length) return true;
    const c = state.clientsById.get(r.client_id);
    const amount = Number(r.amount).toFixed(2);
    const hay = norm([r.description, c?.name, c?.client_number, fmtDate(r.receipt_date), r.receipt_date,
      amount, amount.replace('.', ','), monthLabel(r.receipt_date.slice(0, 7))].join(' '));
    return tokens.every(t => hay.includes(t));
  });
}

function renderSearch() {
  const results = searchResults();
  const shown = results.slice(0, state.searchLimit);
  $('s-summary').innerHTML = `<strong>${results.length}</strong> ${results.length === 1 ? 'bonnetje' : 'bonnetjes'} · totaal <strong>${fmtEUR(sumCents(results))}</strong>`;
  $('s-results').innerHTML = shown.length ? shown.map(r => receiptRow(r, { pdfButton: true })).join('') : emptyState('Geen bonnetjes gevonden.');
  $('s-more').hidden = results.length <= shown.length;
  $('s-pdf').disabled = !results.length;
  loadThumbs($('s-results'));
}

// =====================================================================
//  Tabblad: Cliënten + klantenkaart
// =====================================================================
function clientStats(id) {
  const rs = state.receipts.filter(r => r.client_id === id);
  const ym = currentMonth(), y = ym.slice(0, 4);
  return {
    receipts: rs,
    month: sumCents(rs.filter(r => r.receipt_date.startsWith(ym))),
    year: sumCents(rs.filter(r => r.receipt_date.startsWith(y))),
    total: sumCents(rs),
    count: rs.length,
  };
}

function renderClients() {
  const q = norm($('c-filter').value);
  const showArchived = $('c-show-archived').checked;
  const list = state.clients.filter(c => (showArchived || c.active)
    && (!q || norm(`${c.name} ${c.client_number || ''} ${c.guardian_name || ''}`).includes(q)));
  if (!list.length) {
    $('c-grid').innerHTML = emptyState(state.clients.length ? 'Geen cliënt gevonden.' : 'Nog geen cliënten. Klik op "+ Nieuwe cliënt".');
    return;
  }
  $('c-grid').innerHTML = list.map(c => {
    const s = clientStats(c.id);
    return `
      <button type="button" class="client-card${c.active ? '' : ' archived'}" data-client="${esc(c.id)}">
        <div class="cc-head">
          <span class="avatar">${esc(initials(c.name))}</span>
          <span class="cc-name">${esc(c.name)}</span>
        </div>
        <div class="cc-badges">
          ${c.client_number ? `<span class="badge soft">nr. ${esc(c.client_number)}</span>` : ''}
          ${c.has_guardian ? '<span class="badge">Bewind</span>' : ''}
          ${c.active ? '' : '<span class="badge grey">Gearchiveerd</span>'}
        </div>
        <div class="cc-stats">
          <div><span>Deze maand</span><strong>${fmtEUR(s.month)}</strong></div>
          <div><span>Totaal (${s.count})</span><strong>${fmtEUR(s.total)}</strong></div>
        </div>
      </button>`;
  }).join('');
}

function initials(name) {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function openClientCard(id) {
  const c = state.clientsById.get(id);
  if (!c) return;
  const s = clientStats(id);
  const info = [
    ['Cliëntnummer', c.client_number],
    ['Bewind', c.has_guardian ? 'Ja' : 'Nee'],
    ...(c.has_guardian ? [['Bewindvoerder', c.guardian_name], ['Contact bewindvoerder', c.guardian_contact]] : []),
    ['Notities', c.notes],
  ].filter(([, v]) => v);
  openModal(`
    <div class="kaart">
      <div class="kaart-head">
        <span class="avatar big">${esc(initials(c.name))}</span>
        <div>
          <h2>${esc(c.name)}</h2>
          <div class="cc-badges">
            ${c.has_guardian ? '<span class="badge">Bewind</span>' : ''}
            ${c.active ? '' : '<span class="badge grey">Gearchiveerd</span>'}
          </div>
        </div>
      </div>
      ${info.length ? `<dl class="info">${info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      <div class="stat-row">
        <div><span>Deze maand</span><strong>${fmtEUR(s.month)}</strong></div>
        <div><span>Dit jaar</span><strong>${fmtEUR(s.year)}</strong></div>
        <div><span>Totaal · ${s.count}</span><strong>${fmtEUR(s.total)}</strong></div>
      </div>
      <div class="btn-row">
        ${c.active ? `<button class="btn primary" type="button" data-act="client-add-receipt" data-id="${esc(c.id)}">+ Bonnetje</button>` : ''}
        <button class="btn secondary" type="button" data-act="client-report" data-id="${esc(c.id)}">Uitdraai</button>
        <button class="btn secondary" type="button" data-act="client-edit" data-id="${esc(c.id)}">Gegevens wijzigen</button>
      </div>
      <h3>Bonnetjes</h3>
      <div class="receipt-list">
        ${s.receipts.length ? s.receipts.slice(0, 30).map(r => receiptRow(r, { showClient: false })).join('') : emptyState('Nog geen bonnetjes voor deze cliënt.')}
      </div>
      ${s.count > 30 ? `<button class="btn ghost" type="button" data-act="client-search" data-id="${esc(c.id)}">Alle ${s.count} bonnetjes bekijken</button>` : ''}
      <div class="danger-zone">
        <button class="btn ghost small" type="button" data-act="client-archive" data-id="${esc(c.id)}">${c.active ? 'Archiveren' : 'Terugzetten (niet meer gearchiveerd)'}</button>
        <button class="btn danger small" type="button" data-act="client-delete" data-id="${esc(c.id)}">Verwijderen</button>
      </div>
      <p class="muted small">Archiveren verbergt de cliënt bij "Nieuw bonnetje", maar de bonnetjes blijven bewaard voor uitdraaien.</p>
    </div>`);
}

function openClientForm(c = null) {
  const v = c || { name: '', client_number: '', has_guardian: false, guardian_name: '', guardian_contact: '', notes: '' };
  openModal(`
    <form id="client-form" class="stack" novalidate>
      <h2>${c ? 'Cliënt wijzigen' : 'Nieuwe cliënt'}</h2>
      <label>Naam <span class="muted small">(voorletter + achternaam)</span>
        <input name="name" value="${esc(v.name)}" placeholder="bv. J. Bakker" maxlength="120" required autocomplete="off">
      </label>
      <label>Cliëntnummer <span class="muted small">(optioneel)</span>
        <input name="client_number" value="${esc(v.client_number || '')}" autocomplete="off">
      </label>
      <label class="check"><input type="checkbox" name="has_guardian"${v.has_guardian ? ' checked' : ''}> Staat onder bewind</label>
      <div class="guardian-fields"${v.has_guardian ? '' : ' hidden'}>
        <label>Bewindvoerder / kantoor
          <input name="guardian_name" value="${esc(v.guardian_name || '')}" autocomplete="off">
        </label>
        <label>Contact bewindvoerder <span class="muted small">(e-mail of telefoon)</span>
          <input name="guardian_contact" value="${esc(v.guardian_contact || '')}" autocomplete="off">
        </label>
      </div>
      <label>Notities <span class="muted small">(optioneel, alleen voor jezelf)</span>
        <textarea name="notes" rows="3">${esc(v.notes || '')}</textarea>
      </label>
      <p id="client-form-error" class="form-error" hidden></p>
      <div class="btn-row">
        <button class="btn primary" type="submit">Opslaan</button>
        <button class="btn ghost" type="button" ${c ? `data-act="client-open" data-id="${esc(c.id)}"` : 'data-close'}>Annuleren</button>
      </div>
    </form>`);
  const form = $('client-form');
  form.has_guardian.addEventListener('change', () => {
    form.querySelector('.guardian-fields').hidden = !form.has_guardian.checked;
  });
  form.addEventListener('submit', guard(async e => {
    e.preventDefault();
    const data = {
      ...(c || {}),
      name: form.name.value.trim().replace(/\s+/g, ' '),
      client_number: form.client_number.value.trim(),
      has_guardian: form.has_guardian.checked,
      guardian_name: form.has_guardian.checked ? form.guardian_name.value.trim() : '',
      guardian_contact: form.has_guardian.checked ? form.guardian_contact.value.trim() : '',
      notes: form.notes.value.trim(),
    };
    if (!formError('client-form-error', data.name ? null : 'Vul een naam in.')) return;
    const dup = state.clients.find(x => x.id !== data.id && norm(x.name) === norm(data.name));
    if (dup && !confirm(`Er is al een cliënt "${dup.name}". Toch opslaan?`)) return;
    busy(true);
    try {
      const saved = await Api.saveClient(data);
      upsertClient(saved);
      renderAll();
      toast(c ? 'Cliënt bijgewerkt' : `${saved.name} toegevoegd`);
      openClientCard(saved.id);
    } finally {
      busy(false);
    }
  }));
  form.name.focus();
}

async function toggleArchive(id) {
  const c = state.clientsById.get(id);
  busy(true);
  try {
    const saved = await Api.saveClient({ ...c, active: !c.active });
    upsertClient(saved);
    if (!saved.active && state.selectedClientId === id) state.selectedClientId = null;
    renderAll();
    toast(saved.active ? `${saved.name} staat weer in de lijst` : `${saved.name} is gearchiveerd`);
    openClientCard(id);
  } finally {
    busy(false);
  }
}

async function deleteClient(id) {
  const c = state.clientsById.get(id);
  const count = state.receipts.filter(r => r.client_id === id).length;
  if (count) {
    alert(`${c.name} heeft nog ${count} ${count === 1 ? 'bonnetje' : 'bonnetjes'}. Die zijn nodig voor je administratie, dus de cliënt kan niet worden verwijderd.\n\nKies "Archiveren" om de cliënt te verbergen. Of verwijder eerst de bonnetjes.`);
    return;
  }
  if (!confirm(`${c.name} definitief verwijderen?`)) return;
  busy(true);
  try {
    await Api.deleteClient(id);
    state.clients = state.clients.filter(x => x.id !== id);
    indexClients();
    if (state.selectedClientId === id) state.selectedClientId = null;
    renderAll();
    closeModal();
    toast(`${c.name} is verwijderd`);
  } finally {
    busy(false);
  }
}

// =====================================================================
//  Eén bonnetje bekijken / wijzigen / verwijderen
// =====================================================================
function openReceipt(id) {
  const r = state.receipts.find(x => x.id === id);
  if (!r) return;
  const c = state.clientsById.get(r.client_id);
  openModal(`
    <div class="receipt-detail">
      <div class="big-amount">${fmtEUR(toCents(r.amount))}</div>
      <h2>${esc(r.description)}</h2>
      <dl class="info">
        <dt>Datum</dt><dd>${fmtDate(r.receipt_date)}</dd>
        <dt>Cliënt</dt><dd><button type="button" class="link" data-act="client-open" data-id="${esc(r.client_id)}">${esc(clientName(r.client_id))}</button></dd>
        ${c?.client_number ? `<dt>Cliëntnummer</dt><dd>${esc(c.client_number)}</dd>` : ''}
        ${c?.has_guardian ? `<dt>Bewindvoerder</dt><dd>${esc(c.guardian_name || 'ja')}</dd>` : ''}
      </dl>
      ${r.photo_path
        ? `<a class="photo-large" data-photo-link="${esc(r.photo_path)}" target="_blank" rel="noopener"><img data-photo="${esc(r.photo_path)}" alt="Foto van het bonnetje"></a>`
        : '<p class="muted">Geen foto bij dit bonnetje.</p>'}
      <div class="btn-row">
        <button class="btn secondary" type="button" data-act="receipt-edit" data-id="${esc(r.id)}">Wijzigen</button>
        <button class="btn secondary" type="button" data-receipt-pdf="${esc(r.id)}">PDF</button>
        <button class="btn danger" type="button" data-act="receipt-delete" data-id="${esc(r.id)}">Verwijderen</button>
      </div>
    </div>`);
  // Link naar volledige foto (opent in nieuw tabblad).
  if (r.photo_path) {
    Api.photoUrls([r.photo_path]).then(u => {
      const a = $('modal-body').querySelector('[data-photo-link]');
      if (a && u[r.photo_path]) a.href = u[r.photo_path];
    });
  }
}

function openReceiptEdit(id) {
  const r = state.receipts.find(x => x.id === id);
  if (!r) return;
  let photoChange;             // undefined = niets veranderd, Blob = nieuw, null = weg
  let previewUrl = null;
  openModal(`
    <form id="receipt-form" class="stack" novalidate>
      <h2>Bonnetje wijzigen</h2>
      <label>Cliënt<select name="client_id">${clientOptions(r.client_id)}</select></label>
      <div class="two-col">
        <label>Bedrag
          <span class="amount-field"><span>€</span><input name="amount" inputmode="decimal" value="${esc(Number(r.amount).toFixed(2).replace('.', ','))}"></span>
        </label>
        <label>Datum<input name="receipt_date" type="date" value="${esc(r.receipt_date)}"></label>
      </div>
      <label>Omschrijving<input name="description" maxlength="500" value="${esc(r.description)}"></label>
      <div class="edit-photo">
        <div class="thumb large">${r.photo_path ? `<img data-photo="${esc(r.photo_path)}" alt="">` : '<span class="no-photo">geen<br>foto</span>'}</div>
        <div class="stack-small">
          <label class="btn secondary small">Nieuwe foto<input name="photo" type="file" accept="image/*" hidden></label>
          ${r.photo_path ? '<button class="btn ghost small" type="button" id="rf-remove-photo">Foto verwijderen</button>' : ''}
        </div>
      </div>
      <p id="receipt-form-error" class="form-error" hidden></p>
      <div class="btn-row">
        <button class="btn primary" type="submit">Opslaan</button>
        <button class="btn ghost" type="button" data-act="receipt-open" data-id="${esc(r.id)}">Annuleren</button>
      </div>
    </form>`);
  const form = $('receipt-form');
  const thumb = form.querySelector('.thumb');
  const showThumb = src => {
    thumb.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span class="no-photo">geen<br>foto</span>';
  };
  form.photo.addEventListener('change', guard(async () => {
    const file = form.photo.files[0];
    if (!file) return;
    busy(true);
    try {
      photoChange = await compressImage(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(photoChange);
      showThumb(previewUrl);
    } finally {
      busy(false);
    }
  }));
  $('rf-remove-photo')?.addEventListener('click', () => { photoChange = null; showThumb(null); });
  form.addEventListener('submit', guard(async e => {
    e.preventDefault();
    const changes = {
      client_id: form.client_id.value,
      amount: parseAmount(form.amount.value),
      receipt_date: form.receipt_date.value,
      description: form.description.value.trim(),
    };
    if (!formError('receipt-form-error', validateReceipt(changes))) return;
    busy(true);
    try {
      const saved = await Api.saveReceipt({ ...r, ...changes }, photoChange);
      upsertReceipt(saved);
      renderAfterReceiptChange();
      toast('Bonnetje bijgewerkt');
      openReceipt(saved.id);
    } finally {
      busy(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    }
  }));
}

async function deleteReceipt(id) {
  const r = state.receipts.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Bonnetje "${r.description}" van ${fmtEUR(toCents(r.amount))} verwijderen?\nDit kan niet ongedaan worden gemaakt.`)) return;
  busy(true);
  try {
    await Api.deleteReceipt(r);
    state.receipts = state.receipts.filter(x => x.id !== id);
    renderAfterReceiptChange();
    closeModal();
    toast('Bonnetje verwijderd');
  } finally {
    busy(false);
  }
}

// =====================================================================
//  Tabblad: Uitdraaien
// =====================================================================
function getPeriod() {
  const mode = document.querySelector('input[name="p-mode"]:checked').value;
  if (mode === 'month') {
    const ym = $('p-month').value || currentMonth();
    return { ...monthRange(ym), ym };
  }
  let from = $('p-from').value, to = $('p-to').value;
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to, ym: null };
}

function periodReceipts() {
  const { from, to } = getPeriod();
  return state.receipts.filter(r => inPeriod(r, from, to));
}

function renderReport() {
  const { from, to } = getPeriod();
  const rs = periodReceipts();
  const per = new Map();
  for (const r of rs) per.set(r.client_id, (per.get(r.client_id) || 0) + toCents(r.amount));
  const rows = [...per.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  $('p-summary').innerHTML = `
    <div class="summary-top">
      <div>
        <span class="muted">Terug te ontvangen · ${esc(periodLabel(from, to))}</span>
        <div class="big-amount">${fmtEUR(sumCents(rs))}</div>
      </div>
      <div class="summary-counts">
        <div><strong>${rs.length}</strong><span>bonnetjes</span></div>
        <div><strong>${per.size}</strong><span>cliënten</span></div>
        <div><strong>${rs.filter(r => !r.photo_path).length}</strong><span>zonder foto</span></div>
      </div>
    </div>
    ${rows.length ? `<div class="bars">${rows.map(([id, v]) => `
      <button type="button" class="bar-row" data-report-client="${esc(id)}">
        <span class="bar-label">${esc(clientName(id))}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(v / max * 100).toFixed(1)}%"></span></span>
        <span class="bar-value">${fmtEUR(v)}</span>
      </button>`).join('')}</div>` : emptyState('Geen bonnetjes in deze periode.')}`;
  $('p-list').innerHTML = rs.length ? rs.map(r => receiptRow(r, { pdfButton: true })).join('') : emptyState('Geen bonnetjes in deze periode.');
  $('p-total').disabled = !rs.length;
  loadThumbs($('p-list'));
}

function periodSlug() {
  const { from, to, ym } = getPeriod();
  return ym || [from || 'begin', to || 'nu'].join('_tm_');
}

async function makePdf(builder, filename) {
  const buttons = document.querySelectorAll('#tab-uitdraaien button, #s-pdf, [data-receipt-pdf]');
  buttons.forEach(b => { b.disabled = true; });
  $('p-progress').hidden = false;
  $('p-progress').textContent = 'PDF wordt gemaakt…';
  busy(true);
  try {
    const doc = await builder(msg => { $('p-progress').textContent = msg; });
    doc.save(filename);
    toast('PDF is gedownload');
  } finally {
    busy(false);
    $('p-progress').hidden = true;
    buttons.forEach(b => { b.disabled = false; });
    renderReport();
    renderSearch();
  }
}

function employeeName() { return $('p-name').value.trim() || state.user?.displayName || ''; }

const pdfTotal = guard(() => {
  const { from, to } = getPeriod();
  return makePdf(onProgress => PDF.report({
    receipts: periodReceipts(), clientsById: state.clientsById, from, to,
    employeeName: employeeName(), includePhotos: $('p-photos').checked, onProgress,
  }), `declaratie-${periodSlug()}.pdf`);
});

const pdfClient = guard(clientId => {
  const id = clientId || $('p-client').value;
  if (!id) { toast('Kies eerst een cliënt.', 'error'); $('p-client').focus(); return; }
  const client = state.clientsById.get(id);
  const { from, to } = getPeriod();
  return makePdf(onProgress => PDF.report({
    receipts: periodReceipts().filter(r => r.client_id === id), clientsById: state.clientsById, from, to,
    client, employeeName: employeeName(), includePhotos: $('p-photos').checked, onProgress,
  }), `bonnetjes-${safeFilename(client.name)}-${periodSlug()}.pdf`);
});

const pdfSingle = guard(id => {
  const r = state.receipts.find(x => x.id === id);
  if (!r) return;
  const client = state.clientsById.get(r.client_id);
  return makePdf(() => PDF.single({ receipt: r, client, employeeName: employeeName() }),
    `bonnetje-${r.receipt_date}-${safeFilename(client?.name || 'client')}.pdf`);
});

const pdfSearch = guard(() => {
  const results = searchResults();
  const clientId = $('s-client').value;
  return makePdf(onProgress => PDF.report({
    receipts: results, clientsById: state.clientsById, from: $('s-from').value, to: $('s-to').value,
    client: clientId ? state.clientsById.get(clientId) : null,
    employeeName: employeeName(), includePhotos: $('p-photos').checked, onProgress,
  }), `zoekresultaten-${todayISO()}.pdf`);
});

const saveDisplayName = guard(async () => {
  const name = $('p-name').value.trim();
  if (name === (state.user.displayName || '')) return;
  state.user = await Api.updateDisplayName(name);
  $('user-label').textContent = state.user.displayName || state.user.email;
  toast('Naam opgeslagen');
});

// =====================================================================
//  Alle knoppen koppelen
// =====================================================================
function bindEvents() {
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter || $('login-form').querySelector('button');
    btn.disabled = true;
    $('login-error').hidden = true;
    try {
      const user = await Api.signIn($('login-user').value, $('login-pass').value);
      await enterApp(user);
    } catch (err) {
      showLogin(err.message);
    } finally {
      btn.disabled = false;
    }
  });
  $('logout-btn').addEventListener('click', () => logout(false));

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

  // Nieuw bonnetje
  $('nb-client-filter').addEventListener('input', renderClientChips);
  $('nb-camera').addEventListener('change', guard(e => handlePhoto(e.target.files[0])));
  $('nb-gallery').addEventListener('change', guard(e => handlePhoto(e.target.files[0])));
  $('nb-photo-remove').addEventListener('click', clearNewPhoto);
  $('new-form').addEventListener('submit', saveNewReceipt);
  $('nb-date').value = todayISO();
  $('nb-date').max = todayISO();

  // Zoeken
  const research = () => { state.searchLimit = 50; renderSearch(); };
  $('s-text').addEventListener('input', debounce(research, 150));
  ['s-client', 's-from', 's-to'].forEach(id => $(id).addEventListener('change', research));
  $('s-reset').addEventListener('click', () => {
    $('s-text').value = ''; $('s-client').value = ''; $('s-from').value = ''; $('s-to').value = '';
    research();
  });
  $('s-more').addEventListener('click', () => { state.searchLimit += 50; renderSearch(); });
  $('s-pdf').addEventListener('click', () => pdfSearch());

  // Cliënten
  $('c-add').addEventListener('click', () => openClientForm());
  $('c-filter').addEventListener('input', renderClients);
  $('c-show-archived').addEventListener('change', renderClients);

  // Uitdraaien
  $('p-month').value = currentMonth();
  document.querySelectorAll('input[name="p-mode"]').forEach(r => r.addEventListener('change', () => {
    const range = document.querySelector('input[name="p-mode"]:checked').value === 'range';
    $('p-month-row').hidden = range;
    $('p-range-row').hidden = !range;
    if (range && !$('p-from').value) {
      const m = monthRange($('p-month').value || currentMonth());
      $('p-from').value = m.from;
      $('p-to').value = m.to;
    }
    renderReport();
  }));
  ['p-month', 'p-from', 'p-to'].forEach(id => $(id).addEventListener('change', renderReport));
  $('p-total').addEventListener('click', () => pdfTotal());
  $('p-client-btn').addEventListener('click', () => pdfClient());
  $('p-name').addEventListener('change', saveDisplayName);

  // Venster sluiten (ook met de terugknop van de telefoon)
  $('modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  window.addEventListener('popstate', () => { if (!$('modal').hidden) hideModal(); });

  // Telefoon: tabbalk verbergen zolang het toetsenbord open is
  const typingField = 'input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea';
  document.addEventListener('focusin', e => { if (e.target.matches?.(typingField)) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => document.body.classList.remove('typing'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

  // Klikken op dynamische onderdelen (lijsten, kaarten, knoppen in het venster)
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-receipt-pdf],[data-act],[data-receipt],[data-client],[data-pick-client],[data-goto],[data-report-client]');
    if (!el) return;
    const d = el.dataset;
    if (d.receiptPdf) { e.stopPropagation(); pdfSingle(d.receiptPdf); return; }
    if (d.pickClient) {
      selectClient(d.pickClient);
      // Meteen door naar de foto, zodat je op de telefoon niet hoeft te scrollen.
      if (!state.newPhoto) $('nb-photo-buttons').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (d.goto) return setTab(d.goto);
    if (d.client) return openClientCard(d.client);
    if (d.reportClient) { $('p-client').value = d.reportClient; return pdfClient(d.reportClient); }
    if (d.receipt) return openReceipt(d.receipt);
    const id = d.id;
    switch (d.act) {
      case 'client-open': return openClientCard(id);
      case 'client-edit': return openClientForm(state.clientsById.get(id));
      case 'client-archive': return guard(toggleArchive)(id);
      case 'client-delete': return guard(deleteClient)(id);
      case 'client-add-receipt':
        closeModal();
        setTab('nieuw');
        selectClient(id);
        $('nb-photo-buttons').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      case 'client-report':
        closeModal();
        setTab('uitdraaien');
        $('p-client').value = id;
        return;
      case 'client-search':
        closeModal();
        $('s-client').value = id;
        setTab('zoeken');
        return;
      case 'receipt-open': return openReceipt(id);
      case 'receipt-edit': return openReceiptEdit(id);
      case 'receipt-delete': return guard(deleteReceipt)(id);
    }
  });
  // Toetsenbord: Enter op een lijst-regel opent hem.
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches?.('[data-receipt]')) openReceipt(e.target.dataset.receipt);
  });
}

// =====================================================================
//  Opstarten
// =====================================================================
(async function boot() {
  bindEvents();
  busy(true);
  try {
    if (Idle.expired()) {
      await logout(true);
      return;
    }
    const user = await Api.getUser();
    if (user) await enterApp(user); else showLogin();
  } catch (e) {
    console.error(e);
    showLogin(e.message);
  } finally {
    busy(false);
  }
})();
