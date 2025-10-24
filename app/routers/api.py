import csv
import io
import uuid
from typing import List, Optional, Literal, Any

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from ..services.store import store
from ..services.csv_ops import parse_csv_text, filter_sort_rows
from ..models.csv_item import CSVItem

router = APIRouter(prefix="/api", tags=["api"])


class FilterRequest(BaseModel):
    file_id: str = Field(...)
    query: Optional[str] = Field(None)
    columns: Optional[List[str]] = Field(None)
    sort_by: Optional[str] = Field(None)
    sort_dir: Optional[Literal["asc", "desc"]] = Field("asc")
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


class DownloadRequest(BaseModel):
    file_id: str
    query: Optional[str] = None
    columns: Optional[List[str]] = None
    sort_by: Optional[str] = None
    sort_dir: Optional[Literal["asc", "desc"]] = "asc"


@router.post("/upload")
async def upload_csv(file: UploadFile):
    content = await file.read()
    try:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")
        item = parse_csv_text(text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    file_id = str(uuid.uuid4())
    store.put(file_id, item)

    return JSONResponse({
        "file_id": file_id,
        "columns": item.columns,
        "total_rows": len(item.rows),
        "delimiter": item.delimiter,
        "preview": item.rows[:100],
    })


@router.post("/filter")
async def filter_api(payload: FilterRequest):
    item = store.get(payload.file_id)
    if item is None:
        raise HTTPException(status_code=404, detail="file_id not found or expired")

    columns = payload.columns or None
    if columns is not None:
        bad = [c for c in columns if c not in item.columns]
        if bad:
            raise HTTPException(status_code=400, detail=f"Unknown columns: {bad}")

    filtered = filter_sort_rows(
        rows=item.rows,
        columns=columns,
        query=payload.query,
        sort_by=payload.sort_by,
        sort_dir=payload.sort_dir or "asc",
    )
    total = len(filtered)
    start = payload.offset
    end = min(start + payload.limit, total)
    page = filtered[start:end]

    return JSONResponse({
        "columns": columns if columns else item.columns,
        "total": total,
        "offset": start,
        "limit": payload.limit,
        "rows": page
    })


@router.post("/download")
async def download_api(payload: DownloadRequest):
    item = store.get(payload.file_id)
    if item is None:
        raise HTTPException(status_code=404, detail="file_id not found or expired")

    columns = payload.columns or item.columns
    bad = [c for c in columns if c not in item.columns]
    if bad:
        raise HTTPException(status_code=400, detail=f"Unknown columns: {bad}")

    filtered = filter_sort_rows(
        rows=item.rows,
        columns=columns,
        query=payload.query,
        sort_by=payload.sort_by,
        sort_dir=payload.sort_dir or "asc",
    )

    def generate():
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns, delimiter=item.delimiter)
        writer.writeheader()
        for r in filtered:
            writer.writerow({c: r.get(c, "") for c in columns})
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    filename = f"filtered_{payload.file_id[:8]}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sample")
def sample():
    columns = ["id", "product", "category", "price", "in_stock"]
    rows = [
        {"id": "1", "product": "Wireless Mouse", "category": "Peripherals", "price": "19.99", "in_stock": "true"},
        {"id": "2", "product": "Mechanical Keyboard", "category": "Peripherals", "price": "79.90", "in_stock": "false"},
        {"id": "3", "product": "USB-C Hub", "category": "Adapters", "price": "24.50", "in_stock": "true"},
        {"id": "4", "product": "27\" Monitor", "category": "Displays", "price": "199.00", "in_stock": "true"},
        {"id": "5", "product": "Webcam Pro", "category": "Peripherals", "price": "59.00", "in_stock": "true"},
        {"id": "6", "product": "HDMI Cable 2m", "category": "Cables", "price": "7.49", "in_stock": "true"},
        {"id": "7", "product": "Laptop Stand", "category": "Accessories", "price": "29.00", "in_stock": "false"},
        {"id": "8", "product": "NVMe SSD 1TB", "category": "Storage", "price": "89.99", "in_stock": "true"},
        {"id": "9", "product": "USB Flash 64GB", "category": "Storage", "price": "12.00", "in_stock": "true"},
        {"id": "10", "product": "Bluetooth Speaker", "category": "Audio", "price": "39.95", "in_stock": "false"},
    ]
    from ..services.store import store, CSVItem
    import uuid
    file_id = str(uuid.uuid4())
    store.put(file_id, CSVItem(columns=columns, rows=rows, delimiter=","))

    return JSONResponse({
        "file_id": file_id,
        "columns": columns,
        "total_rows": len(rows),
        "delimiter": ",",
        "preview": rows[:100],
    })
