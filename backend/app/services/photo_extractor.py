"""
Portrait Photo Extraction Layer.

Runs after orientation normalization and before OCR/extraction. Locates the
cardholder's photo on an ID document via face detection, crops a padded
region around it, and compresses the result to a small Base64-ready payload.

Known limitations (real, not hypothetical):
- Uses OpenCV's bundled Haar Cascade frontal-face detector, not a deep
  learning model — keeps this dependency-free and fast on CPU, but it is
  less accurate than modern detectors on low-quality scans, extreme angles,
  or partially obscured photos. Expect some misses on poor photos.
- The crop is expanded from the detected face box using fixed multipliers
  to approximate typical ID-photo framing (head + shoulders). Actual card
  layouts vary, so this is an approximation, not a pixel-exact crop of the
  printed photo box.
- Returns None (not a wrong/empty crop) when no face is confidently
  detected — callers should surface this as a warning, not fabricate data.
"""

import io
import logging
from typing import Optional

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

_FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

# Standard ICAO/Indian passport photo aspect ratio (width:height = 3:4)
PASSPORT_ASPECT_RATIO = 0.75
TARGET_OUTPUT_WIDTH = 300
TARGET_OUTPUT_HEIGHT = 400


def _detect_largest_face(cv_gray: np.ndarray):
    """
    Detects the cardholder's face using OpenCV Haar Cascade.
    Scales image down to ~640px width for near-instant (20-30ms) evaluation,
    then maps the bounding box back to original coordinates.
    """
    h, w = cv_gray.shape
    det_w = 640
    scale = det_w / float(w) if w > det_w else 1.0

    if scale < 1.0:
        det_h = int(h * scale)
        small_gray = cv2.resize(cv_gray, (det_w, det_h), interpolation=cv2.INTER_AREA)
    else:
        small_gray = cv_gray
        scale = 1.0

    # 1. Enhance contrast to cut through watermarks and laminate glare
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced_gray = clahe.apply(small_gray)

    min_dim = max(30, int(45 * scale))

    # Pass 1: standard detection
    faces = _FACE_CASCADE.detectMultiScale(
        enhanced_gray, scaleFactor=1.1, minNeighbors=4, minSize=(min_dim, min_dim)
    )

    # Pass 2: relaxed for low contrast / tilted IDs
    if len(faces) == 0:
        faces = _FACE_CASCADE.detectMultiScale(
            enhanced_gray, scaleFactor=1.05, minNeighbors=3, minSize=(min_dim - 5, min_dim - 5)
        )

    if len(faces) == 0:
        return None

    # Pick largest face by area
    best = max(faces, key=lambda f: f[2] * f[3])
    bx, by, bw, bh = best

    # Map back to original image space
    orig_x = int(round(bx / scale))
    orig_y = int(round(by / scale))
    orig_w = int(round(bw / scale))
    orig_h = int(round(bh / scale))

    return (orig_x, orig_y, orig_w, orig_h)


def _crop_with_margin(img: Image.Image, face_box) -> Image.Image:
    """
    Crops a standard passport-format (3:4 ratio) portrait centered around the face.
    Provides ~35% headroom above forehead and ~55% neck/collar space below chin.
    """
    fx, fy, fw, fh = face_box
    img_w, img_h = img.size

    # Face center
    cx = fx + (fw / 2.0)
    cy = fy + (fh / 2.0)

    # Calculate 3:4 crop box where face occupies ~55% of portrait height
    crop_h = fh * 1.85
    crop_w = crop_h * PASSPORT_ASPECT_RATIO

    # Position: top has headroom (~35% of face height above detected box)
    top = fy - (fh * 0.35)
    bottom = top + crop_h
    left = cx - (crop_w / 2.0)
    right = left + crop_w

    # Adjust if bounds exceed image boundaries
    if top < 0:
        bottom = min(img_h, bottom - top)
        top = 0
    if bottom > img_h:
        shift = bottom - img_h
        top = max(0, top - shift)
        bottom = img_h

    if left < 0:
        right = min(img_w, right - left)
        left = 0
    if right > img_w:
        shift = right - img_w
        left = max(0, left - shift)
        right = img_w

    i_left, i_top = max(0, int(left)), max(0, int(top))
    i_right, i_bottom = min(img_w, int(right)), min(img_h, int(bottom))

    if i_right <= i_left or i_bottom <= i_top:
        return img.crop((fx, fy, fx + fw, fy + fh))

    cropped = img.crop((i_left, i_top, i_right, i_bottom))
    # Resize to crisp standardized passport resolution
    return cropped.resize((TARGET_OUTPUT_WIDTH, TARGET_OUTPUT_HEIGHT), Image.Resampling.BICUBIC)


def _compress_to_target(img: Image.Image) -> bytes:
    """Encodes cropped portrait as a sharp, compact JPEG (~15-25 KB)."""
    img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()


def extract_portrait_photo(img: Image.Image) -> Optional[bytes]:
    """
    Detects and crops the cardholder's photo from an orientation-normalized
    document image. Returns compressed JPEG bytes (~10-30KB), or None if no
    face could be confidently detected.
    """
    try:
        gray = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2GRAY)
        face_box = _detect_largest_face(gray)
        if face_box is None:
            return None

        cropped = _crop_with_margin(img, face_box)
        return _compress_to_target(cropped)
    except Exception as e:
        logger.warning(f"Photo extraction failed: {e}")
        return None