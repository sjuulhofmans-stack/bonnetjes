// Kleine hulpfuncties die overal gebruikt worden.

const MONTHS_NL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
  'augustus', 'september', 'oktober', 'november', 'december'];

const eurFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

// Bedragen rekenen we in centen, zodat 0,10 + 0,20 netjes 0,30 blijft.
function toCents(amount) { return Math.round(Number(amount) * 100); }
function fmtEUR(cents) { return eurFormatter.format(cents / 100).replace(/ /g, ' '); }
function sumCents(receipts) { return receipts.reduce((s, r) => s + toCents(r.amount), 0); }

// "4,50" / "€ 4.50" / "1.234,56" → 4.5 (of NaN)
function parseAmount(text) {
  let s = String(text || '').replace(/[€\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayISO() { return isoDate(new Date()); }
function currentMonth() { return todayISO().slice(0, 7); }

// "2026-10-03" → "03-10-2026"
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

// "2026-10" → { from: "2026-10-01", to: "2026-10-31" }
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad2(last)}` };
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTHS_NL[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

function periodLabel(from, to) {
  if (from && to && from.slice(0, 7) === to.slice(0, 7)) {
    const r = monthRange(from.slice(0, 7));
    if (r.from === from && r.to === to) return monthLabel(from.slice(0, 7));
  }
  if (from && to) return `${fmtDate(from)} t/m ${fmtDate(to)}`;
  if (from) return `vanaf ${fmtDate(from)}`;
  if (to) return `t/m ${fmtDate(to)}`;
  return 'alle bonnetjes';
}

function inPeriod(r, from, to) {
  return (!from || r.receipt_date >= from) && (!to || r.receipt_date <= to);
}

// Tekst veilig in HTML zetten (voorkomt dat een naam als code wordt uitgevoerd).
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Voor zoeken: kleine letters, zonder accenten (cliënt → client).
function norm(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function uuid() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function safeFilename(text) {
  return norm(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bestand';
}

// ---------- Foto's ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Deze foto kan niet worden gelezen. Probeer een andere foto.'));
    img.src = src;
  });
}

// Verkleint een foto tot max. 1600 px en slaat hem op als JPEG (~200-400 KB).
// Zo gaat uploaden ook met slecht bereik snel, en blijft er veel gratis opslag over.
async function compressImage(file, maxSide = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) throw new Error('Foto verkleinen is mislukt.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// ---------- Meldingen ----------

function toast(message, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, type === 'error' ? 6000 : 3000);
}
