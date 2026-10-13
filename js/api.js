// Alles wat met opslaan en ophalen te maken heeft.
// - Is config.js ingevuld? Dan praten we met Supabase (de echte, online versie).
// - Is config.js leeg? Dan draait de app in DEMO-modus: alles blijft in deze browser.

const CLIENT_FIELDS = ['name', 'client_number', 'has_guardian', 'guardian_name',
  'guardian_contact', 'notes', 'active'];
const RECEIPT_FIELDS = ['client_id', 'receipt_date', 'amount', 'description'];
const BUCKET = 'bonnetjes';

function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (f in obj) out[f] = obj[f];
  return out;
}

function loginToEmail(login, domain) {
  const s = String(login || '').trim().toLowerCase();
  return s.includes('@') ? s : `${s}@${domain}`;
}

function byName(a, b) { return a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }); }
function byDateDesc(a, b) {
  return b.receipt_date.localeCompare(a.receipt_date) || String(b.created_at).localeCompare(String(a.created_at));
}

// =====================================================================
//  Supabase (live)
// =====================================================================
function createSupabaseApi(cfg) {
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  let currentUser = null;
  const urlCache = new Map(); // pad → { url, expires }

  function mapUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      displayName: u.user_metadata?.display_name || '',
    };
  }

  function fail(error, fallback) {
    console.error(error);
    if (error?.code === '23503') throw new Error('Deze cliënt heeft nog bonnetjes. Archiveer de cliënt in plaats van te verwijderen.');
    if (/fetch|network/i.test(error?.message || '')) throw new Error('Geen verbinding met internet. Probeer het zo nog eens.');
    throw new Error(fallback);
  }

  async function uploadPhoto(blob) {
    const path = `${currentUser.id}/${new Date().getFullYear()}/${uuid()}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/jpeg', upsert: false, cacheControl: '3600',
    });
    if (error) fail(error, 'Uploaden van de foto is mislukt.');
    return path;
  }

  async function removePhoto(path) {
    if (!path) return;
    urlCache.delete(path);
    const { error } = await sb.storage.from(BUCKET).remove([path]);
    if (error) console.warn('Foto kon niet worden verwijderd', error);
  }

  return {
    isDemo: false,

    async getUser() {
      const { data } = await sb.auth.getSession();
      currentUser = mapUser(data.session?.user);
      return currentUser;
    },

    async signIn(login, password) {
      const { data, error } = await sb.auth.signInWithPassword({
        email: loginToEmail(login, cfg.USERNAME_DOMAIN || 'bonnetjes.app'),
        password,
      });
      if (error) {
        if (/invalid/i.test(error.message)) throw new Error('Onjuiste gebruikersnaam of wachtwoord.');
        fail(error, 'Inloggen is mislukt. Probeer het opnieuw.');
      }
      currentUser = mapUser(data.user);
      return currentUser;
    },

    async signOut() {
      currentUser = null;
      urlCache.clear();
      await sb.auth.signOut().catch(() => {});
    },

    async updateDisplayName(name) {
      const { data, error } = await sb.auth.updateUser({ data: { display_name: name } });
      if (error) fail(error, 'Naam opslaan is mislukt.');
      currentUser = mapUser(data.user);
      return currentUser;
    },

    async listClients() {
      const { data, error } = await sb.from('clients').select('*').order('name');
      if (error) fail(error, 'Cliënten ophalen is mislukt.');
      return data.sort(byName);
    },

    async saveClient(client) {
      const row = pick(client, CLIENT_FIELDS);
      const q = client.id
        ? sb.from('clients').update(row).eq('id', client.id)
        : sb.from('clients').insert(row);
      const { data, error } = await q.select().single();
      if (error) fail(error, 'Cliënt opslaan is mislukt.');
      return data;
    },

    async deleteClient(id) {
      const { error } = await sb.from('clients').delete().eq('id', id);
      if (error) fail(error, 'Cliënt verwijderen is mislukt.');
    },

    async listReceipts() {
      const all = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await sb.from('receipts').select('*')
          .order('receipt_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) fail(error, 'Bonnetjes ophalen is mislukt.');
        all.push(...data);
        if (data.length < pageSize) break;
      }
      return all;
    },

    // photo: Blob = nieuwe foto, null = foto weghalen, undefined = foto ongewijzigd
    async saveReceipt(receipt, photo) {
      const row = pick(receipt, RECEIPT_FIELDS);
      let newPath = null;
      if (photo) {
        newPath = await uploadPhoto(photo);
        row.photo_path = newPath;
      } else if (photo === null) {
        row.photo_path = null;
      }
      const q = receipt.id
        ? sb.from('receipts').update(row).eq('id', receipt.id)
        : sb.from('receipts').insert(row);
      const { data, error } = await q.select().single();
      if (error) {
        if (newPath) await removePhoto(newPath);
        fail(error, 'Bonnetje opslaan is mislukt.');
      }
      // Oude foto pas weghalen als de nieuwe gegevens veilig zijn opgeslagen.
      if (receipt.id && photo !== undefined && receipt.photo_path && receipt.photo_path !== data.photo_path) {
        await removePhoto(receipt.photo_path);
      }
      return data;
    },

    async deleteReceipt(receipt) {
      const { error } = await sb.from('receipts').delete().eq('id', receipt.id);
      if (error) fail(error, 'Bonnetje verwijderen is mislukt.');
      await removePhoto(receipt.photo_path);
    },

    // Tijdelijke (1 uur geldige) links naar privé-foto's.
    async photoUrls(paths) {
      const now = Date.now();
      const missing = [...new Set(paths.filter(p => p && !(urlCache.get(p)?.expires > now)))];
      if (missing.length) {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(missing, 3600);
        if (error) console.warn(error);
        for (const item of data || []) {
          if (item.signedUrl) urlCache.set(item.path, { url: item.signedUrl, expires: now + 50 * 60000 });
        }
      }
      const out = {};
      for (const p of paths) if (p && urlCache.has(p)) out[p] = urlCache.get(p).url;
      return out;
    },

    async photoDataUrl(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error) fail(error, 'Foto ophalen is mislukt.');
      return blobToDataURL(data);
    },
  };
}

// =====================================================================
//  Demo (alleen in deze browser, om uit te proberen)
// =====================================================================
function createDemoApi() {
  const KEY = 'bonnetjes-demo';
  const photos = new Map(); // in het geheugen; foto's zijn te groot voor localStorage
  let db = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw?.clients) return raw;
    } catch { /* leeg of geblokkeerd */ }
    const mk = (name, extra = {}) => ({
      id: uuid(), name, client_number: '', has_guardian: false, guardian_name: '',
      guardian_contact: '', notes: '', active: true, created_at: new Date().toISOString(), ...extra,
    });
    return {
      user: null,
      clients: [
        mk('A. de Vries', { client_number: '1001' }),
        mk('B. Jansen', { client_number: '1002', has_guardian: true, guardian_name: 'Bewindvoering Voorbeeld B.V.' }),
        mk('C. Bakker', { client_number: '1003' }),
      ],
      receipts: [],
    };
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* niet erg in demo */ }
  }

  const delay = v => new Promise(r => setTimeout(() => r(v), 120));
  const copy = v => JSON.parse(JSON.stringify(v));

  return {
    isDemo: true,

    async getUser() { return delay(db.user); },

    async signIn(login, password) {
      if (!String(login).trim() || !password) throw new Error('Vul een gebruikersnaam en wachtwoord in.');
      db.user = { id: 'demo', email: loginToEmail(login, 'demo'), displayName: db.user?.displayName || '' };
      persist();
      return delay(db.user);
    },

    async signOut() { db.user = null; persist(); },

    async updateDisplayName(name) {
      db.user.displayName = name;
      persist();
      return delay(db.user);
    },

    async listClients() { return delay(copy(db.clients).sort(byName)); },

    async saveClient(client) {
      const row = pick(client, CLIENT_FIELDS);
      let saved;
      if (client.id) {
        saved = db.clients.find(c => c.id === client.id);
        Object.assign(saved, row);
      } else {
        saved = { id: uuid(), created_at: new Date().toISOString(), active: true, ...row };
        db.clients.push(saved);
      }
      persist();
      return delay(copy(saved));
    },

    async deleteClient(id) {
      if (db.receipts.some(r => r.client_id === id)) {
        throw new Error('Deze cliënt heeft nog bonnetjes. Archiveer de cliënt in plaats van te verwijderen.');
      }
      db.clients = db.clients.filter(c => c.id !== id);
      persist();
      return delay();
    },

    async listReceipts() { return delay(copy(db.receipts).sort(byDateDesc)); },

    async saveReceipt(receipt, photo) {
      const row = pick(receipt, RECEIPT_FIELDS);
      row.amount = Number(row.amount).toFixed(2);
      if (photo) {
        const path = `demo/${uuid()}.jpg`;
        photos.set(path, await blobToDataURL(photo));
        row.photo_path = path;
      } else if (photo === null) {
        row.photo_path = null;
      }
      let saved;
      if (receipt.id) {
        saved = db.receipts.find(r => r.id === receipt.id);
        Object.assign(saved, row);
      } else {
        saved = { id: uuid(), created_at: new Date().toISOString(), photo_path: null, ...row };
        db.receipts.push(saved);
      }
      persist();
      return delay(copy(saved));
    },

    async deleteReceipt(receipt) {
      db.receipts = db.receipts.filter(r => r.id !== receipt.id);
      photos.delete(receipt.photo_path);
      persist();
      return delay();
    },

    async photoUrls(paths) {
      const out = {};
      for (const p of paths) if (photos.has(p)) out[p] = photos.get(p);
      return out;
    },

    async photoDataUrl(path) {
      if (!photos.has(path)) throw new Error('In de demo blijven foto\'s alleen bewaard tot je de pagina vernieuwt.');
      return photos.get(path);
    },
  };
}

const Api = (() => {
  const cfg = window.APP_CONFIG || {};
  const live = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase;
  return live ? createSupabaseApi(cfg) : createDemoApi();
})();
