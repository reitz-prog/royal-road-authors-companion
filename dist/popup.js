(() => {
  // node_modules/preact/dist/preact.module.js
  var n;
  var l;
  var u;
  var t;
  var i;
  var r;
  var o;
  var e;
  var f;
  var c;
  var s;
  var a;
  var h;
  var p;
  var v;
  var y;
  var d = {};
  var w = [];
  var _ = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
  var g = Array.isArray;
  function m(n2, l2) {
    for (var u3 in l2)
      n2[u3] = l2[u3];
    return n2;
  }
  function b(n2) {
    n2 && n2.parentNode && n2.parentNode.removeChild(n2);
  }
  function k(l2, u3, t2) {
    var i3, r2, o2, e2 = {};
    for (o2 in u3)
      "key" == o2 ? i3 = u3[o2] : "ref" == o2 ? r2 = u3[o2] : e2[o2] = u3[o2];
    if (arguments.length > 2 && (e2.children = arguments.length > 3 ? n.call(arguments, 2) : t2), "function" == typeof l2 && null != l2.defaultProps)
      for (o2 in l2.defaultProps)
        void 0 === e2[o2] && (e2[o2] = l2.defaultProps[o2]);
    return x(l2, e2, i3, r2, null);
  }
  function x(n2, t2, i3, r2, o2) {
    var e2 = { type: n2, props: t2, key: i3, ref: r2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o2 ? ++u : o2, __i: -1, __u: 0 };
    return null == o2 && null != l.vnode && l.vnode(e2), e2;
  }
  function S(n2) {
    return n2.children;
  }
  function C(n2, l2) {
    this.props = n2, this.context = l2;
  }
  function $(n2, l2) {
    if (null == l2)
      return n2.__ ? $(n2.__, n2.__i + 1) : null;
    for (var u3; l2 < n2.__k.length; l2++)
      if (null != (u3 = n2.__k[l2]) && null != u3.__e)
        return u3.__e;
    return "function" == typeof n2.type ? $(n2) : null;
  }
  function I(n2) {
    if (n2.__P && n2.__d) {
      var u3 = n2.__v, t2 = u3.__e, i3 = [], r2 = [], o2 = m({}, u3);
      o2.__v = u3.__v + 1, l.vnode && l.vnode(o2), q(n2.__P, o2, u3, n2.__n, n2.__P.namespaceURI, 32 & u3.__u ? [t2] : null, i3, null == t2 ? $(u3) : t2, !!(32 & u3.__u), r2), o2.__v = u3.__v, o2.__.__k[o2.__i] = o2, D(i3, o2, r2), u3.__e = u3.__ = null, o2.__e != t2 && P(o2);
    }
  }
  function P(n2) {
    if (null != (n2 = n2.__) && null != n2.__c)
      return n2.__e = n2.__c.base = null, n2.__k.some(function(l2) {
        if (null != l2 && null != l2.__e)
          return n2.__e = n2.__c.base = l2.__e;
      }), P(n2);
  }
  function A(n2) {
    (!n2.__d && (n2.__d = true) && i.push(n2) && !H.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(H);
  }
  function H() {
    try {
      for (var n2, l2 = 1; i.length; )
        i.length > l2 && i.sort(e), n2 = i.shift(), l2 = i.length, I(n2);
    } finally {
      i.length = H.__r = 0;
    }
  }
  function L(n2, l2, u3, t2, i3, r2, o2, e2, f3, c2, s2) {
    var a2, h2, p2, v2, y2, _2, g2, m2 = t2 && t2.__k || w, b2 = l2.length;
    for (f3 = T(u3, l2, m2, f3, b2), a2 = 0; a2 < b2; a2++)
      null != (p2 = u3.__k[a2]) && (h2 = -1 != p2.__i && m2[p2.__i] || d, p2.__i = a2, _2 = q(n2, p2, h2, i3, r2, o2, e2, f3, c2, s2), v2 = p2.__e, p2.ref && h2.ref != p2.ref && (h2.ref && J(h2.ref, null, p2), s2.push(p2.ref, p2.__c || v2, p2)), null == y2 && null != v2 && (y2 = v2), (g2 = !!(4 & p2.__u)) || h2.__k === p2.__k ? (f3 = j(p2, f3, n2, g2), g2 && h2.__e && (h2.__e = null)) : "function" == typeof p2.type && void 0 !== _2 ? f3 = _2 : v2 && (f3 = v2.nextSibling), p2.__u &= -7);
    return u3.__e = y2, f3;
  }
  function T(n2, l2, u3, t2, i3) {
    var r2, o2, e2, f3, c2, s2 = u3.length, a2 = s2, h2 = 0;
    for (n2.__k = new Array(i3), r2 = 0; r2 < i3; r2++)
      null != (o2 = l2[r2]) && "boolean" != typeof o2 && "function" != typeof o2 ? ("string" == typeof o2 || "number" == typeof o2 || "bigint" == typeof o2 || o2.constructor == String ? o2 = n2.__k[r2] = x(null, o2, null, null, null) : g(o2) ? o2 = n2.__k[r2] = x(S, { children: o2 }, null, null, null) : void 0 === o2.constructor && o2.__b > 0 ? o2 = n2.__k[r2] = x(o2.type, o2.props, o2.key, o2.ref ? o2.ref : null, o2.__v) : n2.__k[r2] = o2, f3 = r2 + h2, o2.__ = n2, o2.__b = n2.__b + 1, e2 = null, -1 != (c2 = o2.__i = O(o2, u3, f3, a2)) && (a2--, (e2 = u3[c2]) && (e2.__u |= 2)), null == e2 || null == e2.__v ? (-1 == c2 && (i3 > s2 ? h2-- : i3 < s2 && h2++), "function" != typeof o2.type && (o2.__u |= 4)) : c2 != f3 && (c2 == f3 - 1 ? h2-- : c2 == f3 + 1 ? h2++ : (c2 > f3 ? h2-- : h2++, o2.__u |= 4))) : n2.__k[r2] = null;
    if (a2)
      for (r2 = 0; r2 < s2; r2++)
        null != (e2 = u3[r2]) && 0 == (2 & e2.__u) && (e2.__e == t2 && (t2 = $(e2)), K(e2, e2));
    return t2;
  }
  function j(n2, l2, u3, t2) {
    var i3, r2;
    if ("function" == typeof n2.type) {
      for (i3 = n2.__k, r2 = 0; i3 && r2 < i3.length; r2++)
        i3[r2] && (i3[r2].__ = n2, l2 = j(i3[r2], l2, u3, t2));
      return l2;
    }
    n2.__e != l2 && (t2 && (l2 && n2.type && !l2.parentNode && (l2 = $(n2)), u3.insertBefore(n2.__e, l2 || null)), l2 = n2.__e);
    do {
      l2 = l2 && l2.nextSibling;
    } while (null != l2 && 8 == l2.nodeType);
    return l2;
  }
  function O(n2, l2, u3, t2) {
    var i3, r2, o2, e2 = n2.key, f3 = n2.type, c2 = l2[u3], s2 = null != c2 && 0 == (2 & c2.__u);
    if (null === c2 && null == e2 || s2 && e2 == c2.key && f3 == c2.type)
      return u3;
    if (t2 > (s2 ? 1 : 0)) {
      for (i3 = u3 - 1, r2 = u3 + 1; i3 >= 0 || r2 < l2.length; )
        if (null != (c2 = l2[o2 = i3 >= 0 ? i3-- : r2++]) && 0 == (2 & c2.__u) && e2 == c2.key && f3 == c2.type)
          return o2;
    }
    return -1;
  }
  function z(n2, l2, u3) {
    "-" == l2[0] ? n2.setProperty(l2, null == u3 ? "" : u3) : n2[l2] = null == u3 ? "" : "number" != typeof u3 || _.test(l2) ? u3 : u3 + "px";
  }
  function N(n2, l2, u3, t2, i3) {
    var r2, o2;
    n:
      if ("style" == l2)
        if ("string" == typeof u3)
          n2.style.cssText = u3;
        else {
          if ("string" == typeof t2 && (n2.style.cssText = t2 = ""), t2)
            for (l2 in t2)
              u3 && l2 in u3 || z(n2.style, l2, "");
          if (u3)
            for (l2 in u3)
              t2 && u3[l2] == t2[l2] || z(n2.style, l2, u3[l2]);
        }
      else if ("o" == l2[0] && "n" == l2[1])
        r2 = l2 != (l2 = l2.replace(a, "$1")), o2 = l2.toLowerCase(), l2 = o2 in n2 || "onFocusOut" == l2 || "onFocusIn" == l2 ? o2.slice(2) : l2.slice(2), n2.l || (n2.l = {}), n2.l[l2 + r2] = u3, u3 ? t2 ? u3[s] = t2[s] : (u3[s] = h, n2.addEventListener(l2, r2 ? v : p, r2)) : n2.removeEventListener(l2, r2 ? v : p, r2);
      else {
        if ("http://www.w3.org/2000/svg" == i3)
          l2 = l2.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
        else if ("width" != l2 && "height" != l2 && "href" != l2 && "list" != l2 && "form" != l2 && "tabIndex" != l2 && "download" != l2 && "rowSpan" != l2 && "colSpan" != l2 && "role" != l2 && "popover" != l2 && l2 in n2)
          try {
            n2[l2] = null == u3 ? "" : u3;
            break n;
          } catch (n3) {
          }
        "function" == typeof u3 || (null == u3 || false === u3 && "-" != l2[4] ? n2.removeAttribute(l2) : n2.setAttribute(l2, "popover" == l2 && 1 == u3 ? "" : u3));
      }
  }
  function V(n2) {
    return function(u3) {
      if (this.l) {
        var t2 = this.l[u3.type + n2];
        if (null == u3[c])
          u3[c] = h++;
        else if (u3[c] < t2[s])
          return;
        return t2(l.event ? l.event(u3) : u3);
      }
    };
  }
  function q(n2, u3, t2, i3, r2, o2, e2, f3, c2, s2) {
    var a2, h2, p2, v2, y2, d2, _2, k2, x2, M, $2, I2, P2, A2, H2, T2 = u3.type;
    if (void 0 !== u3.constructor)
      return null;
    128 & t2.__u && (c2 = !!(32 & t2.__u), o2 = [f3 = u3.__e = t2.__e]), (a2 = l.__b) && a2(u3);
    n:
      if ("function" == typeof T2)
        try {
          if (k2 = u3.props, x2 = T2.prototype && T2.prototype.render, M = (a2 = T2.contextType) && i3[a2.__c], $2 = a2 ? M ? M.props.value : a2.__ : i3, t2.__c ? _2 = (h2 = u3.__c = t2.__c).__ = h2.__E : (x2 ? u3.__c = h2 = new T2(k2, $2) : (u3.__c = h2 = new C(k2, $2), h2.constructor = T2, h2.render = Q), M && M.sub(h2), h2.state || (h2.state = {}), h2.__n = i3, p2 = h2.__d = true, h2.__h = [], h2._sb = []), x2 && null == h2.__s && (h2.__s = h2.state), x2 && null != T2.getDerivedStateFromProps && (h2.__s == h2.state && (h2.__s = m({}, h2.__s)), m(h2.__s, T2.getDerivedStateFromProps(k2, h2.__s))), v2 = h2.props, y2 = h2.state, h2.__v = u3, p2)
            x2 && null == T2.getDerivedStateFromProps && null != h2.componentWillMount && h2.componentWillMount(), x2 && null != h2.componentDidMount && h2.__h.push(h2.componentDidMount);
          else {
            if (x2 && null == T2.getDerivedStateFromProps && k2 !== v2 && null != h2.componentWillReceiveProps && h2.componentWillReceiveProps(k2, $2), u3.__v == t2.__v || !h2.__e && null != h2.shouldComponentUpdate && false === h2.shouldComponentUpdate(k2, h2.__s, $2)) {
              u3.__v != t2.__v && (h2.props = k2, h2.state = h2.__s, h2.__d = false), u3.__e = t2.__e, u3.__k = t2.__k, u3.__k.some(function(n3) {
                n3 && (n3.__ = u3);
              }), w.push.apply(h2.__h, h2._sb), h2._sb = [], h2.__h.length && e2.push(h2);
              break n;
            }
            null != h2.componentWillUpdate && h2.componentWillUpdate(k2, h2.__s, $2), x2 && null != h2.componentDidUpdate && h2.__h.push(function() {
              h2.componentDidUpdate(v2, y2, d2);
            });
          }
          if (h2.context = $2, h2.props = k2, h2.__P = n2, h2.__e = false, I2 = l.__r, P2 = 0, x2)
            h2.state = h2.__s, h2.__d = false, I2 && I2(u3), a2 = h2.render(h2.props, h2.state, h2.context), w.push.apply(h2.__h, h2._sb), h2._sb = [];
          else
            do {
              h2.__d = false, I2 && I2(u3), a2 = h2.render(h2.props, h2.state, h2.context), h2.state = h2.__s;
            } while (h2.__d && ++P2 < 25);
          h2.state = h2.__s, null != h2.getChildContext && (i3 = m(m({}, i3), h2.getChildContext())), x2 && !p2 && null != h2.getSnapshotBeforeUpdate && (d2 = h2.getSnapshotBeforeUpdate(v2, y2)), A2 = null != a2 && a2.type === S && null == a2.key ? E(a2.props.children) : a2, f3 = L(n2, g(A2) ? A2 : [A2], u3, t2, i3, r2, o2, e2, f3, c2, s2), h2.base = u3.__e, u3.__u &= -161, h2.__h.length && e2.push(h2), _2 && (h2.__E = h2.__ = null);
        } catch (n3) {
          if (u3.__v = null, c2 || null != o2)
            if (n3.then) {
              for (u3.__u |= c2 ? 160 : 128; f3 && 8 == f3.nodeType && f3.nextSibling; )
                f3 = f3.nextSibling;
              o2[o2.indexOf(f3)] = null, u3.__e = f3;
            } else {
              for (H2 = o2.length; H2--; )
                b(o2[H2]);
              B(u3);
            }
          else
            u3.__e = t2.__e, u3.__k = t2.__k, n3.then || B(u3);
          l.__e(n3, u3, t2);
        }
      else
        null == o2 && u3.__v == t2.__v ? (u3.__k = t2.__k, u3.__e = t2.__e) : f3 = u3.__e = G(t2.__e, u3, t2, i3, r2, o2, e2, c2, s2);
    return (a2 = l.diffed) && a2(u3), 128 & u3.__u ? void 0 : f3;
  }
  function B(n2) {
    n2 && (n2.__c && (n2.__c.__e = true), n2.__k && n2.__k.some(B));
  }
  function D(n2, u3, t2) {
    for (var i3 = 0; i3 < t2.length; i3++)
      J(t2[i3], t2[++i3], t2[++i3]);
    l.__c && l.__c(u3, n2), n2.some(function(u4) {
      try {
        n2 = u4.__h, u4.__h = [], n2.some(function(n3) {
          n3.call(u4);
        });
      } catch (n3) {
        l.__e(n3, u4.__v);
      }
    });
  }
  function E(n2) {
    return "object" != typeof n2 || null == n2 || n2.__b > 0 ? n2 : g(n2) ? n2.map(E) : m({}, n2);
  }
  function G(u3, t2, i3, r2, o2, e2, f3, c2, s2) {
    var a2, h2, p2, v2, y2, w2, _2, m2 = i3.props || d, k2 = t2.props, x2 = t2.type;
    if ("svg" == x2 ? o2 = "http://www.w3.org/2000/svg" : "math" == x2 ? o2 = "http://www.w3.org/1998/Math/MathML" : o2 || (o2 = "http://www.w3.org/1999/xhtml"), null != e2) {
      for (a2 = 0; a2 < e2.length; a2++)
        if ((y2 = e2[a2]) && "setAttribute" in y2 == !!x2 && (x2 ? y2.localName == x2 : 3 == y2.nodeType)) {
          u3 = y2, e2[a2] = null;
          break;
        }
    }
    if (null == u3) {
      if (null == x2)
        return document.createTextNode(k2);
      u3 = document.createElementNS(o2, x2, k2.is && k2), c2 && (l.__m && l.__m(t2, e2), c2 = false), e2 = null;
    }
    if (null == x2)
      m2 === k2 || c2 && u3.data == k2 || (u3.data = k2);
    else {
      if (e2 = e2 && n.call(u3.childNodes), !c2 && null != e2)
        for (m2 = {}, a2 = 0; a2 < u3.attributes.length; a2++)
          m2[(y2 = u3.attributes[a2]).name] = y2.value;
      for (a2 in m2)
        y2 = m2[a2], "dangerouslySetInnerHTML" == a2 ? p2 = y2 : "children" == a2 || a2 in k2 || "value" == a2 && "defaultValue" in k2 || "checked" == a2 && "defaultChecked" in k2 || N(u3, a2, null, y2, o2);
      for (a2 in k2)
        y2 = k2[a2], "children" == a2 ? v2 = y2 : "dangerouslySetInnerHTML" == a2 ? h2 = y2 : "value" == a2 ? w2 = y2 : "checked" == a2 ? _2 = y2 : c2 && "function" != typeof y2 || m2[a2] === y2 || N(u3, a2, y2, m2[a2], o2);
      if (h2)
        c2 || p2 && (h2.__html == p2.__html || h2.__html == u3.innerHTML) || (u3.innerHTML = h2.__html), t2.__k = [];
      else if (p2 && (u3.innerHTML = ""), L("template" == t2.type ? u3.content : u3, g(v2) ? v2 : [v2], t2, i3, r2, "foreignObject" == x2 ? "http://www.w3.org/1999/xhtml" : o2, e2, f3, e2 ? e2[0] : i3.__k && $(i3, 0), c2, s2), null != e2)
        for (a2 = e2.length; a2--; )
          b(e2[a2]);
      c2 || (a2 = "value", "progress" == x2 && null == w2 ? u3.removeAttribute("value") : null != w2 && (w2 !== u3[a2] || "progress" == x2 && !w2 || "option" == x2 && w2 != m2[a2]) && N(u3, a2, w2, m2[a2], o2), a2 = "checked", null != _2 && _2 != u3[a2] && N(u3, a2, _2, m2[a2], o2));
    }
    return u3;
  }
  function J(n2, u3, t2) {
    try {
      if ("function" == typeof n2) {
        var i3 = "function" == typeof n2.__u;
        i3 && n2.__u(), i3 && null == u3 || (n2.__u = n2(u3));
      } else
        n2.current = u3;
    } catch (n3) {
      l.__e(n3, t2);
    }
  }
  function K(n2, u3, t2) {
    var i3, r2;
    if (l.unmount && l.unmount(n2), (i3 = n2.ref) && (i3.current && i3.current != n2.__e || J(i3, null, u3)), null != (i3 = n2.__c)) {
      if (i3.componentWillUnmount)
        try {
          i3.componentWillUnmount();
        } catch (n3) {
          l.__e(n3, u3);
        }
      i3.base = i3.__P = null;
    }
    if (i3 = n2.__k)
      for (r2 = 0; r2 < i3.length; r2++)
        i3[r2] && K(i3[r2], u3, t2 || "function" != typeof n2.type);
    t2 || b(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
  }
  function Q(n2, l2, u3) {
    return this.constructor(n2, u3);
  }
  function R(u3, t2, i3) {
    var r2, o2, e2, f3;
    t2 == document && (t2 = document.documentElement), l.__ && l.__(u3, t2), o2 = (r2 = "function" == typeof i3) ? null : i3 && i3.__k || t2.__k, e2 = [], f3 = [], q(t2, u3 = (!r2 && i3 || t2).__k = k(S, null, [u3]), o2 || d, d, t2.namespaceURI, !r2 && i3 ? [i3] : o2 ? null : t2.firstChild ? n.call(t2.childNodes) : null, e2, !r2 && i3 ? i3 : o2 ? o2.__e : t2.firstChild, r2, f3), D(e2, u3, f3);
  }
  n = w.slice, l = { __e: function(n2, l2, u3, t2) {
    for (var i3, r2, o2; l2 = l2.__; )
      if ((i3 = l2.__c) && !i3.__)
        try {
          if ((r2 = i3.constructor) && null != r2.getDerivedStateFromError && (i3.setState(r2.getDerivedStateFromError(n2)), o2 = i3.__d), null != i3.componentDidCatch && (i3.componentDidCatch(n2, t2 || {}), o2 = i3.__d), o2)
            return i3.__E = i3;
        } catch (l3) {
          n2 = l3;
        }
    throw n2;
  } }, u = 0, t = function(n2) {
    return null != n2 && void 0 === n2.constructor;
  }, C.prototype.setState = function(n2, l2) {
    var u3;
    u3 = null != this.__s && this.__s != this.state ? this.__s : this.__s = m({}, this.state), "function" == typeof n2 && (n2 = n2(m({}, u3), this.props)), n2 && m(u3, n2), null != n2 && this.__v && (l2 && this._sb.push(l2), A(this));
  }, C.prototype.forceUpdate = function(n2) {
    this.__v && (this.__e = true, n2 && this.__h.push(n2), A(this));
  }, C.prototype.render = S, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n2, l2) {
    return n2.__v.__b - l2.__v.__b;
  }, H.__r = 0, f = Math.random().toString(8), c = "__d" + f, s = "__a" + f, a = /(PointerCapture)$|Capture$/i, h = 0, p = V(false), v = V(true), y = 0;

  // node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js
  var f2 = 0;
  var i2 = Array.isArray;
  function u2(e2, t2, n2, o2, i3, u3) {
    t2 || (t2 = {});
    var a2, c2, p2 = t2;
    if ("ref" in p2)
      for (c2 in p2 = {}, t2)
        "ref" == c2 ? a2 = t2[c2] : p2[c2] = t2[c2];
    var l2 = { type: e2, props: p2, key: n2, ref: a2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f2, __i: -1, __u: 0, __source: i3, __self: u3 };
    if ("function" == typeof e2 && (a2 = e2.defaultProps))
      for (c2 in a2)
        void 0 === p2[c2] && (p2[c2] = a2[c2]);
    return l.vnode && l.vnode(l2), l2;
  }

  // src/popup/index.jsx
  function Popup() {
    return /* @__PURE__ */ u2("div", { style: { padding: "1rem", minWidth: "200px" }, children: [
      /* @__PURE__ */ u2("h3", { children: "RR Author Companion" }),
      /* @__PURE__ */ u2("p", { children: "v3.0.0" })
    ] });
  }
  R(/* @__PURE__ */ u2(Popup, {}), document.getElementById("app"));
})();
//# sourceMappingURL=popup.js.map
