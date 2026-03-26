import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Activity, MapPin, RefreshCcw, LogOut, CheckCircle2, XCircle, Globe, ShieldAlert, Clock, Smartphone, Database, ExternalLink } from 'lucide-react';

// Fix for default marker icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const UserLocIcon = L.divIcon({
  className: 'custom-ops-user-icon',
  html: `<div class="w-4 h-4 bg-rose-500 border-2 border-white rounded-full shadow-lg ring-2 ring-rose-500/20"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const SelectedUserLocIcon = L.divIcon({
  className: 'custom-ops-selected-icon',
  html: `<div class="w-5 h-5 bg-blue-600 border-2 border-white rounded-full shadow-xl ring-4 ring-blue-500/30"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function MapFocus({ center }: { center: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    const nextZoom = Math.max(map.getZoom(), 14);
    map.setView(center, nextZoom, { animate: true });
  }, [center, map]);

  return null;
}

interface SyncLog {
  id: string;
  timestamp: string;
  status: 'success' | 'error';
  updated_stations: number;
  discovery_status: 'success' | 'failed' | 'skipped';
  discovered_url?: string;
  error_message?: string;
}

interface UserLocation {
  lat: number;
  lng: number;
  user_agent: string;
  ip_address?: string | null;
  updated_at: string;
}

interface Station {
  osm_id: string;
  station_name: string;
  brand: string;
  updated_at: string;
}

export default function OpsDashboard() {
  const [data, setData] = useState<{ latestSync: SyncLog | null, userLocations: UserLocation[], latestStations: Station[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<UserLocation | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('ops_token');
      const res = await fetch('/api/ops/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) {
        localStorage.removeItem('ops_token');
        navigate('/ops/login');
        return;
      }

      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error);
      }
    } catch (err) {
      setError('Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('ops_token');
    navigate('/ops/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <RefreshCcw className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Loading Dashboard Data...</p>
      </div>
    );
  }

  const latest = data?.latestSync;
  const selectedCenter = selectedLocation ? [selectedLocation.lat, selectedLocation.lng] as [number, number] : null;

  const isSelected = (loc: UserLocation) => (
    selectedLocation &&
    loc.lat === selectedLocation.lat &&
    loc.lng === selectedLocation.lng &&
    loc.updated_at === selectedLocation.updated_at
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <Activity className="text-blue-600 w-8 h-8" />
              Operations Center
            </h1>
            <p className="text-slate-500 text-sm mt-1">Real-time status monitor and user activity</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </header>

        {/* Sync Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-50 rounded-2xl">
                <RefreshCcw className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Crawl Status</span>
            </div>
            {latest ? (
              <div>
                <div className="flex items-center gap-2 mt-2">
                  {latest.status === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-500" />
                  )}
                  <span className={`text-xl font-black ${latest.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {latest.status === 'success' ? 'CRUISE CLEAR' : 'ERROR DETECTED'}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-2 font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last run: {new Date(latest.timestamp).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="text-slate-400 text-sm font-medium">No sync records found</p>
            )}
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-amber-50 rounded-2xl">
                <Globe className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">API Discovery</span>
            </div>
            {latest ? (
              <div>
                <div className="flex items-center gap-2 mt-2">
                  {latest.discovery_status === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : latest.discovery_status === 'failed' ? (
                    <ShieldAlert className="w-5 h-5 text-rose-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-slate-300" />
                  )}
                  <span className={`text-xl font-black ${latest.discovery_status === 'success' ? 'text-emerald-600' : latest.discovery_status === 'failed' ? 'text-rose-600' : 'text-slate-400'}`}>
                    {(latest.discovery_status || 'skipped').toUpperCase()}
                  </span>
                </div>
                <div className="mt-3 truncate">
                  <span className="text-[10px] font-bold text-slate-300 uppercase block mb-1">Discovered URL</span>
                  <p className="text-[11px] text-slate-500 font-mono truncate bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    {latest.discovered_url || 'No discovery triggered'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm font-medium">Monitoring discovery...</p>
            )}
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-indigo-50 rounded-2xl">
                <Database className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Data Impact</span>
            </div>
            <div className="mt-2">
              <span className="text-3xl font-black text-indigo-600">
                {latest?.updated_stations || 0}
              </span>
              <span className="ml-2 text-slate-400 font-bold text-sm tracking-tight">Stations Synced</span>
            </div>
            <div className="mt-5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
               <div className="h-full bg-indigo-500 w-[65%]" />
            </div>
          </div>
        </div>

        {/* Map & User Locations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 flex flex-col gap-4">
             <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex-1 overflow-hidden min-h-[450px] relative">
               <div className="absolute top-8 left-8 z-[1000] bg-white/95 backdrop-blur shadow-xl border border-slate-100 px-4 py-2.5 rounded-2xl flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse shadow-sm shadow-rose-200" />
                  <span className="text-xs font-black text-slate-800 tracking-tight">Latest User Activity</span>
               </div>
               <MapContainer
                  center={[18.7883, 98.9853]}
                  zoom={12}
                  className="w-full h-full rounded-2xl z-0"
                  zoomControl={false}
                >
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                  <MapFocus center={selectedCenter} />
                  {data?.userLocations
                    .filter(loc => typeof loc.lat === 'number' && typeof loc.lng === 'number' && !isNaN(loc.lat) && !isNaN(loc.lng))
                    .map((loc, idx) => (
                      <Marker key={idx} position={[loc.lat, loc.lng]} icon={UserLocIcon}>
                      <Popup className="custom-popup">
                          <div className="p-2 min-w-[140px]">
                             <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">User Details</p>
                             <p className="text-xs text-slate-700 font-medium mb-1">Time: {new Date(loc.updated_at).toLocaleTimeString()}</p>
                             {loc.ip_address && (
                               <p className="text-[10px] text-slate-500 font-mono mb-1">IP: {loc.ip_address}</p>
                             )}
                             <p className="text-[10px] text-slate-500 italic break-all leading-tight">{loc.user_agent}</p>
                          </div>
                        </Popup>
                      </Marker>
                  ))}
                  {selectedLocation && (
                    <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={SelectedUserLocIcon}>
                      <Popup className="custom-popup">
                        <div className="p-2 min-w-[140px]">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Selected Visit</p>
                          <p className="text-xs text-slate-700 font-medium mb-1">Time: {new Date(selectedLocation.updated_at).toLocaleTimeString()}</p>
                          {selectedLocation.ip_address && (
                            <p className="text-[10px] text-slate-500 font-mono mb-1">IP: {selectedLocation.ip_address}</p>
                          )}
                          <p className="text-[10px] text-slate-500 italic break-all leading-tight">{selectedLocation.user_agent}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}
               </MapContainer>
             </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-slate-50">
              <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600" />
                Live Feed
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 scrollbar-hide">
              {data?.userLocations.length === 0 && (
                <div className="p-12 text-center text-slate-300 italic text-sm">No recent activity</div>
              )}
              {data?.userLocations.map((loc, idx) => {
                const active = isSelected(loc);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedLocation(loc)}
                    className={`w-full text-left p-5 transition-colors flex gap-4 ${active ? 'bg-blue-50/60' : 'hover:bg-slate-50/50'}`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${active ? 'bg-blue-100 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                      <MapPin className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-black text-slate-800">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                        <span className="text-[10px] text-slate-400 font-bold">{new Date(loc.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      {loc.ip_address && (
                        <p className="text-[10px] text-slate-500 font-mono truncate">IP: {loc.ip_address}</p>
                      )}
                      <p className="text-[11px] text-slate-400 font-medium truncate">{loc.user_agent}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-4 bg-slate-50 text-center">
               <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Viewing last 10 visits</p>
            </div>
          </div>
        </div>

        {/* Latest Stations Sync Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              Latest Synced Stations
            </h2>
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full border border-slate-100">Live Registry</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Station Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Brand</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">OSM ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Synced At</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data?.latestStations.map((station) => (
                  <tr key={station.osm_id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-800">{station.station_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[11px] font-black px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg uppercase tracking-tight">
                        {station.brand}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                        {station.osm_id}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-500 font-medium">
                        {new Date(station.updated_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <a 
                         href={`https://www.openstreetmap.org/node/${station.osm_id}`} 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors group"
                       >
                         View
                         <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                       </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
             <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Latest 10 Registry Updates</p>
          </div>
        </div>
      </div>
    </div>
  );
}
