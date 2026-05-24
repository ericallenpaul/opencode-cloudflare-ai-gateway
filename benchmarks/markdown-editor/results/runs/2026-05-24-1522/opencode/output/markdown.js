function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  const u = String(url).trim();
  const low = u.toLowerCase();
  if (low.startsWith('http://') || low.startsWith('https://')) return u;
  return null;
}

function inlineFormat(input) {
  let s = String(input ?? '');
  const placeholders = [];
  const put = (html) => { const t = `\x00${placeholders.length}\x01`; placeholders.push(html); return t; };

  // code spans
  s = s.replace(/`([^`]+)`/g, (_, code) => put(`<code>${escapeHtml(code)}</code>`));

  // bold+italic ***
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, (_, inner) => put(`<strong><em>${inlineFormat(inner)}</em></strong>`));
  // bold **
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, inner) => put(`<strong>${inlineFormat(inner)}</strong>`));
  // italic * or _
  s = s.replace(/\*([^*_]+)\*/g, (_, inner) => put(`<em>${inlineFormat(inner)}</em>`));
  s = s.replace(/_([^*_]+)_/g, (_, inner) => put(`<em>${inlineFormat(inner)}</em>`));

  // links [text](url) - simplified greedy match to last ')'
  s = s.replace(/\[([^\]]+)\]\((.+)\)/g, (_, text, url) => {
    const safe = safeUrl(url);
    const inner = inlineFormat(text);
    if (!safe) return put(`${inner}`);
    return put(`<a href="${escapeHtml(safe)}" rel="noopener noreferrer" target="_blank">${inner}</a>`);
  });

  // escape rest and restore
  s = escapeHtml(s);
  s = s.replace(/\x00(\d+)\x01/g, (_, i) => placeholders[+i]);
  return s;
}

function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];

  let inCode = false; let codeBuf = [];
  let listStack = []; // ['ul'] or ['ol', 'ul']
  let openLiDepths = []; // booleans per depth
  let paraOpen = false; let paraBuf = [];
  let inBq = false; let bqBuf = [];

  const closePara = () => { if (paraOpen) { out.push(`<p>${inlineFormat(paraBuf.join(' '))}</p>`); paraOpen = false; paraBuf = []; } };
  const closeListsTo = (depth) => {
    while (listStack.length > depth) {
      const last = listStack.length - 1;
      if (openLiDepths[last]) { out.push('</li>'); openLiDepths[last] = false; }
      const t = listStack.pop(); out.push(t === 'ul' ? '</ul>' : '</ol>');
      openLiDepths.pop();
    }
  };
  const ensureList = (type, depth) => {
    // Open missing levels
    while (listStack.length < depth) { listStack.push('ul'); out.push('<ul>'); openLiDepths.push(false); }
    // At target depth
    if (listStack.length === depth) { listStack.push(type); out.push(type === 'ul' ? '<ul>' : '<ol>'); openLiDepths.push(false); return; }
    if (listStack[depth] !== type) {
      // Close deeper levels first
      closeListsTo(depth);
      // Replace list type at this depth
      const t = listStack.pop(); out.push(t === 'ul' ? '</ul>' : '</ol>'); openLiDepths.pop();
      listStack.push(type); out.push(type === 'ul' ? '<ul>' : '<ol>'); openLiDepths.push(false);
    } else {
      // Same list type; close deeper lists
      closeListsTo(depth + 1);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (inCode) {
      if (/^\s*```/.test(line)) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}\n</code></pre>`);
        inCode = false; codeBuf = [];
      } else {
        codeBuf.push(line);
      }
      continue;
    }

    if (/^\s*```/.test(line)) { // open code fence
      if (inBq) { out.push(`<blockquote><p>${inlineFormat(bqBuf.join('\n'))}</p></blockquote>`); inBq = false; bqBuf = []; }
      closePara(); closeListsTo(0);
      inCode = true; continue;
    }

    if (/^\s*>\s?/.test(line)) { // blockquote line
      const content = line.replace(/^\s*>\s?/, '');
      if (!inBq) { closePara(); closeListsTo(0); inBq = true; bqBuf = []; }
      bqBuf.push(content);
      continue;
    } else if (inBq && line.trim() === '') {
      bqBuf.push('');
      continue;
    } else if (inBq) {
      out.push(`<blockquote><p>${inlineFormat(bqBuf.join('\n'))}</p></blockquote>`);
      inBq = false; bqBuf = [];
      // fallthrough
    }

    if (line.trim() === '') {
      closePara();
      // no list manipulation on blank; items close when new item starts or list ends
      continue;
    }

    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      closePara(); closeListsTo(0);
      const level = hm[1].length; const text = hm[2].trim();
      out.push(`<h${level}>${inlineFormat(text)}</h${level}>`);
      continue;
    }

    const ul = line.match(/^(\s{2,})?([*+-])\s+(.*)$/);
    const ol = line.match(/^(\s{2,})?(\d+)\.\s+(.*)$/);
    if (ul || ol) {
      closePara();
      const depth = (ul ? ul[1] : ol[1]) ? 1 : 0;
      const type = ul ? 'ul' : 'ol';
      const text = (ul ? ul[3] : ol[3]).trim();
      ensureList(type, depth);
      // Close existing li at this depth before starting a new one
      if (openLiDepths[depth]) { out.push('</li>'); openLiDepths[depth] = false; }
      out.push(`<li>${inlineFormat(text)}`);
      openLiDepths[depth] = true;
      continue;
    }

    if (!paraOpen) { paraOpen = true; paraBuf = []; }
    paraBuf.push(line.trim());
  }

  if (inBq) { out.push(`<blockquote><p>${inlineFormat(bqBuf.join('\n'))}</p></blockquote>`); }
  if (inCode) { out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}\n</code></pre>`); }
  if (paraOpen) { out.push(`<p>${inlineFormat(paraBuf.join(' '))}</p>`); }
  // Close any open list items and lists
  for (let d = openLiDepths.length - 1; d >= 0; d--) {
    if (openLiDepths[d]) { out.push('</li>'); openLiDepths[d] = false; }
    const t = listStack.pop(); out.push(t === 'ul' ? '</ul>' : '</ol>');
  }

  return out.join('');
}

module.exports = { renderMarkdown, escapeHtml, inlineFormat, safeUrl };
