"""
FundSphere Grant Scraper and Delta Monitor Module
"""

try:
    from .firecrawl_scraper import scrape_grant, crawl_for_grants
except ImportError:
    from firecrawl_scraper import scrape_grant, crawl_for_grants

__all__ = ["scrape_grant", "crawl_for_grants"]
