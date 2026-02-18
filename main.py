from apify_client import ApifyClient
from anthropic import Anthropic
import yfinance as yf
from dotenv import load_dotenv
import os

load_dotenv()
print("Testing connections...\n")

# Test 1: Apify
try:
    client = ApifyClient(os.getenv("APIFY_API_TOKEN"))
    me = client.user("me").get()
    print(f"✅ Apify connected! Username: {me['username']}")
except Exception as e:
    print(f"❌ Apify failed: {e}")

# Test 2: Anthropic
try:
    ant = Anthropic()
    msg = ant.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=10,
        messages=[{"role": "user", "content": "Say OK"}]
    )
    print(f"✅ Anthropic connected! Response: {msg.content[0].text}")
except Exception as e:
    print(f"❌ Anthropic failed: {e}")

# Test 3: Stock prices
try:
    nvda = yf.Ticker("NVDA").fast_info
    print(f"✅ yfinance works! NVDA price: ${nvda['lastPrice']:.2f}")
except Exception as e:
    print(f"❌ yfinance failed: {e}")

print("\n🚀 All systems go. Ready to build.")