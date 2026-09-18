"""数据模型：产品 / 搜索结果 / 平台源。"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional


@dataclass
class Product:
    """单条商品数据。"""
    title: str                     # 商品名称
    price: float                   # 现价（元）
    original_price: Optional[float] = None  # 划线价/原价
    sales: int = 0                 # 销量（件，近30天）
    rating: float = 0.0            # 店铺评分（0-5）
    shop: str = ""                 # 店铺名称
    platform: str = ""             # 来源平台：京东/淘宝/拼多多
    url: str = ""                  # 商品链接
    sku: str = ""                  # 去重用的商品标识（标题+规格归一化）
    warehouse: str = ""            # 发货地/仓库（可选）
    fetched_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PlatformSource:
    """某个平台的采集快照。"""
    platform: str
    succeeded: bool
    count: int
    message: str = ""
    products: list[Product] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "platform": self.platform,
            "succeeded": self.succeeded,
            "count": self.count,
            "message": self.message,
        }


@dataclass
class SearchResult:
    """一次关键词搜索的完整结果。"""
    keyword: str
    generated_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    mode: str = "mock"             # real / mock / mixed
    sources: list[PlatformSource] = field(default_factory=list)
    products: list[Product] = field(default_factory=list)
    cleaned: list[dict] = field(default_factory=list)      # 清洗后结果（含评分/标注）
    samples: list[dict] = field(default_factory=list)      # 筛选出的代表商品
    trends: dict = field(default_factory=dict)             # 价格趋势
    comparison: dict = field(default_factory=dict)         # 横向对比汇总
    summary: dict = field(default_factory=dict)            # 摘要