from fastapi import FastAPI, UploadFile, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis
import numpy as np
from PIL import Image, ImageOps
import io, time, os, traceback

app = FastAPI(title="Face Service — 42 BPM Intel")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

fa = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
fa.prepare(ctx_id=0, det_size=(640, 640))

MIN_DET_SCORE = float(os.getenv("MIN_DET_SCORE", "0.45"))


def process_image(raw: bytes, t0: float) -> dict:
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

    return {
        "count": len(results),
        "total_detected": len(faces),
        "elapsed_ms": int((time.time() - t0) * 1000),
        "image_size": {"w": img.shape[1], "h": img.shape[0]},
        "faces": results,
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": "buffalo_l", "min_det_score": MIN_DET_SCORE}


@app.post("/embed")
async def embed(file: UploadFile):
    t0 = time.time()
    raw = await file.read()
    return process_image(raw, t0)


@app.post("/embed-raw")
async def embed_raw(request: Request):
    """Accepts raw image bytes (Content-Type: image/jpeg or image/png)."""
    t0 = time.time()
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty body")
    return process_image(raw, t0)
