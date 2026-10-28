/* Редактор: рисование участка вдоль улицы, форма знака, сохранение. */
window.Editor = (function () {
  var map, preview, onChange;
  var mode = 'idle';            // idle | start | end | edit
  var startId = null, startLatLng = null;
  var draft = null;             // {id?, path, type, ...}
  var editingExisting = false;
  var lanes = [];
  var previewGroup, startMark;
  var lastRouteId = null;

  var TURN_ORDER = ['left', 'straight', 'right', 'left_straight', 'straight_right', 'uturn'];
  var TURN_GLYPH = { left: '←', straight: '↑', right: '→', left_straight: '↖', straight_right: '↗', uturn: '⤺' };

  function $(id) { return document.getElementById(id); }

  function hint(text, kind) {
    var el = $('hint');
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = text;
    el.className = 'hint' + (kind ? ' ' + kind : '');
  }

  function clearPreview() {
    if (previewGroup) previewGroup.clearLayers();
    startMark = null;
    lastRouteId = null;
  }

  function drawPreview(path, color, dashed) {
    if (!previewGroup) return;
    previewGroup.clearLayers();
    if (!path || path.length < 2) return;
    L.polyline(path, { color: '#000', weight: 9, opacity: 0.35, interactive: false, lineCap: 'round' }).addTo(previewGroup);
    L.polyline(path, {
      color: color || '#8ac926', weight: 5, opacity: 0.95,
      dashArray: dashed ? '8 6' : null, interactive: false, lineCap: 'round'
    }).addTo(previewGroup);
    if (startLatLng) {
      startMark = L.circleMarker(startLatLng, {
        radius: 6, color: '#fff', weight: 2, fillColor: color || '#8ac926', fillOpacity: 1, interactive: false
      }).addTo(previewGroup);
    }
  }

  function routePath(fromId, toId) {
    var p = Roads.route(fromId, toId);
    if (p && p.length >= 2) return p;
    return [Roads.vertex(fromId), Roads.vertex(toId)];
  }

  function startAdd() {
    reset();
    mode = 'start';
    hint('Кликни по улице — это начало участка. Esc — отмена.');
    document.body.classList.add('editing');
  }

  function reset() {
    mode = 'idle';
    startId = null; startLatLng = null; draft = null;
    editingExisting = false;
    clearPreview();
    hidePanel();
    hint('');
    document.body.classList.remove('editing');
  }

  function cancel() { reset(); }

  function asArr(latlng) { return [latlng.lat, latlng.lng]; }

  function onMapClick(e) {
    if (mode === 'start') {
      var n = Roads.nearest(asArr(e.latlng), (window.CONFIG.snapMeters || 45));
      if (!n) { hint('Не вижу улицу рядом. Кликни ближе к дороге.', 'warn'); return; }
      startId = n.id;
      startLatLng = n.latlng;
      mode = 'end';
      drawPreview([startLatLng, startLatLng], '#8ac926', true);
      hint('Теперь кликни по концу участка. Участок пойдёт по улицам.');
      return true;
    }
    if (mode === 'end') {
      var n2 = Roads.nearest(asArr(e.latlng), (window.CONFIG.snapMeters || 45));
      if (!n2) { hint('Не вижу улицу рядом. Кликни ближе к дороге.', 'warn'); return true; }
      var path = routePath(startId, n2.id);
      if (Geo.pathLength(path) < 5) { hint('Слишком короткий участок — выбери точку подальше.', 'warn'); return true; }
      draft = { path: path, type: 'no_parking' };
      mode = 'edit';
      drawPreview(path, '#8ac926', false);
      openPanel(null);
      hint('');
      return true;
    }
    return false;
  }

  function onMapMove(e) {
    if (mode !== 'end' || startId === null) return;
    var n = Roads.nearest(asArr(e.latlng), (window.CONFIG.snapMeters || 45));
    if (!n || n.id === lastRouteId) return;
    lastRouteId = n.id;
    var path = routePath(startId, n.id);
    drawPreview(path, '#8ac926', true);
  }

  // ---------- панель ----------

  function openPanel(sign) {
    editingExisting = !!sign;
    $('ed-title').textContent = sign ? 'Изменить участок' : 'Новый участок';
    lanes = (sign && sign.lanes && sign.lanes.length)
      ? sign.lanes.map(function (l) { return { turn: l.turn }; })
      : [{ turn: 'left' }, { turn: 'straight' }, { turn: 'right' }];

    $('ed-type').value = (sign && sign.type) || (draft && draft.type) || 'no_parking';
    $('ed-side').value = (sign && sign.side) || 'right';
    $('ed-direction').value = (sign && sign.direction) || 'forward';
    $('ed-speed').value = (sign && sign.speed) || 40;
    var z = (sign && sign.zone) || {};
    $('ed-from').value = z.from || '';
    $('ed-to').value = z.to || '';
    $('ed-days').value = z.days || 'all';
    $('ed-note').value = (sign && sign.note) || '';

    renderLanes();
    syncFields();
    $('editor').hidden = false;
    $('ed-note').focus();
  }

  function hidePanel() { $('editor').hidden = true; }

  function syncFields() {
    var t = $('ed-type').value;
    $('ed-side-row').hidden = !(t === 'no_parking' || t === 'no_stopping');
    $('ed-speed-row').hidden = t !== 'speed';
    $('ed-lanes-row').hidden = t !== 'lanes';
    var dirRow = $('ed-direction').parentElement;
    dirRow.hidden = (t === 'speed');
    var path = draft && draft.path;
    var len = path ? Geo.pathLength(path) : 0;
    var street = path ? (Roads.streetNameAt(path[0]) || '') : '';
    $('ed-info').textContent = (street ? street + ' · ' : '') + Geo.fmtLen(len);
  }

  function renderLanes() {
    var box = $('ed-lanes');
    box.innerHTML = '';
    lanes.forEach(function (l, i) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'lane-chip';
      el.title = SignRender.LANE_TURNS[l.turn] || '';
      el.innerHTML = '<span class="lane-ico">' + (TURN_GLYPH[l.turn] || '↑') + '</span>' +
        '<span class="lane-num">' + (i + 1) + '</span>';
      el.addEventListener('click', function () {
        l.turn = TURN_ORDER[(TURN_ORDER.indexOf(l.turn) + 1) % TURN_ORDER.length];
        renderLanes();
      });
      box.appendChild(el);
    });
  }

  function collect() {
    var t = $('ed-type').value;
    var from = $('ed-from').value || '';
    var to = $('ed-to').value || '';
    var days = $('ed-days').value;
    var zone = null;
    if (from || to || days !== 'all') zone = { from: from, to: to, days: days };
    var s = {
      id: (draft && draft.id) || (crypto.randomUUID ? crypto.randomUUID() : 's' + Date.now() + Math.random().toString(16).slice(2)),
      type: t,
      path: draft.path,
      side: (t === 'no_parking' || t === 'no_stopping') ? $('ed-side').value : null,
      direction: t === 'speed' ? 'forward' : $('ed-direction').value,
      speed: t === 'speed' ? parseInt($('ed-speed').value, 10) || 60 : null,
      lanes: t === 'lanes' ? lanes.map(function (l) { return { turn: l.turn }; }) : null,
      zone: zone,
      note: $('ed-note').value.trim(),
      author: Store.author()
    };
    return s;
  }

  function save() {
    if (!draft || !draft.path || draft.path.length < 2) { hint('Сначала нарисуй участок', 'warn'); return; }
    var sign = collect();
    Store.upsert(sign).then(function () {
      reset();
      if (onChange) onChange();
    }).catch(function (e) {
      hint('Не сохранилось: ' + e.message, 'warn');
    });
  }

  function openForEdit(sign) {
    reset();
    draft = { id: sign.id, path: sign.path };
    mode = 'edit';
    drawPreview(sign.path, SignRender.typeColor(sign), false);
    openPanel(sign);
  }

  function removeSign(id) {
    Store.remove(id).then(function () { if (onChange) onChange(); });
  }

  function init(mapRef, previewGroup, changeCb) {
    map = mapRef;
    previewGroup = previewGroup;
    onChange = changeCb;

    map.on('click', function (e) {
      if (onMapClick(e)) {
        L.DomEvent.stopPropagation(e);
      }
    });
    map.on('mousemove', onMapMove);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { cancel(); }
      if (e.key === 'Enter' && !$('editor').hidden && document.activeElement.tagName === 'INPUT') {
        // Enter в поле — сохранить
        if (document.activeElement.id !== 'ed-note') save();
      }
    });

    $('ed-type').addEventListener('change', function () {
      if (draft) draft.type = $('ed-type').value;
      syncFields();
    });
    $('editor').addEventListener('submit', function (e) { e.preventDefault(); save(); });
    $('ed-save').addEventListener('click', function (e) { e.preventDefault(); save(); });
    $('ed-close').addEventListener('click', function (e) { e.preventDefault(); cancel(); });
    $('ed-lane-add').addEventListener('click', function () {
      if (lanes.length < 6) { lanes.push({ turn: 'straight' }); renderLanes(); }
    });
    $('ed-lane-del').addEventListener('click', function () {
      if (lanes.length > 1) { lanes.pop(); renderLanes(); }
    });
  }

  return {
    init: init, startAdd: startAdd, cancel: cancel,
    openForEdit: openForEdit, removeSign: removeSign,
    isActive: function () { return mode !== 'idle'; },
    isPicking: function () { return mode === 'start' || mode === 'end'; }
  };
})();
