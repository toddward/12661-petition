/**
 * Tiny Markdown renderer with a strict allow-list (spec §6 "input hygiene").
 * Everything is HTML-escaped first; only these constructs produce tags:
 *   # / ## / ### headings, paragraphs, line breaks, - or * bullet lists, 1. numbered lists,
 *   > block quotes, **bold**, *italic* / _italic_, and https:// or mailto: links.
 * No raw HTML, images, attributes or inline styles are ever emitted.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(escaped: string): string {
  return (
    escaped
      // [text](https://… or mailto:…). URL is already escaped, so quotes cannot break out.
      .replace(/\[([^\]]+)\]\(((?:https:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![_\w])/g, '$1<em>$2</em>')
  );
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline(escapeHtml(l))).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(escapeHtml(i))}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m: RegExpMatchArray | null;
    if (line.trim() === '') {
      flushAll();
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1] ?? '');
    } else if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      flushAll();
      // Shift down: page already has h1/h2, so markdown # renders as h3.
      const level = Math.min(6, (m[1]?.length ?? 1) + 2);
      out.push(`<h${level}>${inline(escapeHtml(m[2] ?? ''))}</h${level}>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.+)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(m[1] ?? '');
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.+)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(m[1] ?? '');
    } else {
      flushList();
      flushQuote();
      para.push(line.trim());
    }
  }
  flushAll();
  return out.join('\n');
}

/** Plain text version (for emails and CSV), keeping paragraphs. */
export function markdownToText(src: string): string {
  return src
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .trim();
}
