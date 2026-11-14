/** Tiny DOM helper. Text is always inserted as text nodes, so user content can never inject HTML. */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function toast(msg, kind = 'info') {
  const host = document.getElementById('toasts');
  const el = h('div', { class: `toast ${kind}` }, msg);
  host.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2800);
}

export function logo(cls = 'logo') { return h('span', { class: cls, role: 'img', 'aria-label': 'LavO' }); }

export function avatar(name) {
  return h('span', { class: 'avatar', 'aria-hidden': 'true' }, (name || '?').slice(0, 1).toUpperCase());
}

export function field(label, input) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
}

export function scrollToEnd(el) { el.scrollTop = el.scrollHeight; }
