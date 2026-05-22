// markdown.js
export function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeUrl(url = "") {
  const raw = String(url).trim();
  // Allow relative, protocol-relative not considered (no leading //), anchors
  if (raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return raw;
  const m = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!m) return raw; // bare words like example.com treated as relative text
  const scheme = m[1].toLowerCase();
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') return raw;
  return null; // unsafe
}

export function parseMarkdown(input = "") {
  const lines = String(input).split(/\r?\n/);
  const out = [];
  let i = 0;

  const renderInline = (text, { allowLinks = true } = {}) => {
    let working = String(text);
    const tokens = [];
    const ph = (idx) => `§§T${idx}§§`;

    // Code spans first: `code`
    working = working.replace(/`([^`]+)`/g, (_, code) => {
      const idx = tokens.push(`<code>${escapeHtml(code)}</code>`) - 1;
      return ph(idx);
    });

    // Links next: [text](url)
    if (allowLinks) {
      working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, url) => {
        const safe = sanitizeUrl(url);
        if (safe) {
          const inner = renderInline(txt, { allowLinks: false });
          const idx = tokens.push(`<a href=\"${escapeHtml(safe)}\">${inner}</a>`) - 1;
          return ph(idx);
        } else {
          // Unsafe: render only inner text without a link
          const inner = renderInline(txt, { allowLinks: false });
          const idx = tokens.push(inner) - 1;
          return ph(idx);
        }
      });
    }

    // Escape remaining literal text
    working = escapeHtml(working);

    // Emphasis: ***both***, then **bold**, then *italic* and _italic_
    working = working.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    working = working.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    working = working.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    working = working.replace(/(^|[^*])\*([^*\n]+)\*/g, (m, pre, body) => `${pre}<em>${body}</em>`);

    // Restore tokens
    working = working.replace(/§§T(\d+)§§/g, (_, n) => tokens[Number(n)] ?? '');
    return working;
  };

  const matchListLine = (idx) => {
    if (idx >= lines.length) return null;
    const line = lines[idx];
    let m = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (m) return { indent: m[1].length, type: 'ul', text: m[3] };
    m = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (m) return { indent: m[1].length, type: 'ol', text: m[3] };
    return null;
  };

  const parseList = (startIdx, baseIndent, listType) => {
    let html = listType === 'ul' ? '<ul>' : '<ol>';
    let idx = startIdx;
    while (idx < lines.length) {
      const m = matchListLine(idx);
      if (!m) break;
      if (m.indent < baseIndent) break;
      if (m.indent > baseIndent && m.indent !== baseIndent + 2) break; // only one level deeper allowed here
      if (m.indent === baseIndent && m.type !== listType) break; // different list type ends this list

      if (m.indent === baseIndent && m.type === listType) {
        html += `<li>${renderInline(m.text)}`;
        idx++;
        // Check for a nested list starting immediately after
        const n = matchListLine(idx);
        if (n && n.indent === baseIndent + 2) {
          const [childHtml, nextIdx] = parseList(idx, baseIndent + 2, n.type);
          html += childHtml;
          idx = nextIdx;
        }
        html += `</li>`;
        continue;
      }
      // If deeper indent appears unexpectedly, break
      break;
    }
    html += listType === 'ul' ? '</ul>' : '</ol>';
    return [html, idx];
  };
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block ```
    if (/^```/.test(line)) {
      i++;
      const buf = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      // consume closing fence if present
      if (i < lines.length && /^```\s*$/.test(lines[i])) i++;
      const code = escapeHtml(buf.join('\n'));
      out.push(`<pre><code>${code}</code></pre>`);
      continue;
    }
    // ATX headings #..###### followed by space
    if (/^#{1,6} /.test(line)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      const level = m[1].length;
      out.push(`<h${level}>${renderInline(m[2])}</h${level}>`);
      i++;
      continue;
    }
    // Lists
    const lm = matchListLine(i);
    if (lm && lm.indent === 0) {
      const [listHtml, nextI] = parseList(i, 0, lm.type);
      out.push(listHtml);
      i = nextI;
      continue;
    }

    // Blockquotes: lines starting with '>'
    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const inner = quoteLines.map(l => renderInline(l)).join('<br/> ');
      out.push(`<blockquote><p>${inner}</p></blockquote>`);
      continue;
    }
    // Paragraphs: group non-empty lines until blank
    if (line.trim() !== '') {
      const buf = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        buf.push(lines[i].trim());
        i++;
      }
      out.push(`<p>${renderInline(buf.join(' '))}</p>`);
      continue;
    }
    i++;
  }
  return out.join('\n');
}
