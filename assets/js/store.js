/* Хранилище знаков: Supabase (если настроен) или локальный режим с экспортом в JSON. */
window.Store = (function () {
  var signs = [];
  var subs = [];
  var cfg = window.CONFIG.supabase || {};
  var online = !!(cfg.url && cfg.anonKey);
  var table = cfg.table || 'signs';
  var LOCAL_KEY = 'kng_signs_v1';
  var lastError = null;

  function emit() { subs.forEach(function (f) { f(signs.slice()); }); }

  function headers(extra) {
    var h = {
      'apikey': cfg.anonKey,
      'Authorization': 'Bearer ' + cfg.anonKey,
      'Content-Type': 'application/json'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = headers(opts.headers);
    return fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/' + table + path, opts)
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300)); });
        return r.status === 204 ? null : r.json();
      });
  }

  function fromRow(r) {
    return {
      id: r.id,
      type: r.type,
      path: r.path,
      side: r.side || null,
      direction: r.direction || 'forward',
      speed: r.speed == null ? null : r.speed,
      lanes: r.lanes || null,
      zone: r.zone || null,
      note: r.note || '',
      author: r.author || '',
      updatedAt: r.updated_at || null
    };
  }

  function toRow(s) {
    return {
      id: s.id,
      type: s.type,
      path: s.path,
      side: s.side || null,
      direction: s.direction || 'forward',
      speed: s.speed == null ? null : s.speed,
      lanes: s.lanes || null,
      zone: s.zone || null,
      note: s.note || '',
      author: s.author || '',
      updated_at: new Date().toISOString()
    };
  }

  function loadLocal() {
    try {
      signs = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch (e) { signs = []; }
    emit();
    return signs;
  }

  function saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(signs)); }
    catch (e) { lastError = 'Не удалось сохранить локально: ' + e.message; }
  }

  function load() {
    lastError = null;
    if (!online) { loadLocal(); return Promise.resolve(signs); }
    return api('?select=*&order=updated_at.desc')
      .then(function (rows) { signs = rows.map(fromRow); emit(); return signs; })
      .catch(function (e) {
        lastError = e.message;
        loadLocal();
        return signs;
      });
  }

  // Отпечаток набора знаков: по нему видно, изменилось ли что-то на сервере.
  function fingerprint(list) {
    return JSON.stringify(list.map(function (s) {
      return [s.id, s.type, s.side, s.direction, s.speed, s.lanes, s.note, s.path && s.path.length, s.updatedAt];
    }));
  }

  // Тихое обновление с сервера. Возвращает true, если данные поменялись.
  var refreshing = null;
  function refresh() {
    if (!online) return Promise.resolve(false);
    if (refreshing) return refreshing;             // без параллельных запросов
    refreshing = api('?select=*&order=updated_at.desc')
      .then(function (rows) {
        lastError = null;
        var next = rows.map(fromRow);
        if (fingerprint(next) === fingerprint(signs)) return false;
        signs = next;
        emit();
        return true;
      })
      .catch(function (e) { lastError = e.message; return false; })
      .then(function (res) { refreshing = null; return res; });
    return refreshing;
  }

  var timer = null;
  function startAutoRefresh(ms, guard) {
    if (!online || timer) return;
    timer = setInterval(function () {
      if (document.hidden) return;
      if (guard && guard()) return;                 // идёт рисование/открыта карточка — не мешаем
      refresh();
    }, ms || 30000);
  }

  function stopAutoRefresh() { if (timer) { clearInterval(timer); timer = null; } }

  function upsert(sign) {
    var now = new Date().toISOString();
    sign.updatedAt = now;
    var idx = signs.findIndex(function (s) { return s.id === sign.id; });
    if (idx >= 0) signs[idx] = sign; else signs.push(sign);
    emit();
    if (!online) { saveLocal(); return Promise.resolve(sign); }
    var isNew = idx < 0;
    var opts = {
      method: isNew ? 'POST' : 'PATCH',
      body: JSON.stringify(toRow(sign)),
      headers: { 'Prefer': 'return=representation' }
    };
    var q = isNew ? '' : '?id=eq.' + encodeURIComponent(sign.id);
    return api(q, opts).catch(function (e) {
      lastError = e.message;
      return Promise.reject(e);
    });
  }

  function remove(id) {
    signs = signs.filter(function (s) { return s.id !== id; });
    emit();
    if (!online) { saveLocal(); return Promise.resolve(); }
    return api('?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).catch(function (e) {
      lastError = e.message;
      return Promise.reject(e);
    });
  }

  function replaceAll(list) {
    signs = list.slice();
    emit();
    if (!online) { saveLocal(); return Promise.resolve(); }
    // Полная перезапись онлайн-базы: удаляем всё и вставляем заново.
    return api('?id=not.is.null', { method: 'DELETE' })
      .then(function () {
        if (!signs.length) return null;
        return api('', { method: 'POST', body: JSON.stringify(signs.map(toRow)) });
      });
  }

  function author() { return localStorage.getItem('kng_author') || ''; }
  function setAuthor(v) { localStorage.setItem('kng_author', v || ''); }

  return {
    load: load,
    refresh: refresh,
    startAutoRefresh: startAutoRefresh,
    stopAutoRefresh: stopAutoRefresh,
    upsert: upsert,
    remove: remove,
    replaceAll: replaceAll,
    subscribe: function (f) { subs.push(f); },
    all: function () { return signs.slice(); },
    isOnline: function () { return online; },
    lastError: function () { return lastError; },
    author: author,
    setAuthor: setAuthor
  };
})();
