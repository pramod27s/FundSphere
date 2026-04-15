import sys
sys.path.append("/Users/divansingh/Documents/FundSphere/ai-service")
from scrape.utils import parse_currency_and_amount
from scrape.extractor import find_funding_info

text = """Emolument * Consolidated amount of Rs. 1,20,000/- per month 2 Research Grant Rs. 7,00,000/- per annum 3 Overheads Rs. 1,00,000/- per annum"""

print("Utils:", parse_currency_and_amount(text))
print("Extractor:", find_funding_info(text))
