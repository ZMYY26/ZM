"""商品横向对比：跨平台汇总 + 每平台代表商品。"""
from __future__ import annotations

from collections import defaultdict

from .. import config
from .cleaner import sort_by_price


def aggregate_by_platform(cleaned: list[dict]) -> list[dict]:
    """按平台聚合：数量 / 最低平均最高价 / 平均销量 / 平均评分。"""
    groups: dict[str, list[dict]] = defaultdict(list)
    for x in cleaned:
        groups[x["platform"]].append(x)

    rows = []
    for plat in config.PLATFORMS:
        items = groups.get(plat, [])
        if not items:
            rows.append({"platform": plat, "count": 0})
            continue
        prices = [i["price"] for i in items]
        rows.append({
            "platform": plat,
            "count": len(items),
            "min_price": round(min(prices), 2),
            "avg_price": round(sum(prices) / len(prices), 2),
            "max_price": round(max(prices), 2),
            "avg_sales": int(sum(i["sales"] for i in items) / len(items)),
            "avg_rating": round(sum(i["rating"] for i in items) / len(items), 1),
        })
    return rows


def representatives(cleaned: list[dict]) -> list[dict]:
    """每个平台选一条"可比代表商品"（同关键词下各平台最低价且口碑较好）。

    用于横向对比表与价格趋势图。规则：先按 (score 降序, price 升序) 排序，
    取每个平台第一条。
    """
    by_platform: dict[str, list[dict]] = defaultdict(list)
    for x in cleaned:
        by_platform[x["platform"]].append(x)
    reps = []
    for plat in config.PLATFORMS:
        items = by_platform.get(plat, [])
        if not items:
            continue
        items_sorted = sort_by_price(items)
        # 取最便宜 + 评分尚可的一条
        cheap = min(items_sorted, key=lambda i: (i["price"], -i["rating"]))
        reps.append(cheap)
    return reps


def build_comparison(cleaned: list[dict]) -> dict:
    """汇总：聚合表 + 代表商品列表 + 摘要文本。"""
    rows = aggregate_by_platform(cleaned)
    reps = representatives(cleaned)
    return {"aggregate": rows, "representatives": reps}