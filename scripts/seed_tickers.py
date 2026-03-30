#!/usr/bin/env python3
"""
Hamilton Platform — Ticker Seed Script
Populates the asset_tags table with curated tickers across 4 markets.

Usage:
    pip install yfinance psycopg2-binary python-dotenv pandas
    python scripts/seed_tickers.py

Safe to re-run — uses upsert (INSERT ... ON CONFLICT DO UPDATE).
"""

import os
import sys
import time
from datetime import datetime, timezone

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2-binary not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas not installed. Run: pip install pandas")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    # dotenv optional — env vars may already be set
    load_dotenv = None  # type: ignore

# ─── Config ──────────────────────────────────────────────────────────────────

if load_dotenv:
    # Load from apps/api/.env relative to project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, '..', 'apps', 'api', '.env')
    load_dotenv(env_path)

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set.")
    sys.exit(1)

# Strip Prisma-specific params that psycopg2 doesn't understand
# e.g. ?sslmode=require&channel_binding=require → keep sslmode, drop channel_binding
def clean_db_url(url: str) -> str:
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
    parsed = urlparse(url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    # psycopg2 only understands a subset of params
    allowed = {'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'connect_timeout', 'application_name'}
    filtered = {k: v for k, v in params.items() if k in allowed}
    new_query = urlencode({k: v[0] for k, v in filtered.items()})
    return urlunparse(parsed._replace(query=new_query))


# ─── Ticker Data ─────────────────────────────────────────────────────────────

# Curated S&P 500 — top 200 by market cap (used as fallback when Wikipedia is unavailable)
_SP500_FALLBACK = [
    ('AAPL','Apple Inc.'),('MSFT','Microsoft Corp.'),('NVDA','NVIDIA Corp.'),
    ('AMZN','Amazon.com Inc.'),('GOOGL','Alphabet Inc. Class A'),('GOOG','Alphabet Inc. Class C'),
    ('META','Meta Platforms Inc.'),('TSLA','Tesla Inc.'),('BRK-B','Berkshire Hathaway Class B'),
    ('LLY','Eli Lilly and Co.'),('AVGO','Broadcom Inc.'),('JPM','JPMorgan Chase & Co.'),
    ('V','Visa Inc.'),('XOM','Exxon Mobil Corp.'),('UNH','UnitedHealth Group Inc.'),
    ('MA','Mastercard Inc.'),('JNJ','Johnson & Johnson'),('PG','Procter & Gamble Co.'),
    ('COST','Costco Wholesale Corp.'),('HD','Home Depot Inc.'),('MRK','Merck & Co. Inc.'),
    ('ABBV','AbbVie Inc.'),('CVX','Chevron Corp.'),('CRM','Salesforce Inc.'),
    ('BAC','Bank of America Corp.'),('NFLX','Netflix Inc.'),('AMD','Advanced Micro Devices'),
    ('PEP','PepsiCo Inc.'),('KO','Coca-Cola Co.'),('TMO','Thermo Fisher Scientific'),
    ('ORCL','Oracle Corp.'),('ACN','Accenture PLC'),('CSCO','Cisco Systems Inc.'),
    ('MCD','McDonald\'s Corp.'),('ABT','Abbott Laboratories'),('WMT','Walmart Inc.'),
    ('TXN','Texas Instruments Inc.'),('LIN','Linde PLC'),('DHR','Danaher Corp.'),
    ('NKE','Nike Inc.'),('QCOM','Qualcomm Inc.'),('PM','Philip Morris International'),
    ('NEE','NextEra Energy Inc.'),('RTX','RTX Corp.'),('HON','Honeywell International'),
    ('UPS','United Parcel Service'),('SPGI','S&P Global Inc.'),('AMGN','Amgen Inc.'),
    ('IBM','International Business Machines'),('GE','GE Aerospace'),
    ('CAT','Caterpillar Inc.'),('LOW','Lowe\'s Companies Inc.'),('INTU','Intuit Inc.'),
    ('BA','Boeing Co.'),('ISRG','Intuitive Surgical Inc.'),('NOW','ServiceNow Inc.'),
    ('AMAT','Applied Materials Inc.'),('PLD','Prologis Inc.'),('BLK','BlackRock Inc.'),
    ('GS','Goldman Sachs Group'),('MDLZ','Mondelez International'),('VRTX','Vertex Pharmaceuticals'),
    ('AXP','American Express Co.'),('SYK','Stryker Corp.'),('REGN','Regeneron Pharmaceuticals'),
    ('T','AT&T Inc.'),('CVS','CVS Health Corp.'),('LRCX','Lam Research Corp.'),
    ('ADI','Analog Devices Inc.'),('PANW','Palo Alto Networks'),('MS','Morgan Stanley'),
    ('CI','Cigna Group'),('MU','Micron Technology Inc.'),('KLAC','KLA Corp.'),
    ('BSX','Boston Scientific Corp.'),('CB','Chubb Ltd.'),('C','Citigroup Inc.'),
    ('PGR','Progressive Corp.'),('WFC','Wells Fargo & Co.'),('SNPS','Synopsys Inc.'),
    ('CDNS','Cadence Design Systems'),('ELV','Elevance Health Inc.'),('DE','Deere & Co.'),
    ('ADP','Automatic Data Processing'),('ZTS','Zoetis Inc.'),('BX','Blackstone Inc.'),
    ('TJX','TJX Companies Inc.'),('MMC','Marsh & McLennan'),('MO','Altria Group Inc.'),
    ('CME','CME Group Inc.'),('EQIX','Equinix Inc.'),('SHW','Sherwin-Williams Co.'),
    ('SBUX','Starbucks Corp.'),('DUK','Duke Energy Corp.'),('AON','Aon PLC'),
    ('MCO','Moody\'s Corp.'),('INTC','Intel Corp.'),('USB','US Bancorp'),
    ('SO','Southern Co.'),('ITW','Illinois Tool Works'),('FDX','FedEx Corp.'),
    ('PH','Parker-Hannifin Corp.'),('EMR','Emerson Electric Co.'),('ICE','Intercontinental Exchange'),
    ('ECL','Ecolab Inc.'),('WELL','Welltower Inc.'),('WM','Waste Management Inc.'),
    ('CL','Colgate-Palmolive Co.'),('APH','Amphenol Corp.'),('NSC','Norfolk Southern Corp.'),
    ('NOC','Northrop Grumman Corp.'),('GD','General Dynamics Corp.'),('MAR','Marriott International'),
    ('TGT','Target Corp.'),('PSA','Public Storage'),('EW','Edwards Lifesciences'),
    ('HCA','HCA Healthcare Inc.'),('CARR','Carrier Global Corp.'),('F','Ford Motor Co.'),
    ('GM','General Motors Co.'),('ABNB','Airbnb Inc.'),('UBER','Uber Technologies Inc.'),
    ('LYFT','Lyft Inc.'),('SNAP','Snap Inc.'),('PINS','Pinterest Inc.'),
    ('RBLX','Roblox Corp.'),('HOOD','Robinhood Markets Inc.'),('COIN','Coinbase Global Inc.'),
    ('PLTR','Palantir Technologies'),('PATH','UiPath Inc.'),('DDOG','Datadog Inc.'),
    ('ZS','Zscaler Inc.'),('CRWD','CrowdStrike Holdings'),('NET','Cloudflare Inc.'),
    ('SHOP','Shopify Inc.'),('SNOW','Snowflake Inc.'),('OKTA','Okta Inc.'),
    ('MDB','MongoDB Inc.'),('GTLB','GitLab Inc.'),('HCP','HashiCorp Inc.'),
    ('U','Unity Software Inc.'),('TWLO','Twilio Inc.'),('ZM','Zoom Video Communications'),
    ('DOCU','DocuSign Inc.'),('WDAY','Workday Inc.'),('VEEV','Veeva Systems Inc.'),
    ('HUBS','HubSpot Inc.'),('TTD','Trade Desk Inc.'),('ROKU','Roku Inc.'),
    ('SPOT','Spotify Technology SA'),('BABA','Alibaba Group Holding'),('JD','JD.com Inc.'),
    ('PDD','PDD Holdings Inc.'),('BIDU','Baidu Inc.'),('NIO','NIO Inc.'),
    ('XPEV','XPeng Inc.'),('LI','Li Auto Inc.'),('RIVN','Rivian Automotive'),
    ('LCID','Lucid Group Inc.'),('CHPT','ChargePoint Holdings'),('ENPH','Enphase Energy'),
    ('SEDG','SolarEdge Technologies'),('FSLR','First Solar Inc.'),('RUN','Sunrun Inc.'),
    ('MPW','Medical Properties Trust'),('O','Realty Income Corp.'),('AMT','American Tower Corp.'),
    ('CCI','Crown Castle Inc.'),('SBAC','SBA Communications'),('DLR','Digital Realty Trust'),
    ('IRM','Iron Mountain Inc.'),('VICI','VICI Properties Inc.'),('EPR','EPR Properties'),
    ('WPC','W. P. Carey Inc.'),('KIM','Kimco Realty Corp.'),('SPG','Simon Property Group'),
    ('OHI','Omega Healthcare Investors'),('NNN','NNN REIT Inc.'),
    ('LVS','Las Vegas Sands Corp.'),('MGM','MGM Resorts International'),('WYNN','Wynn Resorts'),
    ('CZR','Caesars Entertainment'),('PENN','PENN Entertainment'),
    ('DAL','Delta Air Lines Inc.'),('UAL','United Airlines Holdings'),('AAL','American Airlines'),
    ('LUV','Southwest Airlines Co.'),('CCL','Carnival Corp.'),('RCL','Royal Caribbean'),
    ('NCLH','Norwegian Cruise Line'),('HLT','Hilton Worldwide Holdings'),('H','Hyatt Hotels'),
    ('WH','Wyndham Hotels & Resorts'),('EXPE','Expedia Group Inc.'),('BKNG','Booking Holdings'),
    ('TRIP','TripAdvisor Inc.'),('DIS','Walt Disney Co.'),('WBD','Warner Bros. Discovery'),
    ('CMCSA','Comcast Corp.'),('PARA','Paramount Global'),('FOX','Fox Corp.'),
    ('FOXA','Fox Corp. Class A'),('NYT','New York Times Co.'),('NWSA','News Corp.'),
]

def get_sp500_tickers() -> list[dict]:
    """Fetch S&P 500 constituent list from Wikipedia, with hardcoded fallback."""
    print("Fetching S&P 500 from Wikipedia...")
    try:
        tables = pd.read_html('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', header=0)
        df = tables[0]
        results = []
        for _, row in df.iterrows():
            ticker = str(row.get('Symbol', '')).strip().replace('.', '-')
            name = str(row.get('Security', '')).strip()
            if ticker and name and ticker != 'nan':
                results.append({
                    'ticker': ticker,
                    'name': name,
                    'market': 'us_stock',
                    'asset_type': 'stock',
                    'currency': 'USD',
                    'exchange': 'NYSE/NASDAQ',
                })
        print(f"  Got {len(results)} S&P 500 stocks from Wikipedia")
        return results
    except Exception as e:
        print(f"  Wikipedia unavailable ({e}), using curated fallback list...")
        results = [
            {
                'ticker': t,
                'name': name,
                'market': 'us_stock',
                'asset_type': 'stock',
                'currency': 'USD',
                'exchange': 'NYSE/NASDAQ',
            }
            for t, name in _SP500_FALLBACK
        ]
        print(f"  Got {len(results)} stocks from fallback list")
        return results


MAJOR_ETFS = [
    ('SPY',  'SPDR S&P 500 ETF Trust',             'USD', 'NYSE Arca'),
    ('QQQ',  'Invesco QQQ Trust',                   'USD', 'NASDAQ'),
    ('IWM',  'iShares Russell 2000 ETF',            'USD', 'NYSE Arca'),
    ('VTI',  'Vanguard Total Stock Market ETF',     'USD', 'NYSE Arca'),
    ('VOO',  'Vanguard S&P 500 ETF',                'USD', 'NYSE Arca'),
    ('GLD',  'SPDR Gold Shares',                    'USD', 'NYSE Arca'),
    ('SLV',  'iShares Silver Trust',                'USD', 'NYSE Arca'),
    ('TLT',  'iShares 20+ Year Treasury Bond ETF',  'USD', 'NASDAQ'),
    ('HYG',  'iShares iBoxx High Yield Corp Bond',  'USD', 'NYSE Arca'),
    ('XLF',  'Financial Select Sector SPDR Fund',   'USD', 'NYSE Arca'),
    ('XLK',  'Technology Select Sector SPDR Fund',  'USD', 'NYSE Arca'),
    ('XLE',  'Energy Select Sector SPDR Fund',      'USD', 'NYSE Arca'),
    ('XLV',  'Health Care Select Sector SPDR Fund', 'USD', 'NYSE Arca'),
    ('XLI',  'Industrial Select Sector SPDR Fund',  'USD', 'NYSE Arca'),
    ('XLY',  'Consumer Discretionary SPDR Fund',    'USD', 'NYSE Arca'),
    ('ARKK', 'ARK Innovation ETF',                  'USD', 'NYSE Arca'),
    ('ARKW', 'ARK Next Generation Internet ETF',    'USD', 'NYSE Arca'),
    ('DIA',  'SPDR Dow Jones Industrial Average',   'USD', 'NYSE Arca'),
    ('EEM',  'iShares MSCI Emerging Markets ETF',   'USD', 'NYSE Arca'),
    ('VNQ',  'Vanguard Real Estate ETF',            'USD', 'NYSE Arca'),
]

def get_etf_tickers() -> list[dict]:
    return [
        {
            'ticker': t,
            'name': name,
            'market': 'us_stock',
            'asset_type': 'etf',
            'currency': currency,
            'exchange': exchange,
        }
        for t, name, currency, exchange in MAJOR_ETFS
    ]


TOP_CRYPTO = [
    ('BTC-USD',  'Bitcoin',          'USD'),
    ('ETH-USD',  'Ethereum',         'USD'),
    ('BNB-USD',  'BNB',              'USD'),
    ('SOL-USD',  'Solana',           'USD'),
    ('XRP-USD',  'XRP',              'USD'),
    ('USDC-USD', 'USD Coin',         'USD'),
    ('ADA-USD',  'Cardano',          'USD'),
    ('AVAX-USD', 'Avalanche',        'USD'),
    ('DOGE-USD', 'Dogecoin',         'USD'),
    ('TRX-USD',  'TRON',             'USD'),
    ('DOT-USD',  'Polkadot',         'USD'),
    ('MATIC-USD','Polygon',          'USD'),
    ('LTC-USD',  'Litecoin',         'USD'),
    ('SHIB-USD', 'Shiba Inu',        'USD'),
    ('LINK-USD', 'Chainlink',        'USD'),
    ('BCH-USD',  'Bitcoin Cash',     'USD'),
    ('UNI-USD',  'Uniswap',          'USD'),
    ('ATOM-USD', 'Cosmos',           'USD'),
    ('XLM-USD',  'Stellar',          'USD'),
    ('ETC-USD',  'Ethereum Classic', 'USD'),
    ('FIL-USD',  'Filecoin',         'USD'),
    ('ALGO-USD', 'Algorand',         'USD'),
    ('ICP-USD',  'Internet Computer','USD'),
    ('APT-USD',  'Aptos',            'USD'),
    ('ARB-USD',  'Arbitrum',         'USD'),
    ('OP-USD',   'Optimism',         'USD'),
    ('SUI-USD',  'Sui',              'USD'),
    ('INJ-USD',  'Injective',        'USD'),
    ('SEI-USD',  'Sei',              'USD'),
    ('NEAR-USD', 'NEAR Protocol',    'USD'),
    ('AAVE-USD', 'Aave',             'USD'),
    ('MKR-USD',  'Maker',            'USD'),
    ('GRT-USD',  'The Graph',        'USD'),
    ('SNX-USD',  'Synthetix',        'USD'),
    ('CRV-USD',  'Curve DAO Token',  'USD'),
    ('COMP-USD', 'Compound',         'USD'),
    ('FTM-USD',  'Fantom',           'USD'),
    ('MANA-USD', 'Decentraland',     'USD'),
    ('SAND-USD', 'The Sandbox',      'USD'),
    ('AXS-USD',  'Axie Infinity',    'USD'),
    ('THETA-USD','Theta Network',    'USD'),
    ('VET-USD',  'VeChain',          'USD'),
    ('EOS-USD',  'EOS',              'USD'),
    ('XTZ-USD',  'Tezos',            'USD'),
    ('EGLD-USD', 'MultiversX',       'USD'),
    ('HBAR-USD', 'Hedera',           'USD'),
    ('QNT-USD',  'Quant',            'USD'),
    ('LDO-USD',  'Lido DAO',         'USD'),
    ('RPL-USD',  'Rocket Pool',      'USD'),
    ('PEPE-USD', 'Pepe',             'USD'),
]

def get_crypto_tickers() -> list[dict]:
    return [
        {
            'ticker': t,
            'name': name,
            'market': 'crypto',
            'asset_type': 'crypto',
            'currency': currency,
            'exchange': 'Crypto',
        }
        for t, name, currency in TOP_CRYPTO
    ]


# Major IDX (Indonesia Stock Exchange) — LQ45 + IDX30 constituents
IDX_STOCKS = [
    ('BBCA.JK',  'Bank Central Asia',               'IDR', 'IDX'),
    ('BBRI.JK',  'Bank Rakyat Indonesia',            'IDR', 'IDX'),
    ('BMRI.JK',  'Bank Mandiri',                     'IDR', 'IDX'),
    ('TLKM.JK',  'Telkom Indonesia',                 'IDR', 'IDX'),
    ('ASII.JK',  'Astra International',              'IDR', 'IDX'),
    ('BBNI.JK',  'Bank Negara Indonesia',            'IDR', 'IDX'),
    ('GOTO.JK',  'GoTo Gojek Tokopedia',             'IDR', 'IDX'),
    ('BYAN.JK',  'Bayan Resources',                  'IDR', 'IDX'),
    ('UNVR.JK',  'Unilever Indonesia',               'IDR', 'IDX'),
    ('HMSP.JK',  'HM Sampoerna',                     'IDR', 'IDX'),
    ('PGAS.JK',  'Perusahaan Gas Negara',            'IDR', 'IDX'),
    ('ANTM.JK',  'Aneka Tambang',                    'IDR', 'IDX'),
    ('PTBA.JK',  'Bukit Asam',                       'IDR', 'IDX'),
    ('INDF.JK',  'Indofood Sukses Makmur',           'IDR', 'IDX'),
    ('ICBP.JK',  'Indofood CBP Sukses Makmur',      'IDR', 'IDX'),
    ('KLBF.JK',  'Kalbe Farma',                      'IDR', 'IDX'),
    ('CPIN.JK',  'Charoen Pokphand Indonesia',       'IDR', 'IDX'),
    ('SMGR.JK',  'Semen Indonesia',                  'IDR', 'IDX'),
    ('INCO.JK',  'Vale Indonesia',                   'IDR', 'IDX'),
    ('MEDC.JK',  'Medco Energi Internasional',      'IDR', 'IDX'),
    ('ADRO.JK',  'Adaro Energy Indonesia',           'IDR', 'IDX'),
    ('MNCN.JK',  'Media Nusantara Citra',            'IDR', 'IDX'),
    ('EXCL.JK',  'XL Axiata',                        'IDR', 'IDX'),
    ('ISAT.JK',  'Indosat',                          'IDR', 'IDX'),
    ('JPFA.JK',  'Japfa Comfeed Indonesia',          'IDR', 'IDX'),
    ('SMRA.JK',  'Summarecon Agung',                 'IDR', 'IDX'),
    ('BRPT.JK',  'Barito Pacific',                   'IDR', 'IDX'),
    ('ITMG.JK',  'Indo Tambangraya Megah',           'IDR', 'IDX'),
    ('PWON.JK',  'Pakuwon Jati',                     'IDR', 'IDX'),
    ('SIDO.JK',  'Industri Jamu Sido Muncul',        'IDR', 'IDX'),
    ('BRIS.JK',  'Bank Syariah Indonesia',           'IDR', 'IDX'),
    ('RAJA.JK',  'Rukun Raharja',                    'IDR', 'IDX'),
    ('HRUM.JK',  'Harum Energy',                     'IDR', 'IDX'),
    ('PGEO.JK',  'Pertamina Geothermal Energy',     'IDR', 'IDX'),
    ('AMMN.JK',  'Amman Mineral Internasional',     'IDR', 'IDX'),
    ('MBMA.JK',  'Merdeka Battery Materials',       'IDR', 'IDX'),
    ('DSSA.JK',  'Dian Swastatika Sentosa',         'IDR', 'IDX'),
    ('MDKA.JK',  'Merdeka Copper Gold',              'IDR', 'IDX'),
    ('AKRA.JK',  'AKR Corporindo',                   'IDR', 'IDX'),
    ('BFIN.JK',  'BFI Finance Indonesia',            'IDR', 'IDX'),
    ('MAPI.JK',  'Mitra Adiperkasa',                 'IDR', 'IDX'),
    ('CMRY.JK',  'Cisarua Mountain Dairy',           'IDR', 'IDX'),
    ('FILM.JK',  'MD Pictures',                      'IDR', 'IDX'),
    ('HEAL.JK',  'Medikaloka Hermina',               'IDR', 'IDX'),
    ('ACES.JK',  'Ace Hardware Indonesia',           'IDR', 'IDX'),
    ('AMRT.JK',  'Sumber Alfaria Trijaya',           'IDR', 'IDX'),
    ('MYOR.JK',  'Mayora Indah',                     'IDR', 'IDX'),
    ('DSNG.JK',  'Dharma Satya Nusantara',          'IDR', 'IDX'),
    ('TOWR.JK',  'Sarana Menara Nusantara',         'IDR', 'IDX'),
    ('TBIG.JK',  'Tower Bersama Infrastructure',    'IDR', 'IDX'),
]

def get_idx_tickers() -> list[dict]:
    return [
        {
            'ticker': t,
            'name': name,
            'market': 'id_stock',
            'asset_type': 'stock',
            'currency': currency,
            'exchange': exchange,
        }
        for t, name, currency, exchange in IDX_STOCKS
    ]


# Major Vietnam stocks — HOSE + HNX blue chips
VN_STOCKS = [
    ('VIC.VN',  'Vingroup',                          'VND', 'HOSE'),
    ('VHM.VN',  'Vinhomes',                          'VND', 'HOSE'),
    ('VNM.VN',  'Vinamilk',                          'VND', 'HOSE'),
    ('VCB.VN',  'Vietcombank',                       'VND', 'HOSE'),
    ('TCB.VN',  'Techcombank',                       'VND', 'HOSE'),
    ('BID.VN',  'BIDV',                              'VND', 'HOSE'),
    ('CTG.VN',  'VietinBank',                        'VND', 'HOSE'),
    ('HPG.VN',  'Hoa Phat Group',                   'VND', 'HOSE'),
    ('MSN.VN',  'Masan Group',                      'VND', 'HOSE'),
    ('MWG.VN',  'Mobile World Group',               'VND', 'HOSE'),
    ('FPT.VN',  'FPT Corporation',                  'VND', 'HOSE'),
    ('VPB.VN',  'VPBank',                            'VND', 'HOSE'),
    ('STB.VN',  'Sacombank',                         'VND', 'HOSE'),
    ('ACB.VN',  'Asia Commercial Bank',              'VND', 'HNX'),
    ('MBB.VN',  'MB Bank',                           'VND', 'HOSE'),
    ('GAS.VN',  'PV Gas',                            'VND', 'HOSE'),
    ('PLX.VN',  'Petrolimex',                        'VND', 'HOSE'),
    ('POW.VN',  'PV Power',                          'VND', 'HOSE'),
    ('PNJ.VN',  'PNJ Jewelry',                       'VND', 'HOSE'),
    ('HDB.VN',  'HDBank',                            'VND', 'HOSE'),
    ('EIB.VN',  'Eximbank',                          'VND', 'HOSE'),
    ('VJC.VN',  'Vietjet Air',                       'VND', 'HOSE'),
    ('HVN.VN',  'Vietnam Airlines',                  'VND', 'HOSE'),
    ('REE.VN',  'Refrigeration Electrical Engineering','VND','HOSE'),
    ('DXG.VN',  'Dat Xanh Group',                   'VND', 'HOSE'),
    ('NVL.VN',  'Novaland',                          'VND', 'HOSE'),
    ('PDR.VN',  'Phat Dat Real Estate',             'VND', 'HOSE'),
    ('KDH.VN',  'Khang Dien House',                 'VND', 'HOSE'),
    ('DGC.VN',  'Ducgiang Chemicals',               'VND', 'HOSE'),
    ('GEX.VN',  'Gelex Group',                      'VND', 'HOSE'),
    ('HSG.VN',  'Hoa Sen Group',                    'VND', 'HOSE'),
    ('NKG.VN',  'Nam Kim Steel',                    'VND', 'HOSE'),
    ('TDM.VN',  'Thu Duc Water Supply',             'VND', 'HOSE'),
    ('BWE.VN',  'Binh Duong Water Environment',    'VND', 'HOSE'),
    ('PC1.VN',  'Power Construction No.1',          'VND', 'HOSE'),
    ('TCM.VN',  'Thanh Cong Textile',               'VND', 'HOSE'),
    ('VGC.VN',  'Viglacera',                         'VND', 'HOSE'),
    ('SHB.VN',  'Saigon-Hanoi Bank',                'VND', 'HOSE'),
    ('LPB.VN',  'LienVietPostBank',                 'VND', 'HOSE'),
    ('OCB.VN',  'Orient Commercial Bank',           'VND', 'HOSE'),
    ('SSI.VN',  'SSI Securities',                   'VND', 'HOSE'),
    ('VCI.VN',  'Viet Capital Securities',          'VND', 'HOSE'),
    ('HCM.VN',  'Ho Chi Minh City Securities',      'VND', 'HOSE'),
    ('VND.VN',  'VNDirect Securities',              'VND', 'HOSE'),
    ('DIG.VN',  'DIC Corp',                         'VND', 'HOSE'),
    ('CII.VN',  'CII Infrastructure',               'VND', 'HOSE'),
    ('BCM.VN',  'Binh Duong Industrial Zones',     'VND', 'HOSE'),
    ('IJC.VN',  'IDICO Infrastructure',             'VND', 'HOSE'),
    ('ITA.VN',  'Tan Tao Investment Industry',     'VND', 'HOSE'),
    ('PAN.VN',  'PAN Group',                        'VND', 'HOSE'),
]

def get_vn_tickers() -> list[dict]:
    return [
        {
            'ticker': t,
            'name': name,
            'market': 'vn_stock',
            'asset_type': 'stock',
            'currency': currency,
            'exchange': exchange,
        }
        for t, name, currency, exchange in VN_STOCKS
    ]


# ─── Database Upsert ─────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO asset_tags (id, ticker, name, market, asset_type, currency, exchange, last_synced_at, created_at)
VALUES (
    gen_random_uuid()::text,
    %(ticker)s,
    %(name)s,
    %(market)s::"Market",
    %(asset_type)s::"AssetType",
    %(currency)s,
    %(exchange)s,
    %(last_synced_at)s,
    %(last_synced_at)s
)
ON CONFLICT (ticker) DO UPDATE SET
    name           = EXCLUDED.name,
    market         = EXCLUDED.market,
    asset_type     = EXCLUDED.asset_type,
    currency       = EXCLUDED.currency,
    exchange       = EXCLUDED.exchange,
    last_synced_at = EXCLUDED.last_synced_at;
"""

def upsert_batch(cursor, rows: list[dict], now: datetime) -> int:
    records = [
        {
            'ticker': r['ticker'].upper(),
            'name': r['name'],
            'market': r['market'],
            'asset_type': r['asset_type'],
            'currency': r.get('currency'),
            'exchange': r.get('exchange'),
            'last_synced_at': now,
        }
        for r in rows
        if r.get('ticker') and r.get('name')
    ]
    if not records:
        return 0
    for rec in records:
        cursor.execute(UPSERT_SQL, rec)
    return len(records)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Hamilton Ticker Seed Script")
    print("=" * 50)

    conn = psycopg2.connect(clean_db_url(DATABASE_URL))
    conn.autocommit = False
    cursor = conn.cursor()
    now = datetime.now(timezone.utc)

    totals: dict[str, int] = {}

    try:
        # US Stocks (S&P 500)
        sp500 = get_sp500_tickers()
        n = upsert_batch(cursor, sp500, now)
        totals['us_stock (S&P 500)'] = n

        # US ETFs
        etfs = get_etf_tickers()
        n = upsert_batch(cursor, etfs, now)
        totals['us_stock (ETFs)'] = n

        # Crypto
        print("Loading crypto tickers...")
        crypto = get_crypto_tickers()
        n = upsert_batch(cursor, crypto, now)
        totals['crypto'] = n
        print(f"  Got {n} crypto tickers")

        # Indonesia (IDX)
        print("Loading IDX tickers...")
        idx = get_idx_tickers()
        n = upsert_batch(cursor, idx, now)
        totals['id_stock (IDX)'] = n
        print(f"  Got {n} IDX tickers")

        # Vietnam
        print("Loading Vietnam tickers...")
        vn = get_vn_tickers()
        n = upsert_batch(cursor, vn, now)
        totals['vn_stock'] = n
        print(f"  Got {n} Vietnam tickers")

        conn.commit()

        print("\n" + "=" * 50)
        print("Seed complete — records inserted/updated:")
        total = 0
        for market, count in totals.items():
            print(f"  {market:<30} {count:>5}")
            total += count
        print(f"  {'TOTAL':<30} {total:>5}")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    main()
