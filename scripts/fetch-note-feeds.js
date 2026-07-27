// note RSSを取得し、必要な項目を抽出してdata/配下にJSONとして書き出す。
// GitHub Actionsから定期実行される想定（README.md参照）。

const fs = require('fs');
const path = require('path');

// TOPページ・reportページで埋め込んでいるnoteのソース一覧。
// mkkpjテーマ側（index.php / archive-report.php）の data-note-source と一致させること。
const SOURCES = [
  'https://note.com/mkkpj',
  'https://note.com/mkkpj/m/m1df8b9f90403',
  'https://note.com/mkkpj/m/m75264133559d',
  'https://note.com/mkkpj/m/ma82739e7bfc4',
];

const MAX_ITEMS = 10;
const DATA_DIR = path.join(__dirname, '..', 'data');

function slugify(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function extractTag(block, tagName) {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`<${escapedTag}>([\\s\\S]*?)<\\/${escapedTag}>`));
  if (!match) return '';

  let value = match[1].trim();

  const cdataMatch = value.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdataMatch) value = cdataMatch[1].trim();

  return decodeXmlEntities(value);
}

function decodeXmlEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseNoteRss(xml, maxItems) {
  const channelBlock = xml.split('<item>')[0] || '';

  const feed = {
    title: extractTag(channelBlock, 'title'),
    link: extractTag(channelBlock, 'link'),
    items: [],
  };

  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const block of itemBlocks.slice(0, maxItems)) {
    feed.items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      pubDate: extractTag(block, 'pubDate'),
      thumbnail: extractTag(block, 'media:thumbnail'),
      creatorImage: extractTag(block, 'note:creatorImage'),
      creatorName: extractTag(block, 'note:creatorName'),
    });
  }

  return feed;
}

async function fetchFeed(sourceUrl) {
  const feedUrl = sourceUrl.replace(/\/rss\/?$/, '').replace(/\/$/, '') + '/rss';
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'mkk_note-feed-cache/1.0' },
  });
  if (!res.ok) {
    throw new Error(`failed to fetch ${feedUrl}: ${res.status}`);
  }
  return res.text();
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const results = [];

  for (const source of SOURCES) {
    const slug = slugify(source);
    try {
      const xml = await fetchFeed(source);
      const feed = parseNoteRss(xml, MAX_ITEMS);
      feed.source = source;
      feed.generatedAt = generatedAt;

      fs.writeFileSync(
        path.join(DATA_DIR, `${slug}.json`),
        JSON.stringify(feed, null, 2) + '\n'
      );
      results.push({ source, slug, items: feed.items.length, ok: true });
    } catch (e) {
      results.push({ source, slug, ok: false, error: e.message });
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`${failed.length} feed(s) failed to fetch`);
  }
}

main();
