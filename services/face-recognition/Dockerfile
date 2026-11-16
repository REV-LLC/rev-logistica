FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 OPENCV_THREADS=1 OPENCV_IO_MAX_IMAGE_PIXELS=20000000
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY download_models.py .
RUN python download_models.py
COPY app.py .
RUN useradd --create-home face
USER face
CMD ["sh", "-c", "uvicorn app:app --host :: --port ${PORT:-8000} --workers 1 --limit-concurrency 8 --timeout-keep-alive 5"]
