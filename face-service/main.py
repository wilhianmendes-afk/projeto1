from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis
import numpy as np
from PIL import Image
import io, time, os

app = FastAPI(title="Face Service — 42 BPM Intel")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

fa = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
fa.prepare(ctx_id=0, det_size=(640, 640))

MIN_DET_SCORE = float(os.getenv("MIN_DET_SCORE", "0.6"))


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": "buffalo_l",
        "embedding_dim": 512,
        "min_det_score": MIN_DET_SCORE,
    }


@app.post("/embed")
async def embed(file: UploadFile, min_score: float | None = None):
    t0 = time.time()
    raw = await file.read()

    threshold = min_score if min_score is not None else MIN_DET_SCORE

    try:
        pil_img = Image.open(io.BytesIO(raw)).convert("RGB")
        # Upscale imagens pequenas — det_size=640 precisa de imagem >= 640px
        w, h = pil_img.size
        if max(w, h) < 640:
            scale = 640 / max(w, h)
            pil_img = pil_img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        img = np.array(pil_img)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagem inválida ou corrompida")

    faces = fa.get(img)

    results = []
    for f in faces:
        score = float(f.det_score)
        if score < threshold:
            continue
        results.append(
            {
                "bbox": {
                    "x": int(f.bbox[0]),
                    "y": int(f.bbox[1]),
                    "w": int(f.bbox[2] - f.bbox[0]),
                    "h": int(f.bbox[3] - f.bbox[1]),
                },
                "det_score": score,
                "embedding": f.normed_embedding.tolist(),
            }
        )

    return {
        "count": len(results),
        "total_detected": len(faces),
        "elapsed_ms": int((time.time() - t0) * 1000),
        "image_size": {"w": img.shape[1], "h": img.shape[0]},
        "faces": results,
    }
