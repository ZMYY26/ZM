"""Mock 采集器。

真实电商平台（京东/淘宝/拼多多）反爬严格，脚本在无授权网络或
断网环境下无法拿到数据。为了让命令行工具与演示网页在任何环境都能
"现场运行"，这里用关键词做种子的确定性伪随机数据生成器，
产出形态与真实数据一致的商品（名称/价格/销量/评分/店铺/链接/价格趋势）。
同样一段输入在同一天产生同一结果，跨天产生轻微波动以模拟真实市场。
"""
from __future__ import annotations

import hashlib
import re
import time
from datetime import date
from urllib.parse import quote

from .. import config
from ..models import Product, PlatformSource
from .base import BaseFetcher


class _Seeded:
    """确定性伪随机数生成器（基于 HMAC 种子）。"""

    def __init__(self, seed: str):
        self.h = hashlib.sha256(seed.encode("utf-8")).digest()
        self.idx = 0

    def unit(self) -> float:
        """返回 (0,1) 均匀随机数。"""
        n = int.from_bytes(self.h[self.idx % len(self.h):self.idx % len(self.h) + 2], "big")
        self.idx += 2
        return (n % 10000) / 10000

    def choice(self, seq):
        return seq[int(self.unit() * len(seq)) % len(seq)]

    def range(self, low, high):
        return low + self.unit() * (high - low)


# 平台相关品牌 / 店铺池（仅用于模拟数据，非真实商家）
_BRANDS = ["华耀", "量子", "飞利浦Pro", "栖息", "极麦", "蓝鲸智联",
           "悦尚", "坤鹏", "海之韵", "星驰", "睿芯", "普朗特"]


class MockFetcher(BaseFetcher):
    platform = "mock"

    def search(self, keyword: str, limit: int = config.DEFAULT_PER_PLATFORM) -> PlatformSource:
        kw = (keyword or "默认商品").strip()
        # 用 HASH(keyword, 日期) 作为全局种子，保证"同一天稳定、跨天波动"
        seed = hashlib.sha256(f"{kw}|{date.today().isoformat()}".encode()).hexdigest()
        rng = _Seeded(seed)

        products: list[Product] = []
        price_base = _guess_price_level(keyword, rng)

        for plat in config.PLATFORMS:
            pseed = _Seeded(f"{kw}|{plat}|{date.today().isoformat()}")
            for i in range(limit):
                brand = pseed.choice(_BRANDS)
                spec = pseed.choice(["标准版", "Pro 高配版", "青春版", "Ultra 顶配版",
                                     "Plus 增强版", "mini 精巧款"])
                model = f"{brand}{kw[:6]}{spec}"
                factor = 0.95 + pseed.unit() * 0.15          # 平台间价差
                price = _round2(price_base * factor * (0.75 + pseed.unit() * 0.5))
                original = _round2(price * (1.05 + pseed.unit() * 0.25))
                sales = int(pseed.range(30, 220000))
                rating = round(4.0 + pseed.unit() * 1.0, 1)
                shop = pseed.choice(["旗舰店", "专卖店", "自营店", "优选店", "直营官方店"])
                shop = f"{plat}_{brand}{shop}"
                sku = f"{plat}-{hashlib.md5(f'{model}{shop}{price}'.encode()).hexdigest()[:12]}"
                url = _build_url(plat, kw, sku)

                products.append(Product(
                    title=model, price=price, original_price=original,
                    sales=sales, rating=rating, shop=shop, platform=plat,
                    url=url, sku=sku,
                    warehouse=pseed.choice(["北京", "上海", "广州", "武汉", "成都", "沈阳", "西安"]),
                ))

        return PlatformSource(platform="mock", succeeded=True, count=len(products),
                              message="Mock 数据源（演示模式）", products=products)


def _guess_price_level(keyword: str, rng: _Seeded) -> float:
    """根据关键词猜一个量级，让数据更真实。"""
    low = 19.9
    high = 1599.0
    k = keyword.lower()
    if any(x in k for x in ["手", "phone", "手机", "相机", "电脑", "笔记本", "电视", "平板", "平板电脑"]):
        low, high = 899.0, 8999.0
    elif any(x in k for x in ["鞋", "衣服", "t恤", "女装", "男装", "包包", "口红"]):
        low, high = 39.9, 899.0
    elif any(x in k for x in ["耳机", "音响", "音箱", "耳机", "鼠标", "键盘", "充电"]):
        low, high = 29.9, 1299.0
    return _round2(rng.range(low, high))


def _round2(v: float) -> float:
    return round(v, 2)


def _build_url(plat: str, keyword: str, sku: str) -> str:
    q = quote(keyword)
    if plat == "京东":
        return f"https://item.jd.com/{sku[-10:]}.html"
    if plat == "淘宝":
        return f"https://item.taobao.com/item.htm?id={'9' * 8}{sku[-4:]}"
    return f"https://mobile.yangkeduo.com/goods.html?goods_id={sku[-10:]}"