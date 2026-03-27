import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Fuel, MapPin, Clock, Moon, Sun, Map as MapIcon, List as ListIcon, RefreshCcw, ChevronDown, Check, X, AlertTriangle, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Fix for default marker icons in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = DefaultIcon;

const UserIcon = L.divIcon({
  className: 'custom-user-icon',
  html: `<div class="relative flex items-center justify-center w-6 h-6">
           <div class="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-60"></div>
           <div class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-lg"></div>
         </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  const [hasSetCenter, setHasSetCenter] = useState(false);

  useEffect(() => {
    if (!hasSetCenter && center[0] !== 18.7883) {
      map.setView(center, map.getZoom());
      setHasSetCenter(true);
    }
  }, [center, map, hasSetCenter]);
  return null;
}

interface Station {
  id: number;
  osm_id: string;
  station_name: string;
  brand: string;
  lat: number;
  lng: number;
  updated_at?: string;
}

interface Report {
  id: string;
  osm_id: string;
  station_name: string;
  brand: string;
  lat: number;
  lng: number;
  diesel_premium?: string;
  diesel?: string;
  diesel_b10?: string;
  diesel_b20?: string;
  benzine?: string;
  g95?: string;
  g95_premium?: string;
  g91?: string;
  e20?: string;
  e85?: string;
  queue?: string;
  ts_unix: number;
  ts_th: string;
}

const statusTranslations: Record<string, string> = {
  'มี': 'ရှိသည်',
  'หมด': 'ကုန်ပြီ',
  'รอส่ง': 'စောင့်ဆိုင်း',
  'จองคิว': 'ကြိုတင်တန်းစီ',
  '': 'မသိရ',
};

const statusColors: Record<string, string> = {
  'มี': 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  'หมด': 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50',
  'รอส่ง': 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
  'จองคิว': 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
  '': 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800/30 dark:text-slate-500 dark:border-slate-700/50',
};

const fuelTypes = {
  diesel_premium: 'ဒီဇယ် (ပရီမီယံ)',
  diesel: 'ဒီဇယ် (ရိုးရိုး)',
  diesel_b10: 'ဒီဇယ် B10',
  diesel_b20: 'ဒီဇယ် B20',
  benzine: 'အောက်တိန်း ၉၅ (ဘန်ဇင်း)',
  g95: 'အောက်တိန်း ၉၅',
  g95_premium: 'အောက်တိန်း ၉၅ (ပရီမီယံ)',
  g91: 'အောက်တိန်း ၉၁',
  e20: 'E20',
  e85: 'E85',
};

const brandNames: Record<string, string> = {
  'ptt': 'PTT Stationary',
  'bangchak': 'Bangchak',
  'shell': 'Shell',
  'caltex': 'Caltex',
  'esso': 'Esso',
  'susco': 'Susco',
  'pt': 'PT Station',
  'pure': 'Pure',
  'cosmo': 'Cosmo Pump',
  'rotary': 'Rotary Station',
};

const brandLogos: Record<string, string> = {
  'ptt': 'https://cm-pump.com/ptt.png',
  'bangchak': 'https://cm-pump.com/bangchak.png',
  'shell': 'https://cm-pump.com/shell.png',
  'caltex': 'https://cm-pump.com/caltex.png',
  'esso': 'https://cm-pump.com/esso.png',
  'susco': 'https://cm-pump.com/susco.png',
  'pt': 'https://cm-pump.com/pt.png',
  'pure': 'https://cm-pump.com/pure.png',
  'cosmo': 'https://cm-pump.com/cosmo.png',
};

const getStationStatus = (report?: Report): 'available' | 'empty' | 'low' | 'unknown' | 'no_data' => {
  if (!report) return 'no_data';

  const fuels = [
    report.diesel_premium, report.diesel, report.diesel_b10, report.diesel_b20,
    report.benzine, report.g95, report.g95_premium, report.g91, report.e20, report.e85
  ].filter(f => f !== undefined && f !== null && f !== '');

  if (fuels.length === 0) return 'unknown';

  const allEmpty = fuels.every(f => f === 'หมด');
  if (allEmpty) return 'empty';

  const allAvailable = fuels.every(f => f === 'มี');
  if (allAvailable) return 'available';

  return 'low';
};

const getBrandIcon = (brand: string, status: 'available' | 'empty' | 'low' | 'unknown' | 'no_data', showUpdated = false) => {
  const logoUrl = brandLogos[brand?.toLowerCase()];
  
  let indicatorColor = '#9ca3af';
  let opacity = 1;
  let grayscale = 'none';
  
  if (status === 'available') indicatorColor = '#22c55e';
  else if (status === 'empty') indicatorColor = '#ef4444';
  else if (status === 'low') indicatorColor = '#f59e0b';
  else if (status === 'no_data') {
    indicatorColor = '#d1d5db';
    opacity = 0.6;
    grayscale = 'grayscale(100%)';
  }

  const innerContent = logoUrl 
    ? `<img src="${logoUrl}" alt="${brand}" class="w-full h-full object-contain p-1" />`
    : `<div class="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22L15 22"/><path d="M4 9L14 9"/><path d="M14 22L14 11"/><path d="M15 6C15 6 17 6 18 5C19 4 21 4 21 4"/><path d="M18 11V22"/><path d="M15 15L18 12"/><path d="M4 18V5C4 3.9 4.9 3 6 3H12C13.1 3 14 3.9 14 5V18"/><circle cx="9" cy="13" r="2"/></svg></div>`;

  const html = `
    <div style="position:relative;width:96px;height:32px;opacity:${opacity};filter:${grayscale};">
      ${showUpdated ? '<div style="position:absolute;left:0;top:50%;transform:translateY(-50%);padding:2px 6px;border-radius:999px;background:#10b981;color:#fff;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);z-index:2;pointer-events:none;">updated</div>' : ''}
      <div style="position:absolute;right:0;top:0;width:32px;height:32px;">
        <div style="width:32px;height:32px;background:#fff;border-radius:999px;box-shadow:0 4px 8px rgba(0,0,0,0.15);border:2px solid #fff;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          ${innerContent}
        </div>
        <div style="position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:999px;border:2px solid #fff;background:${indicatorColor};box-shadow:0 1px 2px rgba(0,0,0,0.25);"></div>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: '',
    iconSize: [96, 32],
    iconAnchor: [80, 16],
  });
};

interface PriceHistoryRow {
  date: string;
  prices: any;
}

function FuelPricesView({ history }: { history: PriceHistoryRow[] }) {
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const previous = sorted[1];

  const getPriceTrend = (brand: string, fuelKey: string, currentPrice: number) => {
    if (!previous || !previous.prices[brand] || !previous.prices[brand][fuelKey]) return null;
    const prevPrice = previous.prices[brand][fuelKey];
    if (currentPrice > prevPrice) return <span className="text-rose-500 ml-1 text-[10px] animate-bounce">▲</span>;
    if (currentPrice < prevPrice) return <span className="text-emerald-500 ml-1 text-[10px] animate-bounce">▼</span>;
    return null;
  };

  if (!latest) return <div className="p-10 text-center text-gray-400">ဒေတာ မရှိသေးပါ။</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto pb-24">
      <div className="p-4 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">တရားဝင် ဆီစျေးနှုန်းများ</h2>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Source: EPPO (Thailand) • {latest.date}</p>
      </div>

      <div className="p-4 space-y-4">
        {['ptt', 'bangchak'].map(brand => (
          <div key={brand} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
              {brandLogos[brand] && (
                <img src={brandLogos[brand]} className="w-5 h-5 rounded-full bg-white p-0.5" alt={brand} />
              )}
              <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300">
                {brand === 'ptt' ? 'PTT Stationary' : 'Bangchak'}
              </span>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-slate-700">
              {Object.entries(fuelTypes).map(([key, label]) => {
                const price = latest.prices[brand]?.[key];
                if (!price) return null;
                return (
                  <div key={key} className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <span className="text-[13px] font-medium text-gray-700 dark:text-slate-200">{label}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[14px] font-black text-blue-600 dark:text-blue-400">{price.toFixed(2)}</span>
                      <span className="text-[10px] text-gray-400 font-medium">THB</span>
                      {getPriceTrend(brand, key, price)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FuelMap() {
  const [reports, setReports] = useState<Report[]>([]);
  const [allStations, setAllStations] = useState<Station[]>([]);
  const [fuelHistory, setFuelHistory] = useState<PriceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceTitle, setMaintenanceTitle] = useState('Maintenance');
  const [maintenanceDescription, setMaintenanceDescription] = useState('We are performing maintenance. Please check back soon.');
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'prices'>('map');
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([latitude, longitude]);

          // Log user location for ops dashboard to see (server captures IP)
          fetch('/api/user-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: latitude,
              lng: longitude,
              user_agent: navigator.userAgent,
            }),
          }).catch((error) => {
            console.error('Error logging location:', error);
          });
        },
        (error) => {
          console.error("Error getting location:", error);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
  }, []);

  const parseMaintenanceFlag = (value: unknown) => {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined) return false;
    const normalized = String(value).trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on', 'enabled'].includes(normalized);
  };

  const fetchMaintenance = async () => {
    try {
      const { data, error } = await supabase
        .from('config')
        .select('id, value')
        .in('id', ['maintenance_mode', 'maintenance_title', 'maintenance_description']);

      if (error) throw error;

      const getValue = (id: string) => data?.find((row) => row.id === id)?.value;
      const enabled = parseMaintenanceFlag(getValue('maintenance_mode'));
      const title = String(getValue('maintenance_title') ?? '').trim() || 'Maintenance';
      const description =
        String(getValue('maintenance_description') ?? '').trim() ||
        'We are performing maintenance. Please check back soon.';

      setMaintenanceEnabled(enabled);
      setMaintenanceTitle(title);
      setMaintenanceDescription(description);
    } catch (err) {
      console.error('Maintenance config fetch error:', err);
    }
  };

  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    fetchMaintenance();
    const interval = setInterval(fetchMaintenance, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.body.style.overflow = maintenanceEnabled ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [maintenanceEnabled]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const brands = useMemo(() => {
    const source = allStations.length > 0 ? allStations : reports;
    const uniqueBrands = new Set(
      source
        .map(r => r.brand)
        .filter(Boolean)
        .filter(b => b.toLowerCase() !== 'other')
    );
    return Array.from(uniqueBrands).sort();
  }, [allStations, reports]);

  const mappedStations = useMemo(() => {
    // Merge allStations with reports by osm_id
    return allStations.map(station => {
      const report = reports.find(r => r.osm_id === station.osm_id);
      return {
        ...station,
        report,
        // Fallback for ID if needed
        id: station.id.toString(),
      };
    });
  }, [allStations, reports]);

  const filteredStations = useMemo(() => {
    if (!selectedBrand) return mappedStations;
    return mappedStations.filter(s => s.brand === selectedBrand);
  }, [mappedStations, selectedBrand]);

  const isStationUpdatedInLastCrawl = (station: Station, crawlFinishedAt: Date | null) => {
    if (!crawlFinishedAt) return false;
    const crawlTime = crawlFinishedAt.getTime();
    const windowMs = 15 * 60 * 1000;

    const reportUnix = station.report?.ts_unix;
    if (typeof reportUnix === 'number') {
      const reportMs = reportUnix > 1_000_000_000_000 ? reportUnix : reportUnix * 1000;
      if (!Number.isNaN(reportMs) && Math.abs(reportMs - crawlTime) <= windowMs) {
        return true;
      }
    }

    if (!station.updated_at) return false;
    const stationTime = new Date(station.updated_at).getTime();
    if (Number.isNaN(stationTime)) return false;
    return Math.abs(stationTime - crawlTime) <= windowMs;
  };

  const fetchData = async (forceRefresh = false) => {
    try {
      setIsOffline(false);

      // --- PHASE 1: Fast Fetch from Cache ---
      const [cacheResult, stationsResult] = await Promise.all([
        supabase.from('api_cache').select('data, updated_at').eq('id', 'fuel_data').single(),
        supabase.from('stations').select('*')
      ]);

      if (cacheResult.error && cacheResult.error.code !== 'PGRST116') throw cacheResult.error;
      if (stationsResult.error) throw stationsResult.error;

      const cacheData = cacheResult.data;
      const cacheUpdatedAt = cacheData?.updated_at ? new Date(cacheData.updated_at).getTime() : 0;
      const cacheAgeMs = cacheUpdatedAt ? Date.now() - cacheUpdatedAt : Number.POSITIVE_INFINITY;
      const cacheStale = forceRefresh || cacheAgeMs > 5 * 60 * 1000;

      if (stationsResult.data) {
        setAllStations(stationsResult.data);
      }

      if (!cacheStale && cacheData) {
        setReports(cacheData.data.reports || []);
        if (cacheData.updated_at) setLastUpdated(new Date(cacheData.updated_at));
      }

      // --- PHASE 2: JIT Sync on Visit (only when stale or missing) ---
      if (cacheStale) {
        let synced = false;
        try {
          const res = await fetch('/api/cron');
          const json = await res.json();
          synced = !!(json.success && !json.skipped);
        } catch (err) {
          console.error('JIT sync failed:', err);
        }

        if (synced) {
          const { data: freshCache } = await supabase
            .from('api_cache')
            .select('data, updated_at')
            .eq('id', 'fuel_data')
            .single();

          if (freshCache) {
            setReports(freshCache.data.reports || []);
            setLastUpdated(new Date(freshCache.updated_at));
            synced = true;
          }
        }

        // Fallback to stale cache if sync fails
        if (!synced && cacheData) {
          setReports(cacheData.data.reports || []);
          if (cacheData.updated_at) setLastUpdated(new Date(cacheData.updated_at));
        }
      }

      const { data: historyData, error: historyError } = await supabase
        .from('fuel_prices_history')
        .select('date, prices')
        .order('date', { ascending: false })
        .limit(2);

      if (!historyError && historyData) {
        setFuelHistory(historyData);
      }

    } catch (err) {
      console.error('Data fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const center: [number, number] = userLocation
    ? userLocation
    : (reports.length > 0 ? [reports[0].lat, reports[0].lng] : [18.7883, 98.9853]);

  if (loading && !lastUpdated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-slate-900 gap-4">
        <RefreshCcw className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-gray-500 animate-pulse font-bold">ဆီဆိုင်များ ရှာဖွေနေပါသည်...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      {maintenanceEnabled && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="w-[90%] max-w-md rounded-3xl border border-slate-200/30 bg-white/95 p-6 text-center shadow-2xl dark:border-slate-700/60 dark:bg-slate-900/95"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{maintenanceTitle}</h2>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">{maintenanceDescription}</p>
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
              Maintenance Mode
            </div>
          </div>
        </div>
      )}
      <header className="bg-white dark:bg-slate-800 shadow-sm z-20 p-4 flex items-center justify-between border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-blue-200 shadow-lg">
            <Fuel className="text-white w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-[15px] leading-tight font-bold text-gray-900 dark:text-slate-100 tracking-tight">ဆီဆိုင်မြေပုံ</h1>
            {lastUpdated && (
              <span className="text-[9.5px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                Updated: {lastUpdated.toLocaleTimeString('my-MM', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isOffline ? 'bg-gray-400' : 'bg-green-500'}`}></div>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isOffline ? 'text-gray-400' : 'text-green-600 dark:text-green-400'}`}>
              {isOffline ? 'OFFLINE' : 'LIVE'}
            </span>
          </div>

          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-xl bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors shadow-inner"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />}
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {error && (
          <div className="absolute top-4 left-4 right-4 z-[999] bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/50 p-3 rounded-2xl flex items-center gap-3 shadow-lg backdrop-blur-md">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400 leading-tight flex-1">
              {error}. Linking to local cache.
            </p>
            <button onClick={() => fetchData(true)} className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-800/30 rounded-lg transition-colors">
              <RefreshCcw className="w-3.5 h-3.5 text-rose-500" />
            </button>
          </div>
        )}

        <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'map' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
          <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 text-xs font-bold text-gray-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95 no-scrollbar"
              >
                {selectedBrand && (
                  brandLogos[selectedBrand.toLowerCase()] ? (
                    <img src={brandLogos[selectedBrand.toLowerCase()]} className="w-4 h-4 rounded-full bg-white p-0.5" alt={selectedBrand} />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-blue-50 flex items-center justify-center p-0.5 border border-blue-100">
                      <Fuel className="w-3 h-3 text-blue-600" />
                    </div>
                  )
                )}
                <span>{selectedBrand ? (brandNames[selectedBrand.toLowerCase()] || selectedBrand) : 'ဆိုင်အားလုံး'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`} />
              </button>

              {isFilterOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[-1]"
                    onClick={() => setIsFilterOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-2 w-56 max-h-[60vh] overflow-y-auto bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 py-2 no-scrollbar animate-in fade-in zoom-in duration-200">
                    <button
                      onClick={() => { setSelectedBrand(null); setIsFilterOpen(false); }}
                      className={`w-full px-4 py-3 text-left text-xs font-bold flex items-center justify-between transition-colors ${selectedBrand === null ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                        }`}
                    >
                      <span>ဆိုင်အားလုံး</span>
                      {selectedBrand === null && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                    </button>
                    {brands.map((brand) => (
                      <button
                        key={brand}
                        onClick={() => { setSelectedBrand(brand); setIsFilterOpen(false); }}
                        className={`w-full px-4 py-3 text-left text-xs font-bold flex items-center justify-between transition-colors ${selectedBrand === brand ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          {brandLogos[brand.toLowerCase()] ? (
                            <img src={brandLogos[brand.toLowerCase()]} className="w-5 h-5 rounded-full bg-white p-0.5 border border-gray-100" alt={brand} />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-50 flex items-center justify-center p-1 border border-slate-100">
                              <Fuel className="w-3 h-3 text-slate-400" />
                            </div>
                          )}
                          <span className="uppercase tracking-tight">{brandNames[brand.toLowerCase()] || brand}</span>
                        </div>
                        {selectedBrand === brand && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <MapContainer
            center={center}
            zoom={14}
            className="h-full w-full"
            zoomControl={false}
          >
            <MapUpdater center={center} />
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url={isDark
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
            />

            {userLocation && (
              <Marker position={userLocation} icon={UserIcon} zIndexOffset={1000}>
                <Popup className="custom-popup">
                  <div className="p-2 text-center min-w-[120px]">
                    <h3 className="font-bold text-[14px] text-slate-800 dark:text-slate-100">သင်၏တည်နေရာ</h3>
                    <p className="text-[10px] text-slate-500 mt-1">Your Location</p>
                  </div>
                </Popup>
              </Marker>
            )}
            {filteredStations.map((station) => (
              <Marker
                key={station.id}
                position={[station.lat, station.lng]}
                icon={getBrandIcon(
                  station.brand,
                  getStationStatus(station.report),
                  isStationUpdatedInLastCrawl(station, lastUpdated)
                )}
              >
                <Popup className="custom-popup">
                  <div className="p-2 min-w-[240px] font-sans">
                    <h3 className="font-bold text-[17px] text-[#2c3e50] dark:text-slate-100 mb-4 tracking-wide leading-tight">
                      {brandNames[station.brand?.toLowerCase()] || station.brand || station.station_name || 'အမည်မသိ ဆိုင်'}
                    </h3>

                    <div className="text-[11px] text-[#94a3b8] font-bold mb-3">
                      ဆီအခြေအနေ
                    </div>

                    {!station.report ? (
                      <div className="flex flex-col items-center gap-2 mb-5 py-4 rounded-xl bg-gray-50 dark:bg-slate-700/40 border border-dashed border-gray-200 dark:border-slate-600">
                        <Clock className="w-5 h-5 text-gray-300 dark:text-slate-500" />
                        <span className="text-[12px] font-bold text-gray-400 dark:text-slate-500">ဒေတာမရှိပါ</span>
                        <span className="text-[10px] text-gray-300 dark:text-slate-600 font-medium italic">No recent data available</span>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3 mb-5">
                          {(() => {
                            const fuelRows = Object.entries(fuelTypes).filter(([key]) => {
                              const v = station.report![key as keyof Report] as string | undefined;
                              return v !== undefined && v !== null && v !== '';
                            });

                            if (fuelRows.length === 0) {
                              return (
                                <div className="flex flex-col items-center gap-2 py-4">
                                  <AlertTriangle className="w-5 h-5 text-gray-300" />
                                  <span className="text-[12px] text-gray-400 font-bold">ဒေတာမရှိပါ</span>
                                </div>
                              );
                            }

                            return fuelRows.map(([key, label]) => {
                              const statusRaw = station.report![key as keyof Report] as string;
                              const statusMM = statusTranslations[statusRaw] || statusRaw;

                              let Icon = AlertTriangle;
                              let textClass = "text-[#94a3b8]";

                              if (statusRaw === 'มี') { Icon = Check; textClass = "text-[#10b981]"; }
                              else if (statusRaw === 'หมด') { Icon = X; textClass = "text-[#ef4444]"; }
                              else if (statusRaw === 'รอส่ง') { Icon = Clock; textClass = "text-[#f59e0b]"; }
                              else if (statusRaw === 'จองคิว') { Icon = Clock; textClass = "text-[#f59e0b]"; }

                              return (
                                <div key={key} className="flex justify-between items-center px-1">
                                  <span className="text-[13px] font-bold text-gray-700 dark:text-gray-200">{label}</span>
                                  <div className={`flex items-center gap-1.5 font-bold text-[12px] ${textClass}`}>
                                    <Icon className={`w-3.5 h-3.5 ${statusRaw === '' ? 'stroke-0 fill-current' : 'stroke-[3]'}`} />
                                    <span>{statusMM}</span>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>

                        {station.report.queue && station.report.queue !== '' && (
                          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
                            <Users className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            <span className="text-[12px] font-bold text-amber-700 dark:text-amber-400">တန်းစီ</span>
                            <span className="ml-auto text-[13px] font-extrabold text-amber-700 dark:text-amber-300">{station.report.queue} ယာဉ်</span>
                          </div>
                        )}

                        <div className="text-[10px] text-[#94a3b8] font-bold mb-4 px-1">
                          Updated {station.report.ts_th}
                        </div>
                      </>
                    )}

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold py-3 rounded-xl text-[13px] transition-all border border-blue-100 dark:border-blue-800/30 active:scale-95"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Google Maps တွင်ကြည့်ရန်
                    </a>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'prices' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
          <FuelPricesView history={fuelHistory} />
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-[56px] bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-t border-gray-100 dark:border-slate-700 z-30 pb-safe">
        <div className="flex items-center justify-around h-full max-w-md mx-auto px-6">
          <button
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center justify-center transition-all ${activeTab === 'map' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}
          >
            <MapIcon className="w-5 h-5 mb-0.5" />
            <span className="text-[11px] font-bold">မြေပုံ</span>
          </button>

          <button
            onClick={() => setActiveTab('prices')}
            className={`flex flex-col items-center justify-center transition-all ${activeTab === 'prices' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}
          >
            <ListIcon className="w-5 h-5 mb-0.5" />
            <span className="text-[11px] font-bold">ဆီစျေး</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
