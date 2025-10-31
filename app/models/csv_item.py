from typing import List, Dict
from pydantic import BaseModel


class CSVItem(BaseModel):
    columns: List[str]
    rows: List[Dict[str, str]]
    delimiter: str
