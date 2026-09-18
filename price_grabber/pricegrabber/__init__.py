"""电商商品价格自动化采集与对比工具。

分层架构：
    acquisition  -- 数据获取层（多平台抓取器 + Mock/degradation 模式）
    processing   -- 数据处理层（清洗 / 去重 / 排序 / 趋势 / 性价比评分）
    store        -- 本地存储层（SQLite 价格历史，用于趋势分析）
    cli          -- 命令行入口
    server       -- FastAPI 服务（驱动演示网页）
"""

__version__ = "1.0.0"