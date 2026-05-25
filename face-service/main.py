from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis
import numpy as np
from PIL import Image, ImageOps
import io, time, os, traceback, asyncio, json, logging
import urllib.request, urllib.error
from typing import Optional

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("worker")

MIN_DET_SCORE = float(os.getenv("MIN_DET_SCORE", "0.45"))
SUPABASE_URL  = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_KEY", "")
WORKER_BATCH  = int(os.getenv("WORKER_BATCH", "10"))
WORKER_SLEEP  = int(os.getenv("WORKER_SLEEP", "60"))

# Carregado em background — não bloqueia o uvicorn na inicialização
_fa = None
_fa_ready = asyncio.Event()


def _load_model_sync():
    fa = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    fa.prepare(ctx_id=0, det_size=(640, 640))
    return fa


async def _load_model_bg():
    global _fa
    try:
        log.info("Carregando buffalo_l...")
        loop = asyncio.get_running_loop()
        _fa = await loop.run_in_executor(None, _load_model_sync)
        _fa_ready.set()
        log.info("buffalo_l pronto")
    except Exception as e:
        log.error("Falha ao carregar buffalo_l: %s", e)
        raise


async def get_fa() -> FaceAnalysis:
    if not _fa_ready.is_set():
        await asyncio.wait_for(_fa_ready.wait(), timeout=300)
    return _fa


def process_image(raw: bytes, t0: float, min_score: float = MIN_DET_SCORE, fa: FaceAnalysis = None) -> dict:
    if fa is None:
        raise HTTPException(status_code=503, detail="Model not ready")
    try:
        pil_img = Image.open(io.BytesIO(raw))
        pil_img = ImageOps.exif_transpose(pil_img)
        pil_img = pil_img.convert("RGB")
        img = np.array(pil_img)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image decode error: {e}")

    orig_h, orig_w = img.shape[:2]

    try:
        faces = fa.get(img)
        bbox_offset = 0
        scale_factor = 1.0

        if len(faces) == 0:
            max_dim = max(orig_h, orig_w)
            if max_dim > 1000:
                target = 1600
                scale_factor = target / max_dim
                new_w = int(orig_w * scale_factor)
                new_h = int(orig_h * scale_factor)
                pil_resized = Image.fromarray(img).resize((new_w, new_h), Image.LANCZOS)
                img_resized = np.array(pil_resized)
                faces = fa.get(img_resized)
                if len(faces) > 0:
                    img = img_resized
                    orig_h, orig_w = new_h, new_w

        if len(faces) == 0:
            scale_factor = 1.0
            pad = max(img.shape[0], img.shape[1])
            padded = np.full((img.shape[0] + pad * 2, img.shape[1] + pad * 2, 3), 255, dtype=np.uint8)
            padded[pad:pad + img.shape[0], pad:pad + img.shape[1]] = img
            faces = fa.get(padded)
            bbox_offset = pad

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"face detection error: {e}")

    results = []
    for f in faces:
        score = float(f.det_score)
        if score < min_score:
            continue
        results.append({
            "bbox": {
                "x": max(0, int(f.bbox[0]) - bbox_offset),
                "y": max(0, int(f.bbox[1]) - bbox_offset),
                "w": int(f.bbox[2] - f.bbox[0]),
                "h": int(f.bbox[3] - f.bbox[1]),
            },
            "det_score": score,
            "embedding": f.normed_embedding.tolist(),
        })

    return {
        "count": len(results),
        "total_detected": len(faces),
        "elapsed_ms": int((time.time() - t0) * 1000),
        "image_size": {"w": img.shape[1], "h": img.shape[0]},
        "faces": results,
    }


# ── worker helpers (stdlib urllib, sem dependências externas) ─────────────────

def _sb_headers(extra: dict = {}) -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        **extra,
    }


def _http_post(url: str, payload: dict, headers: dict) -> None:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15):
            pass
    except urllib.error.HTTPError:
        pass  # conflitos de upsert (409) são ignorados


def _http_get(url: str, timeout: int = 10) -> bytes:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _fetch_pending(batch: int) -> list:
    url = f"{SUPABASE_URL}/rest/v1/rpc/get_pending_qualificados"
    data = json.dumps({"batch_limit": batch}).encode()
    req = urllib.request.Request(url, data=data, headers=_sb_headers(), method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read())
        return result if isinstance(result, list) else []


def _process_pessoa_sync(pessoa: dict, fa: FaceAnalysis) -> int:
    extras = pessoa.get("fotos_extras") or []
    urls = [u for u in [pessoa["foto_url"]] + (extras if isinstance(extras, list) else []) if u]
    embedded = 0
    service_error = False

    for url in urls:
        try:
            raw = _http_get(url)
        except Exception:
            continue

        try:
            result = process_image(raw, time.time(), MIN_DET_SCORE, fa)
            if result["count"] == 0 and result["total_detected"] > 0:
                result = process_image(raw, time.time(), 0.35, fa)
        except Exception:
            service_error = True
            continue

        for face_index, face in enumerate(result["faces"]):
            _http_post(
                f"{SUPABASE_URL}/rest/v1/face_embeddings"
                "?on_conflict=source,source_id,photo_url,face_index",
                {
                    "source":       "qualificados",
                    "source_id":    pessoa["id"],
                    "source_label": pessoa["nome"],
                    "photo_url":    url,
                    "embedding":    json.dumps(face["embedding"]),
                    "bbox":         face["bbox"],
                    "det_score":    face["det_score"],
                    "face_index":   face_index,
                },
                _sb_headers({"Prefer": "resolution=ignore-duplicates"}),
            )
            embedded += 1

    if embedded == 0 and not service_error:
        _http_post(
            f"{SUPABASE_URL}/rest/v1/face_skipped"
            "?on_conflict=source,source_id",
            {
                "source":       "qualificados",
                "source_id":    pessoa["id"],
                "source_label": pessoa["nome"],
                "reason":       "no_face_detected",
            },
            _sb_headers({"Prefer": "resolution=merge-duplicates"}),
        )

    return embedded


async def backfill_worker():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.info("Worker desabilitado: SUPABASE_URL ou SUPABASE_SERVICE_KEY ausente")
        return

    # Aguarda modelo estar pronto antes de iniciar o worker
    log.info("Worker aguardando modelo...")
    await _fa_ready.wait()
    fa = _fa

    log.info("Backfill worker iniciado (batch=%d, sleep=%ds)", WORKER_BATCH, WORKER_SLEEP)
    loop = asyncio.get_running_loop()

    while True:
        try:
            queue = await loop.run_in_executor(None, _fetch_pending, WORKER_BATCH)

            if not queue:
                log.info("Fila vazia — aguardando %ds", WORKER_SLEEP)
                await asyncio.sleep(WORKER_SLEEP)
                continue

            log.info("Processando lote de %d", len(queue))
            for pessoa in queue:
                n = await loop.run_in_executor(None, _process_pessoa_sync, pessoa, fa)
                log.info("  %s → %d face(s)", pessoa.get("nome", pessoa.get("id")), n)

        except asyncio.CancelledError:
            log.info("Worker encerrado")
            return
        except Exception as e:
            log.error("Worker erro: %s — retry em 30s", e)
            await asyncio.sleep(30)


# ── app ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    model_task = asyncio.create_task(_load_model_bg())
    worker_task = asyncio.create_task(backfill_worker())
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    model_task.cancel()


app = FastAPI(title="Face Service — 42 BPM Intel", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    ready = _fa_ready.is_set()
    return {
        "status": "ok" if ready else "loading",
        "model": "buffalo_l",
        "model_ready": ready,
        "min_det_score": MIN_DET_SCORE,
    }


@app.post("/embed")
async def embed(file: UploadFile, min_score: Optional[float] = Query(default=None)):
    t0 = time.time()
    fa = await get_fa()
    raw = await file.read()
    return process_image(raw, t0, min_score if min_score is not None else MIN_DET_SCORE, fa)


@app.post("/embed-raw")
async def embed_raw(request: Request, min_score: Optional[float] = Query(default=None)):
    """Accepts raw image bytes (Content-Type: image/jpeg or image/png).
    Optional ?min_score=0.35 to use a lower detection threshold."""
    t0 = time.time()
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty body")
    fa = await get_fa()
    return process_image(raw, t0, min_score if min_score is not None else MIN_DET_SCORE, fa)
