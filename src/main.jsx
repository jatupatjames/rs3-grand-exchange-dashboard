import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Coins,
  LineChart as LineChartIcon,
  Loader2,
  Search,
  TrendingUp,
} from 'lucide-react';
import './styles.css';

const DEFAULT_ITEMS = [
  { id: 49430, name: 'Chronotes' },
  { id: 21787, name: 'Steadfast boots' },
  { id: 22437, name: 'Ascension crossbow' },
  { id: 529, name: 'Blood rune' },
];

const ranges = [
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '180D', days: 180 },
];

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Unknown';
  return Intl.NumberFormat('en', { notation: Math.abs(value) >= 100_000 ? 'compact' : 'standard' }).format(value);
}

function formatGp(value) {
  const formatted = formatNumber(value);
  return formatted === 'Unknown' ? formatted : `${formatted} gp`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date));
}

function pct(value) {
  if (value === null || value === undefined) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={accent || ''}>{value}</strong>
    </div>
  );
}

function App() {
  const itemAnchorRef = useRef(null);
  const shouldAnchorSelectionRef = useRef(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(DEFAULT_ITEMS);
  const [selectedId, setSelectedId] = useState(DEFAULT_ITEMS[0].id);
  const [itemData, setItemData] = useState(null);
  const [range, setRange] = useState(90);
  const [chartMode, setChartMode] = useState('price');
  const [movers, setMovers] = useState({ gainers: [], losers: [] });
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingItem, setLoadingItem] = useState(false);
  const [loadingMovers, setLoadingMovers] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingItems(true);
      try {
        const response = await fetch(`/api/items?q=${encodeURIComponent(query)}&limit=32`, {
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Item search failed');
        setResults(json.items.length ? json.items : DEFAULT_ITEMS);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        setLoadingItems(false);
      }
    }, query ? 220 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    let alive = true;
    async function loadItem() {
      setLoadingItem(true);
      setError('');
      try {
        const response = await fetch(`/api/items/${selectedId}`);
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Item data failed');
        if (alive) setItemData(json);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoadingItem(false);
      }
    }

    loadItem();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!shouldAnchorSelectionRef.current) return;
    shouldAnchorSelectionRef.current = false;

    const scrollToSelectedItem = () => {
      itemAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.history.replaceState(null, '', '#item-detail');
    window.requestAnimationFrame(scrollToSelectedItem);
    const fallback = window.setTimeout(scrollToSelectedItem, 120);

    return () => window.clearTimeout(fallback);
  }, [selectedId]);

  useEffect(() => {
    let alive = true;
    async function loadMovers() {
      setLoadingMovers(true);
      try {
        const response = await fetch('/api/movers?limit=5');
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Market movers failed');
        if (alive) setMovers(json);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoadingMovers(false);
      }
    }

    loadMovers();
    return () => {
      alive = false;
    };
  }, []);

  const chartData = useMemo(() => {
    const rows = itemData?.history || [];
    return rows.slice(Math.max(rows.length - range, 0)).map((row) => ({
      ...row,
      displayDate: formatDate(row.date),
    }));
  }, [itemData, range]);

  const insight = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    const change = ((last - first) / first) * 100;
    const high = chartData.reduce((best, row) => (row.price > best.price ? row : best), chartData[0]);
    const low = chartData.reduce((best, row) => (row.price < best.price ? row : best), chartData[0]);
    const volumeRows = chartData.filter((row) => row.volume);
    const avgVolume = volumeRows.length
      ? Math.round(volumeRows.reduce((sum, row) => sum + row.volume, 0) / volumeRows.length)
      : null;
    return { change, high, low, avgVolume };
  }, [chartData]);

  const item = itemData?.item;
  const hasVolume = chartData.some((row) => row.volume);
  const scrollToItemAnchor = () => {
    window.history.replaceState(null, '', '#item-detail');
    window.requestAnimationFrame(() => {
      itemAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const selectItem = (id) => {
    if (id === selectedId) {
      scrollToItemAnchor();
      return;
    }
    shouldAnchorSelectionRef.current = true;
    setSelectedId(id);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Coins size={24} />
          <div>
            <h1>RS3 Exchange</h1>
            <p>Price and volume dashboard</p>
          </div>
        </div>

        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items or IDs"
          />
          {loadingItems && <Loader2 className="spin" size={16} />}
        </label>

        <div className="item-list">
          {results.map((result) => (
            <button
              key={result.id}
              className={selectedId === result.id ? 'item-row active' : 'item-row'}
              onClick={() => selectItem(result.id)}
            >
              <img src={result.icon || `https://secure.runescape.com/m=itemdb_rs/obj_sprite.gif?id=${result.id}`} alt="" />
              <span>{result.name}</span>
              <small>{formatGp(result.price)}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="content">
        {error && <div className="error">{error}</div>}

        <header id="item-detail" ref={itemAnchorRef} className="topbar">
          <div className="item-title">
            {item?.icon && <img src={item.icon} alt="" />}
            <div>
              <span>Grand Exchange item #{selectedId}</span>
              <h2>{item?.name || 'Loading item'}</h2>
              <p>{item?.examine || 'Live RuneScape 3 market data'}</p>
            </div>
          </div>

          <div className="toolbar" aria-label="Chart controls">
            <div className="segmented">
              {ranges.map((option) => (
                <button
                  key={option.days}
                  className={range === option.days ? 'selected' : ''}
                  onClick={() => setRange(option.days)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="icon-tabs">
              <button
                title="Price chart"
                className={chartMode === 'price' ? 'selected' : ''}
                onClick={() => setChartMode('price')}
              >
                <LineChartIcon size={18} />
              </button>
              <button
                title="Volume chart"
                className={chartMode === 'volume' ? 'selected' : ''}
                onClick={() => setChartMode('volume')}
                disabled={!hasVolume}
              >
                <BarChart3 size={18} />
              </button>
            </div>
          </div>
        </header>

        <div className="stats-grid">
          <Stat label="Current guide price" value={formatGp(item?.price)} accent="gold" />
          <Stat label="Latest volume" value={formatNumber(item?.volume)} />
          <Stat label={`${range} day change`} value={insight ? pct(insight.change) : 'n/a'} accent={insight?.change >= 0 ? 'up' : 'down'} />
          <Stat label="Buy limit" value={formatNumber(item?.limit)} />
        </div>

        <div className="dashboard-grid">
          <div className="main-column">
            <section className="chart-panel">
              <div className="panel-head">
                <div>
                  <span>{chartMode === 'volume' ? 'Daily traded volume' : 'Guide price movement'}</span>
                  <h3>{chartMode === 'volume' ? 'Volume' : 'Price history'}</h3>
                </div>
                {loadingItem && <Loader2 className="spin" size={20} />}
              </div>

              <div className="chart-wrap">
                {chartMode === 'volume' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid vertical={false} stroke="#26313a" />
                      <XAxis dataKey="displayDate" stroke="#8c9aa6" minTickGap={32} />
                      <YAxis stroke="#8c9aa6" tickFormatter={formatNumber} width={72} />
                      <Tooltip content={<ChartTooltip mode="volume" />} />
                      <Bar dataKey="volume" fill="#34b3a0" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#d7a84a" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#d7a84a" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#26313a" />
                      <XAxis dataKey="displayDate" stroke="#8c9aa6" minTickGap={32} />
                      <YAxis stroke="#8c9aa6" tickFormatter={formatNumber} width={72} domain={['dataMin', 'dataMax']} />
                      <Tooltip content={<ChartTooltip mode="price" />} />
                      <Area type="monotone" dataKey="price" stroke="#d7a84a" fill="url(#priceFill)" strokeWidth={3} />
                      <Line type="monotone" dataKey="average" stroke="#70a5d8" strokeWidth={2} dot={false} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="insights">
              <div>
                <TrendingUp size={20} />
                <span>High</span>
                <strong>{insight ? formatGp(insight.high.price) : 'n/a'}</strong>
                <small>{insight ? insight.high.displayDate : ''}</small>
              </div>
              <div>
                <ArrowDownRight size={20} />
                <span>Low</span>
                <strong>{insight ? formatGp(insight.low.price) : 'n/a'}</strong>
                <small>{insight ? insight.low.displayDate : ''}</small>
              </div>
              <div>
                <ArrowUpRight size={20} />
                <span>Wiki average volume</span>
                <strong>{formatNumber(insight?.avgVolume)}</strong>
                <small>{hasVolume ? 'Recent sampled days' : 'No volume in history'}</small>
              </div>
            </section>
          </div>

          <aside className="right-panel">
            <section className="movers-panel">
              <div className="panel-head">
                <div>
                  <span>Current vs previous guide price</span>
                  <h3>Market movers</h3>
                </div>
                {loadingMovers && <Loader2 className="spin" size={20} />}
              </div>
              <div className="movers-grid">
                <MoverList
                  title="Top 5 increases"
                  items={movers.gainers}
                  type="up"
                  onSelect={selectItem}
                />
                <MoverList
                  title="Top 5 decreases"
                  items={movers.losers}
                  type="down"
                  onSelect={selectItem}
                />
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function MoverList({ title, items, type, onSelect }) {
  return (
    <div className="mover-list">
      <h4>{title}</h4>
      {items.length ? (
        items.map((item, index) => (
          <button key={item.id} className="mover-row" onClick={() => onSelect(item.id)}>
            <span className="rank">{index + 1}</span>
            <img src={item.icon} alt="" />
            <span className="mover-name">{item.name}</span>
            <strong className={type}>{pct(item.changePercent)}</strong>
            <small>{item.change > 0 ? '+' : ''}{formatGp(item.change)}</small>
          </button>
        ))
      ) : (
        <div className="empty-movers">Loading movers</div>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="tooltip">
      <strong>{label}</strong>
      {mode === 'volume' ? (
        <span>Volume: {formatNumber(row.volume)}</span>
      ) : (
        <>
          <span>Price: {formatGp(row.price)}</span>
          {row.average ? <span>Average: {formatGp(row.average)}</span> : null}
          {row.volume ? <span>Volume: {formatNumber(row.volume)}</span> : null}
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
