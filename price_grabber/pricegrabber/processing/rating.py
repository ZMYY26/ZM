"""性价比评分与推荐标注。

采用「无监督归一化评分」：在同一批搜索结果内，对价格(越低越好)、
销量(越高越好)、店铺评分(越高越好)分别做 min-max 归一化，
加权合成 0-100 分，并给出可读推荐标签。
    score = 0.50 * price_score + 0.25 * sales_score + 0.25 * rating_score
"""
from __future__ import annotations

from typing import Callable

# 恒定权重，可微调
W_PRICE = 0.50
W_SALES = 0.25
W_RATING = 0.25


def _norm(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return max(0.0, min(1.0, (value - low) / (high - low)))


def _label(score: float) -> str:
    if score >= 85:
        return "性价比之王"
    if score >= 70:
        return "超值推荐"
    if score >= 55:
        return "均衡之选"
    if score >= 40:
        return "表现平平"
    return "溢价偏高"


def score_products(cleaned: list[dict]) -> list[dict]:
    """给每条记录打性价比分并标注，写入 score / score_label（保持原顺序不变）。"""
    if not cleaned:
        return cleaned

    prices = [x["price"] for x in cleaned]
    sales = [x["sales"] for x in cleaned]
    ratings = [x["rating"] for x in cleaned]

    pmin, pmax = min(prices), max(prices)
    smin, smax = min(sales), max(sales)
    rmin, rmax = min(ratings) if ratings else 0, max(ratings) if ratings else 5

    scored = []
    for x in cleaned:
        price_s = _norm(pmax - x["price"], 0, max(pmax - pmin, 1e-9))
        sales_s = _norm(x["sales"], smin, smax)
        rating_s = _norm(x["rating"], rmin, rmax)
        score = round(100 * (W_PRICE * price_s + W_SALES * sales_s + W_RATING * rating_s), 1)
        scored.append({**x, "score": score, "score_label": _label(score)})
    return scored


def pick_best(scored: list[dict]) -> dict | None:
    """返回综合性价比最高（同分取价格最低）的一条。"""
    if not scored:
        return None
    return max(scored, key=lambda x: (x["score"], -x["price"]))