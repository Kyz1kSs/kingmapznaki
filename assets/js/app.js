/* Сборка приложения: карта, слои, фильтры, кнопки. */
(function () {
  var map, signsGroup, roadsGroup, labelsLayer, previewGroup;
  var signs = [];
  var filters = { types: {}, timeOnly: false, speeds: {} };
  var renderedCount = 0;
  var panoOpen = false;

  function $(id) { return document.getElementById(id); }

  function initMap() {
    var startZoom = isMobile() ? Math.max(window.CONFIG.zoom, 16) : window.CONFIG.zoom;
    map = L.map('map', {
      center: window.CONFIG.center,
      zoom: startZoom,
      minZoom: window.CONFIG.minZoom,
      maxZoom: window.CONFIG.maxZoom,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true          // все полосы идут через canvas — заметно быстрее
    });

    L.tileLayer(window.CONFIG.esriImagery, {
      maxNativeZoom: window.CONFIG.esriMaxNativeZoom,
      maxZoom: window.CONFIG.maxZoom,
      attribution: 'Спутник: Esri, Maxar, Earthstar Geographics · Данные: © OpenStreetMap'
    }).addTo(map);

    labelsLayer = L.tileLayer(window.CONFIG.esriLabels, {
      maxNativeZoom: 18, maxZoom: window.CONFIG.maxZoom, opacity: 0.9
    });
    labelsLayer.addTo(map);

    window.kngMap = map; // отладочная ссылка: kngMap.setView([lat,lng], 18)

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

    roadsGroup = L.layerGroup();
    previewGroup = L.layerGroup().addTo(map);
    signsGroup = L.layerGroup().addTo(map);

    // дорожная сеть уже в data/roads.js — работает и через file://, и на Pages
    if (window.ROADS_DATA) {
      Roads.build(window.ROADS_DATA);
      // 520 линий сетки строим только когда её включают в сайдбаре
    } else {
      setStatus('Не загрузилась дорожная сеть (data/roads.js)', true);
    }
    return Promise.resolve();
  }

  var roadsBuilt = false;
  function ensureRoads() {
    if (roadsBuilt) return;
    roadsBuilt = true;
    buildRoadLayer();
  }

  function buildRoadLayer() {
    var edges = Roads.edges();
    var names = Roads.names();
    for (var i = 0; i < edges.length; i++) {
      L.polyline(edges[i].p, {
        color: names[edges[i].n] ? '#ffffff' : '#bcd0e5',
        weight: 1.4, opacity: 0.5, interactive: false
      }).addTo(roadsGroup);
    }
  }

  function setStatus(text, warn) {
    var el = $('storage-status');
    el.textContent = text;
    el.className = 'sub' + (warn ? ' warn' : '');
  }

  function statusText() {
    if (Store.isOnline()) {
      if (Store.lastError()) return 'Онлайн-база недоступна (' + Store.lastError().slice(0, 60) + '…) — правки в браузере';
      return 'Онлайн: правки сохраняются в общей базе';
    }
    return 'Локальный режим: правки только в этом браузере (нужен Supabase для общего доступа)';
  }

  // ---------- фильтры и легенда ----------

  function buildFilters() {
    var box = $('filters');
    box.innerHTML = '';
    var speedsSeen = {};
    signs.forEach(function (s) { if (s.type === 'speed' && s.speed != null) speedsSeen[s.speed] = true; });

    Object.keys(SignRender.TYPES).forEach(function (key) {
      var T = SignRender.TYPES[key];
      var count = signs.filter(function (s) { return s.type === key; }).length;
      if (filters.types[key] === undefined) filters.types[key] = true;

      var row = document.createElement('label');
      row.className = 'f-row';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = filters.types[key];
      cb.addEventListener('change', function () {
        filters.types[key] = cb.checked;
        rerender();
      });
      var sw = document.createElement('span');
      sw.className = 'sw';
      sw.style.background = key === 'speed'
        ? 'linear-gradient(90deg,#d00000,#f48c06,#ffd60a,#8ac926)'
        : T.color;
      var ico = document.createElement('span');
      ico.className = 'f-ico';
      ico.innerHTML = SignRender.face({ type: key, speed: 40, lanes: [{ turn: 'left' }, { turn: 'right' }] });
      var name = document.createElement('span');
      name.className = 'f-name';
      name.textContent = T.code + ' ' + T.label;
      var cnt = document.createElement('span');
      cnt.className = 'f-count';
      cnt.textContent = count;
      row.appendChild(cb); row.appendChild(ico); row.appendChild(name); row.appendChild(cnt);
      box.appendChild(row);
    });

    // подфильтр по значениям скорости
    var speedBox = $('speed-filters');
    speedBox.innerHTML = '';
    Object.keys(speedsSeen).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
      if (filters.speeds[v] === undefined) filters.speeds[v] = true;
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (filters.speeds[v] ? ' on' : '');
      chip.style.setProperty('--c', SignRender.speedColor(v));
      chip.textContent = v + ' км/ч';
      chip.addEventListener('click', function () {
        filters.speeds[v] = !filters.speeds[v];
        chip.classList.toggle('on', filters.speeds[v]);
        rerender();
      });
      speedBox.appendChild(chip);
    });
    $('speed-filters-wrap').hidden = !Object.keys(speedsSeen).length;
  }

  var DETAIL_ZOOM = 15;   // ниже этого зума рисуем только полосы, без значков и стрелок

  // Перерисовка через requestAnimationFrame: при быстрых кликах/зуме
  // не рисуем один и тот же кадр по нескольку раз
  var rafPending = 0;
  function rerender() {
    if (rafPending) return;
    rafPending = requestAnimationFrame(function () {
      rafPending = 0;
      var z = map.getZoom();
      var detail = z >= DETAIL_ZOOM;
      // цифры скорости — самая шумная часть: показываем только с z16
      renderedCount = SignRender.render(signsGroup, signs, filters, map, detail, z >= 16);
      $('shown-count').textContent = renderedCount + ' из ' + signs.length;
      if (window.Panorama) Panorama.setSigns(signs, filters);
    });
  }

  var filterSig = null;
  function filtersSignature(list) {
    var c = {};
    for (var i = 0; i < list.length; i++) c[list[i].type] = (c[list[i].type] || 0) + 1;
    var sp = {};
    for (var j = 0; j < list.length; j++) {
      var s = list[j];
      if (s.type === 'speed') sp[s.speed] = (sp[s.speed] || 0) + 1;
    }
    return JSON.stringify([c, sp, list.length]);
  }

  function onDataChanged(list) {
    signs = list;
    var sig = filtersSignature(list);
    if (sig !== filterSig) { filterSig = sig; buildFilters(); }
    rerender();
    updateAdminUi();
    setStatus(statusText(), !!Store.lastError());
    var t = new Date();
    var stamp = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2);
    var el = $('sync-time');
    if (el) el.textContent = Store.isOnline() ? 'обновлено ' + stamp : 'локально';
  }

  function syncNow() {
    var el = $('sync-time');
    if (el) el.textContent = 'обновляю…';
    return Store.refresh().then(function (changed) {
      if (!changed) {
        var t = new Date();
        var stamp = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2);
        var e2 = $('sync-time');
        if (e2) e2.textContent = 'обновлено ' + stamp;
      }
      return changed;
    });
  }

  // ---------- админ ----------

  function adminLogin(pw) {
    pw = (pw || '').trim();
    var st = $('admin-status');
    if (!pw) { if (st) st.textContent = 'введи пароль'; return; }
    if (st) st.textContent = 'проверяю…';
    Store.loginAdmin(pw).then(function () {
      if (st) st.textContent = 'админ-режим включён';
      var inp = $('admin-pw');
      if (inp) inp.value = '';
      rerender();
    }).catch(function (e) {
      var msg = String(e.message || e);
      if (/PGRST202|does not exist|Could not find/i.test(msg)) {
        if (st) st.textContent = 'нет доступа: сначала выполни SQL из supabase-admin.sql';
      } else {
        if (st) st.textContent = 'не пустило: ' + msg.replace(/^HTTP \d+: /, '').slice(0, 120);
      }
    });
  }

  function updateAdminUi() {
    var on = Store.isAdmin();
    var sec = $('admin-sec');
    if (!sec) return;
    var login = $('admin-login');
    var out = $('admin-out');
    var st = $('admin-status');
    if (login) login.hidden = on;
    if (out) out.hidden = !on;
    if (st && on) st.textContent = 'админ-режим: можно удалять любые участки';
    sec.classList.toggle('is-admin', on);
  }

  // ---------- панорама ----------

  function togglePano(force) {
    panoOpen = force === undefined ? !panoOpen : force;
    $('pano-wrap').hidden = !panoOpen;
    $('btn-pano').classList.toggle('on', panoOpen);
    if (!panoOpen) { Panorama.destroy(); return; }
    var c = map.getCenter();
    Panorama.setSigns(signs, filters);
    Panorama.show([c.lat, c.lng], $('pano'), function (msg) {
      $('pano-info').textContent = msg;
    });
  }

  // Переход в Яндекс.Карты на спутнике: там снимки над Кингисеппом свежее,
  // удобно разглядывать детали, которые на Esri не видны.
  function openInYandex() {
    var c = map.getCenter();
    var z = Math.max(3, Math.min(21, Math.round(map.getZoom()) + 1));
    var url = 'https://yandex.ru/maps/?ll=' + c.lng.toFixed(6) + ',' + c.lat.toFixed(6) +
      '&z=' + z + '&l=sat';
    window.open(url, '_blank', 'noopener');
  }

  // ---------- экспорт / импорт ----------

  function exportJson() {
    var blob = new Blob([JSON.stringify(signs, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kingisepp-signs-' + dateStamp() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function dateStamp() {
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }

  function importJson(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var data = JSON.parse(fr.result);
        if (!Array.isArray(data)) throw new Error('ожидался массив знаков');
        if (Store.isOnline() && !Store.isAdmin()) {
          alert('Импорт перезаписывает общую базу целиком — это доступно только в админ-режиме.');
          return;
        }
        if (!confirm('Заменить все текущие данные (' + signs.length + ' участков) на ' + data.length + ' из файла?')) return;
        Store.replaceAll(data).then(function () { setStatus(statusText(), false); });
      } catch (e) {
        alert('Не получилось прочитать файл: ' + e.message);
      }
    };
    fr.readAsText(file);
  }

  // ---------- запуск ----------

  function isMobile() { return window.matchMedia('(max-width: 760px)').matches; }

  // На телефоне сайдбар — нижний лист: открывается кнопкой ☰, закрывается
  // тапом по затемнению, ручкой или началом рисования.
  function toggleSidebar(force) {
    var open = force === undefined ? !document.body.classList.contains('sb-open') : !!force;
    document.body.classList.toggle('sb-open', open);
    if (open) { setTimeout(function () { map.invalidateSize(); }, 260); }
  }

  function wire() {
    $('btn-add').addEventListener('click', function () { toggleSidebar(false); Editor.startAdd(); });
    var sbBtn = $('btn-sb');
    if (sbBtn) sbBtn.addEventListener('click', function () { toggleSidebar(); });
    var sbClose = $('sb-close');
    if (sbClose) sbClose.addEventListener('click', function () { toggleSidebar(false); });
    var scrim = $('sb-scrim');
    if (scrim) scrim.addEventListener('click', function () { toggleSidebar(false); });
    var syncM = $('btn-sync-m');
    if (syncM) syncM.addEventListener('click', function () { syncNow(); });
    var syncBtn = $('btn-sync');
    if (syncBtn) syncBtn.addEventListener('click', function () { syncNow(); });
    $('btn-export').addEventListener('click', exportJson);
    $('btn-import').addEventListener('click', function () { $('file-import').click(); });
    $('file-import').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-pano').addEventListener('click', function () { togglePano(); });
    $('btn-ymaps').addEventListener('click', openInYandex);
    $('pano-close').addEventListener('click', function () { togglePano(false); });

    $('chk-labels').addEventListener('change', function (e) {
      if (e.target.checked) labelsLayer.addTo(map); else map.removeLayer(labelsLayer);
    });
    $('chk-roads').addEventListener('change', function (e) {
      if (e.target.checked) { ensureRoads(); roadsGroup.addTo(map); } else map.removeLayer(roadsGroup);
    });

    var pwBtn = $('btn-admin');
    if (pwBtn) pwBtn.addEventListener('click', function () { adminLogin($('admin-pw').value); });
    var outBtn = $('btn-admin-out');
    if (outBtn) outBtn.addEventListener('click', function () { Store.logoutAdmin(); });
    var pwInput = $('admin-pw');
    if (pwInput) pwInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') adminLogin(pwInput.value); });
    var panoPrev = $('pano-prev');
    if (panoPrev) panoPrev.addEventListener('click', function () { Panorama.step(false); });
    var panoNext = $('pano-next');
    if (panoNext) panoNext.addEventListener('click', function () { Panorama.step(true); });
    $('chk-time').addEventListener('change', function (e) {
      filters.timeOnly = e.target.checked;
      rerender();
    });

    var authorInput = $('author');
    authorInput.value = Store.author();
    authorInput.addEventListener('change', function () { Store.setAuthor(authorInput.value.trim()); });

    // кнопки в попапе знака
    map.getContainer().addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var sign = signs.filter(function (s) { return s.id === id; })[0];
      if (!sign) return;
      if (btn.getAttribute('data-act') === 'edit') {
        map.closePopup();
        Editor.openForEdit(sign);
      } else if (btn.getAttribute('data-act') === 'del') {
        if (confirm('Удалить этот участок?')) {
          map.closePopup();
          Editor.removeSign(id).catch(function (e) {
            alert('Не удалилось: ' + String(e.message || e));
          });
        }
      }
    });

    map.on('zoomend', rerender);

    // клик по карте в режиме панорамы
    map.on('click', function (e) {
      if (isMobile() && document.body.classList.contains('sb-open')) toggleSidebar(false);
      if (Editor.isPicking()) return;
      if (panoOpen) {
        Panorama.show([e.latlng.lat, e.latlng.lng], $('pano'), function (msg) {
          $('pano-info').textContent = msg;
        });
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') {
        if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
        toggleSidebar(false);
        Editor.startAdd();
      }
    });
  }

  // ?demo=1 — залить несколько примеров на центральные улицы (только локальный режим)
  function maybeDemo() {
    var p = new URLSearchParams(location.search);
    if (!p.has('demo') || Store.isOnline() || Store.all().length) return;
    var c = [window.CONFIG.center[0], window.CONFIG.center[1]];
    var edges = Roads.edges(), names = Roads.names();
    // для демо берём только крупные улицы (магистрали/районные),
    // иначе попадаются проезды, которых нет на спутнике
    var pool = edges.filter(function (e) {
      var mid = e.p[Math.floor(e.p.length / 2)];
      var len = Geo.pathLength(e.p);
      return names[e.n] && e.c <= 2 && Geo.hav(c, mid) < 900 && len > 70 && len < 300;
    });
    var picked = [];
    pool.forEach(function (e) {
      if (picked.length >= 6) return;
      for (var i = 0; i < picked.length; i++) {
        if (Geo.hav(picked[i].p[0], e.p[0]) < 120) return;
      }
      picked.push(e);
    });
    if (picked.length < 4) return;
    var specs = [
      { type: 'no_stopping', side: 'right' },
      { type: 'no_parking', side: 'left', zone: { from: '08:00', to: '20:00', days: 'all' } },
      { type: 'speed', speed: 40 },
      { type: 'lanes', lanes: [{ turn: 'left' }, { turn: 'straight' }, { turn: 'right' }] },
      { type: 'speed', speed: 60 },
      { type: 'no_parking', side: 'right' }
    ];
    var list = picked.map(function (e, i) {
      var sp = specs[i % specs.length];
      return {
        id: 'demo-' + i,
        type: sp.type,
        path: e.p.slice(0, Math.max(3, Math.round(e.p.length * 0.85))),
        side: sp.side || null,
        direction: 'forward',
        speed: sp.speed || null,
        lanes: sp.lanes || null,
        zone: sp.zone || null,
        note: 'демо-пример',
        author: 'демо'
      };
    });
    Store.replaceAll(list);
  }

  function boot() {
    var mapReady;
    try {
      // На телефоне файлы иногда не догружаются/кэшируются битыми — проверяем
      // зависимости и говорим об этом вслух, а не висим на «загрузка…».
      if (!window.L) throw new Error('не загрузилась библиотека карты (Leaflet)');
      if (!window.CONFIG) throw new Error('не загрузился assets/js/config.js');
      if (!window.Store) throw new Error('не загрузился assets/js/store.js');
      mapReady = initMap();
      wire();
    } catch (e) {
      setStatus('Ошибка запуска: ' + e.message + ' — обнови страницу', true);
      return;
    }
    mapReady.then(function () {
      try {
        Editor.init(map, previewGroup, function () {
          rerender();
          buildFilters();
          setStatus(statusText(), !!Store.lastError());
        });
      } catch (e) {
        // рисование отвалилось — карта и слои всё равно должны работать
        setStatus('Редактор не запустился: ' + e.message, true);
      }
      // Список слоёв и кнопки показываем сразу, не дожидаясь ответа базы.
      buildFilters();
      setStatus('загрузка…', false);
      return Store.load().catch(function () { return Store.all(); });
    }).then(function () {
      maybeDemo();
      onDataChanged(Store.all());
      // Правки других людей подтягиваются сами: раз в 30 с, если пользователь
      // ничего не рисует и не держит открытой карточку знака.
      Store.startAutoRefresh(30000, function () {
        return Editor.isActive() || !!document.querySelector('.leaflet-popup');
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) syncNow();
      });
      // ?add=1 — сразу режим рисования (используется ярлыком PWA)
      if (new URLSearchParams(location.search).has('add')) {
        setTimeout(function () { Editor.startAdd(); }, 400);
      }
    }).catch(function (e) {
      setStatus('Ошибка: ' + ((e && e.message) || e) + ' — обнови страницу', true);
    });
    Store.subscribe(onDataChanged);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
