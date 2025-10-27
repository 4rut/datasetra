def _import(name_options):
    for name in name_options:
        try:
            mod = __import__(name, fromlist=["*"])
            return mod
        except Exception:
            continue
    raise ImportError(f"None of the modules could be imported: {name_options}")

csv_ops_mod = _import(["app.services.csv_ops", "csv_ops"])
parse_csv_text = getattr(csv_ops_mod, "parse_csv_text")
filter_sort_rows = getattr(csv_ops_mod, "filter_sort_rows")


def test_parse_csv_text_basic():
    src = "id;name;price\n1;Mouse;19.99\n2;Keyboard;79.90\n"
    item = parse_csv_text(src)
    assert item.delimiter in (",", ";", "\t", "|")
    assert item.columns == ["id", "name", "price"]
    assert len(item.rows) == 2
    assert item.rows[0]["id"] == "1"
    assert item.rows[1]["price"] == "79.90"


def test_filter_sort_rows_projection_search_and_sort():
    rows = [
        {"id": "1", "product": "Wireless Mouse", "price": "19.99"},
        {"id": "2", "product": "Mechanical Keyboard", "price": "79.90"},
        {"id": "3", "product": "USB-C Hub", "price": "24.50"},
        {"id": "4", "product": "27\" Monitor", "price": "199.00"},
        {"id": "5", "product": "USB Flash", "price": "12"},
    ]
    filtered = filter_sort_rows(rows, columns=None, query="usb", sort_by=None, sort_dir="asc")
    assert len(filtered) == 2

    projected = filter_sort_rows(rows, columns=["id", "price"], query=None, sort_by=None, sort_dir="asc")
    assert list(projected[0].keys()) == ["id", "price"]

    asc = filter_sort_rows(rows, columns=None, query=None, sort_by="price", sort_dir="asc")
    prices = [float(r["price"].replace(",", ".")) for r in asc]
    assert prices == sorted(prices)

    desc = filter_sort_rows(rows, columns=None, query=None, sort_by="price", sort_dir="desc")
    prices_desc = [float(r["price"].replace(",", ".")) for r in desc]
    assert prices_desc == sorted(prices_desc, reverse=True)
