import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Fuel, MapPin, Clock } from 'lucide-react';

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
  'มี': 'text-green-700 bg-green-100 border-green-200',
  'หมด': 'text-red-700 bg-red-100 border-red-200',
  'รอส่ง': 'text-yellow-700 bg-yellow-100 border-yellow-200',
  '': 'text-gray-600 bg-gray-100 border-gray-200',
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

  // Mixed state or has 'รอส่ง'
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
    <div class="relative w-10 h-10">
      <div class="w-full h-full bg-white rounded-full shadow-md border-2 border-white flex items-center justify-center overflow-hidden">
        <img src="${logoUrl}" alt="${brand}" class="w-full h-full object-contain p-1" />
      </div>
      <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${indicatorColor} shadow-sm"></div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-brand-icon',
    html,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
};

export default function App() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('https://cm-pump.com/api_report.php?action=list&limit=500');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const data = await response.json();
        if (data.ok && data.reports) {
          setReports(data.reports);
        } else {
          throw new Error('Invalid data format');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate center based on reports or default to Chiang Mai
  const center: [number, number] = reports.length > 0 
    ? [reports[0].lat, reports[0].lng] 
    : [18.7883, 98.9853];

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 font-sans">
      <header className="bg-white shadow-sm z-10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fuel className="text-blue-600 w-6 h-6" />
          <h1 className="text-lg font-semibold text-gray-900">လောင်စာဆီရရှိနိုင်မှု မြေပုံ</h1>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {loading ? 'Loading...' : 'Live Updates'}
          </div>
          <button 
            onClick={() => {
              setLoading(true);
              fetch('https://cm-pump.com/api_report.php?action=list&limit=500')
                .then(res => res.json())
                .then(data => {
                  if (data.ok && data.reports) setReports(data.reports);
                })
                .catch(err => setError(err.message))
                .finally(() => setLoading(false));
            }}
            disabled={loading}
            className="px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 relative">
        {error && (
          <div className="absolute top-4 left-4 right-4 z-[1000] bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            Error: {error}
          </div>
        )}
        
        <MapContainer 
          center={center} 
          zoom={12} 
          className="absolute inset-0 z-0"
        >
          <MapUpdater center={center} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {reports.map((report) => (
            <Marker key={report.id} position={[report.lat, report.lng]} icon={getBrandIcon(report.brand, getStationStatus(report))}>
              <Popup className="custom-popup">
                <div className="p-1 min-w-[200px]">
                  <h3 className="font-bold text-base mb-1 flex items-start gap-1">
                    <MapPin className="w-4 h-4 mt-1 flex-shrink-0 text-blue-600" />
                    <span>{report.station_name || 'အမည်မသိ ဆိုင်'}</span>
                  </h3>
                  
                  {report.brand && (
                    <div className="text-xs text-gray-500 mb-3 ml-5 uppercase tracking-wider">
                      {report.brand}
                    </div>
                  )}

                  <div className="space-y-2 mb-3">
                    {Object.entries(fuelTypes).map(([key, label]) => {
                      const statusRaw = report[key as keyof Report] as string | undefined;
                      if (statusRaw === undefined || statusRaw === null) return null;
                      
                      const status = statusTranslations[statusRaw] || statusTranslations[''];
                      const colorClass = statusColors[statusRaw] || statusColors[''];
                      
                      return (
                        <div key={key} className="flex justify-between items-center text-sm border-b border-gray-100 pb-1 last:border-0">
                          <span className="text-gray-700">{label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
                            {status}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[10px] text-gray-400 text-right mt-2 pt-2 border-t border-gray-100">
                    နောက်ဆုံးအပ်ဒိတ်: {report.ts_th}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </main>
    </div>
  );
}
