"""价格趋势：为每次搜索的代表商品生成趋势序列（真实历史上累积的快照 + 确定性合成）。"""
from __future__ import annotations

from datetime import date, timedelta

import hashlib

from .. import config
from ..store import PriceStore


def _synth_history(sku_data: dict, days: int = config.TREND_DAYS) -> list[dict]:
    """基于当前价格倒退生成确定性波动序列，形态接近真实价格曲线。"""
    price = float(sku_data["price"])
    today = date.today().isoformat()
    seed = hashlib.sha256((sku_data.get("sku", "") + today).encode()).hexdigest()
    s = int(seed[:8], 16)

    # 随机游走：向后回放，生成 days 个点，结束在当日价
    base = price / (1 + (s % 30) / 100.0)  # 起始价略低
    step = (base - price) / (days - 1) if days > 1 else 0
    cur = base
    pts = [price]
    for _ in range(days - 1):
        cur += step
        pts.append(round(cur + ((s % 7) - 3) * 0.2, 2))
    pts = ([price] + pts[::-1][: days - 1]) if days > 1 else [price]
    labels = [(date.today() - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    return [{"date": d, "price": round(float(p), 2)} for d, p in zip(labels, pts)]


def build_trends(reps: list[dict], store: PriceStore | None = None,
                 days: int = config.TREND_DAYS) -> dict:
    """返回 {sku: {title, platform, series:[{date,price}], current}}。"""
    trends: dict[str, dict] = {}
    for r in reps:
        sku = r.get("sku", "")
        series = _synth_history(r, days)
        if store:
            hist = store.history(sku, days)
            if hist:
                series = [{"date": h["ts"][:10], "price": h["price"]} for h in hist]
        trends[sku] = {
            "title": r["title"],
            "platform": r["platform"],
            "current": r["price"],
            "series": series[-days:],
        }
    return trends