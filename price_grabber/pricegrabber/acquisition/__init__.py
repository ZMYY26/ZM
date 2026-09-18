"""数据获取层。"""
from .base import BaseFetcher
from .mock import MockFetcher
from .jd import JDFetcher
from .taobao import TaobaoFetcher
from .pdd import PDDFetcher
from .manager import AcquisitionManager

__all__ = [
    "BaseFetcher", "MockFetcher", "JDFetcher", "TaobaoFetcher", "PDDFetcher",
    "AcquisitionManager",
]