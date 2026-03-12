import json


def encode_text_for_storage(value: str) -> str:
    text = "" if value is None else str(value)
    if not text:
        return ""
    return json.dumps(text, ensure_ascii=True)


def decode_text_from_storage(value: str) -> str:
    text = "" if value is None else str(value)
    if not text:
        return ""

    stripped = text.strip()
    if stripped.startswith('"') and stripped.endswith('"'):
        try:
            decoded = json.loads(stripped)
            if isinstance(decoded, str):
                return decoded
        except Exception:
            pass

    repair_candidates = (
        ('latin1', 'utf-8'),
        ('latin1', 'gbk'),
        ('cp1252', 'utf-8'),
        ('cp1252', 'gbk'),
    )

    for source_encoding, target_encoding in repair_candidates:
        try:
            repaired = text.encode(source_encoding).decode(target_encoding)
            if repaired:
                return repaired
        except Exception:
            continue

    return text
