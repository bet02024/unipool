import threading
import time
from datetime import datetime, timedelta
import requests
import schedule
from flask import Flask, request, jsonify
from flask_socketio import SocketIO
from flask_cors import CORS   
from collections import defaultdict, deque
from web3 import Web3
import json
import os
from dotenv import load_dotenv
from MarketAndNewsDataMCP import MarketData, NewsAndSocialMediaData
from openai import OpenAI
import uuid
from pickledb import PickleDB
import asyncio
import logging
import numpy as np
from rq_scheduler import Scheduler
import pprint
load_dotenv()

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
#openai.api_key = OPENAI_KEY

# --- CONFIGURATION ---
COINGECKO_API_URL = "https://api.coingecko.com/api/v3"
PORT = os.getenv("PORT") 
MCP_BASE_URL = f"http://127.0.0.1:{PORT}"
PROVIDER_URL = os.getenv("PROVIDER_URL") 
TRADER_AGENT_PRIVATE_KEY = os.getenv("TRADER_AGENT_PRIVATE_KEY")
UNIPOOL_CONTRACT_ADDRESS = os.getenv("UNIPOOL_CONTRACT_ADDRESS")
UNIPOOL_CONTRACT_ABI = None
TOKENS_TO_WATCH=['bitcoin', 'uniswap', 'ethereum', 'compound-governance-token']
CG_API_KEY = os.getenv("CG_API_KEY")


# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logging.getLogger('werkzeug').setLevel(logging.ERROR)

TOKENS_TO_ADDRESS=[{'USDC':"0x078D782b760474a361dDA0AF3839290b0EF57AD6"}, {'bitcoin':"0x927b51f251480a681271180da4de28d44ec4afb8"}, {'uniswap':"0x8f187aA05619a017077f5308904739877ce9eA21"}, {'ethereum':"0x4200000000000000000000000000000000000006"}, {'compound-governance-token':"0xdf78e4F0A8279942ca68046476919A90f2288656"}]


with open('abi.json') as f:
    UNIPOOL_CONTRACT_ABI = json.load(f)


mcp_app = Flask(__name__)
CORS(mcp_app)             
socketio = SocketIO(mcp_app, cors_allowed_origins="*") 

# --- Persistent Message Queue Storage with PickleDB ---
PICKLEDB_PATH = 'message_queues.db'

def load_message_queues():
    db = PickleDB(PICKLEDB_PATH)
    mq = defaultdict(lambda: deque(maxlen=200))
    for topic in db.all():
        mq[topic] = deque(db.get(topic), maxlen=200)
    return mq, db

def save_message_queue(db, topic, queue):
    db.set(topic, list(queue))

message_queues, mqdb = load_message_queues()



@mcp_app.route('/contract/asset-balances', methods=['GET'])
def get_asset_balances():
    try:
        print("get_balances")
        if not all([PROVIDER_URL, UNIPOOL_CONTRACT_ADDRESS, UNIPOOL_CONTRACT_ABI]):
            return jsonify({"success": False, "error": "Contract/web3 config missing"}), 500

        w3 = Web3(Web3.HTTPProvider(PROVIDER_URL))
        if not w3.is_connected():
            return jsonify({"success": False, "error": "Web3 connection failed"}), 500

        contract = w3.eth.contract(
            address=Web3.to_checksum_address(UNIPOOL_CONTRACT_ADDRESS),
            abi=UNIPOOL_CONTRACT_ABI
        )
        addresses = contract.functions.portfolioAssetsList().call()
        pprint.pprint(addresses)
        result = [
            {
                "address": w3.to_checksum_address(addr)
            }
            for addr in  addresses
        ]
        return jsonify({"assets": result, "success": True})

    except Exception as e:
        print(f"[API] Error get_balances(): {e}") 
        return jsonify({"success": False, "error": str(e)}), 500

@socketio.on('connect')
def handle_connect():
    """Handles a new client connecting to the WebSocket."""
    #print("[MCP Server] React UI connected to WebSocket.", request.sid)
    sid = request.sid
    for topic, queue in message_queues.items():
        messages = list(queue)[-5:]
        if messages:
            for msg in messages:
                socketio.emit(topic, {"message": msg}, room=sid)


@socketio.on('disconnect')
def handle_disconnect(reason):
    """Handles a client disconnecting."""
    print("[MCP Server] React UI disconnected.", reason)

@socketio.on_error()      
def error_handler(e):
    print("[MCP Server] Error ", e)

def run_mcp_server():
    """Function to run the Flask-SocketIO app."""
    print(f"[Main] Starting MCP Server with WebSocket on port {PORT}...")
    socketio.run(mcp_app, port=PORT, host='0.0.0.0', debug=False, use_reloader=False)

def mcp_publish(topic, message):
    try:
        print("##### NEW MESSAGE IN THE TOPIC: ", topic)
        print(message)
        message_queues[topic].append(message)

        save_message_queue(mqdb, topic, message_queues[topic])  # persist
        socketio.emit(topic, {'message': message})

    except requests.exceptions.RequestException as e:
        print(f"[Agent Error] Could not publish to MCP: {e}")

def mcp_subscribe(topic):
    try:
        messages = list(message_queues[topic])
        return messages
    except requests.exceptions.RequestException as e:
        print(f"[Agent Error] Could not subscribe to MCP: {e}")
        return []


def execute_rebalance(sell_assets, sell_amounts_bps, buy_assets, buy_amounts_bps) -> str:
    """
    Connects to the blockchain, builds, signs, and sends a multi-asset rebalance transaction.
    Args:
        sell_assets (list[str]): A list of addresses for the tokens to sell.
        sell_amounts_bps (list[int]): A list of amounts to sell, in basis points (1% = 100 BPS).
        buy_assets (list[str]): A list of addresses for the tokens to buy.
        buy_amounts_bps (list[int]): A list of target allocations for the bought assets, in BPS.
    """
    if not all([PROVIDER_URL, TRADER_AGENT_PRIVATE_KEY, UNIPOOL_CONTRACT_ADDRESS]):
        print("Error: Please set PROVIDER_URL, TRADER_AGENT_PRIVATE_KEY, and UNIPOOL_CONTRACT_ADDRESS in your .env file.")
        return

    # 1. Connect to the Ethereum node
    w3 = Web3(Web3.HTTPProvider(PROVIDER_URL))
    if not w3.is_connected():
        print("Error: Could not connect to the Ethereum node.")
        return
    print(f"Successfully connected to provider. Chain ID: {w3.eth.chain_id}")

    # 2. Set up the trader's account from the private key
    trader_account = w3.eth.account.from_key(TRADER_AGENT_PRIVATE_KEY)
    print(f"Trader-Agent wallet address: {trader_account.address}")

    # 3. Load the smart contract
    unipool_contract = w3.eth.contract(
        address=Web3.to_checksum_address(UNIPOOL_CONTRACT_ADDRESS),
        abi=UNIPOOL_CONTRACT_ABI
    )

    # Convert addresses to checksum format
    sell_assets_checksum = [Web3.to_checksum_address(addr) for addr in sell_assets]
    buy_assets_checksum = [Web3.to_checksum_address(addr) for addr in buy_assets]

    # 4. Build the transaction
    # This calls the `rebalance` function on the smart contract.
    print("\nBuilding transaction...")
    try:
        transaction = unipool_contract.functions.rebalance(
            sell_assets_checksum,
            sell_amounts_bps,
            buy_assets_checksum,
            buy_amounts_bps
        ).build_transaction({
            'from': trader_account.address,
            'gas': 500000, 
            'gasPrice': w3.eth.gas_price,
            'nonce': w3.eth.get_transaction_count(trader_account.address),
            'chainId': w3.eth.chain_id
        })
        print("Transaction built successfully.")
    except Exception as e:
        print(f"Error building transaction: {e}")
        return

    # 5. Sign the transaction with the private key
    print("Signing transaction...")
    signed_transaction = w3.eth.account.sign_transaction(transaction, TRADER_AGENT_PRIVATE_KEY)
    print("Transaction signed successfully.")

    # 6. Send the raw transaction to the network
    print("Sending transaction to the network...")
    try:
        tx_hash = w3.eth.send_raw_transaction(signed_transaction.rawTransaction)
        print(f"Transaction sent! Hash: {tx_hash.hex()}")

        # 7. Wait for the transaction receipt (confirmation)
        print("Waiting for transaction receipt...")
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
        
        print("\n--- Transaction Confirmed ---")
        print(f"  Transaction Hash: {tx_receipt['transactionHash'].hex()}")
        print(f"  Block Number: {tx_receipt['blockNumber']}")
        print(f"  Gas Used: {tx_receipt['gasUsed']}")
        print("Rebalance executed successfully!")
        return tx_hash
    except Exception as e:
        print(f"An error occurred while sending the transaction: {e}")



class RiskMetrics:
    def __init__(self, var_95, sharpe_ratio, volatility, max_drawdown, correlation_matrix, risk_level):
        self.var_95 = var_95
        self.sharpe_ratio = sharpe_ratio
        self.volatility = volatility
        self.max_drawdown = max_drawdown
        self.correlation_matrix = correlation_matrix
        self.risk_level = risk_level

    def to_dict(self):
        return {
            "var_95": self.var_95,
            "sharpe_ratio": self.sharpe_ratio,
            "volatility": self.volatility,
            "max_drawdown": self.max_drawdown,
            "correlation_matrix": self.correlation_matrix,
            "risk_level": self.risk_level
        }


class ResearchInsight:
    def __init__(self, token_symbol, score, sentiment, confidence, key_factors, recommendation):
        self.token_symbol = token_symbol
        self.score = score
        self.sentiment = sentiment
        self.confidence = confidence
        self.key_factors = key_factors
        self.recommendation = recommendation

    def to_dict(self):
        return {
            "token": self.token_symbol,
            "score": self.score,
            "sentiment": self.sentiment,
            "confidence": self.confidence,
            "key_factors": self.key_factors,
            "recommendation": self.recommendation
        }

class ResearchAgent:
    def __init__(self):
        self.tokens_to_watch = TOKENS_TO_WATCH
        self.market_data = MarketData()
        self.social_data = NewsAndSocialMediaData()

    def extract_key_factors(self, market_data, news_data, social_data):
        factors = []
        if market_data.get("price_change_24h", 0) > 5:
            factors.append("Strong price momentum")
        elif market_data.get("price_change_24h", 0) < -5:
            factors.append("Negative price pressure")
        if news_data.get("sentiment_score", 50) > 60:
            factors.append("Positive news sentiment")
        elif news_data.get("sentiment_score", 50) < 35:
            factors.append("Negative news sentiment")
        if social_data.get("sentiment_score", 50) > 60:
            factors.append("Strong social media buzz")
        return factors


    def get_recommendation(self, score):
        if score > 60:
            return "BUY"
        elif score < 25:
            return "SELL"
        else:
            return "HOLD"

    def calculate_technical_score(self, market_data):
        price_change = market_data.get("price_change_24h", 0)
        volume_change = market_data.get("volume_change_24h", 0)
        score = 50
        if price_change > 0:
            score += min(price_change * 2, 30)
        else:
            score += max(price_change * 2, -30)
        if volume_change > 0 and price_change > 0:
            score += min(volume_change, 20)
        return max(0, min(100, score))

    def calculate_market_score(self, market_data):
        market_cap = market_data.get("market_cap", 0)
        volume_24h = market_data.get("volume_24h", 0)
        liquidity_ratio = volume_24h / market_cap if market_cap > 0 else 0
        return min(liquidity_ratio * 1000, 50)

    def technical_score(self, token):
        weights = {
            "price_change_1h": 0.4,
            "price_change_24h": 0.3,
            "price_change_7d": 0.2,
            "price_change_14d": 0.05,
            "price_change_30d": 0.05
        }
        market_health = np.log1p(token["market_cap"]) * 0.5 + np.log1p(token["volume_24h"]) * 0.5
        momentum = 0
        for key, w in weights.items():
            change_pct = token[key]   
            if change_pct < 0:
                momentum += w * change_pct * 1.5  
            else:
                momentum += w * change_pct
        raw_score = market_health + momentum
        norm_score = 1 / (1 + np.exp(-raw_score / 1000))
        scaled_score = 1 + norm_score * 99
        return round(scaled_score, 2)

    async def calculate_comprehensive_score(self, market_data, news_data, social_data) -> float:
        technical_score = self.calculate_technical_score(market_data)
        technical_score2 = self.technical_score(market_data)
        print("Score 1, Score 2, ", technical_score, technical_score2)

        news_score = news_data.get("sentiment_score", 50)
        social_score = social_data.get("sentiment_score", 50)
        market_score = self.calculate_market_score(market_data)
        final_score = (
            technical_score * 0.6 +
            news_score * 0.2 +
            social_score * 0.19 +
            market_score * 0.01
        )
        return max(0, min(100, final_score))

    def fetch_market_data_and_publish_wrapper(self):
        """A synchronous wrapper to run the async job."""
        asyncio.run(self.fetch_market_data_and_publish())

    async def fetch_market_data_and_publish(self):
        print("[Research Agent] Fetching enriched market research data...")
        # 1. Get market overview which includes trending coins
        overview = await self.market_data.get_market_overview({})
        if not overview["success"]:
            print("[Research Agent] Failed to fetch market overview:", overview.get("error"))
            return

        trending_coins = [
            coin.get("name") for coin in overview["data"].get("trending_coins", [])
            if coin.get("name")
        ]

        target_tokens = list(set(trending_coins + self.tokens_to_watch)) if trending_coins else self.tokens_to_watch

        tokens_final = await self.market_data.get_market_data({"coins": ','.join(target_tokens) })

        for token in tokens_final['data']['tokens']:
            # 2. Get detailed token data
            market_resp = await self.market_data.get_token_data({"id": token['id'].lower()})
            if not market_resp["success"]:
                print(f"[Research Agent] Market data failed for {token['id']}: {market_resp.get('error')}")
                continue
            market_data = market_resp["data"]

            # 3. News sentiment
            news_resp = await self.social_data.get_sentiment({"token": token['symbol']})
            if not news_resp["success"]:
                news_data = {"sentiment_score": 50, "overall_sentiment": "NEUTRAL", "confidence": 0.5}
            else:
                news_data = news_resp["data"]

            # 4. Social sentiment
            social_resp = await self.social_data.get_social_sentiment({"token": token['symbol']})
            if not social_resp["success"]:
                social_data = {"sentiment_score": 50, "confidence": 0.5}
            else:
                social_data = social_resp["data"]
            # 5. Calculate overall score (async in case you extend with DB/network)
            score = await self.calculate_comprehensive_score(market_data, news_data, social_data)
            recommendation = self.get_recommendation(score)

            insight = ResearchInsight(
                token_symbol=token['id'],
                score=score,
                sentiment=news_data.get("overall_sentiment", "NEUTRAL"),
                confidence=  float(min(news_data.get("confidence", 0.5) + social_data.get("confidence", 0.5), 1.0)),
                key_factors=self.extract_key_factors(market_data, news_data, social_data),
                recommendation=recommendation,
            )

            mcp_publish("market_data", insight.to_dict())
            print(f"[Research Agent] Published insight for {token['id']}")

    def run(self):
        try:
            print("[Research Agent] Starting async market research loop...")
            asyncio.run(self.fetch_market_data_and_publish())
        except Exception as e:
            print(f"Error: {e}")

# --- RISK AGENT (No changes needed here) ---
class RiskAgent:
    def __init__(self):
        self.portfolio_history = []
        self.market_data = MarketData()
        self.risk_thresholds = {
            "max_var": 0.05,  # 5% daily VaR
            "min_sharpe": 0.5,
            "max_volatility": 0.3,
            "max_drawdown": 0.2
        }

    async def run_continuous_monitoring(self):
        print("[Risk Agent] Calculating portfolio risk...")
        try:
            await self.perform_risk_check()
            await self.check_market_anomalies()
            await asyncio.sleep(60)
        except Exception as e:
            print(f"Risk monitoring error: {e}")
            await asyncio.sleep(120)

    def run_continuous_monitoring_wrapper(self):
        """A synchronous wrapper to run the async job."""
        asyncio.run(self.run_continuous_monitoring())


    async def perform_risk_check(self):
        try:
            portfolio_tokens_ids = TOKENS_TO_WATCH

            # Call MarketData class to get latest tokens data
            result = await self.market_data.get_market_data({"coins": ",".join(portfolio_tokens_ids)})
            if not result["success"]:
                print(f"[RiskAgent] Could not fetch market data for risk check: {result.get('error')}")
                return
            tokens = result["data"]["tokens"]
            # Build the portfolio_data structure needed for calculate_risk_metrics
            risk_scores = self.performance_risk_score(tokens)
            for token in risk_scores:
                mcp_publish("risk_metrics", token)

            #await self.check_risk_alerts(risk_metrics)
        except Exception as e:
            logger.error(f"Risk check failed: {e}")


    def performance_risk_score(self, tokens, weights=(0.6, 0.3, 0.05, 0.05)):
        results = []
        negative_factor=2
        weights_arr = np.array(weights)
        for token in tokens:
            print(token)
            changes = np.array([
                token["price_change_1h"],
                token["price_change_24h"],
                token["price_change_7d"],
                token["price_change_14d"]
            ])
            factors = np.where(
                changes < 0,
                1 + np.abs(changes)*2 / 100,        
                1 / (1 + changes*2 / 100)         
            )
            penalized_changes = changes * factors
            mean = np.average(penalized_changes, weights=weights_arr)
            var = np.average((penalized_changes - mean) ** 2, weights=weights_arr)
            std_risk = np.sqrt(var)
            print(std_risk)
            results.append({
                "symbol": token["id"],
                "std_risk": float(std_risk)
            })

        std_values = [r["std_risk"] for r in results]
        min_val, max_val = min(std_values), max(std_values)
        print(min_val, max_val)
        for r in results:
            if max_val != min_val:
                print((  r["std_risk"] - min_val ), (max_val - min_val) )
                r["RiskScore"] = float(   (  r["std_risk"] - min_val ) / (max_val - min_val))
            else:
                r["RiskScore"] = 0.0

        results.sort(key=lambda x: x["RiskScore"], reverse=True)
        return results

    def calculate_risk_metrics(self, portfolio_data) -> RiskMetrics:
        returns = portfolio_data.get("returns", [])
        prices = portfolio_data.get("prices", {})

        var_95 = self.calculate_var(returns, 0.95)
        sharpe_ratio = self.calculate_sharpe_ratio(returns)
        volatility = self.calculate_volatility(returns)
        max_drawdown = self.calculate_max_drawdown(returns)
        correlation_matrix = self.calculate_correlation_matrix(prices)
        risk_level = self.determine_risk_level(var_95, volatility, max_drawdown)

        return RiskMetrics(
            var_95=var_95,
            sharpe_ratio=sharpe_ratio,
            volatility=volatility,
            max_drawdown=max_drawdown,
            correlation_matrix=correlation_matrix,
            risk_level=risk_level)

    def calculate_var(self, returns: list[float], confidence: float) -> float:
        if not returns:
            return 0.0
        sorted_returns = sorted(returns)
        index = int((1 - confidence) * len(sorted_returns))
        return abs(sorted_returns[index]) if index < len(sorted_returns) else 0.0

    def calculate_sharpe_ratio(self, returns: list[float]) -> float:
        if not returns or len(returns) < 2:
            return 0.0
        avg_return = sum(returns) / len(returns)
        variance = sum((r - avg_return) ** 2 for r in returns) / (len(returns) - 1)
        std_dev = variance ** 0.5
        return avg_return / std_dev if std_dev > 0 else 0.0

    def calculate_volatility(self, returns: list[float]) -> float:
        if not returns or len(returns) < 2:
            return 0.0
        avg_return = sum(returns) / len(returns)
        variance = sum((r - avg_return) ** 2 for r in returns) / (len(returns) - 1)
        return variance ** 0.5



    def calculate_max_drawdown(self, returns: list[float]) -> float:
        if not returns:
            return 0.0
        cumulative = 1.0
        peak = 1.0
        max_dd = 0.0
        for ret in returns:
            cumulative *= (1 + ret)
            if cumulative > peak:
                peak = cumulative
            drawdown = (peak - cumulative) / peak
            max_dd = max(max_dd, drawdown)
        return max_dd

    def calculate_correlation_matrix(self, prices: dict[str, list[float]]) -> dict[str, dict[str, float]]:
        if not prices:
            return {}
        tokens = list(prices.keys())
        correlation_matrix = {}
        for token1 in tokens:
            correlation_matrix[token1] = {}
            for token2 in tokens:
                if token1 == token2:
                    correlation_matrix[token1][token2] = 1.0
                else:
                    corr = self.calculate_correlation(prices[token1], prices[token2])
                    correlation_matrix[token1][token2] = corr
        return correlation_matrix

    def calculate_correlation(self, prices1: list[float], prices2: list[float]) -> float:
        if len(prices1) != len(prices2) or len(prices1) < 2:
            return 0.0
        returns1 = [(prices1[i] - prices1[i-1]) / prices1[i-1] for i in range(1, len(prices1))]
        returns2 = [(prices2[i] - prices2[i-1]) / prices2[i-1] for i in range(1, len(prices2))]
        if not returns1 or not returns2:
            return 0.0
        n = len(returns1)
        mean1 = sum(returns1) / n
        mean2 = sum(returns2) / n
        numerator = sum((returns1[i] - mean1) * (returns2[i] - mean2) for i in range(n))
        denominator1 = sum((returns1[i] - mean1) ** 2 for i in range(n)) ** 0.5
        denominator2 = sum((returns2[i] - mean2) ** 2 for i in range(n)) ** 0.5
        if denominator1 == 0 or denominator2 == 0:
            return 0.0
        return numerator / (denominator1 * denominator2)




    def determine_risk_level(self, var: float, volatility: float, max_drawdown: float) -> str:
        risk_score = 0
        if var > self.risk_thresholds["max_var"]:
            risk_score += 1
        if volatility > self.risk_thresholds["max_volatility"]:
            risk_score += 1
        if max_drawdown > self.risk_thresholds["max_drawdown"]:
            risk_score += 1
        if risk_score >= 3:
            return "CRITICAL"
        elif risk_score == 2:
            return "HIGH"
        elif risk_score == 1:
            return "MEDIUM"
        else:
            return "LOW"

    async def check_risk_alerts(self, risk_metrics: RiskMetrics):
        alerts = []
        if risk_metrics.var_95 > self.risk_thresholds["max_var"]:
            alerts.append({
                "type": "VAR_EXCEEDED",
                "message": f"VaR ({risk_metrics.var_95:.2%}) exceeds threshold ({self.risk_thresholds['max_var']:.2%})",
                "severity": "HIGH"
            })
        if risk_metrics.volatility > self.risk_thresholds["max_volatility"]:
            alerts.append({
                "type": "HIGH_VOLATILITY",
                "message": f"Portfolio volatility ({risk_metrics.volatility:.2%}) exceeds threshold",
                "severity": "MEDIUM"
            })
        if risk_metrics.max_drawdown > self.risk_thresholds["max_drawdown"]:
            alerts.append({
                "type": "MAX_DRAWDOWN",
                "message": f"Maximum drawdown ({risk_metrics.max_drawdown:.2%}) exceeds threshold",
                "severity": "HIGH"
            })
        if risk_metrics.risk_level == "CRITICAL":
            alerts.append({
                "type": "CRITICAL_RISK",
                "message": "Portfolio risk level is CRITICAL - immediate action required",
                "severity": "CRITICAL"
            })
        for alert in alerts:
            mcp_publish("risk_alert", alert)

    async def check_market_anomalies(self):
        try:

            overview = await self.market_data.get_market_overview({})
            if not overview["success"]:
                print("[Research Agent] Failed to fetch market overview:", overview.get("error"))
                return

            total_market_cap_change = overview["data"]["market_cap_change_24h"]
            fear_greed_index = overview["data"]["fear_greed_index"]

            market_data = {"fear_greed_index": fear_greed_index, "total_market_cap_change_1h": total_market_cap_change}

            if market_data.get("fear_greed_index", 50) < 10:
                mcp_publish("risk_alert",  {
                    "type": "MARKET_PANIC",
                    "fear_greed_index": fear_greed_index,

                    "message": "Extreme fear in market - consider defensive positioning",
                    "severity": "HIGH"
                })
            total_market_change = market_data.get("total_market_cap_change_1h", 0)
            if total_market_change < -10:  # 10% drop in 1 hour
                mcp_publish("risk_alert",  {
                    "type": "FLASH_CRASH",
                    "fear_greed_index": fear_greed_index,
                    "message": f"Potential flash crash detected - market down {total_market_change:.1%} in 1 hour",
                    "severity": "CRITICAL"
                })
        except Exception as e:
            logger.error(f"RiskAgent market anomaly check failed: {e}")

    def run(self):
        try:
            print("[Risk Agent] Starting...")
            asyncio.run(self.run_continuous_monitoring())
        except Exception as e:
            print(f"Error: {e}")



# --- PORTFOLIO MANAGER (PM) AGENT ---
class PMAgent:
    def make_decisions(self):
        print("[PM Agent] Making portfolio decisions using AI rebalancing...")
        research_insights = mcp_subscribe("market_data")
        risk_metrics = mcp_subscribe("risk_metrics")
        risk_alerts = mcp_subscribe("risk_alert")

        # Emergency/Rebalance Rules
        if any(alert.get("severity") == "CRITICAL" for alert in risk_alerts):
            print("[PM Agent] CRITICAL risk alerts detected, holding position.")
            mcp_publish("pm_instructions",{"action": "Emergency rebalancing, convert all to stablecoin", "detail": "" })
            mcp_publish("emergency_rebalance",{"action": "Emergency rebalancing, convert all to stablecoin" })
            return

        if risk_metrics:
            latest_metrics = risk_metrics[-1]
            if latest_metrics.get('risk_level') in ["HIGH", "CRITICAL"]:
                print(f"[PM Agent] Risk level {latest_metrics['risk_level']} - not rebalancing.")
                mcp_publish("pm_instructions",{"action": "No rebalance (HOLD)", "detail": "HIGH VOLATILITY" })
                return

        print("PMAgent insights::: ", research_insights, risk_metrics, risk_alerts)
        if len(research_insights) == 0 or len(risk_metrics)  == 0:
            print("No insights, PMAgent make_decisions ")
            mcp_publish("pm_instructions",{"action": "No rebalance (HOLD)", "detail": "NO STRONG INSIGHTS" })
            return

        data = self.get_balances()
        assets = data['assets']

        # Compose prompt for OpenAI
        prompt = f'''

            You are a crypto portfolio risk management AI. Your task is to generate a rebalance_order

            You are given three inputs about a crypto portfolio: Research Insights, Risk Metrics, and Risk Alerts.

            rebalance_order is a JSON object, follow this exact structure:

            {{
                "type": "rebalance_order",
                "sell_assets": [<array of token addresses>],
                "sell_amounts_bps": [<array of integers, basis points 1–10000>],
                "buy_assets": [<array of token addresses>],
                "buy_amounts_bps": [<array of integers, must sum to total proceeds>],
                "reason": "<concise explanation>"
            }}


            Rebalancing Rules:

                Buy Condition: Use the proceeds to buy assets that are not currently in the portfolio, have a "BUY" recommendation and haved a low RiskScore.

                Buy Amount: Distribute the purchase (buy_amounts_bps) proportionally among the selected buy assets.

                Sell Amount: For each asset that meets the sell condition, set the sell_amounts_bps to 5000 (i.e., sell 50% of the holding).

                Sell Condition: Initiate a sale if any asset in the current portfolio has a RiskScore greater than 0.9.

                No Action: If no assets meet the sell condition, return null.



            Restrictions:

            Token Mapping: Use only the provided mapping of token names to addresses:


                {TOKENS_TO_ADDRESS}\n


            Current Portfolio Assets:
                Sell decisions must be chosen only from the current portfolio assets:

                {assets}\n

            
            Sell Allocation (sell_amounts_bps): Assign integer basis point amounts (1–10000) for each sell asset.

            Buy Allocation (buy_amounts_bps): Allocate the proceeds into buy assets using basis points that sum 10000 bps (100%).

            Reason: Provide a concise one-sentence explanation, grounded in Research Insights, Risk Metrics, and Risk Alerts.

            No Action Case: If insights and risks suggest no change (best action is to hold), return only:


            null


            Input Data Structure:
                Token Insights:

                    score: Overall token score (0-100)
                    sentiment: BULLISH/NEUTRAL/BEARISH
                    confidence: Analysis confidence (0-1)
                    recommendation: BUY/HOLD/SELL
                    key_factors: Array of driving factors

                Risk Metrics:

                    std_risk: Standard deviation risk measure
                    RiskScore: Normalized risk (0-1, higher = riskier)

                Risk Alerts:

                    Array of active risk warnings requiring immediate action

            Inputs Provided:

            Token Insights: 
            
                    {json.dumps(research_insights, indent=2)}\n\n

            Risk Metrics: 
            
                    {json.dumps(risk_metrics, indent=2)}\n\n

            Risk Alerts: 
            
                    {json.dumps(risk_alerts, indent=2)}\n\n

            Output:

                        Return only the JSON object. No extra commentary.

            '''


        # Query OpenAI
        try:
            client = OpenAI(api_key=OPENAI_KEY)
            ai_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert crypto portfolio manager agent."},
                    {"role": "user", "content": prompt},
                ],
            )
            response_content = ai_response.choices[0].message.content
            print("[PM Agent] OpenAI response:", response_content)
            if "null" in response_content.lower().strip():
                print("[PM Agent] AI recommends no rebalance (HOLD).")
                mcp_publish("pm_instructions",{"action": "No rebalance (HOLD)", "detail": "NOT STRONG SIGNALS" })
                return

            order_json = None
            try:
                # Try to parse the JSON object directly
                order_json = json.loads(response_content.strip())
            except Exception:
                # Try to extract the JSON substring if the AI put text before/after
                import re
                matched = re.search(r"(\{.*\})", response_content, re.DOTALL)
                if matched:
                    order_json = json.loads(matched.group(1))


            #  Publish if it's a valid dict and has both sell_assets and buy_assets
            if (order_json
                and isinstance(order_json, dict)
                and "sell_assets" in order_json
                and "buy_assets" in order_json):

                order_json["uuid"] = str(uuid.uuid4())
                mcp_publish("pm_instructions", {"action": "Rebalance order", "detail": order_json } )
                mcp_publish("trade_instructions", order_json)
                print(f"[PM Agent] ISSUED AI REBALANCE ORDER: {order_json}")
            else:
                print("[PM Agent] AI did not return a valid rebalance order.")

        except Exception as e:
            print(f"[PM Agent] OpenAI error or parsing error: {e}")
            print(prompt)

    def get_balances(self):
        try:
            print("get_balances")
            if not all([PROVIDER_URL, UNIPOOL_CONTRACT_ADDRESS, UNIPOOL_CONTRACT_ABI]):
                return jsonify({"success": False, "error": "Contract/web3 config missing"}), 500

            w3 = Web3(Web3.HTTPProvider(PROVIDER_URL))
            if not w3.is_connected():
                return jsonify({"success": False, "error": "Web3 connection failed"}), 500

            contract = w3.eth.contract(
                address=Web3.to_checksum_address(UNIPOOL_CONTRACT_ADDRESS),
                abi=UNIPOOL_CONTRACT_ABI
            )
            addresses = contract.functions.portfolioAssetsList().call()
            pprint.pprint(addresses)
            result = [
                {
                    "address": w3.to_checksum_address(addr)
                }
                for addr in  addresses
            ]
            return  {"assets": result, "success": True}

        except Exception as e:
            print(f"[API] Error get_balances(): {e}") 
            return {"success": False, "error": str(e)}

    def run(self):
        try:
            print("[PM Agent] Starting...")
            self.make_decisions()
        except Exception as e:
            print(f"Error: {e}")



# --- TRADER AGENT ---
class TraderAgent:
    def __init__(self):
        self.processed_orders = deque(maxlen=100)

    def emergency_rebalance(self):
        """Emergency rebalancing to move to stablecoin"""

        data = self.get_balances()
        assets = data['assets']

        addresses_to_sell = []
        amount_to_sell = []
        for asset in assets:
            addresses_to_sell.append(asset['address'])
            amount_to_sell.append(10000) #sell all

        ## Emergency Rebalance
        tx_hash = execute_rebalance(addresses_to_sell, amount_to_sell, [], [])
        mcp_publish("trader_status", {
            "status": "Trade Complete",
            "details": "Emergency rebalance",
            "tx_hash": tx_hash
        })
        print(f"[Trader Agent] Trade complete. TxHash: {tx_hash}")

    def execute_trades(self):
        print("[Trader Agent] Checking for new trading instructions...")

        emergency = mcp_subscribe("emergency_rebalance")
        if emergency:
            self.emergency_rebalance()
            return

        instructions = mcp_subscribe("trade_instructions")
        if not instructions: return

        latest_order = instructions[-1]


        order_id = latest_order["uuid"]
        if order_id in self.processed_orders: return
        
        print(f"[Trader Agent] New order received: {latest_order}")
        
        # Publish status update for the UI
        mcp_publish("trader_status", {
            "status": "Executing Trade",
            "details": latest_order
        })
        time.sleep(3) # Simulate execution time

        tx_hash = execute_rebalance(  latest_order["sell_assets"], latest_order["sell_amounts_bps"], latest_order["buy_assets"], latest_order["buy_amounts_bps"])

        # Publish result for the UI
        mcp_publish("trader_status", {
            "status": "Trade Complete",
            "details": latest_order,
            "tx_hash": tx_hash
        })
        print(f"[Trader Agent] Trade complete. TxHash: {tx_hash}")
        self.processed_orders.append(order_id)


    def get_balances(self):
        try:
            print("get_balances")
            if not all([PROVIDER_URL, UNIPOOL_CONTRACT_ADDRESS, UNIPOOL_CONTRACT_ABI]):
                return jsonify({"success": False, "error": "Contract/web3 config missing"}), 500

            w3 = Web3(Web3.HTTPProvider(PROVIDER_URL))
            if not w3.is_connected():
                return jsonify({"success": False, "error": "Web3 connection failed"}), 500

            contract = w3.eth.contract(
                address=Web3.to_checksum_address(UNIPOOL_CONTRACT_ADDRESS),
                abi=UNIPOOL_CONTRACT_ABI
            )
            addresses = contract.functions.portfolioAssetsList().call()
            pprint.pprint(addresses)
            result = [
                {
                    "address": w3.to_checksum_address(addr)
                }
                for addr in  addresses
            ]
            return  {"assets": result, "success": True}

        except Exception as e:
            print(f"[API] Error get_balances(): {e}") 
            return  {"success": False, "error": str(e)}


    def run(self):
        try:
            time.sleep(20) 
            print("[Trader Agent] Starting...")
            self.execute_trades()
        except Exception as e:
            print(f"Error: {e}")

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    
 
    job1 = ResearchAgent()
    job2 = RiskAgent()
    job3 = PMAgent()
    job4 = TraderAgent()
    
    agent_thread = threading.Thread(target=run_mcp_server, args=[], daemon=True)
    agent_thread.start()
    def job():
        print("I'm working...")
 

    schedule.every(10).seconds.do(job)
    schedule.every(120).seconds.do(job1.run)
    schedule.every(120).seconds.do(job2.run)
    schedule.every(140).seconds.do(job3.run)
    schedule.every(180).seconds.do(job4.run)
    while True:
        schedule.run_pending()
        time.sleep(1)
