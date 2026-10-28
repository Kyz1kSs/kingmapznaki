/* Геометрия: расстояния, пеленги, смещение линии к бордюру, выборка точек вдоль линии. */
window.Geo = (function () {
  var R = 6371000;
  var D2R = Math.PI / 180;

  function hav(a, b) {
    var dLat = (b[0] - a[0]) * D2R;
    var dLon = (b[1] - a[1]) * D2R;
    var la1 = a[0] * D2R, la2 = b[0] * D2R;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function pathLength(pts) {
    var s = 0;
    for (var i = 1; i < pts.length; i++) s += hav(pts[i - 1], pts[i]);
    return s;
  }

  // Пеленг от a к b в градусах (0 = север, 90 = восток)
  function bearing(a, b) {
    var la1 = a[0] * D2R, la2 = b[0] * D2R;
    var dLon = (b[1] - a[1]) * D2R;
    var y = Math.sin(dLon) * Math.cos(la2);
    var x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
    return (Math.atan2(y, x) / D2R + 360) % 360;
  }

  // Сдвигает линию вбок на meters. Положительное значение — вправо по ходу линии.
  function offsetPath(pts, meters) {
    if (!meters || pts.length < 2) return pts.slice();
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var latRad = pts[i][0] * D2R;
      var mx = (b[1] - a[1]) * 111320 * Math.cos(latRad);
      var my = (b[0] - a[0]) * 111320;
      var len = Math.hypot(mx, my) || 1;
      var nx = my / len, ny = -mx / len;      // единичная нормаль вправо
      var ox = nx * meters, oy = ny * meters;
      out.push([
        pts[i][0] + oy / 111320,
        pts[i][1] + ox / (111320 * Math.cos(latRad) || 1)
      ]);
    }
    return out;
  }

  // Точки вдоль линии с шагом step метров: [{lat,lng,bearing,i}]
  function sampleAlong(pts, step) {
    var res = [];
    if (pts.length < 2) return res;
    var acc = 0, next = 0;
    for (var i = 1; i < pts.length; i++) {
      var segLen = hav(pts[i - 1], pts[i]);
      var b = bearing(pts[i - 1], pts[i]);
      while (next <= acc + segLen && segLen > 0.01) {
        var t = (next - acc) / segLen;
        res.push({
          lat: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
          lng: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
          bearing: b
        });
        next += step;
      }
      acc += segLen;
    }
    return res;
  }

  // Точка на линии на расстоянии m от начала (для бейджей)
  function pointAt(pts, m) {
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var segLen = hav(pts[i - 1], pts[i]);
      if (acc + segLen >= m) {
        var t = segLen > 0 ? (m - acc) / segLen : 0;
        return [
          pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
          pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t
        ];
      }
      acc += segLen;
    }
    return pts[pts.length - 1];
  }

  // Точка на расстоянии meters по пеленгу bearing от p
  function dest(p, bearing, meters) {
    var d = meters / R, b = bearing * D2R, la1 = p[0] * D2R, lo1 = p[1] * D2R;
    var la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
    var lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return [la2 / D2R, lo2 / D2R];
  }

  function fmtLen(m) {
    if (m < 950) return Math.round(m) + ' м';
    return (m / 1000).toFixed(m < 9500 ? 1 : 0).replace('.', ',') + ' км';
  }

  return {
    hav: hav, pathLength: pathLength, bearing: bearing,
    offsetPath: offsetPath, sampleAlong: sampleAlong, pointAt: pointAt, fmtLen: fmtLen, dest: dest
  };
})();
