import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = process.env.PORT || 8787;
const host = process.env.HOST || '127.0.0.1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const cache = new Map();
const TTL = {
  dump: 1000 * 60 * 20,
  detail: 1000 * 60 * 10,
  history: 1000 * 60 * 10,
};

const SOURCES = {
  dump: 'https://chisel.weirdgloop.org/gazproj/gazbot/rs_dump.json',
  wikiHistory: 'https://api.weirdgloop.org/exchange/history/rs',
  jagexDetail: 'https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json',
  jagexGraph: 'https://secure.runescape.com/m=itemdb_rs/api/graph',
};

function getCached(key) {
  const hit = cache.get(key);
  if (!hit || Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value, ttl) {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

async function fetchJson(url, cacheKey, ttl) {
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RS3 Grand Exchange Dashboard local app',
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  setCached(cacheKey, json, ttl);
  return json;
}

function normalizeDumpEntry(id, entry) {
  return {
    id: Number(id),
    name: entry.name || entry.item || `Item ${id}`,
    price: Number(entry.price ?? entry.current ?? 0) || null,
    lastPrice: Number(entry.last ?? entry.lastPrice ?? 0) || null,
    volume: Number(entry.volume ?? 0) || null,
    members: Boolean(entry.members),
    limit: Number(entry.limit ?? entry.buyLimit ?? 0) || null,
    icon: `https://secure.runescape.com/m=itemdb_rs/obj_sprite.gif?id=${id}`,
  };
}

async function getDumpItems() {
  const dump = await fetchJson(SOURCES.dump, 'dump', TTL.dump);
  return Object.entries(dump)
    .filter(([id, entry]) => /^\d+$/.test(id) && entry && typeof entry === 'object')
    .map(([id, entry]) => normalizeDumpEntry(id, entry));
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const clean = value.toLowerCase().replace(/[, ]/g, '');
  const multiplier = clean.endsWith('b') ? 1_000_000_000 : clean.endsWith('m') ? 1_000_000 : clean.endsWith('k') ? 1_000 : 1;
  const numeric = Number.parseFloat(clean.replace(/[bmk]/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : null;
}

function parseChange(value) {
  if (typeof value !== 'string') return null;
  const numeric = Number.parseFloat(value.replace('%', ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeJagexGraph(graph) {
  return Object.entries(graph.daily || {}).map(([timestamp, price]) => ({
    date: new Date(Number(timestamp)).toISOString().slice(0, 10),
    timestamp: Number(timestamp),
    price,
    average: graph.average?.[timestamp] ?? null,
    volume: null,
  }));
}

function normalizeWikiHistory(history) {
  return history
    .map((entry) => {
      if (Array.isArray(entry)) {
        const [timestamp, price, volume] = entry;
        const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
        return { timestamp: milliseconds, price, volume: volume ?? null };
      }

      const timestamp = Number(entry.timestamp);
      const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
      return {
        timestamp: milliseconds,
        price: Number(entry.price),
        volume: Number(entry.volume) || null,
      };
    })
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.price))
    .map((row) => ({
      date: new Date(row.timestamp).toISOString().slice(0, 10),
      timestamp: row.timestamp,
      price: row.price,
      average: null,
      volume: row.volume,
    }));
}

function describeTrend(trend) {
  if (!trend) return 'neutral';
  return trend === 'positive' ? 'up' : trend === 'negative' ? 'down' : 'neutral';
}

app.get('/api/items', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const items = await getDumpItems();
    const matches = items
      .filter((item) => !q || item.name.toLowerCase().includes(q) || String(item.id) === q)
      .sort((a, b) => {
        if (!q) return (b.volume || 0) - (a.volume || 0);
        const aExact = a.name.toLowerCase() === q ? -1 : 0;
        const bExact = b.name.toLowerCase() === q ? -1 : 0;
        return aExact - bExact || a.name.length - b.name.length;
      })
      .slice(0, limit);

    res.json({ items: matches });
  } catch (error) {
    res.status(502).json({ error: `Could not load RS3 item list: ${error.message}` });
  }
});

app.get('/api/movers', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const minVolume = Math.max(Number(req.query.minVolume) || 0, 0);
    const items = await getDumpItems();
    const movers = items
      .filter((item) => item.price && item.lastPrice && item.lastPrice > 0)
      .filter((item) => !minVolume || (item.volume || 0) >= minVolume)
      .map((item) => {
        const change = item.price - item.lastPrice;
        return {
          ...item,
          change,
          changePercent: (change / item.lastPrice) * 100,
        };
      })
      .filter((item) => item.change !== 0);

    res.json({
      gainers: [...movers]
        .sort((a, b) => b.changePercent - a.changePercent || b.change - a.change)
        .slice(0, limit),
      losers: [...movers]
        .sort((a, b) => a.changePercent - b.changePercent || a.change - b.change)
        .slice(0, limit),
    });
  } catch (error) {
    res.status(502).json({ error: `Could not load market movers: ${error.message}` });
  }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'A valid item id is required.' });
      return;
    }

    const [items, detail, graph, latest, history] = await Promise.all([
      getDumpItems(),
      fetchJson(`${SOURCES.jagexDetail}?item=${id}`, `detail:${id}`, TTL.detail).catch(() => null),
      fetchJson(`${SOURCES.jagexGraph}/${id}.json`, `jagex-graph:${id}`, TTL.history).catch(() => null),
      fetchJson(`${SOURCES.wikiHistory}/latest?id=${id}`, `latest:${id}`, TTL.history).catch(() => null),
      fetchJson(`${SOURCES.wikiHistory}/last90d?id=${id}`, `history:${id}`, TTL.history).catch(() => null),
    ]);

    const dumpItem = items.find((item) => item.id === id);
    const itemDetail = detail?.item;
    const wikiLatest = latest?.[id];
    const wikiHistory = history?.[id];
    const jagexHistory = graph ? normalizeJagexGraph(graph) : [];
    const historyRows = Array.isArray(wikiHistory) && wikiHistory.length
      ? normalizeWikiHistory(wikiHistory)
      : jagexHistory;

    const mergedRows = historyRows.map((row) => {
      if (row.volume !== null) return row;
      const jagexRow = jagexHistory.find((candidate) => candidate.date === row.date);
      return { ...row, average: row.average ?? jagexRow?.average ?? null };
    });

    const item = {
      id,
      name: itemDetail?.name || dumpItem?.name || `Item ${id}`,
      examine: itemDetail?.description || '',
      members: itemDetail?.members === 'true' || dumpItem?.members || false,
      icon: itemDetail?.icon_large || itemDetail?.icon || dumpItem?.icon || `https://secure.runescape.com/m=itemdb_rs/obj_big.gif?id=${id}`,
      price: parseNumber(itemDetail?.current?.price) ?? wikiLatest?.price ?? dumpItem?.price,
      volume: wikiLatest?.volume ?? dumpItem?.volume,
      limit: dumpItem?.limit,
      updatedAt: wikiLatest?.timestamp || null,
      trend: describeTrend(itemDetail?.current?.trend),
      today: {
        trend: describeTrend(itemDetail?.today?.trend),
        change: parseNumber(itemDetail?.today?.price),
      },
      changes: {
        day30: parseChange(itemDetail?.day30?.change),
        day90: parseChange(itemDetail?.day90?.change),
        day180: parseChange(itemDetail?.day180?.change),
      },
    };

    res.json({ item, history: mergedRows });
  } catch (error) {
    res.status(502).json({ error: `Could not load item data: ${error.message}` });
  }
});

app.use(express.static(path.join(rootDir, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.listen(port, host, () => {
  console.log(`RS3 Grand Exchange API listening on http://${host}:${port}`);
});
