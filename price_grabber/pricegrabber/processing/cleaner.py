"""清洗、去重、规整、排序。"""
from __future__ import annotations

import re

from ..models import Product


def clean_price(value, default: float = 0.0) -> float:
    """把各种价格字符串规整为 float。"""
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if not value:
        return default
    m = re.search(r"\d+\.?\d*", str(value).replace(",", ""))
    try:
        return round(float(m.group(0)), 2) if m else default
    except (ValueError, AttributeError):
        return default


def normalize_title(title: str) -> str:
    """标题归一化：去空格/符号/大小写，用于去重比对。"""
    if not title:
        return ""
    t = re.sub(r"[\s｜|·•【】\[\]（）()/\\\-\.,，。；;]+", "", title).lower()
    return t


def clean_products(products: list[Product]) -> list[dict]:
    """清洗并去重：剔除无效价格、按 (平台, 标题) 去重、过滤脏数据。"""
    seen: set[str] = set()
    cleaned: list[dict] = []

    for p in products:
        price = clean_price(p.price)
        sales = int(p.sales) if p.sales and p.sales > 0 else 0
        rating = round(float(p.rating), 1) if (p.rating and 0 < float(p.rating) <= 5) else 0.0
        if price <= 0:
            continue
        norm = normalize_title(p.title)
        key = (p.platform, norm)
        if key in seen:
            continue
        seen.add(key)

        cleaned.append({
            "title": p.title,
            "price": price,
            "original_price": clean_price(p.original_price) or price,
            "sales": sales,
            "rating": rating,
            "discount": round(price / (clean_price(p.original_price) or price), 2),
            "shop": p.shop,
            "platform": p.platform,
            "url": p.url,
            "sku": p.sku,
            "warehouse": p.warehouse,
        })

    return cleaned


def sort_by_price(cleaned: list[dict], ascending: bool = True) -> list[dict]:
    """按价格升序（默认）排序，并写入按价格排名的 rank（1 起）。"""
    out = sorted(cleaned, key=lambda x: (x["price"], -x["rating"], -x["sales"]),
                 reverse=not ascending)
    for i, x in enumerate(out, 1):
        x["rank"] = i
    return out