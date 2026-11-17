import hashlib
import hmac
import os
from pathlib import Path
import threading
import cv2
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile

ROOT = Path(__file__).parent / 'models'
TOKEN = os.environ.get('FACE_SERVICE_TOKEN', '')
if len(TOKEN) < 32:
    raise RuntimeError('FACE_SERVICE_TOKEN must contain at least 32 characters')
cv2.setNumThreads(int(os.environ.get('OPENCV_THREADS', '1')))
detector = cv2.FaceDetectorYN.create(str(ROOT / 'yunet.onnx'), '', (320, 320), 0.9)
recognizer = cv2.FaceRecognizerSF.create(str(ROOT / 'sface.onnx'), '')
VERSION = 'sface-' + hashlib.sha256((ROOT / 'sface.onnx').read_bytes()).hexdigest()[:16]
lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

@app.get('/health')
def health():
    return {'ok': True, 'modelVersion': VERSION}

@app.post('/extract')
def extract(image: UploadFile = File(...), authorization: str = Header(default='')):
    if not hmac.compare_digest(authorization, 'Bearer ' + TOKEN):
        raise HTTPException(401, 'Unauthorized')
    raw = image.file.read(5 * 1024 * 1024 + 1)
    if not raw or len(raw) > 5 * 1024 * 1024:
        raise HTTPException(422, 'La imagen debe pesar menos de 5 MB')
    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None or frame.shape[0] * frame.shape[1] > 20000000:
        raise HTTPException(422, 'Imagen inválida')
    if max(frame.shape[:2]) > 1024:
        ratio = 1024 / max(frame.shape[:2])
        frame = cv2.resize(frame, (round(frame.shape[1] * ratio), round(frame.shape[0] * ratio)))
    # OpenCV detector and recognizer instances are shared and not thread-safe.
    with lock:
        detector.setInputSize((frame.shape[1], frame.shape[0]))
        _, faces = detector.detect(frame)
        if faces is None or len(faces) == 0:
            raise HTTPException(422, 'No pudimos detectar tu rostro. Mira de frente a la cámara, con buena luz y sin cubrir tu cara.')
        if len(faces) > 1:
            raise HTTPException(422, f'Detectamos {len(faces)} rostros en la foto. Debe aparecer únicamente tu cara.')
        face = faces[0]
        if min(face[2], face[3]) < 60:
            raise HTTPException(422, 'Acerca el rostro a la cámara')
        aligned = recognizer.alignCrop(frame, face)
        gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
        if gray.mean() < 35 or gray.mean() > 235 or cv2.Laplacian(gray, cv2.CV_64F).var() < 20:
            raise HTTPException(422, 'Busca mejor luz y mantén la cámara quieta')
        vector = recognizer.feature(aligned).flatten()
        norm = np.linalg.norm(vector)
        if not np.isfinite(vector).all() or norm <= 0:
            raise HTTPException(422, 'No se pudo procesar el rostro')
        vector = vector / norm
    return {'vector': vector.tolist(), 'modelVersion': VERSION}
