/* Лица дорожных знаков по ГОСТ 52290 (упрощённо, но узнаваемо):
   3.27 «Остановка запрещена» — синий круг с красной каймой и красным крестом;
   3.28 «Стоянка запрещена»   — то же, но одна красная диагональ;
   3.24 «Ограничение скорости» — белый круг с красной каймой и цифрой;
   5.15.1 «Движение по полосам» — синий прямоугольник со стрелками по полосам. */
window.SignSVG = (function () {
  var BLUE = '#0b57a4';
  var RED = '#d21f26';
  var WHITE = '#ffffff';
  var INK = '#12161d';

  function svg(inner, w, h, cls) {
    return '<svg class="' + (cls || 'sign-svg') + '" viewBox="0 0 ' + w + ' ' + h + '" ' +
      'width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      inner + '</svg>';
  }

  // круглый запрещающий знак: белая кромка → красная кайма → синее поле
  function disc(inner) {
    return '<circle cx="50" cy="50" r="49" fill="' + WHITE + '"/>' +
      '<circle cx="50" cy="50" r="44.5" fill="none" stroke="' + RED + '" stroke-width="8.5"/>' +
      '<circle cx="50" cy="50" r="40" fill="' + BLUE + '"/>' + inner;
  }

  function cross(lineWidth) {
    var w = lineWidth || 8.5;
    return '<line x1="24" y1="22" x2="76" y2="78" stroke="' + RED + '" stroke-width="' + w + '"/>' +
      '<line x1="76" y1="22" x2="24" y2="78" stroke="' + RED + '" stroke-width="' + w + '"/>';
  }

  function slash(lineWidth) {
    var w = lineWidth || 8.5;
    return '<line x1="24" y1="22" x2="76" y2="78" stroke="' + RED + '" stroke-width="' + w + '"/>';
  }

  function speedDisc(value) {
    return '<circle cx="50" cy="50" r="49" fill="' + WHITE + '"/>' +
      '<circle cx="50" cy="50" r="44.5" fill="none" stroke="' + RED + '" stroke-width="8.5"/>' +
      '<text x="50" y="66" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" ' +
      'font-weight="700" font-size="44" fill="' + INK + '">' + escape1(value) + '</text>';
  }

  function escape1(v) {
    return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
    });
  }

  // стрелка на полосе: turn = left | straight | right | left_straight | straight_right | uturn
  function laneArrow(cx, cy, turn, scale) {
    var s = scale || 1;
    var w = 5.2 * s;
    var head = 7.5 * s;
    var stroke = 'stroke="' + WHITE + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"';
    function tri(x, y, dir) {
      // dir: 'up' | 'left' | 'right'
      if (dir === 'up') return '<path d="M' + (x - head) + ' ' + (y + head) + ' L' + x + ' ' + y + ' L' + (x + head) + ' ' + (y + head) + ' Z" fill="' + WHITE + '"/>';
      if (dir === 'left') return '<path d="M' + (x + head) + ' ' + (y - head) + ' L' + x + ' ' + y + ' L' + (x + head) + ' ' + (y + head) + ' Z" fill="' + WHITE + '"/>';
      return '<path d="M' + (x - head) + ' ' + (y - head) + ' L' + x + ' ' + y + ' L' + (x - head) + ' ' + (y + head) + ' Z" fill="' + WHITE + '"/>';
    }
    var baseY = cy + 17 * s;
    if (turn === 'left') {
      return '<path d="M' + cx + ' ' + baseY + ' V' + (cy + 2 * s) + ' H' + (cx - 12 * s) + '" ' + stroke + '/>' +
        tri(cx - 16 * s, cy + 2 * s, 'left');
    }
    if (turn === 'right') {
      return '<path d="M' + cx + ' ' + baseY + ' V' + (cy + 2 * s) + ' H' + (cx + 12 * s) + '" ' + stroke + '/>' +
        tri(cx + 16 * s, cy + 2 * s, 'right');
    }
    if (turn === 'left_straight') {
      return '<path d="M' + cx + ' ' + baseY + ' V' + (cy - 10 * s) + '" ' + stroke + '/>' + tri(cx, cy - 14 * s, 'up') +
        '<path d="M' + cx + ' ' + (cy + 10 * s) + ' H' + (cx - 11 * s) + '" ' + stroke + '/>' + tri(cx - 15 * s, cy + 10 * s, 'left');
    }
    if (turn === 'straight_right') {
      return '<path d="M' + cx + ' ' + baseY + ' V' + (cy - 10 * s) + '" ' + stroke + '/>' + tri(cx, cy - 14 * s, 'up') +
        '<path d="M' + cx + ' ' + (cy + 10 * s) + ' H' + (cx + 11 * s) + '" ' + stroke + '/>' + tri(cx + 15 * s, cy + 10 * s, 'right');
    }
    if (turn === 'uturn') {
      return '<path d="M' + (cx + 8 * s) + ' ' + baseY + ' V' + (cy - 4 * s) + ' Q' + (cx + 8 * s) + ' ' + (cy - 16 * s) + ' ' + cx + ' ' + (cy - 16 * s) +
        ' Q' + (cx - 8 * s) + ' ' + (cy - 16 * s) + ' ' + (cx - 8 * s) + ' ' + (cy - 4 * s) + ' V' + (cy + 6 * s) + '" ' + stroke + '/>' +
        tri(cx - 8 * s, cy + 10 * s, 'left');
    }
    return '<path d="M' + cx + ' ' + baseY + ' V' + (cy - 10 * s) + '" ' + stroke + '/>' + tri(cx, cy - 14 * s, 'up');
  }

  function lanesFace(lanes) {
    var list = (lanes && lanes.length) ? lanes : [{ turn: 'straight' }];
    var n = list.length;
    var W = 100, H = 100;
    var pad = 4;
    var cw = (W - pad * 2) / n;
    var out = '<rect x="2" y="14" width="96" height="72" rx="5" fill="' + BLUE + '" stroke="' + WHITE + '" stroke-width="3"/>';
    for (var i = 1; i < n; i++) {
      var x = pad + cw * i;
      out += '<line x1="' + x + '" y1="22" x2="' + x + '" y2="78" stroke="' + WHITE + '" stroke-width="2" stroke-dasharray="6 5"/>';
    }
    var scale = Math.min(1, 46 / (cw + 14));
    for (var k = 0; k < n; k++) {
      out += laneArrow(pad + cw * (k + 0.5), 50, list[k].turn, scale);
    }
    return out;
  }

  // Главная функция: sign → svg-разметка
  function face(sign, opts) {
    opts = opts || {};
    var t = sign && sign.type;
    var cls = opts.cls || 'sign-svg';
    if (t === 'no_stopping') return svg(disc(cross()), 100, 100, cls);      // 3.27
    if (t === 'no_parking') return svg(disc(slash()), 100, 100, cls);       // 3.28
    if (t === 'speed') return svg(speedDisc(sign.speed == null ? 60 : sign.speed), 100, 100, cls); // 3.24
    if (t === 'lanes') return svg(lanesFace(sign.lanes), 100, 100, cls);    // 5.15.1
    return svg('<circle cx="50" cy="50" r="46" fill="#666"/>', 100, 100, cls);
  }

  // Уменьшенная копия для маркера на карте: квадрат side×side
  function marker(sign, side) {
    var s = side || 28;
    return '<div class="kng-sign" style="width:' + s + 'px;height:' + s + 'px">' + face(sign) + '</div>';
  }

  return { face: face, marker: marker, LANE_ARROW: laneArrow };
})();
