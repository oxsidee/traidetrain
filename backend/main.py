from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
import requests
import time

from database import engine, get_db, Base
from models import User, Portfolio, Transaction, Favorite

Base.metadata.create_all(bind=engine)

DEFAULT_STOCKS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "META", "NVDA", "NFLX", "SBER.ME", "GAZP.ME", "LKOH.ME", "YDEX.ME"]

# Currency pairs for conversion (base is USD)
CURRENCY_PAIRS = {
    "RUB": "USDRUB=X",
    "EUR": "USDEUR=X", 
    "GBP": "USDGBP=X",
    "CNY": "USDCNY=X",
}

_currency_cache = {}
_currency_cache_time = 0

# Yahoo Finance proxy with full browser-like headers
YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
}

def is_moex_symbol(symbol: str) -> bool:
    """Check if symbol is from MOEX exchange"""
    if ".ME" in symbol.upper():
        return True
    symbol_clean = symbol.upper().replace('.ME', '')
    moex_tickers = ['SBER', 'GAZP', 'LKOH', 'GMKN', 'ROSN', 'TATN', 'MGNT', 'NVTK', 'ALRS', 'PLZL', 'CHMF', 'SNGS', 'SNGSP', 'MOEX', 'VTBR', 'YNDX', 'POLY', 'PIKK', 'AFLT', 'RUAL', 'NLMK', 'MTSS', 'FIVE', 'OZON', 'TCSG', 'VKCO']
    return symbol_clean in moex_tickers

def moex_quote(symbol: str):
    """Fetch real-time quote from MOEX ISS API"""
    symbol_clean = symbol.upper().replace('.ME', '')
    
    # Get current market data
    url = f"https://iss.moex.com/iss/engines/stock/markets/shares/securities/{symbol_clean}.json"
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        
        # Get marketdata (real-time prices)
        marketdata = data.get("marketdata", {})
        md_columns = marketdata.get("columns", [])
        md_rows = marketdata.get("data", [])
        
        # Get securities info (static data)
        securities = data.get("securities", {})
        sec_columns = securities.get("columns", [])
        sec_rows = securities.get("data", [])
        
        if not md_rows or not sec_rows:
            raise HTTPException(503, f"No MOEX data for {symbol_clean}")
        
        # Find the TQBR board (main trading board)
        md_row = None
        sec_row = None
        for i, row in enumerate(md_rows):
            board_idx = md_columns.index("BOARDID") if "BOARDID" in md_columns else 0
            if row[board_idx] == "TQBR":
                md_row = row
                break
        
        for i, row in enumerate(sec_rows):
            board_idx = sec_columns.index("BOARDID") if "BOARDID" in sec_columns else 1
            if row[board_idx] == "TQBR":
                sec_row = row
                break
        
        if not md_row:
            md_row = md_rows[0]
        if not sec_row:
            sec_row = sec_rows[0]
        
        # Parse marketdata
        def get_md(col):
            return md_row[md_columns.index(col)] if col in md_columns else None
        
        def get_sec(col):
            return sec_row[sec_columns.index(col)] if col in sec_columns else None
        
        price = get_md("LAST") or get_md("LCURRENTPRICE") or get_sec("PREVPRICE") or 0
        prev_close = get_sec("PREVPRICE") or price
        open_price = get_md("OPEN") or prev_close
        high = get_md("HIGH") or price
        low = get_md("LOW") or price
        volume = get_md("VOLTODAY") or 0
        
        change_day = ((price - prev_close) / prev_close * 100) if prev_close and price else 0
        
        # Check if market is open (has recent trades)
        trade_status = get_md("TRADINGSTATUS")
        market_state = "REGULAR" if trade_status == "T" else "CLOSED"
        
        # Get name and currency
        name = get_sec("SECNAME") or get_sec("SHORTNAME") or symbol_clean
        currency_id = get_sec("CURRENCYID") or "SUR"  # SUR = Russian Ruble
        currency = "RUB" if currency_id in ["SUR", "RUB"] else currency_id
        
        return {
            "symbol": f"{symbol_clean}.ME",
            "name": name,
            "price": round(float(price), 2) if price else 0,
            "change": round(change_day, 2),
            "prev_close": round(float(prev_close), 2) if prev_close else 0,
            "open": round(float(open_price), 2) if open_price else 0,
            "high": round(float(high), 2) if high else 0,
            "low": round(float(low), 2) if low else 0,
            "volume": int(volume) if volume else 0,
            "market_state": market_state,
            "last_update": datetime.now().isoformat(),
            "exchange": "MOEX",
            "currency": currency,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"MOEX quote error for {symbol_clean}: {e}")
        raise HTTPException(503, f"No MOEX data for {symbol_clean}")

def moex_search(query: str):
    """Search stocks on MOEX"""
    url = f"https://iss.moex.com/iss/securities.json"
    params = {
        "q": query,
        "engine": "stock",
        "market": "shares",
        "is_trading": 1,
        "limit": 20
    }
    
    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        
        securities = data.get("securities", {})
        columns = securities.get("columns", [])
        rows = securities.get("data", [])
        
        results = []
        seen = set()
        for row in rows:
            def get_col(col):
                return row[columns.index(col)] if col in columns else None
            
            secid = get_col("secid")
            if not secid or secid in seen:
                continue
            seen.add(secid)
            
            # Only include shares
            sec_type = get_col("type")
            if sec_type and sec_type not in ["common_share", "preferred_share"]:
                continue
            
            results.append({
                "symbol": f"{secid}.ME",
                "displaySymbol": secid,
                "name": get_col("name") or get_col("shortname") or secid,
                "exchange": "MOEX",
            })
        
        return results
    except Exception as e:
        print(f"MOEX search error: {e}")
        return []

def yahoo_quote(symbol: str):
    """Fetch quote from Yahoo Finance API"""
    urls = [
        f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=2d",
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=2d",
    ]
    
    data = None
    for url in urls:
        try:
            resp = requests.get(url, headers=YAHOO_HEADERS, timeout=10)
            print(f"Yahoo {symbol}: status={resp.status_code}, len={len(resp.text)}")
            if resp.status_code == 200 and resp.text:
                data = resp.json()
                if "chart" in data and data["chart"]["result"]:
                    break
        except Exception as e:
            print(f"Yahoo {symbol} error: {e}")
            continue
    
    if not data or "chart" not in data or not data["chart"]["result"]:
        raise HTTPException(503, f"No data for {symbol}")
    
    result = data["chart"]["result"][0]
    meta = result["meta"]
    
    price = meta.get("regularMarketPrice", 0)
    prev_close = meta.get("chartPreviousClose", meta.get("previousClose", price))
    open_price = meta.get("regularMarketOpen", prev_close)
    change_day = ((price - prev_close) / prev_close * 100) if prev_close else 0
    
    # Market status and last update time
    market_state = meta.get("marketState", "UNKNOWN")
    market_time = meta.get("regularMarketTime", 0)
    last_update = datetime.fromtimestamp(market_time).isoformat() if market_time else None
    
    # Determine exchange and currency
    exchange_name = meta.get("exchangeName", "")
    exchange = "NASDAQ" if "NASDAQ" in exchange_name.upper() else "NYSE" if "NYSE" in exchange_name.upper() else exchange_name
    currency = meta.get("currency", "USD")
    
    return {
        "symbol": symbol,
        "name": meta.get("shortName") or meta.get("longName") or symbol,
        "price": round(price, 2),
        "change": round(change_day, 2),
        "prev_close": round(prev_close, 2),
        "open": round(open_price, 2),
        "high": round(meta.get("regularMarketDayHigh", 0), 2),
        "low": round(meta.get("regularMarketDayLow", 0), 2),
        "volume": meta.get("regularMarketVolume", 0),
        "market_state": market_state,
        "last_update": last_update,
        "exchange": exchange,
        "currency": currency,
    }

def get_quote_universal(symbol: str):
    """Get quote from appropriate exchange API"""
    if is_moex_symbol(symbol):
        return moex_quote(symbol)
    else:
        return yahoo_quote(symbol)

def yahoo_history(symbol: str):
    """Fetch 1 month history from Yahoo Finance"""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1mo"
    resp = requests.get(url, headers=YAHOO_HEADERS, timeout=10)
    data = resp.json()
    
    if "chart" not in data or not data["chart"]["result"]:
        return []
    
    result = data["chart"]["result"][0]
    timestamps = result.get("timestamp", [])
    closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
    
    history = []
    for ts, close in zip(timestamps, closes):
        if close:
            date = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
            history.append({"date": date, "price": round(close, 2)})
    return history

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

pwd_context = CryptContext(schemes=["bcrypt"])
SECRET_KEY = "your-secret-key-change-in-production"

class UserCreate(BaseModel):
    username: str
    password: str
    display_name: str = None

class DepositRequest(BaseModel):
    amount: float

class TradeRequest(BaseModel):
    symbol: str
    quantity: float
    action: str

def get_current_user(token: str, db: Session):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user = db.query(User).filter(User.username == payload["sub"]).first()
        return user
    except:
        raise HTTPException(401, "Invalid token")

@app.post("/api/register")
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(400, "Username exists")
    display = data.display_name if data.display_name else data.username
    user = User(username=data.username, display_name=display, password_hash=pwd_context.hash(data.password))
    db.add(user)
    db.commit()
    return {"message": "Registered"}

@app.post("/api/login")
def login(data: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    token = jwt.encode({"sub": user.username, "exp": datetime.utcnow() + timedelta(days=7)}, SECRET_KEY)
    return {"token": token, "username": user.username, "display_name": user.display_name or user.username}

@app.get("/api/me")
def get_me(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    portfolio = db.query(Portfolio).filter(Portfolio.user_id == user.id).all()
    return {
        "username": user.username,
        "display_name": user.display_name or user.username,
        "balance": user.balance,
        "portfolio": [{"symbol": p.symbol, "quantity": p.quantity, "avg_price": p.avg_price} for p in portfolio]
    }

@app.post("/api/deposit")
def deposit(data: DepositRequest, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    user.balance += data.amount
    db.commit()
    return {"balance": user.balance}

# Account settings
class UpdateUsernameRequest(BaseModel):
    new_username: str

class UpdatePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@app.put("/api/account/username")
def update_username(data: UpdateUsernameRequest, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    
    if len(data.new_username) < 3:
        raise HTTPException(400, "Логин должен быть не менее 3 символов")
    
    existing = db.query(User).filter(User.username == data.new_username).first()
    if existing and existing.id != user.id:
        raise HTTPException(400, "Этот логин уже занят")
    
    user.username = data.new_username
    db.commit()
    
    # Generate new token with new username
    new_token = jwt.encode({"sub": user.username}, SECRET_KEY, algorithm="HS256")
    return {"message": "Логин изменён", "username": user.username, "token": new_token}

@app.put("/api/account/password")
def update_password(data: UpdatePasswordRequest, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    
    if not pwd_ctx.verify(data.current_password, user.password_hash):
        raise HTTPException(400, "Неверный текущий пароль")
    
    if len(data.new_password) < 4:
        raise HTTPException(400, "Пароль должен быть не менее 4 символов")
    
    user.password_hash = pwd_ctx.hash(data.new_password)
    db.commit()
    return {"message": "Пароль изменён"}

class UpdateDisplayNameRequest(BaseModel):
    display_name: str

@app.put("/api/account/display_name")
def update_display_name(data: UpdateDisplayNameRequest, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    
    if len(data.display_name) < 2:
        raise HTTPException(400, "Имя должно быть не менее 2 символов")
    
    user.display_name = data.display_name
    db.commit()
    return {"message": "Имя изменено", "display_name": user.display_name}

# Cache for screener data (Yahoo doesn't support offset, so we fetch all and paginate locally)
_screener_cache = {}
_screener_cache_time = {}
SCREENER_CACHE_TTL = 60  # 1 minute cache

def fetch_yahoo_screener(screener_type: str, limit: int = 15, offset: int = 0):
    """Fetch stocks from Yahoo Finance screener API with local pagination"""
    global _screener_cache, _screener_cache_time
    
    now = time.time()
    
    # Check cache first
    if screener_type in _screener_cache and (now - _screener_cache_time.get(screener_type, 0)) < SCREENER_CACHE_TTL:
        all_stocks = _screener_cache[screener_type]
        paginated = all_stocks[offset:offset+limit]
        has_more = (offset + limit) < len(all_stocks)
        return paginated, has_more
    
    # Yahoo screener IDs
    screeners = {
        "gainers": "day_gainers",
        "losers": "day_losers", 
        "active": "most_actives",
        "trending": "trending"
    }
    
    screener_id = screeners.get(screener_type, "day_gainers")
    all_stocks = []
    
    # Try trending endpoint first
    if screener_type == "trending":
        try:
            url = "https://query1.finance.yahoo.com/v1/finance/trending/US"
            resp = requests.get(url, headers=YAHOO_HEADERS, timeout=10)
            data = resp.json()
            quotes = data.get("finance", {}).get("result", [{}])[0].get("quotes", [])
            symbols = [q.get("symbol") for q in quotes if q.get("symbol")]
            
            for symbol in symbols[:50]:  # Limit to 50 for performance
                try:
                    quote = yahoo_quote(symbol)
                    quote["displaySymbol"] = normalize_symbol(quote["symbol"], for_display=True)
                    quote["category"] = "trending"
                    all_stocks.append(quote)
                except:
                    pass
                time.sleep(0.05)
        except Exception as e:
            print(f"Trending fetch error: {e}")
    else:
        # Use screener API for gainers/losers/active - fetch 100 at once
        try:
            url = f"https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds={screener_id}&count=100"
            resp = requests.get(url, headers=YAHOO_HEADERS, timeout=10)
            data = resp.json()
            
            result = data.get("finance", {}).get("result", [{}])[0]
            quotes = result.get("quotes", [])
            
            for q in quotes:
                try:
                    stock = {
                        "symbol": q.get("symbol"),
                        "displaySymbol": q.get("symbol"),
                        "name": q.get("shortName") or q.get("longName") or q.get("symbol"),
                        "price": q.get("regularMarketPrice"),
                        "change": q.get("regularMarketChangePercent"),
                        "volume": q.get("regularMarketVolume"),
                        "exchange": q.get("exchange", ""),
                        "currency": q.get("currency", "USD"),
                        "market_state": q.get("marketState", "REGULAR"),
                        "category": screener_type
                    }
                    all_stocks.append(stock)
                except:
                    pass
        except Exception as e:
            print(f"Screener fetch error for {screener_type}: {e}")
    
    # Cache the results
    _screener_cache[screener_type] = all_stocks
    _screener_cache_time[screener_type] = now
    
    # Return paginated results
    paginated = all_stocks[offset:offset+limit]
    has_more = (offset + limit) < len(all_stocks)
    return paginated, has_more

@app.get("/api/stocks")
def get_stocks(category: str = "default", limit: int = 15, offset: int = 0):
    """Fetch stocks from appropriate source based on category with pagination"""
    
    # Handle special categories with pagination
    if category in ["gainers", "losers", "active", "trending"]:
        stocks, has_more = fetch_yahoo_screener(category, limit, offset)
        if stocks:
            return {"stocks": stocks, "has_more": has_more, "offset": offset + len(stocks)}
        return {"stocks": [], "has_more": False, "offset": offset}
    
    # Default: fetch static stock list (no pagination needed for small list)
    stocks = []
    stock_list = DEFAULT_STOCKS[offset:offset+limit]
    for symbol in stock_list:
        try:
            quote = get_quote_universal(symbol)
            quote["displaySymbol"] = normalize_symbol(quote["symbol"], for_display=True)
            quote["category"] = "default"
            stocks.append(quote)
        except Exception as e:
            print(f"Error fetching {symbol}: {e}")
            stocks.append({
                "symbol": symbol,
                "displaySymbol": normalize_symbol(symbol, for_display=True),
                "name": symbol,
                "price": None,
                "change": None,
                "exchange": "MOEX" if is_moex_symbol(symbol) else "US",
                "category": "default",
                "error": str(e)
            })
        time.sleep(0.1)
    has_more = (offset + limit) < len(DEFAULT_STOCKS)
    return {"stocks": stocks, "has_more": has_more, "offset": offset + len(stocks)}

@app.get("/api/stock/{symbol}")
def get_stock(symbol: str):
    """Get single stock with history from appropriate exchange API"""
    normalized_symbol = normalize_symbol(symbol)
    quote = get_quote_universal(normalized_symbol)
    
    # Get history from appropriate API
    if is_moex_symbol(normalized_symbol):
        quote["history"] = moex_history(normalized_symbol, "1mo")
    else:
        quote["history"] = yahoo_history(normalized_symbol)
    
    quote["displaySymbol"] = normalize_symbol(quote["symbol"], for_display=True)
    return quote

@app.get("/api/quote/{symbol}")
def get_quote(symbol: str):
    """Quick quote for single symbol from appropriate exchange"""
    return get_quote_universal(symbol)

# Exchange info with trading hours (UTC offset in hours, open/close in local time)
EXCHANGES = {
    "NASDAQ": {
        "symbol": "AAPL", 
        "name": "NASDAQ", 
        "hours": "9:30-16:00 EST",
        "utc_offset": -5,  # EST
        "open_hour": 9, "open_min": 30,
        "close_hour": 16, "close_min": 0,
        "weekend_closed": True
    },
    "NYSE": {
        "symbol": "JPM", 
        "name": "NYSE", 
        "hours": "9:30-16:00 EST",
        "utc_offset": -5,
        "open_hour": 9, "open_min": 30,
        "close_hour": 16, "close_min": 0,
        "weekend_closed": True
    },
    "MOEX": {
        "symbol": "SBER.ME", 
        "name": "MOEX (Московская биржа)", 
        "hours": "10:00-18:45 MSK",
        "utc_offset": 3,  # MSK
        "open_hour": 10, "open_min": 0,
        "close_hour": 18, "close_min": 45,
        "weekend_closed": True
    },
    "LSE": {
        "symbol": "HSBA.L", 
        "name": "LSE (Лондонская биржа)", 
        "hours": "8:00-16:30 GMT",
        "utc_offset": 0,
        "open_hour": 8, "open_min": 0,
        "close_hour": 16, "close_min": 30,
        "weekend_closed": True
    },
    "XETRA": {
        "symbol": "SAP.DE", 
        "name": "XETRA (Франкфурт)", 
        "hours": "9:00-17:30 CET",
        "utc_offset": 1,
        "open_hour": 9, "open_min": 0,
        "close_hour": 17, "close_min": 30,
        "weekend_closed": True
    },
    "HKEX": {
        "symbol": "0005.HK", 
        "name": "HKEX (Гонконг)", 
        "hours": "9:30-16:00 HKT",
        "utc_offset": 8,
        "open_hour": 9, "open_min": 30,
        "close_hour": 16, "close_min": 0,
        "weekend_closed": True
    },
    "TSE": {
        "symbol": "7203.T", 
        "name": "TSE (Токио)", 
        "hours": "9:00-15:00 JST",
        "utc_offset": 9,
        "open_hour": 9, "open_min": 0,
        "close_hour": 15, "close_min": 0,
        "weekend_closed": True
    },
}

def is_exchange_open(exchange_info: dict) -> bool:
    """Calculate if exchange is open based on current UTC time and exchange hours"""
    from datetime import timezone
    
    utc_now = datetime.now(timezone.utc)
    offset = timedelta(hours=exchange_info["utc_offset"])
    local_now = utc_now + offset
    
    # Check weekend
    if exchange_info.get("weekend_closed", True) and local_now.weekday() >= 5:
        return False
    
    current_minutes = local_now.hour * 60 + local_now.minute
    open_minutes = exchange_info["open_hour"] * 60 + exchange_info["open_min"]
    close_minutes = exchange_info["close_hour"] * 60 + exchange_info["close_min"]
    
    return open_minutes <= current_minutes < close_minutes

@app.get("/api/markets")
def get_markets_status():
    """Get market status for all major exchanges"""
    results = []
    for exchange_id, info in EXCHANGES.items():
        # First try Yahoo Finance for real-time status
        try:
            quote = yahoo_quote(info["symbol"])
            market_state = quote.get("market_state")
            # If Yahoo returns REGULAR, market is definitely open
            if market_state == "REGULAR":
                is_open = True
            # If Yahoo returns something else (CLOSED, PRE, POST), use it
            elif market_state and market_state != "UNKNOWN":
                is_open = False
            # Otherwise calculate from trading hours
            else:
                is_open = is_exchange_open(info)
                market_state = "REGULAR" if is_open else "CLOSED"
        except Exception as e:
            print(f"Market status error for {exchange_id}: {e}")
            # Fallback to time-based calculation
            is_open = is_exchange_open(info)
            market_state = "REGULAR" if is_open else "CLOSED"
        
        results.append({
            "id": exchange_id,
            "name": info["name"],
            "hours": info["hours"],
            "is_open": is_open,
            "state": market_state,
            "representative": info["symbol"],
        })
        time.sleep(0.05)
    
    any_open = any(r["is_open"] for r in results)
    return {
        "any_open": any_open,
        "exchanges": results
    }

def normalize_symbol(symbol: str, for_display: bool = False) -> str:
    """Normalize symbol: add .ME for MOEX if needed, or remove for display"""
    if for_display:
        return symbol.replace('.ME', '')
    # Common MOEX tickers - add .ME if not present
    moex_tickers = ['SBER', 'GAZP', 'LKOH', 'GMKN', 'ROSN', 'TATN', 'MGNT', 'NVTK', 'ALRS', 'PLZL', 'CHMF', 'SNGS', 'SNGSP', 'MOEX', 'YNDX']
    symbol_upper = symbol.upper().replace('.ME', '')
    if symbol_upper in moex_tickers and not symbol.endswith('.ME'):
        return f"{symbol_upper}.ME"
    return symbol

@app.get("/api/search")
def search_stocks(q: str, exchange: str = None):
    """Search stocks by symbol or name on specific or all exchanges"""
    q = q.strip()
    q_upper = q.upper()
    results = []
    
    # Search on MOEX first (for Russian queries or explicit MOEX search)
    is_cyrillic = any('\u0400' <= c <= '\u04FF' for c in q)
    should_search_moex = exchange == "MOEX" or is_cyrillic or is_moex_symbol(q_upper)
    
    if should_search_moex or exchange is None:
        moex_results = moex_search(q)
        results.extend(moex_results)
    
    # Search on Yahoo Finance (for US/International stocks)
    if exchange != "MOEX":
        # Try direct quote first if it looks like a ticker
        if len(q_upper) <= 6 and q_upper.replace('.', '').isalnum() and not is_moex_symbol(q_upper):
            try:
                quote = yahoo_quote(q_upper)
                results.append({
                    "symbol": quote["symbol"],
                    "displaySymbol": quote["symbol"],
                    "name": quote["name"],
                    "exchange": quote.get("exchange", "US"),
                })
            except:
                pass
        
        # Yahoo Finance search API
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={q}&quotesCount=10&newsCount=0"
        try:
            resp = requests.get(url, headers=YAHOO_HEADERS, timeout=10)
            data = resp.json()
            for quote in data.get("quotes", []):
                if quote.get("quoteType") == "EQUITY":
                    symbol = quote.get("symbol")
                    # Skip MOEX symbols from Yahoo (we already have them from MOEX API)
                    if ".ME" in symbol:
                        continue
                    exchange_name = quote.get("exchange", "")
                    results.append({
                        "symbol": symbol,
                        "displaySymbol": symbol,
                        "name": quote.get("shortname") or quote.get("longname", ""),
                        "exchange": exchange_name,
                    })
        except Exception as e:
            print(f"Yahoo search error: {e}")
    
    # Remove duplicates
    seen = set()
    unique_results = []
    for r in results:
        key = r["symbol"].upper()
        if key not in seen:
            seen.add(key)
            unique_results.append(r)
    
    return unique_results[:20]

@app.get("/api/currencies")
def get_currencies():
    """Get current exchange rates (USD base)"""
    global _currency_cache, _currency_cache_time
    
    # Cache for 5 minutes
    if time.time() - _currency_cache_time < 300 and _currency_cache:
        return _currency_cache
    
    rates = {"USD": 1.0}
    for currency, pair in CURRENCY_PAIRS.items():
        try:
            url = f"https://query2.finance.yahoo.com/v8/finance/chart/{pair}?interval=1d&range=1d"
            resp = requests.get(url, headers=YAHOO_HEADERS, timeout=10)
            data = resp.json()
            if "chart" in data and data["chart"]["result"]:
                rate = data["chart"]["result"][0]["meta"].get("regularMarketPrice", 0)
                rates[currency] = round(rate, 4)
        except Exception as e:
            print(f"Currency {currency} error: {e}")
            rates[currency] = 0
        time.sleep(0.2)
    
    _currency_cache = rates
    _currency_cache_time = time.time()
    return rates

def moex_history(symbol: str, period: str = "1mo"):
    """Get historical data from MOEX ISS API"""
    # Remove .ME suffix if present
    symbol_clean = symbol.replace('.ME', '').upper()
    
    # Calculate date range
    end_date = datetime.now()
    if period == "1d":
        start_date = end_date - timedelta(days=1)
        interval = "60"  # hourly
    elif period == "5d":
        start_date = end_date - timedelta(days=5)
        interval = "24"  # daily
    elif period == "1mo":
        start_date = end_date - timedelta(days=30)
        interval = "24"
    elif period == "3mo":
        start_date = end_date - timedelta(days=90)
        interval = "24"
    elif period == "6mo":
        start_date = end_date - timedelta(days=180)
        interval = "24"
    elif period == "1y":
        start_date = end_date - timedelta(days=365)
        interval = "24"
    elif period == "5y":
        start_date = end_date - timedelta(days=1825)
        interval = "24"
    else:
        start_date = end_date - timedelta(days=30)
        interval = "24"
    
    url = f"https://iss.moex.com/iss/history/engines/stock/markets/shares/securities/{symbol_clean}.json"
    params = {
        "from": start_date.strftime("%Y-%m-%d"),
        "till": end_date.strftime("%Y-%m-%d"),
        "interval": interval
    }
    
    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        
        history_data = data.get("history", {})
        columns = history_data.get("columns", [])
        rows = history_data.get("data", [])
        
        if not rows or not columns:
            return []
        
        # Find column indices
        date_idx = columns.index("TRADEDATE") if "TRADEDATE" in columns else 1
        open_idx = columns.index("OPEN") if "OPEN" in columns else None
        high_idx = columns.index("HIGH") if "HIGH" in columns else None
        low_idx = columns.index("LOW") if "LOW" in columns else None
        close_idx = columns.index("CLOSE") if "CLOSE" in columns else 11
        
        history = []
        seen_dates = set()
        
        for row in rows:
            if len(row) > close_idx and row[close_idx] is not None:
                date = row[date_idx]
                
                # Skip duplicate dates (different boards)
                if date in seen_dates:
                    continue
                seen_dates.add(date)
                
                close_price = float(row[close_idx])
                
                if period in ["1d", "5d"] and interval == "60":
                    try:
                        dt = datetime.strptime(date, "%Y-%m-%d %H:%M:%S")
                        date = dt.strftime("%H:%M")
                    except:
                        pass
                
                item = {"date": date, "price": round(close_price, 2), "close": round(close_price, 2)}
                
                # Add OHLC data for candlestick charts
                if open_idx is not None and row[open_idx] is not None:
                    item["open"] = round(float(row[open_idx]), 2)
                if high_idx is not None and row[high_idx] is not None:
                    item["high"] = round(float(row[high_idx]), 2)
                if low_idx is not None and row[low_idx] is not None:
                    item["low"] = round(float(row[low_idx]), 2)
                
                history.append(item)
        
        return history
    except Exception as e:
        print(f"MOEX history error for {symbol_clean}: {e}")
        return []

@app.get("/api/stock/{symbol}/history")
def get_stock_history(symbol: str, period: str = "1mo"):
    """Get stock history for different periods"""
    # Normalize symbol (add .ME if needed)
    normalized_symbol = normalize_symbol(symbol)
    
    # Check if it's a MOEX ticker
    is_moex = ".ME" in normalized_symbol or normalized_symbol.upper().replace('.ME', '') in ['SBER', 'GAZP', 'LKOH', 'GMKN', 'ROSN', 'TATN', 'MGNT', 'NVTK', 'ALRS', 'PLZL', 'CHMF', 'SNGS', 'SNGSP', 'MOEX']
    
    if is_moex:
        # Use MOEX API for Russian stocks
        return moex_history(normalized_symbol, period)
    
    # Use Yahoo Finance for other stocks
    valid_periods = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y"]
    if period not in valid_periods:
        period = "1mo"
    
    interval = "1d"
    if period == "1d":
        interval = "5m"
    elif period == "5d":
        interval = "15m"
    
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{normalized_symbol}?interval={interval}&range={period}"
    try:
        resp = requests.get(url, headers=YAHOO_HEADERS, timeout=10)
        data = resp.json()
        
        if "chart" not in data or not data["chart"]["result"]:
            return []
        
        result = data["chart"]["result"][0]
        timestamps = result.get("timestamp", [])
        quote_data = result.get("indicators", {}).get("quote", [{}])[0] if result.get("indicators", {}).get("quote") else {}
        
        opens = quote_data.get("open", [])
        highs = quote_data.get("high", [])
        lows = quote_data.get("low", [])
        closes = quote_data.get("close", [])
        
        if not timestamps or not closes:
            return []
        
        history = []
        for i, ts in enumerate(timestamps):
            close = closes[i] if i < len(closes) else None
            if close:
                if period in ["1d", "5d"]:
                    date = datetime.fromtimestamp(ts).strftime("%H:%M")
                else:
                    date = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
                
                item = {"date": date, "price": round(close, 2)}
                
                # Add OHLC data for candlestick charts
                if i < len(opens) and opens[i]:
                    item["open"] = round(opens[i], 2)
                if i < len(highs) and highs[i]:
                    item["high"] = round(highs[i], 2)
                if i < len(lows) and lows[i]:
                    item["low"] = round(lows[i], 2)
                item["close"] = round(close, 2)
                
                history.append(item)
        return history
    except Exception as e:
        print(f"Yahoo history error: {e}")
        return []

def convert_to_usd(amount: float, from_currency: str) -> float:
    """Convert amount from any currency to USD"""
    if not from_currency or from_currency.upper() == "USD":
        return amount
    
    # Get current exchange rate
    rates = get_currencies()
    from_rate = rates.get(from_currency.upper(), 1)
    
    if from_rate <= 0:
        return amount
    
    # Convert to USD: amount / rate
    return amount / from_rate

def convert_from_usd(amount: float, to_currency: str) -> float:
    """Convert amount from USD to any currency"""
    if not to_currency or to_currency.upper() == "USD":
        return amount
    
    rates = get_currencies()
    to_rate = rates.get(to_currency.upper(), 1)
    
    return amount * to_rate

@app.post("/api/trade")
def trade(data: TradeRequest, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    # Normalize symbol (add .ME if needed)
    normalized_symbol = normalize_symbol(data.symbol)
    quote = get_quote_universal(normalized_symbol)
    
    native_price = quote["price"]  # Price in stock's native currency
    stock_currency = quote.get("currency", "USD")
    
    # Convert price to USD for balance calculations
    price_usd = convert_to_usd(native_price, stock_currency)
    total_usd = price_usd * data.quantity
    
    if data.action == "buy":
        if user.balance < total_usd:
            raise HTTPException(400, f"Insufficient funds. Need ${total_usd:.2f}, have ${user.balance:.2f}")
        user.balance -= total_usd
        
        position = db.query(Portfolio).filter(Portfolio.user_id == user.id, Portfolio.symbol == normalized_symbol).first()
        if position:
            new_qty = position.quantity + data.quantity
            # Store avg_price in USD
            position.avg_price = (position.avg_price * position.quantity + total_usd) / new_qty
            position.quantity = new_qty
        else:
            db.add(Portfolio(user_id=user.id, symbol=normalized_symbol, quantity=data.quantity, avg_price=price_usd))
    
    elif data.action == "sell":
        position = db.query(Portfolio).filter(Portfolio.user_id == user.id, Portfolio.symbol == normalized_symbol).first()
        if not position or position.quantity < data.quantity:
            raise HTTPException(400, "Not enough shares")
        position.quantity -= data.quantity
        user.balance += total_usd
        if position.quantity == 0:
            db.delete(position)
    
    db.add(Transaction(user_id=user.id, symbol=normalized_symbol, action=data.action, quantity=data.quantity, price=price_usd, total=total_usd))
    db.commit()
    return {"message": "Trade executed", "balance": user.balance, "price": price_usd, "native_price": native_price, "currency": stock_currency}

@app.get("/api/transactions")
def get_transactions(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    txs = db.query(Transaction).filter(Transaction.user_id == user.id).order_by(Transaction.created_at.desc()).all()
    return [{"symbol": t.symbol, "displaySymbol": normalize_symbol(t.symbol, for_display=True), "action": t.action, "quantity": t.quantity, "price": t.price, "total": t.total, "date": str(t.created_at)} for t in txs]

# Favorites API
@app.get("/api/favorites")
def get_favorites(token: str, db: Session = Depends(get_db)):
    """Get user's favorite stocks"""
    user = get_current_user(token, db)
    favs = db.query(Favorite).filter(Favorite.user_id == user.id).all()
    return [f.symbol for f in favs]

@app.get("/api/favorites/stocks")
def get_favorite_stocks(token: str, limit: int = 15, offset: int = 0, db: Session = Depends(get_db)):
    """Get user's favorite stocks with full data"""
    user = get_current_user(token, db)
    favs = db.query(Favorite).filter(Favorite.user_id == user.id).all()
    symbols = [f.symbol for f in favs]
    
    if not symbols:
        return {"stocks": [], "has_more": False, "offset": 0}
    
    stocks = []
    paginated_symbols = symbols[offset:offset+limit]
    for symbol in paginated_symbols:
        try:
            quote = get_quote_universal(symbol)
            quote["displaySymbol"] = normalize_symbol(quote["symbol"], for_display=True)
            quote["category"] = "favorites"
            quote["isFavorite"] = True
            stocks.append(quote)
        except Exception as e:
            print(f"Error fetching favorite {symbol}: {e}")
            stocks.append({
                "symbol": symbol,
                "displaySymbol": normalize_symbol(symbol, for_display=True),
                "name": symbol,
                "price": None,
                "change": None,
                "exchange": "MOEX" if is_moex_symbol(symbol) else "US",
                "category": "favorites",
                "isFavorite": True,
                "error": str(e)
            })
        time.sleep(0.05)
    
    has_more = (offset + limit) < len(symbols)
    return {"stocks": stocks, "has_more": has_more, "offset": offset + len(stocks)}

class FavoriteRequest(BaseModel):
    symbol: str

@app.post("/api/favorites")
def add_favorite(req: FavoriteRequest, token: str, db: Session = Depends(get_db)):
    """Add stock to favorites"""
    user = get_current_user(token, db)
    symbol = normalize_symbol(req.symbol)
    
    # Check if already in favorites
    existing = db.query(Favorite).filter(Favorite.user_id == user.id, Favorite.symbol == symbol).first()
    if existing:
        return {"message": "Already in favorites", "symbol": symbol}
    
    fav = Favorite(user_id=user.id, symbol=symbol)
    db.add(fav)
    db.commit()
    return {"message": "Added to favorites", "symbol": symbol}

@app.delete("/api/favorites/{symbol}")
def remove_favorite(symbol: str, token: str, db: Session = Depends(get_db)):
    """Remove stock from favorites"""
    user = get_current_user(token, db)
    normalized = normalize_symbol(symbol)
    
    fav = db.query(Favorite).filter(Favorite.user_id == user.id, Favorite.symbol == normalized).first()
    if not fav:
        raise HTTPException(404, "Not in favorites")
    
    db.delete(fav)
    db.commit()
    return {"message": "Removed from favorites", "symbol": normalized}

@app.get("/api/indices")
def get_market_indices():
    """Get major market indices"""
    indices = [
        {"symbol": "^GSPC", "name": "S&P 500"},
        {"symbol": "^DJI", "name": "Dow Jones"},
        {"symbol": "^IXIC", "name": "NASDAQ"},
        {"symbol": "IMOEX.ME", "name": "MOEX"},
    ]
    
    results = []
    for idx in indices:
        try:
            quote = yahoo_quote(idx["symbol"])
            results.append({
                "symbol": idx["symbol"],
                "name": idx["name"],
                "price": quote.get("price"),
                "change": quote.get("change"),
            })
        except:
            results.append({
                "symbol": idx["symbol"],
                "name": idx["name"],
                "price": None,
                "change": None,
            })
        time.sleep(0.05)
    
    return results

@app.get("/api/report")
def get_report(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    portfolio = db.query(Portfolio).filter(Portfolio.user_id == user.id).all()
    
    total_invested = 0
    total_current = 0
    holdings = []
    
    for p in portfolio:
        try:
            quote = get_quote_universal(p.symbol)
            native_price = quote["price"]
            stock_currency = quote.get("currency", "USD")
            
            # Convert current price to USD for calculations
            current_price_usd = convert_to_usd(native_price, stock_currency)
            
            # avg_price is already stored in USD
            invested = p.avg_price * p.quantity
            current = current_price_usd * p.quantity
            profit = current - invested
            
            total_invested += invested
            total_current += current
            
            holdings.append({
                "symbol": p.symbol,
                "displaySymbol": normalize_symbol(p.symbol, for_display=True),
                "quantity": p.quantity,
                "avg_price": p.avg_price,  # USD
                "current_price": current_price_usd,  # USD
                "native_price": native_price,
                "currency": stock_currency,
                "invested": invested,
                "current": current,
                "profit": profit,
                "profit_percent": (profit / invested * 100) if invested > 0 else 0,
                "exchange": quote.get("exchange", "US"),
            })
            time.sleep(0.1)
        except:
            pass
    
    return {
        "balance": user.balance,
        "total_invested": total_invested,
        "total_current": total_current,
        "total_profit": total_current - total_invested,
        "holdings": holdings
    }
