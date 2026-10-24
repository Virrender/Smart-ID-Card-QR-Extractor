FROM python:3.12-slim

# 2. Set environment variables
# - PYTHONDONTWRITEBYTECODE: Prevents Python from writing .pyc files to disk
# - PYTHONUNBUFFERED: Ensures log outputs (FastAPI/Uvicorn) print immediately to console
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 3. Install required OS-level C libraries for OpenCV and PyZbar
# - libgl1 & libglib2.0-0: Required by OpenCV for computer vision operations
# - libzbar0: The C library that PyZbar requires to scan barcodes/QR codes
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libzbar0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 5. Leverage Docker Layer Caching for dependencies!
# (Only re-runs pip install if requirements.txt changes, saving build time)
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy the rest of the backend application code
COPY . /app/

# 7. Expose the port Uvicorn listens on
EXPOSE 8000
# 8. Command to run the application in production
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]