import threading
from collections import OrderedDict
from typing import Optional, List, Dict

from pydantic import BaseModel
from ..models.csv_item import CSVItem


class LRUStore:
    def __init__(self, capacity: int = 20):
        self.capacity = capacity
        self.data: "OrderedDict[str, CSVItem]" = OrderedDict()
        self.lock = threading.Lock()

    def put(self, key: str, value: CSVItem):
        with self.lock:
            if key in self.data:
                self.data.move_to_end(key)
            self.data[key] = value
            if len(self.data) > self.capacity:
                self.data.popitem(last=False)

    def get(self, key: str) -> Optional[CSVItem]:
        with self.lock:
            item = self.data.get(key)
            if item is not None:
                self.data.move_to_end(key)
            return item


# Global in-memory store instance
store = LRUStore(capacity=20)
