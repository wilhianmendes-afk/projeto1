from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis
import numpy as np
from PIL import Image, ImageOps
import io, time, os, traceback, asyncio, json, logging
from typing import Optional
import httpx

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("worker")

fa = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
fa.prepare(ctx_id=0, det_size=(640, 640))

MIN_DET_SCORE   = float(os.getenv("MIN_DET_SCORE", "0.45"))
SUPABASE_URL    = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_KEY", "")
WORKER_BATCH    = int(os.getenv("WORKER_BATCH", "10"))
WORKER_SLEEP    = int(os.getenv("WORKER_SLEEP", "60"))   # segundos entre polls quando fila vazia


def process_image(raw: bytes, t0: float, min_score: float = MIN_DET_SCORE) -> dict:
    try:
        pil_img = Image.open(io.BytesIO(raw))
        pil_img = ImageOps.exif_transpose(pil_img)
        pil_img = pil_img.convert("RGB")
        img = np.array(pil_img)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image decode error: {e}")

    try:
        faces = fa.get(img)
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
                "x": int(f.bbox[0]), "y": int(f.bbox[1]),
                "w": int(f.bbox[2] - f.bbox[0]), "h": int(f.bbox[3] - f.bbox[1]),
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


# ── worker helpers ────────────────────────────────────────────────────────────

def _sb_headers(extra: dict | None = None) -> dict:
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


async def _process_pessoa(client: httpx.AsyncClient, pessoa: dict) -> int:
    extras = pessoa.get("fotos_extras") or []
    urls = [u for u in [pessoa["foto_url"]] + (extras if isinstance(extras, list) else []) if u]
    embedded = 0
    service_error = False
    loop = asyncio.get_running_loop()

    for url in urls:
        try:
            r = await client.get(url, timeout=10.0)
            r.raise_for_status()
            raw = r.content
        except Exception:
            continue

        try:
            result = await loop.run_in_executor(None, process_image, raw, time.time(), MIN_DET_SCORE)
            if result["count"] == 0 and result["total_detected"] > 0:
                result = await loop.run_in_executor(None, process_image, raw, time.time(), 0.35)
        except Exception:
            service_error = True
            continue

        for face_index, face in enumerate(result["faces"]):
            try:
                await client.post(
                    f"{SUPABASE_URL}/rest/v1/face_embeddings"
                    "?on_conflict=source,source_id,photo_url,face_index",
                    json={
                        "source":       "qualificados",
                        "source_id":    pessoa["id"],
                        "source_label": pessoa["nome"],
                        "photo_url":    url,
                        "embedding":    json.dumps(face["embedding"]),
                        "bbox":         face["bbox"],
                        "det_score":    face["det_score"],
                        "face_index":   face_index,
                    },
                    headers=_sb_headers({"Prefer": "resolution=ignore-duplicates"}),
                    timeout=10.0,
                )
                embedded += 1
            except Exception:
                pass

    if embedded == 0 and not service_error:
        try:
            await client.post(
                f"{SUPABASE_URL}/rest/v1/face_skipped"
                "?on_conflict=source,source_id",
                json={
                    "source":       "qualificados",
                    "source_id":    pessoa["id"],
                    "source_label": pessoa["nome"],
                    "reason":       "no_face_detected",
                },
                headers=_sb_headers({"Prefer": "resolution=merge-duplicates"}),
                timeout=10.0,
            )
        except Exception:
            pass

    return embedded


async def backfill_worker():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.info("Worker desabilitado: SUPABASE_URL ou SUPABASE_SERVICE_KEY ausente")
        return

    log.info("Backfill worker iniciado (batch=%d, sleep=%ds)", WORKER_BATCH, WORKER_SLEEP)

    async with httpx.AsyncClient() as client:
        while True:
            try:
                resp = await client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/get_pending_qualificados",
                    json={"batch_limit": WORKER_BATCH},
                    headers=_sb_headers(),
                    timeout=15.0,
                )
                queue = resp.json() if resp.status_code == 200 else []
                if not isinstance(queue, list):
                    queue = []

                if not queue:
                    log.info("Fila vazia — aguardando %ds", WORKER_SLEEP)
                    await asyncio.sleep(WORKER_SLEEP)
                    continue

                log.info("Processando lote de %d", len(queue))
                for pessoa in queue:
                    n = await _process_pessoa(client, pessoa)
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
    task = asyncio.create_task(backfill_worker())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Face Service — 42 BPM Intel", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "model": "buffalo_l", "min_det_score": MIN_DET_SCORE}


@app.post("/embed")
async def embed(file: UploadFile, min_score: Optional[float] = Query(default=None)):
    t0 = time.time()
    raw = await file.read()
    return process_image(raw, t0, min_score if min_score is not None else MIN_DET_SCORE)


@app.post("/embed-raw")
async def embed_raw(request: Request, min_score: Optional[float] = Query(default=None)):
    """Accepts raw image bytes (Content-Type: image/jpeg or image/png).
    Optional ?min_score=0.35 to use a lower detection threshold."""
    t0 = time.time()
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty body")
    return process_image(raw, t0, min_score if min_score is not None else MIN_DET_SCORE)
