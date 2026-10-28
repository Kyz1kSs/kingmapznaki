/* Хранилище знаков: Supabase (если настроен) или локальный режим с экспортом в JSON.

   Удаление устроено так: прямой DELETE в таблице закрыт, а удаляет серверная
   функция delete_sign(id, owner_token, admin_password). Она разрешает удалить
   свою запись (совпал owner_token) или любую — если пароль совпал с админским.
   Пароль админа хранится в базе в виде sha256-хэша и в исходники не попадает. */
window.Store = (function () {
  var signs = [];
  var subs = [];
  var cfg = window.CONFIG.supabase || {};
  var online = !!(cfg.url && cfg.anonKey);
  var table = cfg.table || 'signs';
  var LOCAL_KEY = 'kng_signs_v1';
  var OWNER_KEY = 'kng_owner';
  var ADMIN_KEY = 'kng_admin_pw';
  var lastError = null;
  var rpcMissing = false;

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

  function base() { return cfg.url.replace(/\/$/, ''); }

  // Мобильный интернет любит «подвисать»: без таймаута запрос может не ответить
  // никогда, и тогда сайт навсегда остаётся в состоянии «загрузка…».
  var TIMEOUT = 12000;
  function tfetch(url, opts) {
    if (typeof AbortController === 'undefined') return fetch(url, opts);
    var ctrl = new AbortController();
    var id = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
    opts = opts || {};
    opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) { clearTimeout(id); return r; }, function (e) {
      clearTimeout(id);
      throw new Error(e && e.name === 'AbortError' ? 'база не ответила за ' + Math.round(TIMEOUT / 1000) + ' с' : (e && e.message) || 'сеть недоступна');
    });
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = headers(opts.headers);
    return tfetch(base() + '/rest/v1/' + table + path, opts)
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 300)); });
        return r.status === 204 ? null : r.json();
      });
  }

  function rpc(fn, body) {
    return tfetch(base() + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) {
          var e = new Error('HTTP ' + r.status + ': ' + t.slice(0, 300));
          e.status = r.status;
          e.body = t;
          throw e;
        }
        return t ? JSON.parse(t) : null;
      });
    });
  }

  // ---------- кто есть кто ----------

  function ownerToken() {
    var t = null;
    try { t = localStorage.getItem(OWNER_KEY); } catch (e) {}
    if (!t) {
      t = (crypto.randomUUID ? crypto.randomUUID() : 'o' + Date.now().toString(16) + Math.random().toString(16).slice(2));
      try { localStorage.setItem(OWNER_KEY, t); } catch (e) {}
    }
    return t;
  }

  var adminPassword = null;
  try { adminPassword = localStorage.getItem(ADMIN_KEY); } catch (e) {}

  function isAdmin() { return !!adminPassword; }

  // Проверяем пароль на сервере (сравнение с хэшем в базе).
  function loginAdmin(password) {
    if (!online) return Promise.reject(new Error('нет онлайн-базы'));
    return rpc('is_admin', { p_password: password }).then(function (ok) {
      if (!ok) throw new Error('неверный пароль');
      adminPassword = password;
      try { localStorage.setItem(ADMIN_KEY, password); } catch (e) {}
      emit();
      return true;
    });
  }

  function logoutAdmin() {
    adminPassword = null;
    try { localStorage.removeItem(ADMIN_KEY); } catch (e) {}
    emit();
  }

  // Может ли текущий посетитель удалить этот знак
  function canDelete(sign) {
    if (!online) return true;
    if (isAdmin()) return true;
    return !!(sign && sign.ownerToken && sign.ownerToken === ownerToken());
  }

  // ---------- данные ----------

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
      ownerToken: r.owner_token || null,
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
      owner_token: s.ownerToken || ownerToken(),
      updated_at: new Date().toISOString()
    };
  }

  function loadLocal() {
    try {
      signs = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch (e) { signs = []; }
    signs.forEach(function (s) { if (!s.ownerToken) s.ownerToken = ownerToken(); });
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
      .then(function (rows) {
        if (!Array.isArray(rows)) throw new Error('база вернула не список');
        signs = rows.map(fromRow); emit(); return signs;
      })
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
    if (!sign.ownerToken) sign.ownerToken = ownerToken();
    var idx = -1;
    for (var i = 0; i < signs.length; i++) if (signs[i].id === sign.id) { idx = i; break; }
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

  function knownRpcMissing(e) {
    var b = (e && (e.body || e.message)) || '';
    return /PGRST202|does not exist|Could not find the function|404/i.test(b);
  }

  function remove(id) {
    var sign = null;
    for (var i = 0; i < signs.length; i++) if (signs[i].id === id) sign = signs[i];
    if (!online) {
      signs = signs.filter(function (s) { return s.id !== id; });
      emit(); saveLocal(); return Promise.resolve();
    }
    function drop() {
      signs = signs.filter(function (s) { return s.id !== id; });
      emit();
    }
    if (rpcMissing) {
      return api('?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).then(drop).catch(function (e) {
        lastError = e.message;
        throw e;
      });
    }
    // основной путь — серверная проверка прав
    return rpc('delete_sign', {
      p_id: id,
      p_token: ownerToken(),
      p_password: adminPassword || null
    }).then(function (deleted) {
      if (!deleted) throw new Error('удалять чужие правки может только админ');
      drop();
    }).catch(function (e) {
      if (knownRpcMissing(e)) {
        rpcMissing = true;                       // SQL-миграция ещё не применена
        return remove(id);
      }
      lastError = e.message;
      throw e;
    });
  }

  function replaceAll(list) {
    signs = list.slice();
    emit();
    if (!online) { saveLocal(); return Promise.resolve(); }
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
    setAuthor: setAuthor,
    ownerToken: ownerToken,
    canDelete: canDelete,
    isAdmin: isAdmin,
    loginAdmin: loginAdmin,
    logoutAdmin: logoutAdmin
  };
})();
