import io
import csv
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _import(name_options):
    for name in name_options:
        try:
            mod = __import__(name, fromlist=["*"])
            return mod
        except Exception:
            continue
    raise ImportError(f"None of the modules could be imported: {name_options}")


def make_app() -> FastAPI:
    try:
        factory = _import(["app.factory"])
        return factory.create_app()
    except Exception:
        api_mod = _import(["app.routers.api", "app.api", "api"])
        app = FastAPI(title="Datasetra Test App")
        app.include_router(api_mod.router)
        return app


def make_csv(rows=120):
    header = ["id", "name", "price"]
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(header)
    for i in range(1, rows + 1):
        w.writerow([i, f"Item {i}", f"{i/10:.2f}"])
    return out.getvalue()


def upload_sample(client: TestClient, rows=120):
    content = make_csv(rows).encode("utf-8")
    files = {"file": ("sample.csv", content, "text/csv")}
    r = client.post("/api/upload", files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "file_id" in data
    assert data["columns"] == ["id", "name", "price"]
    assert data["total_rows"] == rows
    assert len(data.get("preview", [])) <= 100
    return data["file_id"]


def test_upload_paginate_column_subset_sort_and_download():
    app = make_app()
    client = TestClient(app)

    file_id = upload_sample(client, rows=123)

    payload = {
        "file_id": file_id,
        "query": None,
        "columns": None,
        "sort_by": None,
        "sort_dir": "asc",
        "limit": 25,
        "offset": 25,
    }
    r = client.post("/api/filter", json=payload)
    assert r.status_code == 200, r.text
    page = r.json()
    assert page["total"] == 123
    assert page["offset"] == 25
    assert page["limit"] == 25
    assert len(page["rows"]) == 25

    payload.update({"columns": ["id", "price"], "sort_by": "price", "sort_dir": "desc", "offset": 0})
    r = client.post("/api/filter", json=payload)
    assert r.status_code == 200
    page = r.json()
    assert page["columns"] == ["id", "price"]
    assert list(page["rows"][0].keys()) == ["id", "price"]

    dl_payload = {k: payload[k] for k in ["file_id", "query", "columns", "sort_by", "sort_dir"]}
    r = client.post("/api/download", json=dl_payload)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/csv")
    assert "attachment; filename=" in r.headers.get("content-disposition", "")

    csv_text = r.text
    first_line = csv_text.splitlines()[0]
    assert first_line.strip().split(",") == ["id", "price"]
