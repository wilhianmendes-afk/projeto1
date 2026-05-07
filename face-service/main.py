from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis
import numpy as np
from PIL import Image, ImageOps
import io, time, os, sys, gc, logging

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

app = FastAPI(title="Face Service — 42 BPM Intel")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuração
MIN_DET_SCORE = float(os.getenv("MIN_DET_SCORE", "0.45"))
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 50 * 1024 * 1024))  # 50MB padrão
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", 30))  # 30s

logger.info(f"Iniciando Face Service com MIN_DET_SCORE={MIN_DET_SCORE}, MAX_FILE_SIZE={MAX_FILE_SIZE/1024/1024:.1f}MB")

# Carrega modelo na inicialização
try:
    fa = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    fa.prepare(ctx_id=0, det_size=(640, 640))
    logger.info("✅ Modelo buffalo_l carregado com sucesso")
    MODEL_READY = True
except Exception as e:
    logger.error(f"❌ Erro ao carregar modelo: {e}")
    MODEL_READY = False


@app.get("/health")
def health():
    return {
        "status": "ok" if MODEL_READY else "initializing",
        "model": "buffalo_l",
        "model_ready": MODEL_READY,
        "min_det_score": MIN_DET_SCORE,
        "max_file_size_mb": MAX_FILE_SIZE / 1024 / 1024,
    }


@app.post("/embed")
async def embed(file: UploadFile):
    t0 = time.time()

    if not MODEL_READY:
        raise HTTPException(status_code=503, detail="Modelo ainda não foi carregado")

    # Validação de tamanho
    raw = await file.read()
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande: {len(raw)/1024/1024:.1f}MB (máximo: {MAX_FILE_SIZE/1024/1024:.1f}MB)"
        )

    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Arquivo vazio")

    try:
        pil_img = Image.open(io.BytesIO(raw))
        pil_img = ImageOps.exif_transpose(pil_img)
        pil_img = pil_img.convert("RGB")
        w, h = pil_img.size

        # Validação de dimensões
        if w < 10 or h < 10:
            raise ValueError(f"Imagem muito pequena: {w}x{h}px (mínimo: 10x10)")

        if max(w, h) < 640:
            scale = 640 / max(w, h)
            pil_img = pil_img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        img = np.array(pil_img)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao processar imagem: {e}")
        raise HTTPException(status_code=400, detail=f"Erro ao processar imagem: {str(e)}")

    try:
        faces = fa.get(img)
    except Exception as e:
        logger.error(f"❌ Erro na detecção de faces: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na detecção de faces: {str(e)}")
    finally:
        # Libera memória
        del img, raw
        gc.collect()

    results = []
    for f in faces:
        score = float(f.det_score)
        if score < MIN_DET_SCORE:
            continue
        results.append({
            "bbox": {
                "x": int(f.bbox[0]), "y": int(f.bbox[1]),
                "w": int(f.bbox[2] - f.bbox[0]), "h": int(f.bbox[3] - f.bbox[1]),
            },
            "det_score": score,
            "embedding": f.normed_embedding.tolist(),
        })

    elapsed_ms = int((time.time() - t0) * 1000)
    logger.info(f"✅ Embed: {len(results)}/{len(faces)} rostos detectados em {elapsed_ms}ms")

    return {
        "count": len(results),
        "total_detected": len(faces),
        "elapsed_ms": elapsed_ms,
        "image_size": {"w": pil_img.shape[1], "h": pil_img.shape[0]},
        "faces": results,
    }
