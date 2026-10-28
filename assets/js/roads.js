/* Дорожная сеть: граф улиц, поиск ближайшей улицы к клику, маршрут вдоль дорог. */
window.Roads = (function () {
  var pts = [];                 // [lat,lng]
  var adj = [];                 // [[{to, w}], ...]
  var grid = new Map();         // "ix,iy" -> [vertexId]
  var CELL = 0.0004;            // ~44 м по широте
  var raw = null;

  function keyOf(lat, lng) { return lat.toFixed(6) + ',' + lng.toFixed(6); }

  function vertexId(p) {
    var k = keyOf(p[0], p[1]);
    var id = grid.get('id:' + k);
    if (id !== undefined) return id;
    id = pts.length;
    pts.push([p[0], p[1]]);
    adj.push([]);
    grid.set('id:' + k, id);
    var cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
    var gk = cx + ',' + cy;
    if (!grid.has(gk)) grid.set(gk, []);
    grid.get(gk).push(id);
    return id;
  }

  function link(a, b) {
    if (a === b) return;
    var w = Geo.hav(pts[a], pts[b]);
    adj[a].push({ to: b, w: w });
    adj[b].push({ to: a, w: w });
  }

  // Вершины в OSM стоят редко (иногда через 100 м), поэтому режем длинные
  // сегменты на куски ≤ 14 м: так клик по улице всегда попадает в сеть.
  function densify(a, b, out) {
    var d = Geo.hav(a, b);
    var n = d < 14 ? 1 : Math.ceil(d / 14);
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
  }

  function build(data) {
    raw = data;
    pts = []; adj = []; grid = new Map();
    var buf = [];
    for (var e = 0; e < data.edges.length; e++) {
      var p = data.edges[e].p;
      buf.length = 0;
      buf.push(p[0]);
      for (var i = 1; i < p.length; i++) densify(p[i - 1], p[i], buf);
      var prev = -1;
      for (var k = 0; k < buf.length; k++) {
        var id = vertexId(buf[k]);
        if (prev >= 0 && prev !== id) link(prev, id);
        prev = id;
      }
    }
    return { vertices: pts.length };
  }

  function nearest(p, maxMeters) {
    var cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
    var best = -1, bestD = Infinity;
    for (var r = 0; r <= 2; r++) {
      for (var dx = -r; dx <= r; dx++) {
        for (var dy = -r; dy <= r; dy++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          var arr = grid.get((cx + dx) + ',' + (cy + dy));
          if (!arr) continue;
          for (var k = 0; k < arr.length; k++) {
            var d = Geo.hav(p, pts[arr[k]]);
            if (d < bestD) { bestD = d; best = arr[k]; }
          }
        }
      }
    }
    if (best < 0 || bestD > (maxMeters || 45)) return null;
    return { id: best, dist: bestD, latlng: pts[best].slice() };
  }

  // Двоичная куча для Дейкстры
  function Heap() { this.a = []; }
  Heap.prototype.push = function (node, pri) {
    var a = this.a; a.push([pri, node]);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a;
    if (!a.length) return null;
    var top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  // Кратчайший путь по улицам. Возвращает массив [lat,lng] или null.
  function route(fromId, toId) {
    if (fromId === toId) return [pts[fromId].slice()];
    var n = pts.length;
    var dist = new Float64Array(n).fill(Infinity);
    var prev = new Int32Array(n).fill(-1);
    var done = new Uint8Array(n);
    var heap = new Heap();
    dist[fromId] = 0;
    heap.push(fromId, 0);
    while (true) {
      var top = heap.pop();
      if (!top) break;
      var u = top[1];
      if (done[u]) continue;
      done[u] = 1;
      if (u === toId) break;
      var list = adj[u];
      for (var i = 0; i < list.length; i++) {
        var v = list[i].to, nd = dist[u] + list[i].w;
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push(v, nd); }
      }
    }
    if (dist[toId] === Infinity) return null;
    var path = [], cur = toId;
    while (cur !== -1) { path.push(pts[cur].slice()); cur = prev[cur]; }
    return path.reverse();
  }

  function streetNameAt(latlng) {
    if (!raw) return '';
    var best = null, bestD = Infinity;
    for (var e = 0; e < raw.edges.length; e++) {
      var p = raw.edges[e].p;
      for (var i = 0; i < p.length; i++) {
        var d = Geo.hav(latlng, p[i]);
        if (d < bestD) { bestD = d; best = raw.edges[e]; }
      }
    }
    return best && bestD < 40 ? (raw.names[best.n] || '') : '';
  }

  return {
    build: build,
    nearest: nearest,
    route: function (a, b) { return route(a, b); },
    vertex: function (id) { return pts[id].slice(); },
    points: function () { return pts; },
    edges: function () { return raw ? raw.edges : []; },
    names: function () { return raw ? raw.names : []; },
    streetNameAt: streetNameAt,
    center: function () { return raw ? raw.center : [59.3738, 28.6018]; }
  };
})();
