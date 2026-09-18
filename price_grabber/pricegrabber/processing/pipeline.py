"""搜索流水线：采集 → 清洗 → 排序 → 评分 → 对比 → 趋势 → 摘要。

作为 CLI 与 Web 服务的共用核心逻辑。
"""
from __future__ import annotations

from datetime import datetime

from ..acquisition import AcquisitionManager
from ..store import PriceStore
from .cleaner import clean_products, sort_by_price
from .compare import build_comparison, representatives
from .rating import score_products, pick_best
from .trends import build_trends


def analyze(keyword: str, per_platform: int = 5, real: bool = False,
            platforms=None, store: PriceStore | None = None, keep: int = 30) -> dict:
    """执行一次完整分析，返回可直接 JSON 化的结果字典。"""
    mgr = AcquisitionManager(keyword, per_platform=per_platform, real=real, platforms=platforms)
    sources, products, mode = mgr.fetch()

    cleaned = clean_products(products)
    cleaned = sort_by_price(cleaned)
    cleaned = score_products(cleaned)          # 写入 score / label / rank
    cleaned = cleaned[:keep] if keep else cleaned

    # 平价代表商品（横向对比 + 趋势用）
    reps = representatives(cleaned)
    comparison = build_comparison(cleaned)
    trends = build_trends(reps, store)

    # 持久化快照，累积历史趋势
    if store:
        now = datetime.now().isoformat(timespec="seconds")
        for x in cleaned:
            store.save_snapshot(keyword, x, now)

    best = pick_best(cleaned)
    cheapest = min(cleaned, key=lambda x: x["price"]) if cleaned else None

    summary = {
        "mode": mode,
        "keyword": keyword,
        "total": len(cleaned),
        "platforms": sorted({x["platform"] for x in cleaned}),
        "best": best,
        "cheapest": cheapest,
        "avg_price": round(sum(x["price"] for x in cleaned) / len(cleaned), 2) if cleaned else 0.0,
        "sources": [s.to_dict() for s in sources],
        "time": datetime.now().isoformat(timespec="seconds"),
    }

    return {
        "keyword": keyword,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "mode": mode,
        "sources": [s.to_dict() for s in sources],
        "products": cleaned,
        "representatives": reps,
        "trends": trends,
        "comparison": comparison,
        "summary": summary,
    }