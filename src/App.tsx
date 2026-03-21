import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Fuel, MapPin, Clock, Moon, Sun, Map as MapIcon, List as ListIcon, RefreshCcw, ChevronDown, Check, X, AlertTriangle } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Analytics } from '@vercel/analytics/react';

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
  'มี': 'text-white bg-green-500 border-green-600 dark:bg-green-600 dark:border-green-700',
  'หมด': 'text-white bg-red-500 border-red-600 dark:bg-red-600 dark:border-red-700',
  'รอส่ง': 'text-white bg-yellow-500 border-yellow-600 dark:bg-yellow-600 dark:border-yellow-700',
  '': 'text-white bg-gray-500 border-gray-600 dark:bg-gray-600 dark:border-gray-700',
};

const fuelTypes: Record<string, string> = {
  'diesel_premium': 'ဒီဇယ် ပရီမီယံ',
  'diesel': 'ဒီဇယ်',
  'diesel_b10': 'ဒီဇယ် B10',
  'diesel_b20': 'ဒီဇယ် B20',
  'benzine': 'ဓာတ်ဆီ',
  'g95': '95',
  'g91': '91',
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
  diesel_premium: 'Premium Diesel',
  diesel: 'Diesel',
  diesel_b10: 'Diesel B10',
  diesel_b20: 'Diesel B20',
  benzine: 'Benzine',
  g95: '95',
  g95_premium: 'Premium 95',
  g91: '91',
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
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch User Location once on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation([lat, lng]);
          
          try {
            await supabase.from('user_locations').insert([
              { lat, lng, user_agent: navigator.userAgent }
            ]);
          } catch (err) {
            console.error('Supabase write error for user location:', err);
          }
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          setLocationError('Unable to get your location. Please check browser permissions.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
  }, []);

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
        try {
          const { data: cache, error: supabaseError } = await supabase
            .from('api_cache')
            .select('data, updated_at')
            .eq('id', 'fuel_data')
            .single();

          if (cache && !supabaseError) {
            const updatedAt = new Date(cache.updated_at).getTime();
            const now = new Date().getTime();
            const fifteenMinutes = 15 * 60 * 1000;

            if (now - updatedAt < fifteenMinutes && cache.data) {
              setReports(cache.data.reports || []);
              setPriceData(cache.data.priceData || null);
              setLastUpdated(new Date(cache.updated_at));
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn('Supabase read failed, bypassing cache...', e);
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
          // Fallback to direct crawl if API is missing
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
        console.warn('Price fetch failed, attempting fallback...', e);
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
          console.error('Price fallback also failed:', fe);
        }
      }

      if (reportsJson.ok && reportsJson.reports) {
        setReports(reportsJson.reports);
        setPriceData(crawledPrices);
        setLastUpdated(new Date());
        
        try {
          await supabase.from('api_cache').upsert({ 
            id: 'fuel_data', 
            data: {
              reports: reportsJson.reports,
              priceData: crawledPrices
            }, 
            updated_at: new Date().toISOString() 
          }, { onConflict: 'id' });
        } catch (e) {
          console.warn('Supabase write failed:', e);
        }
      } else {
        throw new Error('Invalid format from API');
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

  const center: [number, number] = userLocation 
    ? userLocation 
    : (reports.length > 0 ? [reports[0].lat, reports[0].lng] : [18.7883, 98.9853]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
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

          {/* Brand Filter Dropdown */}
          <div className="absolute top-4 left-4 z-[1001]">
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg border ${
                  selectedBrand 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200 dark:shadow-none' 
                    : 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-gray-100 dark:border-slate-700 text-gray-700 dark:text-slate-100'
                }`}
              >
                {selectedBrand && brandLogos[selectedBrand.toLowerCase()] && (
                  <img src={brandLogos[selectedBrand.toLowerCase()]} className="w-4 h-4 rounded-full bg-white p-0.5" alt={selectedBrand} />
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
                      className={`w-full px-4 py-3 text-left text-xs font-bold flex items-center justify-between transition-colors ${
                        selectedBrand === null ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <span>ဆိုင်အားလုံး</span>
                      {selectedBrand === null && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                    </button>
                    {brands.map((brand) => (
                      <button
                        key={brand}
                        onClick={() => { setSelectedBrand(brand); setIsFilterOpen(false); }}
                        className={`w-full px-4 py-3 text-left text-xs font-bold flex items-center justify-between transition-colors ${
                          selectedBrand === brand ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {brandLogos[brand.toLowerCase()] && (
                            <img src={brandLogos[brand.toLowerCase()]} className="w-5 h-5 rounded-full bg-white p-0.5 border border-gray-100" alt={brand} />
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
            
            {filteredReports.map((report) => (
              <Marker key={report.id} position={[report.lat, report.lng]} icon={getBrandIcon(report.brand, getStationStatus(report))}>
                <Popup className="custom-popup">
                  <div className="p-2 min-w-[240px] font-sans">
                    <h3 className="font-bold text-[17px] text-[#2c3e50] dark:text-slate-100 mb-4 tracking-wide leading-tight">
                      {brandNames[report.brand?.toLowerCase()] || report.brand || report.station_name || 'အမည်မသိ ဆိုင်'}
                    </h3>
                    
                    <div className="text-[11px] text-[#94a3b8] font-bold mb-3">
                      ဆီအခြေအနေ
                    </div>

                    <div className="space-y-3 mb-5">
                      {Object.entries(fuelTypes).map(([key, label]) => {
                        const statusRaw = report[key as keyof Report] as string | undefined;
                        if (statusRaw === undefined || statusRaw === null || statusRaw === '') return null;
                        
                        let Icon = AlertTriangle;
                        let textClass = "text-[#94a3b8]";
                        let statusText = "မသိရ";
                        
                        if (statusRaw === 'มี') {
                          Icon = Check;
                          textClass = "text-[#10b981]";
                          statusText = "ရှိသည်";
                        } else if (statusRaw === 'หมด') {
                          Icon = X;
                          textClass = "text-[#ef4444]";
                          statusText = "ကုန်ပြီ";
                        } else if (statusRaw === 'รอส่ง') {
                          Icon = Clock;
                          textClass = "text-[#f59e0b]";
                          statusText = "စောင့်ဆိုင်း";
                        }
                        
                        return (
                          <div key={key} className="flex justify-between items-center">
                            <span className="text-[13px] text-black dark:text-gray-100">{label}</span>
                            <div className={`flex items-center gap-1 font-bold text-[12px] ${textClass}`}>
                              {Icon !== AlertTriangle ? <Icon className="w-3.5 h-3.5 stroke-[3]" /> : <Icon className="w-3 h-3 fill-current stroke-0" />}
                              <span>{statusText}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="text-[10px] text-[#94a3b8] mb-3">
                      Updated {report.ts_th}
                    </div>

                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-600 dark:text-blue-400 font-bold py-2.5 rounded-xl text-[13px] transition-colors border border-blue-100 dark:border-blue-800/50"
                      onClick={(e) => e.stopPropagation()}
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
      <Analytics />
    </div>
  );
}
