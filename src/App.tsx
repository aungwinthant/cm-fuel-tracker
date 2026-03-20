import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Fuel, MapPin, Clock, Moon, Sun, Map as MapIcon, List as ListIcon, RefreshCcw } from 'lucide-react';
import { supabase } from './lib/supabase';

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
  g91?: string;
  e20?: string;
  e85?: string;
  ts_unix: number;
  ts_th: string;
}

const statusTranslations: Record<string, string> = {
  'มี': 'ရှိသည်',
  'หมด': 'ကုန်ပြီ',
  'รอส่ง': 'ပို့ဆောင်ရန်စောင့်ဆိုင်းနေသည်',
  '': 'မသိရ',
};

const statusColors: Record<string, string> = {
  'มี': 'text-green-700 bg-green-100 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  'หมด': 'text-red-700 bg-red-100 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  'รอส่ง': 'text-yellow-700 bg-yellow-100 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
  '': 'text-gray-600 bg-gray-100 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

const fuelTypes: Record<string, string> = {
  'diesel_premium': 'ပရီမီယံ ဒီဇယ်',
  'diesel': 'ဒီဇယ်',
  'diesel_b10': 'ဒီဇယ် B10',
  'diesel_b20': 'ဒီဇယ် B20',
  'benzine': 'ဓာတ်ဆီ',
  'g95': 'ဂက်စ်ဆိုဟော ၉၅',
  'g91': 'ဂက်စ်ဆိုဟော ၉၁',
  'e20': 'E20',
  'e85': 'E85',
};

const brandLogos: Record<string, string> = {
  'bangchak': 'https://cm-pump.com/bangchak.png',
  'caltex': 'https://cm-pump.com/caltex.png',
  'ptt': 'https://cm-pump.com/ptt.png',
  'pttt': 'https://cm-pump.com/ptt.png',
  'pt': 'https://cm-pump.com/pt.png',
  'shell': 'https://cm-pump.com/shell.png',
};

const getStationStatus = (report: Report): 'available' | 'empty' | 'low' | 'unknown' => {
  const fuels = [
    report.diesel_premium, report.diesel, report.diesel_b10, report.diesel_b20,
    report.benzine, report.g95, report.g91, report.e20, report.e85
  ].filter(f => f !== undefined && f !== null && f !== '');
  
  if (fuels.length === 0) return 'unknown';

  const allEmpty = fuels.every(f => f === 'หมด');
  if (allEmpty) return 'empty';

  const allAvailable = fuels.every(f => f === 'มี');
  if (allAvailable) return 'available';

  return 'low';
};

const getBrandIcon = (brand: string, status: 'available' | 'empty' | 'low' | 'unknown') => {
  const logoUrl = brandLogos[brand?.toLowerCase()];
  if (!logoUrl) return DefaultIcon;

  let indicatorColor = 'bg-gray-400';
  if (status === 'available') indicatorColor = 'bg-green-500';
  else if (status === 'empty') indicatorColor = 'bg-red-500';
  else if (status === 'low') indicatorColor = 'bg-yellow-500';

  const html = `
    <div class="relative w-8 h-8">
      <div class="w-full h-full bg-white rounded-full shadow-md border-2 border-white flex items-center justify-center overflow-hidden">
        <img src="${logoUrl}" alt="${brand}" class="w-full h-full object-contain p-1" />
      </div>
      <div class="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${indicatorColor} shadow-sm"></div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-brand-icon',
    html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

interface PriceData {
  prices: Record<string, Record<string, number>>;
  effective_date: string;
  source: string;
  date_short: string;
  generated: string;
}

const priceLabels: Record<string, string> = {
  diesel_premium: 'ဒီဇယ် ပရီမီယံ',
  diesel: 'ဒီဇယ်',
  diesel_b10: 'ဒီဇယ် B10',
  diesel_b20: 'ဒီဇယ် B20',
  benzine: 'ဓာတ်ဆီ',
  g95: 'ဂက်စ်ဆိုဟော ၉၅',
  g95_premium: 'ဂက်စ်ဆိုဟော ၉၅ ပရီမီယံ',
  g91: 'ဂက်စ်ဆိုဟော ၉၁',
  e20: 'E20',
  e85: 'E85',
};

const brandNames: Record<string, string> = {
  ptt: 'PTT OR',
  bangchak: 'Bangchak',
  shell: 'Shell',
  caltex: 'Caltex',
  pt: 'PT',
};

function FuelPricesView({ priceData }: { priceData: PriceData | null }) {
  if (!priceData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-slate-400 p-8 text-center">
        <Clock className="w-12 h-12 mb-4 opacity-20" />
        <p>စျေးနှုန်းဒေတာ မရရှိနိုင်သေးပါ</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-slate-900">
      <div className="p-4 overflow-y-auto space-y-4 pb-24">
        <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200 dark:shadow-none mb-2">
          <div className="text-xs opacity-80 uppercase tracking-widest font-bold mb-1">နောက်ဆုံးအပ်ဒိတ်</div>
          <div className="text-xl font-bold">{priceData.date_short || priceData.effective_date}</div>
          <div className="text-[10px] opacity-60 mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Source: {priceData.source}
          </div>
        </div>

        {Object.entries(priceData.prices).map(([brand, prices]) => (
          <div key={brand} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-gray-50 dark:border-slate-700 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                {brandLogos[brand.toLowerCase()] && (
                  <img 
                    src={brandLogos[brand.toLowerCase()]} 
                    alt={brand} 
                    className="w-8 h-8 object-contain bg-white rounded-full border border-gray-100 p-1"
                  />
                )}
                <h3 className="font-bold text-gray-900 dark:text-slate-100 uppercase tracking-tight">
                  {brandNames[brand.toLowerCase()] || brand}
                </h3>
              </div>
            </div>
            
            <div className="divide-y divide-gray-50 dark:divide-slate-700">
              {Object.entries(prices).map(([fuelKey, price]) => (
                <div key={fuelKey} className="flex justify-between items-center p-3 px-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                  <span className="text-sm font-medium text-gray-600 dark:text-slate-300">
                    {priceLabels[fuelKey] || fuelKey}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-gray-900 dark:text-slate-100">{price.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">THB</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        <div className="text-center text-[10px] text-gray-400 dark:text-slate-500 py-4">
          Data generated at: {priceData.generated}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [reports, setReports] = useState<Report[]>([]);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'prices'>('map');
  const [isOffline, setIsOffline] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const brands = useMemo(() => {
    const uniqueBrands = new Set(reports.map(r => r.brand).filter(Boolean));
    return Array.from(uniqueBrands).sort();
  }, [reports]);

  const filteredReports = useMemo(() => {
    if (!selectedBrand) return reports;
    return reports.filter(r => r.brand === selectedBrand);
  }, [reports, selectedBrand]);

  const fetchData = async (forceRefresh = false) => {
    try {
      setIsOffline(false);
      let cachedReports = null;
      let cachedPrices = null;

      if (!forceRefresh) {
        const { data: cache, error: supabaseError } = await supabase
          .from('api_cache')
          .select('data, updated_at')
          .eq('id', 'fuel_data')
          .single();

        if (cache && !supabaseError) {
          const updatedAt = new Date(cache.updated_at).getTime();
          const now = new Date().getTime();
          const fifteenMinutes = 15 * 60 * 1000;

          if (now - updatedAt < fifteenMinutes) {
            if (cache.data) {
              setReports(cache.data.reports || []);
              setPriceData(cache.data.priceData || null);
              setLoading(false);
              return;
            }
          }
        }
      }

      // 1. Fetch Reports
      const reportsResponse = await fetch('https://cm-pump.com/api_report.php?action=list&limit=500');
      if (!reportsResponse.ok) throw new Error('Failed to fetch reports');
      const reportsJson = await reportsResponse.json();
      
      // 2. Fetch Prices (Try Serverless API, fallback to direct crawl)
      let crawledPrices = null;
      try {
        const pricesResponse = await fetch('/api/prices');
        if (pricesResponse.ok) {
          crawledPrices = await pricesResponse.json();
        } else {
          // Fallback to direct crawl if API is missing (e.g. local dev without vercel dev)
          const mainPageResponse = await fetch('https://cm-pump.com/');
          if (mainPageResponse.ok) {
            const html = await mainPageResponse.text();
            const priceDataMatch = html.match(/const\s+PRICE_DATA\s*=\s*(\{[\s\S]*?\});/);
            if (priceDataMatch && priceDataMatch[1]) {
              let jsonStr = priceDataMatch[1].trim();
              jsonStr = jsonStr.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
              crawledPrices = JSON.parse(jsonStr);
            }
          }
        }
      } catch (e) {
        console.error('Error fetching prices from API, attempting fallback...', e);
        // Fallback to direct crawl on fetch failure (e.g. 404 with no proxy)
        try {
          const mainPageResponse = await fetch('https://cm-pump.com/');
          if (mainPageResponse.ok) {
            const html = await mainPageResponse.text();
            const priceDataMatch = html.match(/const\s+PRICE_DATA\s*=\s*(\{[\s\S]*?\});/);
            if (priceDataMatch && priceDataMatch[1]) {
              let jsonStr = priceDataMatch[1].trim();
              jsonStr = jsonStr.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
              crawledPrices = JSON.parse(jsonStr);
            }
          }
        } catch(fe) {
          console.error('Fallback crawling also failed:', fe);
        }
      }

      if (reportsJson.ok && reportsJson.reports) {
        setReports(reportsJson.reports);
        setPriceData(crawledPrices);
        
        await supabase.from('api_cache').upsert({ 
          id: 'fuel_data', 
          data: {
            reports: reportsJson.reports,
            priceData: crawledPrices
          }, 
          updated_at: new Date().toISOString() 
        }, { onConflict: 'id' });
      } else {
        throw new Error('Invalid format');
      }
    } catch (err) {
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

  const center: [number, number] = reports.length > 0 
    ? [reports[0].lat, reports[0].lng] 
    : [18.7883, 98.9853];

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-800 shadow-sm z-20 p-4 flex items-center justify-between border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-blue-200 shadow-lg">
            <Fuel className="text-white w-5 h-5" />
          </div>
          <h1 className="text-md font-bold text-gray-900 dark:text-slate-100 tracking-tight">ဆီဆိုင်မြေပုံ</h1>
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
            className="p-2 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          
          <button 
            onClick={() => {
              setLoading(true);
              fetchData(true);
            }}
            disabled={loading}
            className="p-2 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {error && (
          <div className="absolute top-4 left-4 right-4 z-[2000] bg-red-100 dark:bg-red-900/80 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded-xl shadow-lg flex items-center justify-between">
            <span className="text-sm font-medium">Error: {error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}
        
        <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'map' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
          {loading && reports.length === 0 ? (
            <div className="absolute inset-0 z-[1500] bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <RefreshCcw className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="text-sm text-gray-500 font-medium">Loading Map Data...</span>
              </div>
            </div>
          ) : null}

          {/* Brand Filter Bar */}
          <div className="absolute top-4 left-0 right-0 z-[1001] px-4 overflow-x-auto no-scrollbar scroll-smooth flex items-center gap-2 pb-4">
            <button
              onClick={() => setSelectedBrand(null)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm border ${
                selectedBrand === null 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200 dark:shadow-none scale-105' 
                  : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              All Shops
            </button>
            {brands.map((brand) => (
              <button
                key={brand}
                onClick={() => setSelectedBrand(brand)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm border flex items-center gap-2 ${
                  selectedBrand === brand 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200 dark:shadow-none scale-105' 
                    : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                {brandLogos[brand.toLowerCase()] && (
                  <img 
                    src={brandLogos[brand.toLowerCase()]} 
                    alt={brand} 
                    className="w-4 h-4 object-contain brightness-100 rounded-full" 
                  />
                )}
                <span className="whitespace-nowrap uppercase tracking-tight">{brandNames[brand.toLowerCase()] || brand}</span>
              </button>
            ))}
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
            
            {filteredReports.map((report) => (
              <Marker key={report.id} position={[report.lat, report.lng]} icon={getBrandIcon(report.brand, getStationStatus(report))}>
                <Popup className="custom-popup">
                  <div className="p-0 min-w-[220px]">
                    <h3 className="font-bold text-base mb-1 flex items-start gap-1.5 text-slate-900 dark:text-slate-100">
                      <MapPin className="w-4 h-4 mt-1 flex-shrink-0 text-blue-600" />
                      <span>{report.station_name || 'အမည်မသိ ဆိုင်'}</span>
                    </h3>
                    
                    {report.brand && (
                      <div className="text-[10px] text-gray-500 dark:text-slate-400 mb-3 ml-5 uppercase tracking-wider font-semibold">
                        {report.brand}
                      </div>
                    )}

                    <div className="space-y-1.5 mb-3">
                      {Object.entries(fuelTypes).map(([key, label]) => {
                        const statusRaw = report[key as keyof Report] as string | undefined;
                        if (statusRaw === undefined || statusRaw === null || statusRaw === '') return null;
                        
                        const status = statusTranslations[statusRaw] || statusTranslations[''];
                        const colorClass = statusColors[statusRaw] || statusColors[''];
                        
                        return (
                          <div key={key} className="flex justify-between items-center text-xs border-b border-gray-100 dark:border-slate-700 pb-1.5 last:border-0 last:pb-0">
                            <span className="text-gray-700 dark:text-slate-300 font-medium">{label}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${colorClass}`}>
                              {status}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="text-[9px] text-gray-400 dark:text-slate-500 text-right mt-2 flex items-center justify-end gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {report.ts_th}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'prices' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
          <FuelPricesView priceData={priceData} />
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
