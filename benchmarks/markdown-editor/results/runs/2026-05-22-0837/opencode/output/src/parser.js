function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sanitizeUrl(url) {
  const u = String(url || '').trim();
  // Disallow dangerous schemes like javascript:, data: (except mailto), vbscript:
  const lower = u.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    // Basic attribute escaping for quotes and ampersands
    return u.replace(/["&<>]/g, c => ({ '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  return null; // unsafe
}

function renderInline(text) {
  // Escape first to neutralize raw HTML/XSS
  let s = escapeHtml(text);
  // Extract code spans first to prevent further parsing inside code
  const codeParts = [];
  s = s.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeParts.push(`<code>${code}</code>`) - 1;
    return `\u0000C${idx}\u0000`;
  });

  // Links: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, txt, url) => {
    const safe = sanitizeUrl(url);
    if (!safe) return _m; // keep literal text (already escaped)
    return `<a href=\"${safe}\">${txt}</a>`;
  });

  // Bold+Italic (*** or ___)
  s = s.replace(/(\*{3}|_{3})(.+?)\1/g, (_m, _mkr, inner) => `<strong><em>${inner}</em></strong>`);
  // Bold (** or __)
  s = s.replace(/(\*{2}|__)(.+?)\1/g, (_m, _mkr, inner) => `<strong>${inner}</strong>`);
  // Italic (* or _)
  s = s.replace(/(\*|_)([^\s][\s\S]*?)\1/g, (_m, _mkr, inner) => `<em>${inner}</em>`);

  // Restore code spans
  s = s.replace(/\u0000C(\d+)\u0000/g, (_m, i) => codeParts[Number(i)]);
  return s;
}

function renderParagraph(lines) {
  const text = lines.join(' ').trim();
  if (text === '') return '';
  return `<p>${renderInline(text)}</p>`;
}

function parseList(lines, start) {
  // Returns { html, nextIndex }
  const itemRe = /^(\s*)(?:([*+-])|(\d+)\.)\s+(.+)$/;
  let i = start;
  const first = lines[i].match(itemRe);
  if (!first) return null;
  const rootType = first[2] ? 'ul' : 'ol';
  let html = `<${rootType}>`;
  while (i < lines.length) {
    const m = lines[i].match(itemRe);
    if (!m) break;
    const type = m[2] ? 'ul' : 'ol';
    // Stop if list type changes at top-level
    if (type !== rootType && m[1].length < 2) break;

    if (m[1].length >= 2) {
      // nested one-level under previous <li>
      // consume nested cluster
      const nestedStart = i;
      const nestedItems = [];
      while (i < lines.length) {
        const n = lines[i].match(itemRe);
        if (!n || n[1].length < 2) break;
        if ((n[2] ? 'ul' : 'ol') !== 'ul') break; // support nested UL only per requirement
        nestedItems.push(n[4]);
        i++;
      }
      // Append nested items under the previous <li>
      if (nestedItems.length) {
        html += `<ul>` + nestedItems.map(t => `<li>${renderInline(t)}</li>`).join('') + `</ul>`;
      } else {
        // safety to prevent infinite loop
        if (i === nestedStart) i++;
      }
      continue;
    }

    // top-level item
    html += `<li>${renderInline(m[4])}`;

    // Lookahead for immediate nested items after this line
    let j = i + 1;
    const nested = [];
    while (j < lines.length) {
      const n = lines[j].match(itemRe);
      if (!n || n[1].length < 2) break;
      if ((n[2] ? 'ul' : 'ol') !== 'ul') break; // only nested UL supported
      nested.push(n[4]);
      j++;
    }
    if (nested.length) {
      html += `<ul>` + nested.map(t => `<li>${renderInline(t)}</li>`).join('') + `</ul>`;
      i = j; // consume nested items
    } else {
      i++;
    }
    html += `</li>`;
  }
  html += `</${rootType}>`;
  return { html, nextIndex: i };
}

function renderMarkdown(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block
    if (/^```/.test(line)) {
      i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      if (i < lines.length && /^```/.test(lines[i])) i++; // consume closing fence
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    // Blockquote (one or more consecutive lines starting with ">")
    if (/^>\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      const inner = renderMarkdown(q.join('\n'));
      out.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }

    // List
    const listParsed = parseList(lines, i);
    if (listParsed) {
      out.push(listParsed.html);
      i = listParsed.nextIndex;
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length;
      out.push(`<h${level}>${renderInline(hm[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blank line -> paragraph boundary
    if (line.trim() === '') { out.push(''); i++; continue; }

    // Paragraph: collect consecutive non-blank lines that are not other blocks
    const para = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === '' || /^```/.test(l) || /^>\s?/.test(l) || /^(#{1,6})\s+/.test(l) || /^(\s*)(?:([*+-])|(\d+)\.)\s+/.test(l)) break;
      para.push(l);
      i++;
    }
    out.push(renderParagraph(para));
  }
  return out.join('\n');
}

module.exports = { renderMarkdown, escapeHtml, sanitizeUrl };
