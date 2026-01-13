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
from models import User, Portfolio, Transaction

Base.metadata.create_all(bind=engine)

DEFAULT_STOCKS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "META", "NVDA", "NFLX"]

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
    }

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
    user = User(username=data.username, password_hash=pwd_context.hash(data.password))
    db.add(user)
    db.commit()
    return {"message": "Registered"}

@app.post("/api/login")
def login(data: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    token = jwt.encode({"sub": user.username, "exp": datetime.utcnow() + timedelta(days=7)}, SECRET_KEY)
    return {"token": token, "username": user.username}

@app.get("/api/me")
def get_me(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    portfolio = db.query(Portfolio).filter(Portfolio.user_id == user.id).all()
    return {
        "username": user.username,
        "balance": user.balance,
        "portfolio": [{"symbol": p.symbol, "quantity": p.quantity, "avg_price": p.avg_price} for p in portfolio]
    }

@app.post("/api/deposit")
def deposit(data: DepositRequest, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    user.balance += data.amount
    db.commit()
    return {"balance": user.balance}

@app.get("/api/stocks")
def get_stocks():
    """Proxy to Yahoo Finance - fetch default stocks"""
    stocks = []
    for symbol in DEFAULT_STOCKS:
        try:
            quote = yahoo_quote(symbol)
            stocks.append(quote)
        except Exception as e:
            print(f"Error fetching {symbol}: {e}")
            stocks.append({
                "symbol": symbol,
                "name": symbol,
                "price": None,
                "change": None,
                "error": str(e)
            })
        time.sleep(0.2)  # Small delay between requests
    return stocks

@app.get("/api/stock/{symbol}")
def get_stock(symbol: str):
    """Proxy to Yahoo Finance - single stock with history"""
    quote = yahoo_quote(symbol)
    quote["history"] = yahoo_history(symbol)
    return quote

@app.get("/api/quote/{symbol}")
def get_quote(symbol: str):
    """Quick quote for single symbol"""
    return yahoo_quote(symbol)

@app.get("/api/search")
def search_stocks(q: str):
    """Search stocks by symbol or name"""
    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={q}&quotesCount=10&newsCount=0"
    try:
        resp = requests.get(url, headers=YAHOO_HEADERS, timeout=10)
        data = resp.json()
        results = []
        for quote in data.get("quotes", []):
            if quote.get("quoteType") == "EQUITY":
                results.append({
                    "symbol": quote.get("symbol"),
                    "name": quote.get("shortname") or quote.get("longname", ""),
                    "exchange": quote.get("exchange", ""),
                })
        return results
    except Exception as e:
        print(f"Search error: {e}")
        return []

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

@app.get("/api/stock/{symbol}/history")
def get_stock_history(symbol: str, period: str = "1mo"):
    """Get stock history for different periods"""
    valid_periods = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y"]
    if period not in valid_periods:
        period = "1mo"
    
    interval = "1d"
    if period == "1d":
        interval = "5m"
    elif period == "5d":
        interval = "15m"
    
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?interval={interval}&range={period}"
    try:
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
                if period in ["1d", "5d"]:
                    date = datetime.fromtimestamp(ts).strftime("%H:%M")
                else:
                    date = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
                history.append({"date": date, "price": round(close, 2)})
        return history
    except Exception as e:
        print(f"History error: {e}")
        return []

@app.post("/api/trade")
def trade(data: TradeRequest, token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    quote = yahoo_quote(data.symbol)
    price = quote["price"]
    total = price * data.quantity
    
    if data.action == "buy":
        if user.balance < total:
            raise HTTPException(400, "Insufficient funds")
        user.balance -= total
        
        position = db.query(Portfolio).filter(Portfolio.user_id == user.id, Portfolio.symbol == data.symbol).first()
        if position:
            new_qty = position.quantity + data.quantity
            position.avg_price = (position.avg_price * position.quantity + total) / new_qty
            position.quantity = new_qty
        else:
            db.add(Portfolio(user_id=user.id, symbol=data.symbol, quantity=data.quantity, avg_price=price))
    
    elif data.action == "sell":
        position = db.query(Portfolio).filter(Portfolio.user_id == user.id, Portfolio.symbol == data.symbol).first()
        if not position or position.quantity < data.quantity:
            raise HTTPException(400, "Not enough shares")
        position.quantity -= data.quantity
        user.balance += total
        if position.quantity == 0:
            db.delete(position)
    
    db.add(Transaction(user_id=user.id, symbol=data.symbol, action=data.action, quantity=data.quantity, price=price, total=total))
    db.commit()
    return {"message": "Trade executed", "balance": user.balance, "price": price}

@app.get("/api/transactions")
def get_transactions(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    txs = db.query(Transaction).filter(Transaction.user_id == user.id).order_by(Transaction.created_at.desc()).all()
    return [{"symbol": t.symbol, "action": t.action, "quantity": t.quantity, "price": t.price, "total": t.total, "date": str(t.created_at)} for t in txs]

@app.get("/api/report")
def get_report(token: str, db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    portfolio = db.query(Portfolio).filter(Portfolio.user_id == user.id).all()
    
    total_invested = 0
    total_current = 0
    holdings = []
    
    for p in portfolio:
        try:
            quote = yahoo_quote(p.symbol)
            current_price = quote["price"]
            invested = p.avg_price * p.quantity
            current = current_price * p.quantity
            profit = current - invested
            
            total_invested += invested
            total_current += current
            
            holdings.append({
                "symbol": p.symbol,
                "quantity": p.quantity,
                "avg_price": p.avg_price,
                "current_price": current_price,
                "invested": invested,
                "current": current,
                "profit": profit,
                "profit_percent": (profit / invested * 100) if invested > 0 else 0
            })
            time.sleep(0.2)
        except:
            pass
    
    return {
        "balance": user.balance,
        "total_invested": total_invested,
        "total_current": total_current,
        "total_profit": total_current - total_invested,
        "holdings": holdings
    }
