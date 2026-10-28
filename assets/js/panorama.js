/* Панорама Яндекс.Карт + проекция наших знаков поверх кадра.

   Как это работает: у плеера спрашиваем точку съёмки, направление взгляда (азимут,
   наклон) и угол обзора (span). Дальше каждая вершина полосы знака переводится в
   экранные координаты: по горизонтали — разница азимутов, по вертикали — насколько
   точка ниже горизонта (высота камеры / расстояние). Так полоса «лежит» на дороге
   и едет вместе с поворотом камеры. */
window.Panorama = (function () {
  var loading = null;
  var player = null;
  var box = null;            // контейнер панели (#pano)
  var ovBox = null;          // слой с нашими полосами и значками
  var signs = [];
  var filters = null;
  var onInfo = null;
  var raf = 0;
  var asked = null;          // точка, которую просили показать (для проверки порядка координат)
  var EYE = 2.6;             // высота камеры панорамы, м
  var D2R = Math.PI / 180;
  var MAX_DIST = 160;        // дальше знаки не рисуем: полоса тоньше пикселя, только мусор в кадре

  function hasApi() { return !!(window.CONFIG && window.CONFIG.yandexApiKey); }

  function loadApi() {
    if (!hasApi()) return Promise.reject(new Error('no-key'));
    if (window.ymaps) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://api-maps.yandex.ru/2.1/?apikey=' + encodeURIComponent(window.CONFIG.yandexApiKey) + '&lang=ru_RU';
      s.onload = function () {
        if (!window.ymaps) return reject(new Error('ymaps не загрузился'));
        window.ymaps.ready(function () { resolve(); });
      };
      s.onerror = function () { reject(new Error('не удалось загрузить API Яндекс.Карт')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function externalLink(latlng) {
    return 'https://yandex.ru/maps/?ll=' + latlng[1] + ',' + latlng[0] +
      '&z=18&l=stv%2Csta&panorama%5Bpoint%5D=' + latlng[1] + '%2C' + latlng[0] +
      '&panorama%5Bdirection%5D=0%2C0&panorama%5Bspan%5D=90%2C75';
  }

  // ---------- слой поверх панорамы ----------

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function ensureOverlay() {
    if (!box) return null;
    if (ovBox && box.contains(ovBox)) return ovBox;
    ovBox = document.createElement('div');
    ovBox.className = 'pano-ov';
    box.appendChild(ovBox);
    return ovBox;
  }

  function readView() {
    if (!player || !box) return null;
    var el = box.querySelector('.pano-player');
    if (!el || !el.clientWidth) return null;
    var pano = player.getPanorama();
    var pos = pano && pano.getPosition && pano.getPosition();
    if (!pos) return null;
    // Страховка от перепутанного порядка координат: getPosition отдаёт [lat, lng],
    // но если точка уехала от запрошенной — берём обратный порядок.
    if (asked && Geo.hav([pos[0], pos[1]], asked) > 300 && Geo.hav([pos[1], pos[0]], asked) < 300) {
      pos = [pos[1], pos[0]];
    }
    var dir = player.getDirection() || [0, 0];
    var span = player.getSpan() || [90, 60];
    return {
      lat: pos[0], lng: pos[1],
      az: dir[0], tilt: dir[1],
      spanH: span[0] || 90, spanV: span[1] || 60,
      w: el.clientWidth, h: el.clientHeight
    };
  }

  // Перспективная проекция: панорама — сфера, кадр — плоскость,
  // поэтому угол переводим через тангенс (так прямые остаются прямыми).
  function project(v, lat, lng) {
    var d = Geo.hav([v.lat, v.lng], [lat, lng]);
    if (d < 2.5 || d > MAX_DIST) return null;       // под знаком или слишком далеко
    var brg = Geo.bearing([v.lat, v.lng], [lat, lng]);
    var da = ((brg - v.az + 540) % 360) - 180;      // азимут точки относительно взгляда
    var halfH = Math.min(85, v.spanH / 2);
    var halfV = Math.min(85, v.spanV / 2);
    if (Math.abs(da) > Math.min(88, halfH * 1.15)) return null;
    var x = v.w / 2 + (Math.tan(da * D2R) / Math.tan(halfH * D2R)) * (v.w / 2);
    // getDirection() — [азимут, наклон вверх от горизонта]
    var pitch = -Math.atan2(EYE, d) / D2R;          // точка на земле всегда ниже горизонта
    var rel = pitch - v.tilt;
    var y = v.h / 2 - (Math.tan(rel * D2R) / Math.tan(halfV * D2R)) * (v.h / 2);
    return { x: x, y: y, d: d };
  }

  function passesFilters(sign) {
    if (filters && window.SignRender) return SignRender.matchFilters(sign, filters);
    return true;
  }

  function draw() {
    raf = 0;
    var v = readView();
    if (!v || !ovBox) return;
    var svg = [];
    var marks = [];
    var visible = 0;

    signs.forEach(function (sign) {
      if (!sign.path || sign.path.length < 2 || !passesFilters(sign)) return;
      var T = (window.SignRender && SignRender.TYPES[sign.type]) || null;
      if (!T) return;
      var color = SignRender.typeColor(sign);
      var sides = T.sided
        ? (sign.side === 'both' ? [-1, 1] : [sign.side === 'left' ? -1 : 1])
        : [0];

      sides.forEach(function (s) {
        var path = T.offset ? Geo.offsetPath(sign.path, s * T.offset) : sign.path;
        var chunks = [];
        var cur = [];
        for (var i = 0; i < path.length; i++) {
          var q = project(v, path[i][0], path[i][1]);
          if (!q) { if (cur.length > 1) chunks.push(cur); cur = []; continue; }
          cur.push(q);
        }
        if (cur.length > 1) chunks.push(cur);
        if (!chunks.length) return;
        visible++;
        chunks.forEach(function (chunk) {
          var pts = chunk.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
          var near = chunk[0].d;
          var w = clamp(300 / Math.max(near, 4), 2.2, 16);
          var dash = T.dash ? ' stroke-dasharray="' + Math.round(w * 3) + ' ' + Math.round(w * 2.2) + '"' : '';
          // тёмная подложка + цветная полоса
          svg.push('<polyline points="' + pts + '" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="' + (w + 2.5).toFixed(1) + '" stroke-linecap="round"/>');
          svg.push('<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="' + w.toFixed(1) + '" stroke-linecap="round"' + dash + '/>');
        });
      });

      // сам знак — в начале зоны действия
      var head = sign.direction === 'backward' ? sign.path[sign.path.length - 1] : sign.path[0];
      var hq = project(v, head[0], head[1]);
      if (hq) marks.push({ q: hq, sign: sign });
    });

    var html = '<svg class="pano-svg" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' + svg.join('') + '</svg>';
    marks.sort(function (a, b) { return b.q.d - a.q.d; });
    marks.forEach(function (m) {
      var px = clamp(Math.round(1500 / Math.max(m.q.d, 3)), 26, 86);
      var len = Geo.pathLength(m.sign.path);
      html += '<div class="pano-sign" style="left:' + (m.q.x - px / 2).toFixed(0) + 'px;top:' +
        (m.q.y - px - 6).toFixed(0) + 'px;width:' + px + 'px">' +
        SignSVG.face(m.sign) +
        '<span class="pano-sign-t">' + Geo.fmtLen(len) + '</span></div>';
    });
    ovBox.innerHTML = html;
    if (onInfo) onInfo(visible ? 'знаков в кадре: ' + visible : 'в этой точке знаков нет');
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(draw);
  }

  function bindPlayer() {
    if (!player || !player.events) return;
    ['directionchange', 'spanchange', 'zoomchange', 'panoramachange'].forEach(function (ev) {
      try { player.events.add(ev, schedule); } catch (e) {}
    });
    // на время перетаскивания камеры события идут пачкой — rAF их склеивает
    schedule();
  }

  function setSigns(list, f) {
    signs = list || [];
    filters = f || null;
    schedule();
  }

  // Шаг по улице: ищем ближайшую панораму в 15 м впереди/позади по направлению взгляда
  function step(forward) {
    if (!player || !window.ymaps) return Promise.resolve(false);
    var pano = player.getPanorama();
    var pos = pano && pano.getPosition && pano.getPosition();
    if (!pos) return Promise.resolve(false);
    var az = (player.getDirection() || [0])[0];
    var target = Geo.dest([pos[0], pos[1]], forward ? az : (az + 180) % 360, 16);
    return window.ymaps.panorama.locate([target]).then(function (list) {
      if (!list || !list.length) return false;
      var np = list[0].getPosition();
      if (Geo.hav([pos[0], pos[1]], [np[0], np[1]]) < 4) return false;   // та же панорама
      player.moveTo(list[0]);
      return true;
    }).catch(function () { return false; });
  }

  function show(latlng, container, statusCb) {
    box = container;
    asked = [latlng[0], latlng[1]];
    onInfo = statusCb || null;
    function fallback(msg) {
      if (onInfo) onInfo(msg);
      box.innerHTML = '<div class="pano-fallback">' +
        '<p>' + (msg || 'Панорама недоступна') + '</p>' +
        '<a target="_blank" rel="noopener" href="' + externalLink(latlng) + '">Открыть панораму в Яндекс.Картах ↗</a>' +
        '</div>';
      ovBox = null;
    }
    if (!hasApi()) {
      fallback('Ключ API Яндекс.Карт не задан — панорама откроется в новой вкладке.');
      return;
    }
    loadApi().then(function () {
      return window.ymaps.panorama.locate([latlng[0], latlng[1]]);
    }).then(function (panoramas) {
      if (!panoramas || !panoramas.length) {
        fallback('В этой точке нет панорамы. Кликни ближе к улице.');
        return;
      }
      if (player) { try { player.destroy(); } catch (e) {} player = null; }
      box.innerHTML = '<div id="pano-player" class="pano-player"></div>';
      ovBox = null;
      player = new window.ymaps.panorama.Player('pano-player', panoramas[0], {
        direction: [0, 0],
        controls: ['panoramaZoomControl', 'panoramaFullscreenControl']
      });
      ensureOverlay();
      bindPlayer();
      if (onInfo) onInfo('Панорама загружена');
    }).catch(function (e) {
      var m = String(e && e.message || e);
      if (/load|ymaps|загрузить/i.test(m)) {
        m = 'API Яндекс.Карт не загрузился — возможно, закончился дневной лимит ключа. Открой панораму по ссылке ниже.';
      } else {
        m = 'Панорама недоступна: ' + m;
      }
      fallback(m);
    });
  }

  function destroy() {
    if (player) { try { player.destroy(); } catch (e) {} player = null; }
    if (box) box.innerHTML = '';
    ovBox = null;
  }

  window.addEventListener('resize', schedule);

  return {
    hasApi: hasApi, show: show, destroy: destroy, externalLink: externalLink,
    setSigns: setSigns, step: step, redraw: schedule,
    view: readView,
    isOpen: function () { return !!player; }
  };
})();
