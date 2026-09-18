"""本地存储：SQLite 保存每次搜索的商品快照，支撑价格趋势分析。

每次操作独立打开连接，保证 FastAPI 多线程环境下线程安全。
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager

from . import config


class PriceStore:
    def __init__(self, db_path: str | None = None):
        config.ensure_dirs()
        self.db_path = db_path or str(config.DB_PATH)
        self._init_schema()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS price_snapshots (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    keyword    TEXT,
                    sku        TEXT,
                    title      TEXT,
                    platform   TEXT,
                    url        TEXT,
                    price      REAL,
                    sales      INTEGER,
                    rating     REAL,
                    ts         TEXT,
                    raw        TEXT
                )"""
            )

    def save_snapshot(self, keyword: str, product: dict, ts: str) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO price_snapshots
                   (keyword, sku, title, platform, url, price, sales, rating, ts, raw)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (keyword, product.get("sku", ""), product.get("title", ""),
                 product.get("platform", ""), product.get("url", ""),
                 product.get("price", 0.0), product.get("sales", 0),
                 product.get("rating", 0.0), ts,
                 json.dumps(product, ensure_ascii=False)),
            )

    def history(self, sku: str, days: int = 14) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                """SELECT ts, price, sales FROM price_snapshots
                   WHERE sku = ? ORDER BY ts ASC""", (sku,)
            ).fetchall()
        out = [{"ts": r[0], "price": r[1], "sales": r[2]} for r in rows]
        return out[-days:]

    def close(self) -> None:
        # 无长连接，无需关闭
        pass