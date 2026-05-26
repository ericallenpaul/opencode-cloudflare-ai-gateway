const CODE_TOKEN_PREFIX = '\u0000CODE';
const CODE_TOKEN_SUFFIX = '\u0000';

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createCodeToken(index) {
  return `${CODE_TOKEN_PREFIX}${index}${CODE_TOKEN_SUFFIX}`;
}

function sanitizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (normalized.startsWith('javascript:')) {
    return null;
  }

  if (
    /^(https?:|mailto:)/i.test(trimmed) ||
    /^(\/|\.\/|\.\.\/|#|\?)/.test(trimmed)
  ) {
    return trimmed;
  }

  return null;
}

function applyEmphasis(html) {
  return html
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
}

function tokenizeCodeSpans(text) {
  const tokens = [];
  const replaced = text.replace(/`([^`\n]+)`/g, (_, content) => {
    const token = createCodeToken(tokens.length);
    tokens.push(`<code>${escapeHtml(content)}</code>`);
    return token;
  });
  return { replaced, tokens };
}

function restoreCodeTokens(text, tokens) {
  return text.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => tokens[Number(index)] ?? '');
}

function renderInline(text) {
  const { replaced, tokens } = tokenizeCodeSpans(text);
  let cursor = 0;
  let html = '';

  while (cursor < replaced.length) {
    const labelStart = replaced.indexOf('[', cursor);
    if (labelStart === -1) {
      html += escapeHtml(replaced.slice(cursor));
      break;
    }

    html += escapeHtml(replaced.slice(cursor, labelStart));

    const labelEnd = replaced.indexOf('](', labelStart);
    if (labelEnd === -1) {
      html += escapeHtml(replaced.slice(labelStart));
      break;
    }

    let hrefIndex = labelEnd + 2;
    let depth = 1;
    let hrefEnd = -1;

    while (hrefIndex < replaced.length) {
      const char = replaced[hrefIndex];
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          hrefEnd = hrefIndex;
          break;
        }
      }
      hrefIndex += 1;
    }

    if (hrefEnd === -1) {
      html += escapeHtml(replaced.slice(labelStart));
      break;
    }

    const rawLabel = replaced.slice(labelStart + 1, labelEnd);
    const rawHref = replaced.slice(labelEnd + 2, hrefEnd);
    const safeHref = sanitizeUrl(rawHref);
    if (safeHref) {
      html += `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${renderInline(rawLabel)}</a>`;
    } else {
      html += `<span class="unsafe-link">${escapeHtml(rawLabel)}</span>`;
    }

    cursor = hrefEnd + 1;
  }

  html = applyEmphasis(html);
  return restoreCodeTokens(html, tokens);
}

function isBlank(line) {
  return line.trim() === '';
}

function isFence(line) {
  return /^```/.test(line);
}

function isHeading(line) {
  return /^(#{1,6})\s+.+$/.test(line);
}

function isBlockquote(line) {
  return /^>\s?/.test(line);
}

function parseListMarker(line) {
  const match = line.match(/^(\s{0,3})([-+*]|\d+\.)\s+(.+)$/);
  if (!match) {
    return null;
  }

  const indent = match[1].length;
  return {
    indent,
    type: /\d+\./.test(match[2]) ? 'ol' : 'ul',
    content: match[3]
  };
}

function renderParagraph(lines) {
  return `<p>${lines.map((line) => renderInline(line)).join('<br>')}</p>`;
}

function collectParagraph(lines, startIndex) {
  const content = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (
      isBlank(line) ||
      isFence(line) ||
      isHeading(line) ||
      isBlockquote(line) ||
      parseListMarker(line)
    ) {
      break;
    }
    content.push(line);
    index += 1;
  }

  return { html: renderParagraph(content), nextIndex: index };
}

function collectFence(lines, startIndex) {
  const opener = lines[startIndex].match(/^```(\S+)?\s*$/);
  const language = opener?.[1] ? ` class="language-${escapeHtml(opener[1])}"` : '';
  const content = [];
  let index = startIndex + 1;

  while (index < lines.length && !/^```\s*$/.test(lines[index])) {
    content.push(lines[index]);
    index += 1;
  }

  if (index < lines.length) {
    index += 1;
  }

  return {
    html: `<pre><code${language}>${escapeHtml(content.join('\n'))}</code></pre>`,
    nextIndex: index
  };
}

function collectBlockquote(lines, startIndex) {
  const quoteLines = [];
  let index = startIndex;

  while (index < lines.length && (isBlockquote(lines[index]) || isBlank(lines[index]))) {
    if (isBlockquote(lines[index])) {
      quoteLines.push(lines[index].replace(/^>\s?/, ''));
    } else {
      quoteLines.push('');
    }
    index += 1;
  }

  const paragraphs = [];
  let current = [];
  for (const line of quoteLines) {
    if (line === '') {
      if (current.length) {
        paragraphs.push(renderParagraph(current));
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length) {
    paragraphs.push(renderParagraph(current));
  }

  return {
    html: `<blockquote>${paragraphs.join('')}</blockquote>`,
    nextIndex: index
  };
}

function collectList(lines, startIndex, expectedIndent = null, forcedType = null) {
  const firstMarker = parseListMarker(lines[startIndex]);
  const baseIndent = expectedIndent ?? firstMarker.indent;
  const listType = forcedType ?? firstMarker.type;
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const marker = parseListMarker(lines[index]);
    if (!marker) {
      break;
    }

    if (marker.indent < baseIndent || marker.indent > baseIndent + 3) {
      break;
    }

    if (marker.indent > baseIndent) {
      if (!items.length) {
        break;
      }

      const nested = collectList(lines, index, marker.indent, marker.type);
      items[items.length - 1] += nested.html;
      index = nested.nextIndex;
      continue;
    }

    if (marker.type !== listType) {
      break;
    }

    items.push(`<li>${renderInline(marker.content)}`);
    index += 1;

    while (index < lines.length) {
      const nextLine = lines[index];
      if (isBlank(nextLine)) {
        index += 1;
        break;
      }

      const nextMarker = parseListMarker(nextLine);
      if (nextMarker) {
        if (nextMarker.indent > baseIndent) {
          const nested = collectList(lines, index, nextMarker.indent, nextMarker.type);
          items[items.length - 1] += nested.html;
          index = nested.nextIndex;
          continue;
        }

        if (nextMarker.indent === baseIndent && nextMarker.type === listType) {
          break;
        }

        break;
      }

      if (/^\s{2,}.+/.test(nextLine)) {
        items[items.length - 1] += `<br>${renderInline(nextLine.trim())}`;
        index += 1;
        continue;
      }

      break;
    }

    items[items.length - 1] += '</li>';
  }

  return {
    html: `<${listType}>${items.join('')}</${listType}>`,
    nextIndex: index
  };
}

export function renderMarkdown(markdown) {
  const normalized = String(markdown ?? '').replace(/\r\n?/g, '\n');
  if (!normalized.trim()) {
    return '';
  }

  const lines = normalized.split('\n');
  const parts = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const fence = collectFence(lines, index);
      parts.push(fence.html);
      index = fence.nextIndex;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      parts.push(`<h${heading[1].length}>${renderInline(heading[2].trim())}</h${heading[1].length}>`);
      index += 1;
      continue;
    }

    if (isBlockquote(line)) {
      const blockquote = collectBlockquote(lines, index);
      parts.push(blockquote.html);
      index = blockquote.nextIndex;
      continue;
    }

    const marker = parseListMarker(line);
    if (marker) {
      const list = collectList(lines, index, marker.indent, marker.type);
      parts.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraph = collectParagraph(lines, index);
    parts.push(paragraph.html);
    index = paragraph.nextIndex;
  }

  return parts.join('\n');
}
