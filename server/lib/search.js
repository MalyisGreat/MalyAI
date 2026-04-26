import * as cheerio from 'cheerio';
import { SEARCH_TIMEOUT_MS } from '../config.js';
import { createTimeoutSignal } from './http.js';

function decodeDuckDuckGoUrl(href) {
  if (!href) {
    return '';
  }

  try {
    const parsed = new URL(href, 'https://duckduckgo.com');
    const redirected = parsed.searchParams.get('uddg');
    return redirected ? decodeURIComponent(redirected) : parsed.href;
  } catch {
    return href;
  }
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isGenericNewsQuery(query) {
  const lower = query.toLowerCase();
  return (
    /\b(today|happened|happend|headlines?|breaking|latest|news)\b/.test(lower) &&
    !/\b(site:|from:|about:|stock|weather|sports score|game score)\b/.test(lower)
  );
}

function normalizeNewsQuery(query) {
  return query
    .replace(/^\s*(search|serach|look\s*up|browse)\b[:\s-]*/i, '')
    .replace(/\bhappend\b/gi, 'happened')
    .trim();
}

async function searchGoogleNews(query, { limit }) {
  const cleanQuery = normalizeNewsQuery(query);
  const url =
    cleanQuery &&
    !/^(what\s+)?(has\s+)?happened\s+today(\s+[a-z]+\s+\d{1,2},\s+\d{4})?\??$/i.test(cleanQuery) &&
    !/^top\s+news\s+headlines\s+today\b/i.test(cleanQuery)
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=en-US&gl=US&ceid=US:en`
      : 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
  const timeout = createTimeoutSignal(SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      },
      signal: timeout.signal,
    });

    if (!response.ok) {
      return null;
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const results = [];

    $('item').each((_, element) => {
      if (results.length >= limit) {
        return false;
      }

      const item = $(element);
      const title = normalizeSpace(item.find('title').first().text());
      const resultUrl = normalizeSpace(item.find('link').first().text());
      const source = normalizeSpace(item.find('source').first().text());
      const pubDate = normalizeSpace(item.find('pubDate').first().text());
      const snippet = [source, pubDate].filter(Boolean).join(' - ');

      if (title && resultUrl) {
        results.push({ title, url: resultUrl, snippet });
      }

      return undefined;
    });

    return {
      query: cleanQuery || 'top headlines',
      results,
      source: 'google-news-rss',
    };
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

export async function searchWeb(query, { limit = 5 } = {}) {
  const cleanQuery = normalizeSpace(query);
  if (!cleanQuery) {
    return { query: cleanQuery, results: [], error: 'Missing search query' };
  }

  if (isGenericNewsQuery(cleanQuery)) {
    const news = await searchGoogleNews(cleanQuery, { limit });
    if (news?.results?.length > 0) {
      return news;
    }
  }

  const timeout = createTimeoutSignal(SEARCH_TIMEOUT_MS);
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      },
      signal: timeout.signal,
    });

    if (!response.ok) {
      return {
        query: cleanQuery,
        results: [],
        error: `Search provider responded ${response.status}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((_, element) => {
      if (results.length >= limit) {
        return false;
      }

      const titleElement = $(element).find('.result__title a').first();
      const title = normalizeSpace(titleElement.text());
      const resultUrl = decodeDuckDuckGoUrl(titleElement.attr('href'));
      const snippet = normalizeSpace($(element).find('.result__snippet').first().text());

      if (title && resultUrl) {
        results.push({ title, url: resultUrl, snippet });
      }

      return undefined;
    });

    return { query: cleanQuery, results };
  } catch (error) {
    return {
      query: cleanQuery,
      results: [],
      error: error?.name === 'AbortError' ? 'Search timed out' : 'Search unavailable',
    };
  } finally {
    timeout.clear();
  }
}
