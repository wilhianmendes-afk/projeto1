FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV MIN_DET_SCORE=0.6

# Pre-download buffalo_l during build so the container starts without network dependency
RUN python -c "from insightface.app import FaceAnalysis; fa = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); fa.prepare(ctx_id=0, det_size=(640,640)); print('buffalo_l cached')"

EXPOSE 8080

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
