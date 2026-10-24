# Carta

> An open-source, local-first engine and mobile client to parse and extract verified details from Indian Driving Licences and Aadhaar cards without paid cloud APIs.

<p align="center">
  <img src="docs/screenshots/home.png" width="280" alt="Carta Home Screen" />
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="docs/screenshots/upload.png" width="280" alt="Carta Upload Screen" />
</p>

---

## Background & Motivation

Most automated KYC and identity document extraction systems on the market rely on expensive third-party SaaS APIs that charge per request, store private identity data on external servers, and frequently fail on real-world Indian ID cards due to regional scripts, laminated card glare, and multi-column layouts.

Alternative open-source solutions typically slap a basic Tesseract OCR wrapper over an image. In practice, Tesseract returns messy, jumbled text blocks because it assumes standard left-to-right document paragraphs rather than structured, tabular ID card fields.

I started **Carta** (originally *DL-Extractor*) in **August 2026** as a hands-on project to build an end-to-end extraction pipeline from scratch that runs locally on commodity laptop hardware. The goal was simple: take raw, imperfect card photos or camera scans, extract accurate structured data (Name, ID number, DOB, Address, Photo), and present it through a clean, usable mobile interface.

---

## Development Journey & Engineering Phases

This project is actively under development. Rather than treating deep-learning models as black-box APIs, I spent significant time understanding their internal geometry and failure modes.

### Phase 1: Deep Dive into OCR Internals (August 2026)
* **The 2-Week DOB Challenge:** In the first two weeks, instead of rushing to build a full UI, I focused entirely on extracting single, notoriously tricky fields like the Date of Birth (DOB) and Driving Licence validity dates.
* **Understanding Bounding Boxes:** I worked directly with the raw outputs of PaddleOCR's detection model (DBNet / PP-OCRv5 Det). Instead of plain text strings, the model outputs 4-corner polygon coordinates `[[x1,y1], [x2,y2], [x3,y3], [x4,y4]]` alongside confidence scores.
* **Why Naive Top-to-Bottom Reading Fails:** On Indian Driving Licences, "Issue Date" and "Validity (NT/TR)" often sit on the exact same horizontal baseline across two columns. A naive sequential reading order reads:  
  `Issue Date Valid Till 12/05/2018 11/05/2038`  
  This causes regex to assign the expiry date to the issue date.
* **Spatial Sorting Heuristics:** To solve this, I wrote spatial clustering logic. By calculating bounding box centroids, horizontal overlaps, and vertical line bands, the algorithm groups labels with their corresponding values based on geometric proximity rather than just reading order.

### Phase 2: Hybrid Extraction Architecture & Edge Cases (September 2026)
Real cards in the field are messy: some are worn-out laminated cards, others have pristine digital QR codes. To get both speed and accuracy, I split the engine into two distinct pipelines:

1. **Instant QR Decompression Path (< 50ms):**
   * Aadhaar cards contain a Secure QR Code.
   * I implemented dual-mode decompression: V1 (XML-based) and V2 (Base-10 integer representation decoded into a byte array, followed by `zlib.decompress`).
   * This instantly pulls verified demographic information (Name, DOB, Gender, Address) and extracts the embedded 200x200 JPEG cardholder photo without running OCR at all.
2. **Deep-Learning Fallback Pipeline (for Driving Licences and unreadable QRs):**
   * Uses a 3-stage PaddleOCR pipeline: Document Orientation Classifier (`PP-LCNet doc_ori`), Textline Orientation Classifier, and Text Recognizer (`PP-OCRv5 Server Rec`).
   * **The 3-Chunk Aadhaar Splitting Bug:** Aadhaar numbers are printed as three distinct 4-digit groups (`XXXX XXXX XXXX`). Detection models often recognize them as 3 independent bounding boxes with other words caught in between. I engineered a spatial stitcher that finds horizontally aligned 4-digit boxes and validates them with the Verhoeff checksum.
   * **Noise Filtering:** Built sanitizers to eliminate Government slogans (*"Mera Aadhaar, Meri Pehchan"*), relationship prefixes (*"S/O"*, *"D/O"*, *"W/O"*, *"HOH"*), and website footers (*"uidai.gov.in"*) from bleeding into name and address fields.

### Phase 3: Mobile Client, Networking & Containerization (October 2026 – Ongoing)
* **Mobile Frontend:** Built a clean, minimalist UI using React Native and Expo, inspired by iOS system design patterns (gentle haptics, clear typography, connection health indicators).
* **Network & Multipart Uploads:** Solved a critical Expo SDK 52 bug where the default `fetch` implementation threw `Unsupported FormDataPart` on binary file uploads. Wrote a custom `XMLHttpRequest` multipart uploader that talks directly to native mobile networking stacks.
* **Dockerization:** Containerized the FastAPI backend with multi-stage dependencies (`libgl1`, `libglib2.0-0`, `libzbar0`, and GNU OpenMP `libgomp1`) so the deep learning models can be deployed to any Linux server or cloud environment.
* **WSL2 Networking:** Configured Mirrored Networking (`networkingMode=mirrored`) to bridge physical mobile devices directly to the local development server over local Wi-Fi.

---

## System Architecture

```text
┌────────────────────────────────────────────────────────┐
│             Carta React Native Mobile App             │
│        (Live Camera QR Scanner / Photo Uploader)       │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP Multipart / JSON
                           ▼
┌────────────────────────────────────────────────────────┐
│                 FastAPI Backend Engine                 │
│                                                        │
│  ┌───────────────────────┐    ┌─────────────────────┐  │
│  │   Fast Path (PyZbar)  │    │  OCR Pipeline       │  │
│  │  - QR Detection       │    │  - Orientation Clf  │  │
│  │  - zlib Decompress    │    │  - DBNet Detection  │  │
│  │  - ISO/XML Parsing    │    │  - Text Recognition │  │
│  │  - Photo Extraction   │    │  - Spatial Parser   │  │
│  └───────────┬───────────┘    └──────────┬──────────┘  │
│              │                           │             │
│              └────────────┬──────────────┘             │
│                           ▼                            │
│           Validated JSON Schema (Pydantic)             │
│         { Name, DOB, ID_Number, Address, Photo }       │
└────────────────────────────────────────────────────────┘
```

---

## Tech Stack

* **Backend:** Python 3.12, FastAPI, Uvicorn, PaddleOCR, OpenCV (`opencv-contrib-python`), PyZbar, Pillow, NumPy
* **Frontend:** React Native, Expo SDK, Expo Camera, Expo Image Picker
* **Deployment & Tooling:** Docker, Linux / WSL2, Git

---

## Repository Structure

```text
DL-Extractor/
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   │   ├── document.py      # /api/v1/extract endpoint
│   │   │   └── health.py        # /health connection probe
│   │   ├── services/
│   │   │   ├── ocr_engine.py    # PaddleOCR lifecycle & bounding box parser
│   │   │   ├── qr_decoder.py    # Secure Aadhaar QR decompression & photo decoder
│   │   │   ├── aadhaar_parser.py# Aadhaar-specific regex & spatial rules
│   │   │   └── dl_parser.py     # Driving Licence column & date disambiguation
│   │   ├── schemas.py           # Strict Pydantic response models
│   │   └── main.py              # FastAPI app startup & model pre-warming
│   ├── Dockerfile               # Production container definition
│   ├── requirements.txt         # Pinned Python dependencies
│   └── verify_tests.py          # End-to-end test suite
│
├── frontend/
│   ├── screens/
│   │   ├── HomeScreen.js        # Server health pill & navigation hub
│   │   ├── ScanScreen.js        # Live QR viewfinder with visual frame guide
│   │   └── UploadScreen.js      # Card front/back picker & extraction trigger
│   ├── components/
│   │   └── ResultCard.js        # Extracted data display, copy & share actions
│   ├── utils/
│   │   └── uploader.js          # Native XHR multipart file uploader
│   ├── config.js                # Server base URL configuration
│   └── App.js                   # Application root
│
└── docs/
    └── screenshots/             # Visual previews for documentation
```

---

## Local Setup Guide

### 1. Prerequisites
* **Python 3.10+** (Python 3.12 recommended)
* **Node.js 18+** with `npm`
* **Docker Desktop** (optional, for running containerized)
* **Expo Go** app on your physical mobile phone ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779))

---

### 2. Backend Setup (Native)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:
   ```bash
   # On Linux / WSL2 / macOS:
   python3 -m venv .venv
   source .venv/bin/activate

   # On Windows (PowerShell):
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. Verify the server is running by opening `http://localhost:8000/docs` in your browser.

---

### 3. Backend Setup (Docker)

If you prefer to run the backend inside an isolated container:

```bash
cd backend
docker build -t carta-backend:v1 .
docker run -p 8000:8000 --name carta-api carta-backend:v1
```

---

### 4. Frontend Setup

1. Open a new terminal and navigate to the frontend:
   ```bash
   cd frontend
   npm install
   ```

2. Configure your backend URL in `frontend/config.js`:
   * Find your computer's local Wi-Fi IP address (`ipconfig` on Windows or `ip a` on Linux).
   * Open [frontend/config.js](frontend/config.js) and update:
     ```javascript
     export const API_BASE = "http://YOUR_LOCAL_IP:8000";
     ```
   *(Ensure both your computer and phone are connected to the same Wi-Fi network).*

3. Start the Expo development server:
   ```bash
   npx expo start
   ```

4. Scan the QR code in your terminal using **Expo Go** on Android or the default **Camera app** on iOS.  
   *(Tip: To test directly inside your laptop browser without a phone, press `w` in the terminal).*

---

## Running the Automated Test Suite

The repository includes a comprehensive regression test suite that verifies date parsing, Aadhaar QR decompression, DL expiry disambiguation, and address footer stripping:

```bash
cd backend
python verify_tests.py
```

All 7 test cases will execute and validate the extraction logic against real sample scenarios.

---

## Current Status & Next Steps

- [x] Pre-warmed PaddleOCR models in RAM for sub-second inference
- [x] Aadhaar Secure QR decompressor with base64 portrait extraction
- [x] Multi-column date disambiguation for Indian Driving Licences
- [x] Cross-platform Docker containerization with C library bindings
- [x] Resilient mobile client with live connection health monitoring
- [ ] **In Progress:** Privacy masking toggle (allow users to mask Aadhaar / DOB before sharing)
- [ ] **In Progress:** One-click digital e-Card image export (`react-native-view-shot`)
- [ ] **Planned:** Client-side model quantization (ONNX Runtime) for fully offline on-device extraction
