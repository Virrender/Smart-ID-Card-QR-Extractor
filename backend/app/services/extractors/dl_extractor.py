"""
Phase 1: Deterministic Driving Licence Extractor.

Responsibilities:
- Consume a List[OCRBlock].
- Generate and rank candidates using spatial geometry and anchors.
- Validate candidates using structural/format rules.
- Construct the final DrivingLicenceResponse.
"""

import re
from typing import List, Optional, Tuple, Literal

from app.schemas import (
    OCRBlock, ExtractedField,
    DrivingLicenceFrontFields, DrivingLicenceBackFields, DrivingLicenceResponse
)
from app.services.spatial_utils import find_blocks_to_right, find_blocks_below
from app.services.common_extractors import (
    FieldCandidate, compute_composite_score, is_label_boundary,
    parse_calendar_date, is_valid_name_part, extract_address, extract_pin_code,
    gate_by_confidence
)


class DrivingLicenceExtractor:

    def extract(
        self,
        blocks: List[OCRBlock],
        pages_processed: Optional[List[Literal["front", "back"]]] = None
    ) -> DrivingLicenceResponse:
        front_blocks = [b for b in blocks if b.page_source == "front"]
        back_blocks = [b for b in blocks if b.page_source == "back"]

        if not blocks:
            return DrivingLicenceResponse(
                status="failed",
                missing_fields=["id_number", "name", "dob"],
                pages_processed=pages_processed if pages_processed is not None else [],
                warnings=["No OCR text blocks available for extraction."]
            )

        warnings: List[str] = []

        # Extract Front
        id_number = self._extract_id_number(front_blocks)
        if not id_number and back_blocks:
            # Fallback: Indian state DLs (e.g. Himachal Pradesh, Karnataka) frequently print
            # the primary DL number or endorsement number on the back card.
            id_number = self._extract_id_number(back_blocks)

        dob = self._extract_date(front_blocks, ["dob", "date of birth", "d.o.b", "d.o.b."])
        name = self._extract_name(front_blocks, ["name", "holder name"])
        relative_name = self._extract_relative_name(front_blocks)
        blood_group = self._extract_blood_group(front_blocks)
        issue_date = self._extract_date(front_blocks, ["date of issue", "issue date", "issued on", "doi"], is_issue_date=True)
        expiry_date = self._extract_date(front_blocks, ["valid till", "validity", "expiry date", "exp date"], is_expiry_date=True)

        # Cross-field integrity: DLs have DOB, Issue Date, and Expiry Date.
        # If issue_date or expiry_date are missing or collided, use date ordering (Issue < Expiry).
        dob_val = dob.value if dob else None
        other_dates = []
        for b in front_blocks:
            ok, d = parse_calendar_date(b.text)
            if ok and d != dob_val:
                other_dates.append((d, b))

        unique_dates = sorted(list({d: b for d, b in other_dates}.items()), key=lambda x: x[0])
        if len(unique_dates) >= 2:
            earlier_date, earlier_blk = unique_dates[0]
            later_date, later_blk = unique_dates[-1]
            if not issue_date or (expiry_date and issue_date.value == expiry_date.value):
                issue_date = ExtractedField(
                    value=earlier_date,
                    ocr_confidence=earlier_blk.ocr_confidence,
                    anchor_matched=True,
                    format_valid=True,
                    composite_score=compute_composite_score(earlier_blk.ocr_confidence, True, True),
                    raw_text=earlier_blk.text,
                    bounding_box=earlier_blk.rect,
                    source_page="front"
                )
            if not expiry_date:
                expiry_date = ExtractedField(
                    value=later_date,
                    ocr_confidence=later_blk.ocr_confidence,
                    anchor_matched=True,
                    format_valid=True,
                    composite_score=compute_composite_score(later_blk.ocr_confidence, True, True),
                    raw_text=later_blk.text,
                    bounding_box=later_blk.rect,
                    source_page="front"
                )

        # Extract Back
        address = extract_address(back_blocks, source_page="back")
        pin_code = extract_pin_code(back_blocks, address, source_page="back")

        # Confidence gating — drop anything below threshold instead of
        # silently returning a low-confidence guess as if it were solid.
        id_number, w1 = gate_by_confidence(id_number)
        name, w2 = gate_by_confidence(name)
        dob, w3 = gate_by_confidence(dob)
        relative_name, w4 = gate_by_confidence(relative_name)
        blood_group, w5 = gate_by_confidence(blood_group)
        issue_date, w6 = gate_by_confidence(issue_date)
        expiry_date, w7 = gate_by_confidence(expiry_date)
        address, w8 = gate_by_confidence(address)
        pin_code, w9 = gate_by_confidence(pin_code)
        warnings.extend(w for w in [w1, w2, w3, w4, w5, w6, w7, w8, w9] if w)

        front_fields = DrivingLicenceFrontFields(
            id_number=id_number, name=name, dob=dob,
            father_or_husband_name=relative_name, blood_group=blood_group,
            issue_date=issue_date, expiry_date=expiry_date
        )
        back_fields = DrivingLicenceBackFields(address=address, pin_code=pin_code) if back_blocks else None

        missing = []
        if not id_number: missing.append("id_number")
        if not name: missing.append("name")
        if not dob: missing.append("dob")

        status: Literal["success", "partial", "failed"] = "success"
        if len(missing) == 3:
            status = "failed"
        elif len(missing) > 0:
            status = "partial"

        if pages_processed is not None:
            processed = pages_processed
        else:
            processed = []
            if front_blocks: processed.append("front")
            if back_blocks: processed.append("back")

        return DrivingLicenceResponse(
            status=status,
            front=front_fields,
            back=back_fields,
            missing_fields=missing,
            pages_processed=processed,
            warnings=warnings
        )

    # ------------------------------------------------------------------------
    # FIELD EXTRACTION METHODS
    # ------------------------------------------------------------------------

    def _extract_id_number(self, blocks: List[OCRBlock]) -> Optional[ExtractedField]:
        anchors = ["dl no", "dl number", "driving licence", "licence no", "license no", "dl. no"]
        candidates: List[FieldCandidate] = []

        def validate_id(text: str) -> Tuple[bool, str]:
            t_upper = text.upper()
            # Reject address words, authority labels, and geographic entities
            if any(stop in t_upper for stop in [
                "PRADESH", "PERSONAL", "HOUSE", "STREET", "ROAD", "SECTOR",
                "NAGAR", "COLONY", "DISTRICT", "HIMACHAL", "SIGNATURE", "AUTHORITY", "SIGN"
            ]):
                return False, text

            clean = re.sub(r'[^A-Z0-9]', '', t_upper)
            # Indian DL format: 2-letter State Code + 2-digit RTO Code + number (e.g. HP91 20240000388 or DL0420110012345)
            if 10 <= len(clean) <= 18 and re.match(r'^[A-Z]{2}\d{2}[0-9A-Z]{6,14}$', clean):
                return True, clean
            if 10 <= len(clean) <= 18 and re.match(r'^[A-Z]{2}\d{2,}', clean) and sum(c.isdigit() for c in clean) >= 7:
                return True, clean
            return False, text

        for block in blocks:
            t = block.text.lower()
            matched_anchor = next((a for a in anchors if a in t), None)
            if matched_anchor:
                remainder = t.split(matched_anchor, 1)[1].strip(" :,-")
                if remainder:
                    val_ok, norm = validate_id(remainder)
                    candidates.append(FieldCandidate(remainder, norm, [block], "inline", 0.0, block.ocr_confidence, val_ok))

                rights = find_blocks_to_right(block, blocks, max_distance=200)
                for r in rights[:3]:
                    val_ok, norm = validate_id(r.text)
                    candidates.append(FieldCandidate(r.text, norm, [r], "right", r.rect[0] - block.rect[2], r.ocr_confidence, val_ok))

                belows = find_blocks_below(block, blocks, vertical_limit=50, require_horizontal_overlap=True)
                for b in belows[:3]:
                    val_ok, norm = validate_id(b.text)
                    candidates.append(FieldCandidate(b.text, norm, [b], "below", b.rect[1] - block.rect[3], b.ocr_confidence, val_ok))

        if not candidates:
            for block in blocks:
                val_ok, norm = validate_id(block.text)
                if val_ok:
                    candidates.append(FieldCandidate(block.text, norm, [block], "fallback", 999.0, block.ocr_confidence, True))

        # Check for adjacent split blocks (e.g., ['HP91', '20240000388'])
        if not candidates:
            sorted_blocks = sorted(blocks, key=lambda b: (round(b.center[1] / 20.0), b.rect[0]))
            for i in range(len(sorted_blocks) - 1):
                b1 = sorted_blocks[i]
                b2 = sorted_blocks[i + 1]
                # Same horizontal line and reasonable spacing
                if abs(b1.center[1] - b2.center[1]) < 20 and (0 <= (b2.rect[0] - b1.rect[2]) <= 80):
                    combined = f"{b1.text.strip()} {b2.text.strip()}"
                    val_ok, norm = validate_id(combined)
                    if val_ok:
                        avg_conf = (b1.ocr_confidence + b2.ocr_confidence) / 2.0
                        candidates.append(FieldCandidate(combined, norm, [b1, b2], "fallback", 500.0, avg_conf, True))

        if not candidates:
            return None

        candidates.sort(key=lambda c: c.sort_key(), reverse=True)
        best = candidates[0]

        if not best.format_valid:
            return None

        bx = (
            min(b.rect[0] for b in best.source_blocks),
            min(b.rect[1] for b in best.source_blocks),
            max(b.rect[2] for b in best.source_blocks),
            max(b.rect[3] for b in best.source_blocks),
        )

        return ExtractedField(
            value=best.normalized_value,
            ocr_confidence=best.ocr_confidence,
            anchor_matched=(best.anchor_relation != "fallback"),
            format_valid=best.format_valid,
            composite_score=compute_composite_score(best.ocr_confidence, best.anchor_relation != "fallback", best.format_valid),
            raw_text=best.raw_text,
            bounding_box=bx,
            source_page=best.source_blocks[0].page_source
        )

    def _extract_date(
        self,
        blocks: List[OCRBlock],
        anchors: List[str],
        is_issue_date: bool = False,
        is_expiry_date: bool = False
    ) -> Optional[ExtractedField]:
        import datetime
        candidates: List[FieldCandidate] = []
        today_str = datetime.date.today().strftime("%Y-%m-%d")

        for block in blocks:
            t = block.text.lower()
            matched_anchor = next((a for a in anchors if a in t), None)
            if matched_anchor:
                remainder = t.split(matched_anchor, 1)[1].strip(" :,-")
                if remainder:
                    val_ok, norm = parse_calendar_date(remainder)
                    if val_ok:
                        candidates.append(FieldCandidate(remainder, norm, [block], "inline", 0.0, block.ocr_confidence, True))

                # When scanning right, STOP if we hit another column anchor (e.g. 'Validity')
                rights = find_blocks_to_right(block, blocks, max_distance=200)
                for r in rights:
                    if is_label_boundary(r.text):
                        break
                    val_ok, norm = parse_calendar_date(r.text)
                    if val_ok:
                        candidates.append(FieldCandidate(r.text, norm or r.text, [r], "right", r.rect[0] - block.rect[2], r.ocr_confidence, True))

                # When scanning below, tolerate moderate column offset across card layouts
                belows = find_blocks_below(block, blocks, vertical_limit=140, require_horizontal_overlap=True, overlap_tolerance=80.0)
                for b in belows[:3]:
                    val_ok, norm = parse_calendar_date(b.text)
                    if val_ok:
                        candidates.append(FieldCandidate(b.text, norm or b.text, [b], "below", b.rect[1] - block.rect[3], b.ocr_confidence, True))

        if is_issue_date:
            # An issue date cannot be in the future
            valid_issue = [c for c in candidates if c.normalized_value <= today_str]
            if valid_issue:
                candidates = valid_issue

        if not candidates:
            return None

        candidates.sort(key=lambda c: c.sort_key(), reverse=True)
        best = candidates[0]

        if not best.format_valid:
            return None

        return ExtractedField(
            value=best.normalized_value,
            ocr_confidence=best.ocr_confidence,
            anchor_matched=True,
            format_valid=True,
            composite_score=compute_composite_score(best.ocr_confidence, True, True),
            raw_text=best.raw_text,
            bounding_box=best.source_blocks[0].rect,
            source_page="front"
        )

    def _extract_name(self, blocks: List[OCRBlock], anchors: List[str]) -> Optional[ExtractedField]:
        candidates: List[FieldCandidate] = []

        def gather_multi_word(start_blocks: List[OCRBlock]) -> Tuple[str, List[OCRBlock]]:
            texts = []
            srcs = []
            for blk in start_blocks:
                if not is_valid_name_part(blk.text):
                    break
                texts.append(blk.text.strip(" :,-"))
                srcs.append(blk)
            return " ".join(texts), srcs

        for block in blocks:
            t = block.text.lower()
            if any(rel in t for rel in ["father", "husband", "mother", "s/o", "w/o", "d/o"]):
                continue

            matched_anchor = next((a for a in anchors if a in t), None)
            if matched_anchor:
                remainder = t.split(matched_anchor, 1)[1].strip(" :,-")
                remainder = re.sub(r'^(of)\b', '', remainder, flags=re.IGNORECASE).strip(" :,-")

                if remainder and is_valid_name_part(remainder):
                    candidates.append(FieldCandidate(remainder, remainder.upper(), [block], "inline", 0.0, block.ocr_confidence, True))

                rights = find_blocks_to_right(block, blocks, max_distance=200)
                if rights:
                    val, srcs = gather_multi_word(rights)
                    if val:
                        conf = sum(b.ocr_confidence for b in srcs) / len(srcs)
                        candidates.append(FieldCandidate(val, val.upper(), srcs, "right", rights[0].rect[0] - block.rect[2], conf, True))

                belows = find_blocks_below(block, blocks, vertical_limit=50, require_horizontal_overlap=True)
                if belows:
                    val, srcs = gather_multi_word(belows)
                    if val:
                        conf = sum(b.ocr_confidence for b in srcs) / len(srcs)
                        candidates.append(FieldCandidate(val, val.upper(), srcs, "below", belows[0].rect[1] - block.rect[3], conf, True))

        if not candidates:
            return None

        candidates.sort(key=lambda c: c.sort_key(), reverse=True)
        best = candidates[0]

        bx = (min(b.rect[0] for b in best.source_blocks), min(b.rect[1] for b in best.source_blocks),
              max(b.rect[2] for b in best.source_blocks), max(b.rect[3] for b in best.source_blocks))

        return ExtractedField(
            value=best.normalized_value,
            ocr_confidence=best.ocr_confidence,
            anchor_matched=True,
            format_valid=True,
            composite_score=compute_composite_score(best.ocr_confidence, True, True),
            raw_text=best.raw_text,
            bounding_box=bx,
            source_page="front"
        )

    def _extract_relative_name(self, blocks: List[OCRBlock]) -> Optional[ExtractedField]:
        anchors = [
            "father", "father name", "father's name",
            "husband", "husband name", "husband's name",
            "s/w/d", "s/d/w", "s/o", "d/o", "w/o",
            "son of", "wife of", "daughter of"
        ]
        candidates: List[FieldCandidate] = []

        def gather_multi_word(start_blocks: List[OCRBlock]) -> Tuple[str, List[OCRBlock]]:
            texts = []
            srcs = []
            for blk in start_blocks:
                if not is_valid_name_part(blk.text):
                    break
                texts.append(blk.text.strip(" :,-"))
                srcs.append(blk)
            return " ".join(texts), srcs

        for block in blocks:
            t = block.text.lower()
            matched_anchor = next((a for a in anchors if a in t), None)
            if matched_anchor:
                remainder = t.split(matched_anchor, 1)[1].strip(" :,-")
                remainder = re.sub(r'^(name|of)\b', '', remainder, flags=re.IGNORECASE).strip(" :,-")

                if remainder and is_valid_name_part(remainder):
                    candidates.append(FieldCandidate(remainder, remainder.upper(), [block], "inline", 0.0, block.ocr_confidence, True))

                rights = find_blocks_to_right(block, blocks, max_distance=200)
                if rights:
                    val, srcs = gather_multi_word(rights)
                    if val:
                        conf = sum(b.ocr_confidence for b in srcs) / len(srcs)
                        candidates.append(FieldCandidate(val, val.upper(), srcs, "right", rights[0].rect[0] - block.rect[2], conf, True))

                belows = find_blocks_below(block, blocks, vertical_limit=50, require_horizontal_overlap=True)
                if belows:
                    val, srcs = gather_multi_word(belows)
                    if val:
                        conf = sum(b.ocr_confidence for b in srcs) / len(srcs)
                        candidates.append(FieldCandidate(val, val.upper(), srcs, "below", belows[0].rect[1] - block.rect[3], conf, True))

        if not candidates:
            return None

        candidates.sort(key=lambda c: c.sort_key(), reverse=True)
        best = candidates[0]

        bx = (min(b.rect[0] for b in best.source_blocks), min(b.rect[1] for b in best.source_blocks),
              max(b.rect[2] for b in best.source_blocks), max(b.rect[3] for b in best.source_blocks))

        return ExtractedField(
            value=best.normalized_value,
            ocr_confidence=best.ocr_confidence,
            anchor_matched=True,
            format_valid=True,
            composite_score=compute_composite_score(best.ocr_confidence, True, True),
            raw_text=best.raw_text,
            bounding_box=bx,
            source_page="front"
        )

    def _extract_blood_group(self, blocks: List[OCRBlock]) -> Optional[ExtractedField]:
        anchors = ["blood group", "blood", "bg"]
        bg_pattern = r'\b(A|B|AB|[O0])[\s]*[\(\[]?(\+|\-|pos|neg|positive|negative)'
        candidates: List[FieldCandidate] = []

        def parse_bg(text: str) -> Optional[str]:
            m = re.search(bg_pattern, text, re.IGNORECASE)
            if m:
                grp = m.group(1).upper().replace('0', 'O')
                sign = m.group(2).upper().replace('POS', '+').replace('NEG', '-')
                return grp + sign
            return None

        for block in blocks:
            t = block.text.lower()
            matched_anchor = next((a for a in anchors if a in t), None)
            if matched_anchor:
                remainder = t.split(matched_anchor, 1)[1].strip(" :,-")
                if remainder:
                    val = parse_bg(remainder)
                    if val:
                        candidates.append(FieldCandidate(remainder, val, [block], "inline", 0.0, block.ocr_confidence, True))

                rights = find_blocks_to_right(block, blocks, max_distance=150)
                for r in rights[:2]:
                    val = parse_bg(r.text)
                    if val:
                        candidates.append(FieldCandidate(r.text, val, [r], "right", r.rect[0] - block.rect[2], r.ocr_confidence, True))

                belows = find_blocks_below(block, blocks, vertical_limit=50, require_horizontal_overlap=True)
                for b in belows[:2]:
                    val = parse_bg(b.text)
                    if val:
                        candidates.append(FieldCandidate(b.text, val, [b], "below", b.rect[1] - block.rect[3], b.ocr_confidence, True))

        if not candidates:
            for block in blocks:
                val = parse_bg(block.text)
                if val:
                    candidates.append(FieldCandidate(block.text, val, [block], "fallback", 999.0, block.ocr_confidence, True))

        if not candidates:
            return None

        candidates.sort(key=lambda c: c.sort_key(), reverse=True)
        best = candidates[0]

        return ExtractedField(
            value=best.normalized_value,
            ocr_confidence=best.ocr_confidence,
            anchor_matched=(best.anchor_relation != "fallback"),
            format_valid=True,
            composite_score=compute_composite_score(best.ocr_confidence, best.anchor_relation != "fallback", True),
            raw_text=best.raw_text,
            bounding_box=best.source_blocks[0].rect,
            source_page="front"
        )