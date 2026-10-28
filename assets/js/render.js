/* Отрисовка знаков: полосы вдоль улиц, стрелки по полосам, цифры ограничения скорости. */
window.SignRender = (function () {

  var TYPES = {
    no_parking: {
      code: '3.27', label: 'Стоянка запрещена', color: '#ff9f1c',
      width: 5, dash: '10 8', offset: 6.5, sided: true, arrowed: true
    },
    no_stopping: {
      code: '3.28', label: 'Остановка запрещена', color: '#e5383b',
      width: 5, dash: null, offset: 6.5, sided: true, arrowed: true
    },
    lanes: {
      code: '5.15.1', label: 'Движение по полосам', color: '#3a86ff',
      width: 4, dash: null, offset: 0, sided: false, arrowed: true, laneWidth: 3.3
    },
    speed: {
      code: '3.24', label: 'Ограничение скорости', color: '#ffd60a',
      width: 8, dash: null, offset: 0, sided: false, arrowed: false
    }
  };

  var LANE_TURNS = {
    left: 'налево', straight: 'прямо', right: 'направо',
    left_straight: 'прямо и налево', straight_right: 'прямо и направо', uturn: 'разворот'
  };

  function speedColor(v) {
    if (v == null) return '#ffd60a';
    if (v <= 20) return '#d00000';
    if (v <= 30) return '#e85d04';
    if (v <= 40) return '#f48c06';
    if (v <= 50) return '#ffba08';
    if (v <= 60) return '#8ac926';
    if (v <= 70) return '#43aa8b';
    if (v <= 90) return '#277da1';
    return '#c77dff';
  }

  function typeColor(sign) {
    return sign.type === 'speed' ? speedColor(sign.speed) : (TYPES[sign.type] || {}).color || '#fff';
  }

  function icon(html, cls, size) {
    return L.divIcon({
      className: 'kng-mk ' + (cls || ''),
      html: html,
      iconSize: size || null
    });
  }

  function chevron(bearing, color) {
    return icon(
      '<svg width="15" height="15" viewBox="0 0 15 15" style="transform:rotate(' + bearing + 'deg)">' +
      '<path d="M7.5 2.2 L12.6 11.6 L7.5 9.1 L2.4 11.6 Z" fill="' + color + '" stroke="rgba(0,0,0,.65)" stroke-width="1.1"/>' +
      '</svg>', 'kng-chev');
  }

  function laneArrow(turn, bearing, color) {
    // 24×24, стрелка смотрит вверх; поворачиваем по пеленгу
    var stroke = 'stroke="' + color + '" stroke-width="3.2" stroke-linecap="round" fill="none"';
    var headOut = 'fill="' + color + '" stroke="rgba(0,0,0,.6)" stroke-width="1"';
    var upHead = '<path d="M12 2.2 L18.2 11.6 H5.8 Z" ' + headOut + '/>';
    var upShaft = '<path d="M12 21 V7" ' + stroke + '/>';
    var leftHead = '<path d="M1.6 13.6 L8.4 9.2 V18 Z" ' + headOut + '/>';
    var leftShaft = '<path d="M12 21 V13.6 H7.4" ' + stroke + '/>';
    var rightHead = '<path d="M22.4 13.6 L15.6 9.2 V18 Z" ' + headOut + '/>';
    var rightShaft = '<path d="M12 21 V13.6 H16.6" ' + stroke + '/>';
    var leftBranch = '<path d="M12 16.8 H9.4 Q6.4 16.8 6.4 13.6" ' + stroke + '/>' +
      '<path d="M1.6 13.6 L8.4 9.4 V17.8 Z" ' + headOut + '/>';
    var rightBranch = '<path d="M12 16.8 H14.6 Q17.6 16.8 17.6 13.6" ' + stroke + '/>' +
      '<path d="M22.4 13.6 L15.6 9.4 V17.8 Z" ' + headOut + '/>';
    var uturn = '<path d="M9.4 21 V11 Q9.4 5.4 13.4 5.4 Q17.4 5.4 17.4 11 V12.6" ' + stroke + '/>' +
      '<path d="M13.4 17.6 L17.4 11.6 L21.4 17.6 Z" ' + headOut + '/>';
    var body;
    switch (turn) {
      case 'left': body = leftShaft + leftHead; break;
      case 'right': body = rightShaft + rightHead; break;
      case 'left_straight': body = upShaft + upHead + leftBranch; break;
      case 'straight_right': body = upShaft + upHead + rightBranch; break;
      case 'uturn': body = uturn; break;
      default: body = upShaft + upHead;
    }
    return icon(
      '<svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(' + bearing + 'deg)">' + body + '</svg>',
      'kng-arrow');
  }

  function speedBadge(v) {
    return icon('<div class="kng-speed" style="border-color:' + speedColor(v) + '">' + v + '</div>', 'kng-speed-wrap');
  }

  function signBadge(sign) {
    var T = TYPES[sign.type];
    if (!T) return null;
    if (sign.type === 'speed') return speedBadge(sign.speed == null ? 60 : sign.speed);
    var label = T.code;
    var cls = 'kng-code';
    if (sign.zone) cls += ' has-zone';
    return icon('<div class="' + cls + '" style="background:' + typeColor(sign) + '">' + label + '</div>', 'kng-code-wrap');
  }

  function zonesText(zone) {
    if (!zone) return '';
    var parts = [];
    if (zone.from || zone.to) parts.push((zone.from || '00:00') + '–' + (zone.to || '24:00'));
    if (zone.days === 'even') parts.push('чётные дни');
    if (zone.days === 'odd') parts.push('нечётные дни');
    if (zone.days === 'workdays') parts.push('будни');
    return parts.join(', ');
  }

  function sideText(sign) {
    if (!sign.side) return '';
    if (sign.side === 'both') return 'обе стороны';
    var base = sign.side === 'left' ? 'левая сторона' : 'правая сторона';
    if (sign.direction === 'both') return base;
    return base + ' (по ходу линии)';
  }

  function lanesText(sign) {
    if (!sign.lanes || !sign.lanes.length) return '';
    return sign.lanes.length + ' полос: ' + sign.lanes.map(function (l) {
      return LANE_TURNS[l.turn] || l.turn;
    }).join(', ');
  }

  function popupHtml(sign) {
    var T = TYPES[sign.type] || {};
    var len = Geo.pathLength(sign.path || []);
    var street = Roads.streetNameAt(sign.path[0]) || '';
    var rows = [];
    if (street) rows.push(street);
    rows.push(Geo.fmtLen(len));
    var st = sideText(sign);
    if (st) rows.push(st);
    if (sign.type === 'lanes') rows.push(lanesText(sign));
    if (sign.type === 'speed' && sign.speed != null) rows.push(sign.speed + ' км/ч');
    var zt = zonesText(sign.zone);
    if (zt) rows.push('⏱ ' + zt);
    var html = '<div class="pop">' +
      '<div class="pop-h"><span class="dot" style="background:' + typeColor(sign) + '"></span>' +
      '<b>' + T.code + '</b> ' + T.label + '</div>';
    for (var i = 0; i < rows.length; i++) html += '<div class="pop-row">' + rows[i] + '</div>';
    if (sign.note) html += '<div class="pop-row pop-note">' + sign.note + '</div>';
    if (sign.author) html += '<div class="pop-row pop-auth">добавил: ' + sign.author + '</div>';
    html += '<div class="pop-btns">' +
      '<button data-act="edit" data-id="' + sign.id + '">Изменить</button>' +
      '<button data-act="del" data-id="' + sign.id + '" class="danger">Удалить</button>' +
      '</div></div>';
    return html;
  }

  function matchFilters(sign, f) {
    if (!f) return true;
    if (f.types && f.types[sign.type] === false) return false;
    if (f.timeOnly && !(sign.zone && (sign.zone.from || sign.zone.to || (sign.zone.days && sign.zone.days !== 'all')))) return false;
    if (f.speeds && sign.type === 'speed' && f.speeds[sign.speed] === false) return false;
    return true;
  }

  function drawStripes(sign, group, map) {
    var T = TYPES[sign.type];
    var color = typeColor(sign);
    var sides = [];
    if (T.sided) {
      if (sign.side === 'both') { sides = [-1, 1]; }
      else sides = [sign.side === 'left' ? -1 : 1];
    } else sides = [0];

    sides.forEach(function (sgn) {
      var path = T.offset ? Geo.offsetPath(sign.path, sgn * T.offset) : sign.path;
      // тёмная подложка для контраста на светлом спутнике
      L.polyline(path, {
        color: '#000', weight: T.width + 3, opacity: 0.35, interactive: false, lineCap: 'round'
      }).addTo(group);
      var line = L.polyline(path, {
        color: color,
        weight: T.width,
        opacity: 0.98,
        dashArray: T.dash,
        lineCap: T.dash ? 'butt' : 'round',
        interactive: true,
        bubblingMouseEvents: false
      }).addTo(group);
      line._sign = sign;
      line.bindPopup(popupHtml(sign), { closeButton: true, autoPan: true, minWidth: 220 });
      line.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
      });
      // тонкая светлая кромка поверх — полоса читается на любом фоне
      if (!T.dash) {
        L.polyline(path, {
          color: '#fff', weight: 1.2, opacity: 0.55, interactive: false
        }).addTo(group);
      }
    });
  }

  function drawChevrons(sign, group) {
    var T = TYPES[sign.type];
    if (!T.arrowed) return;
    if (sign.direction === 'both') return;
    var reverse = sign.direction === 'backward';
    var path = sign.path;
    var color = sign.type === 'speed' ? speedColor(sign.speed) : T.color;
    var samples = Geo.sampleAlong(path, 48);
    var max = 12;
    for (var i = 0; i < samples.length && i < max; i++) {
      var s = samples[i];
      var brg = s.bearing + (reverse ? 180 : 0);
      L.marker([s.lat, s.lng], {
        icon: chevron(brg, color), interactive: false, keyboard: false, zIndexOffset: 300
      }).addTo(group);
    }
  }

  // Смещение точки вбок от линии движения (meters > 0 — вправо)
  function lateral(p, bearing, meters) {
    var br = (bearing + 90) * Math.PI / 180;
    var dLat = meters * Math.cos(br) / 111320;
    var dLng = meters * Math.sin(br) / (111320 * Math.cos(p[0] * Math.PI / 180) || 1);
    return [p[0] + dLat, p[1] + dLng];
  }

  function drawLaneArrows(sign, group) {
    if (sign.type !== 'lanes' || !sign.lanes || !sign.lanes.length) return;
    var reverse = sign.direction === 'backward';
    var n = sign.lanes.length;
    var color = TYPES.lanes.color;
    var step = 70, maxPerLane = 3;
    sign.lanes.forEach(function (lane, i) {
      var lat = (i - (n - 1) / 2) * TYPES.lanes.laneWidth;
      var lanePath = Geo.offsetPath(sign.path, lat);
      // направляющая полосы — чтобы видно было, какие полосы покрывает знак
      L.polyline(lanePath, {
        color: color, weight: 1.6, opacity: 0.8, interactive: false
      }).addTo(group);
      var samples = Geo.sampleAlong(lanePath, step);
      for (var k = 0; k < samples.length && k < maxPerLane; k++) {
        var s = samples[k];
        var brg = s.bearing + (reverse ? 180 : 0);
        L.marker([s.lat, s.lng], {
          icon: laneArrow(lane.turn, brg, color), interactive: false, keyboard: false, zIndexOffset: 320
        }).addTo(group);
      }
    });
  }

  function drawSpeedBadges(sign, group) {
    if (sign.type !== 'speed') return;
    var len = Geo.pathLength(sign.path);
    var count = Math.min(5, Math.max(1, Math.round(len / 90)));
    for (var i = 0; i < count; i++) {
      var m = count === 1 ? len / 2 : (len / (count + 1)) * (i + 1);
      var p = Geo.pointAt(sign.path, m);
      L.marker(p, {
        icon: speedBadge(sign.speed == null ? 60 : sign.speed),
        interactive: false, keyboard: false, zIndexOffset: 340
      }).addTo(group);
    }
  }

  // Бейдж ставим чуть в стороне от полосы, чтобы не закрывать её
  function drawStartBadge(sign, group) {
    var b = signBadge(sign);
    if (!b) return;
    var p = sign.path[0];
    var b0 = Geo.bearing(sign.path[0], sign.path[Math.min(2, sign.path.length - 1)]) || 0;
    var shift = sign.type === 'speed' ? -11 : -9;
    var pos = lateral(p, sign.direction === 'backward' ? b0 + 180 : b0, shift);
    L.marker(pos, { icon: b, interactive: false, keyboard: false, zIndexOffset: 360 }).addTo(group);
  }

  function render(group, signs, filters, map) {
    group.clearLayers();
    var shown = 0;
    for (var i = 0; i < signs.length; i++) {
      var s = signs[i];
      if (!matchFilters(s, filters)) continue;
      if (!s.path || s.path.length < 2) continue;
      drawStripes(s, group, map);
      drawChevrons(s, group);
      drawLaneArrows(s, group);
      drawSpeedBadges(s, group);
      drawStartBadge(s, group);
      shown++;
    }
    return shown;
  }

  return {
    TYPES: TYPES, LANE_TURNS: LANE_TURNS,
    speedColor: speedColor, typeColor: typeColor,
    render: render, popupHtml: popupHtml, matchFilters: matchFilters,
    zonesText: zonesText, drawStripes: drawStripes, drawChevrons: drawChevrons,
    drawLaneArrows: drawLaneArrows, drawSpeedBadges: drawSpeedBadges, drawStartBadge: drawStartBadge
  };
})();
