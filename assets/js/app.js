/* Сборка приложения: карта, слои, фильтры, кнопки. */
(function () {
  var map, signsGroup, roadsGroup, labelsLayer, previewGroup;
  var signs = [];
  var filters = { types: {}, timeOnly: false, speeds: {} };
  var renderedCount = 0;
  var panoOpen = false;

  function $(id) { return document.getElementById(id); }

  function initMap() {
    map = L.map('map', {
      center: window.CONFIG.center,
      zoom: window.CONFIG.zoom,
      minZoom: window.CONFIG.minZoom,
      maxZoom: window.CONFIG.maxZoom,
      zoomControl: false,
      attributionControl: true
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
      buildRoadLayer();
    } else {
      setStatus('Не загрузилась дорожная сеть (data/roads.js)', true);
    }
    return Promise.resolve();
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
      var name = document.createElement('span');
      name.className = 'f-name';
      name.textContent = T.code + ' ' + T.label;
      var cnt = document.createElement('span');
      cnt.className = 'f-count';
      cnt.textContent = count;
      row.appendChild(cb); row.appendChild(sw); row.appendChild(name); row.appendChild(cnt);
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

  function rerender() {
    var detail = map.getZoom() >= DETAIL_ZOOM;
    renderedCount = SignRender.render(signsGroup, signs, filters, map, detail);
    $('shown-count').textContent = renderedCount + ' из ' + signs.length;
  }

  function onDataChanged(list) {
    signs = list;
    buildFilters();
    rerender();
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

  // ---------- панорама ----------

  function togglePano(force) {
    panoOpen = force === undefined ? !panoOpen : force;
    $('pano-wrap').hidden = !panoOpen;
    $('btn-pano').classList.toggle('on', panoOpen);
    if (!panoOpen) { Panorama.destroy(); return; }
    var c = map.getCenter();
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
        if (!confirm('Заменить все текущие данные (' + signs.length + ' участков) на ' + data.length + ' из файла?')) return;
        Store.replaceAll(data).then(function () { setStatus(statusText(), false); });
      } catch (e) {
        alert('Не получилось прочитать файл: ' + e.message);
      }
    };
    fr.readAsText(file);
  }

  // ---------- запуск ----------

  function wire() {
    $('btn-add').addEventListener('click', function () { Editor.startAdd(); });
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
      if (e.target.checked) roadsGroup.addTo(map); else map.removeLayer(roadsGroup);
    });
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
          Editor.removeSign(id);
        }
      }
    });

    map.on('zoomend', rerender);

    // клик по карте в режиме панорамы
    map.on('click', function (e) {
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
    var mapReady = initMap();
    wire();
    mapReady.then(function () {
      Editor.init(map, previewGroup, function () {
        rerender();
        buildFilters();
        setStatus(statusText(), !!Store.lastError());
      });
      return Store.load();
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
    });
    Store.subscribe(onDataChanged);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
