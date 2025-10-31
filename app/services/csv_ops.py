import csv
import io
from typing import Any, List, Optional, Literal

from .store import CSVItem


def sniff_delimiter(sample_text: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample_text, delimiters=",;\t|")
        return dialect.delimiter
    except Exception:
        return ","


def parse_csv_text(text: str) -> CSVItem:
    text_stream = io.StringIO(text)
    head = text[:4096]
    delimiter = sniff_delimiter(head)

    try:
        has_header = csv.Sniffer().has_header(head)
    except Exception:
        has_header = True

    reader = csv.reader(text_stream, delimiter=delimiter)
    rows_raw = [row for row in reader if any(cell.strip() != "" for cell in row)]
    if not rows_raw:
        raise ValueError("Empty CSV")

    if has_header:
        columns = [c if c != "" else f"col_{i + 1}" for i, c in enumerate(rows_raw[0])]
        data_rows = rows_raw[1:]
    else:
        width = max(len(r) for r in rows_raw)
        columns = [f"col_{i + 1}" for i in range(width)]
        data_rows = rows_raw

    normalized = []
    for r in data_rows:
        normalized.append({columns[i]: (r[i] if i < len(r) else "") for i in range(len(columns))})

    return CSVItem(columns=columns, rows=normalized, delimiter=delimiter)


def filter_sort_rows(
        rows: List[dict],
        columns: Optional[List[str]],
        query: Optional[str],
        sort_by: Optional[str],
        sort_dir: Literal["asc", "desc"] = "asc",
) -> List[dict]:
    if query:
        q = query.lower()
        if columns:
            filtered = [r for r in rows if any(q in str(r.get(c, "")).lower() for c in columns)]
        else:
            filtered = [r for r in rows if any(q in str(val).lower() for val in r.values())]
    else:
        filtered = rows

    if sort_by:
        def _key(v: Any):
            s = str(v.get(sort_by, ""))
            try:
                return float(s.replace(",", "."))
            except Exception:
                return s.lower()

        reverse = sort_dir == "desc"
        filtered = sorted(filtered, key=_key, reverse=reverse)

    if columns:
        projected = [{c: r.get(c, "") for c in columns} for r in filtered]
    else:
        projected = filtered

    return projected
