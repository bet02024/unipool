import requests
import json
import os
import asyncio
import aiohttp
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import time
import hashlib
import numpy as np
from textblob import TextBlob
import feedparser
from dotenv import load_dotenv
import tweepy
import praw

load_dotenv()


COINGECKO_API_URL = "https://api.coingecko.com/api/v3"
CG_API_KEY = os.getenv("CG_API_KEY")
NEWS_API_KEY = os.getenv("NEWS_API_KEY")
TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN")
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CACHE_DURATION = 300  # 5 minutes cache

cache = {}
last_request_time = {}

    
def get_cache_key(endpoint: str, params: Dict[str, Any]) -> str:
    """Generate cache key for request"""
    params_str = json.dumps(params, sort_keys=True)
    return hashlib.md5(f"{endpoint}:{params_str}".encode()).hexdigest()

def is_cache_valid(cache_key: str) -> bool:
    """Check if cache entry is still valid"""
    if cache_key not in cache:
        return False

    cached_time = cache[cache_key].get('timestamp', 0)
    return time.time() - cached_time < CACHE_DURATION



class MarketData():
    def __init__(self):
        self.session = None

    async def _make_request(self, endpoint: str, params: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Make HTTP request with optional headers"""
        try:
           
            logger.info(f"#### API request to {endpoint} - {headers} - {params}" )

            cache_key = get_cache_key(endpoint, params)
        
            if is_cache_valid(cache_key):
                logger.debug(f"Cache hit for {endpoint}")
                return cache[cache_key]['data']

            async with aiohttp.ClientSession() as session:
                async with session.get(endpoint, params=params, headers=headers) as response:
                    response.raise_for_status()
                    data = await response.json()
                    logger.debug(f"API request to {endpoint} successful")
                    return data
        except Exception as e:
            logger.error(f"API request failed for {endpoint}: {e}")
            raise Exception(f"API request failed: {e}")

    async def get_market_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get comprehensive market data"""
        try:
            limit = params.get("limit", 100)
            ids = params.get("coins", "")
            endpoint = f"{COINGECKO_API_URL}/coins/markets"
            api_params = {
                "vs_currency": "usd",
                "order": "market_cap_desc",
                "ids": ids,
                "price_change_percentage": "1h,24h,7d,14d"
            }
            #  "per_page": limit,
            headers = {"x-cg-demo-api-key": CG_API_KEY} if CG_API_KEY else None
            data = await self._make_request(endpoint, api_params, headers=headers)

            tokens = []
            for coin in data:
                token = {
                    "id": coin.get("id", ""),
                    "symbol": coin.get("symbol", "").upper(),
                    "name": coin.get("name", ""),
                    "price": coin.get("current_price", 0),
                    "market_cap": coin.get("market_cap", 0),
                    "total_volume": coin.get("total_volume", 0),
                    "high_24h": coin.get("high_24h", 0),
                    "low_24h": coin.get("low_24h", 0),
                    "price_change_1h": coin.get("price_change_percentage_1h_in_currency", 0),
                    "price_change_24h": coin.get("price_change_percentage_24h_in_currency", 0),
                    "price_change_7d": coin.get("price_change_percentage_7d_in_currency", 0),
                    "price_change_14d": coin.get("price_change_percentage_14d_in_currency", 0),
                    "market_cap_rank": coin.get("market_cap_rank", 0),
                    "circulating_supply": coin.get("circulating_supply", 0),
                    "total_supply": coin.get("total_supply", 0),
                }
                tokens.append(token)

            global_endpoint = f"{COINGECKO_API_URL}/global"
            #headers = {"x-cg-demo-api-key": CG_API_KEY} if CG_API_KEY else None
            global_data = await self._make_request(global_endpoint, {}, headers=None)

            response_data = {
                "tokens": tokens,
                "total_market_cap": global_data.get("data", {}).get("total_market_cap", {}).get("usd", 0),
                "total_volume": global_data.get("data", {}).get("total_volume", {}).get("usd", 0),
                "market_cap_change_24h": global_data.get("data", {}).get("market_cap_change_percentage_24h_usd", 0),
                "timestamp": datetime.now().isoformat()
            }

            return {"success": True, "data": response_data}

        except Exception as e:
            logger.error(f"Market data request failed: {e}")
            return {"success": False, "error": str(e)}

    async def get_token_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get detailed data for a specific token"""
        try:
            token_id = params.get("id", "")
            endpoint = f"{COINGECKO_API_URL}/coins/{token_id}"
            api_params = {
                "localization": "false",
                "tickers": "true",
                "market_data": "true",
                "community_data": "true",
                "developer_data": "true",
                "sparkline": "true"
            }
            headers = {"x-cg-demo-api-key": CG_API_KEY} if CG_API_KEY else None
            data = await self._make_request(endpoint, api_params, headers=headers)
            market_data = data.get("market_data", {})
            price_change_1h =  market_data['price_change_percentage_1h_in_currency']["usd"]

            token_data = {
                "symbol": data.get("symbol", "").upper(),
                "name": data.get("name", ""),
                "price": market_data.get("current_price", {}).get("usd", 0),
                "market_cap": market_data["market_cap"]["usd"],
                "volume_24h": market_data["total_volume"]["usd"],
                "price_change_1h": price_change_1h,
                "price_change_24h": market_data.get("price_change_percentage_24h", 0),
                "price_change_7d": market_data.get("price_change_percentage_7d", 0),
                "price_change_14d": market_data.get("price_change_percentage_14d", 0),
                "price_change_30d": market_data.get("price_change_percentage_30d", 0),
                "all_time_high": market_data.get("ath", {}).get("usd", 0),
                "all_time_low": market_data.get("atl", {}).get("usd", 0),
                "circulating_supply": market_data.get("circulating_supply", 0), 
                "total_supply": market_data.get("total_supply", 0),
                "max_supply": market_data.get("max_supply", 0),
                "market_cap_rank": market_data.get("market_cap_rank", 0),
                "sentiment_votes_up_percentage": data.get("sentiment_votes_up_percentage", 0),
                "sentiment_votes_down_percentage": data.get("sentiment_votes_down_percentage", 0),
                "community_score": data.get("community_score", 0),
                "developer_score": data.get("developer_score", 0),
                "liquidity_score": data.get("liquidity_score", 0),
                "public_interest_score": data.get("public_interest_score", 0),
                "links": {
                    "homepage": data.get("links", {}).get("homepage", []),
                    "blockchain_site": data.get("links", {}).get("blockchain_site", []),
                    "official_forum_url": data.get("links", {}).get("official_forum_url", []),
                    "chat_url": data.get("links", {}).get("chat_url", []),
                    "twitter_screen_name": data.get("links", {}).get("twitter_screen_name", ""),
                    "telegram_channel_identifier": data.get("links", {}).get("telegram_channel_identifier", ""),
                    "subreddit_url": data.get("links", {}).get("subreddit_url", "")
                }
            }
            return {"success": True, "data": token_data}
        except Exception as e:
            logger.error(f"Token data request failed: {e}")
            return {"success": False, "error": str(e)}

    async def get_market_overview(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get market overview including fear & greed index"""
        try:
            fear_greed_endpoint = "https://api.alternative.me/fng/"
            fear_greed_data = await self._make_request(fear_greed_endpoint, {"limit": 1})

            #headers = {"x-cg-demo-api-key": CG_API_KEY} if CG_API_KEY else None
            global_endpoint = f"{COINGECKO_API_URL}/global"
            global_data = await self._make_request(global_endpoint, {}, headers=None)

            headers = {"x-cg-demo-api-key": CG_API_KEY} if CG_API_KEY else None
            trending_endpoint = f"{COINGECKO_API_URL}/search/trending"
            trending_data = await self._make_request(trending_endpoint, {}, headers=headers)

            overview = {
                "fear_greed_index": int(fear_greed_data.get("data", [{}])[0].get("value", 50)),
                "fear_greed_classification": fear_greed_data.get("data", [{}])[0].get("value_classification", "Neutral"),
                "total_market_cap": global_data.get("data", {}).get("total_market_cap", {}).get("usd", 0),
                "total_volume": global_data.get("data", {}).get("total_volume", {}).get("usd", 0),
                "market_cap_change_24h": global_data.get("data", {}).get("market_cap_change_percentage_24h_usd", 0),
                "active_cryptocurrencies": global_data.get("data", {}).get("active_cryptocurrencies", 0),
                "markets": global_data.get("data", {}).get("markets", 0),
                "bitcoin_dominance": global_data.get("data", {}).get("market_cap_percentage", {}).get("btc", 0),
                "ethereum_dominance": global_data.get("data", {}).get("market_cap_percentage", {}).get("eth", 0),
                "trending_coins": [
                    {
                        "name": coin.get("item", {}).get("name", ""),
                        "symbol": coin.get("item", {}).get("symbol", ""),
                        "market_cap_rank": coin.get("item", {}).get("market_cap_rank", 0),
                        "price_btc": coin.get("item", {}).get("price_btc", 0)
                    }
                    for coin in trending_data.get("coins", [])
                ],
                "timestamp": datetime.now().isoformat()
            }

            return {"success": True, "data": overview}

        except Exception as e:
            logger.error(f"Market overview request failed: {e}")
            return {"success": False, "error": str(e)}

    async def check_market_anomalies(self) -> Dict[str, Any]:
        """Check for market-wide anomalies and black swan events"""
        try:
            # Get market overview data from alternative.me fear & greed index and coingecko global
            fear_greed_endpoint = "https://api.alternative.me/fng/"
            fear_greed_data = await self._make_request(fear_greed_endpoint, {"limit": 1})

            #headers = {"x-cg-demo-api-key": CG_API_KEY} if CG_API_KEY else None
            global_endpoint = f"{COINGECKO_API_URL}/global"
            global_data = await self._make_request(global_endpoint, {}, headers=None)

            alerts = []

            fear_greed_index = int(fear_greed_data.get("data", [{}])[0].get("value", 50))

            if fear_greed_index < 10:
                alerts.append({
                    "type": "MARKET_PANIC",
                    "message": "Extreme fear in market - consider defensive positioning",
                    "severity": "HIGH"
                })

            # Check for flash crash indicators - example: 24 hour market cap change (if available)
            total_market_change_1h = global_data.get("data", {}).get("market_cap_change_percentage_24h_usd", 0)
            if total_market_change_1h is not None and total_market_change_1h < -10:
                alerts.append({
                    "type": "FLASH_CRASH",
                    "message": f"Potential flash crash detected - market down {total_market_change_1h:.1f}% in 1 hour",
                    "severity": "CRITICAL"
                })

            return {"success": True, "alerts": alerts}

        except Exception as e:
            logger.error(f"Market anomaly check failed: {e}")
            return {"success": False, "error": str(e)}

    def extract_key_factors(self, market_data, news_data, social_data) -> List[str]:
        """Extract key factors driving the analysis"""
        factors = []
        if market_data.get("price_change_24h", 0) > 5:
            factors.append("Strong price momentum")
        elif market_data.get("price_change_24h", 0) < -5:
            factors.append("Negative price pressure")
        
        if news_data.get("sentiment_score", 50) > 70:
            factors.append("Positive news sentiment")
        elif news_data.get("sentiment_score", 50) < 30:
            factors.append("Negative news sentiment")
        
        if social_data.get("sentiment_score", 50) > 70:
            factors.append("Strong social media buzz")
        return factors

 

    def calculate_market_score(self, market_data) -> float:
        """Calculate market fundamentals score"""
        market_cap = market_data.get("market_cap", 0)
        volume_24h = market_data.get("volume_24h", 0)
        
        # Liquidity score
        liquidity_ratio = volume_24h / market_cap if market_cap > 0 else 0
        liquidity_score = min(liquidity_ratio * 1000, 50)  # Cap at 50
        
        return liquidity_score

    def get_recommendation(self, score: float) -> str:
        """Get buy/sell/hold recommendation"""
        if score > 75:
            return "BUY"
        elif score < 25:
            return "SELL"
        else:
            return "HOLD"

    def calculate_technical_score(self, market_data) -> float:
        """Calculate technical analysis score"""
        # Simplified technical analysis
        price_change = market_data.get("price_change_24h", 0)
        volume_change = market_data.get("volume_change_24h", 0)
        score = 50  # Neutral baseline
        # Price momentum
        if price_change > 0:
            score += min(price_change * 2, 30)
        else:
            score += max(price_change * 2, -30)
        
        # Volume confirmation
        if volume_change > 0 and price_change > 0:
            score += min(volume_change, 20)
        
        return max(0, min(100, score))

    def calculate_comprehensive_score(self, market_data, news_data, social_data) -> float:
        """Calculate comprehensive token score (0-100)"""
        # Technical analysis score (40% weight)
        technical_score = self.calculate_technical_score(market_data)
        
        # News sentiment score (30% weight)
        news_score = news_data.get("sentiment_score", 50)
        
        # Social sentiment score (20% weight)
        social_score = social_data.get("sentiment_score", 50)
        
        # Market metrics score (10% weight)
        market_score = self.calculate_market_score(market_data)
        
        final_score = (
            technical_score * 0.4 +
            news_score * 0.3 +
            social_score * 0.2 +
            market_score * 0.1
        )
        
        return max(0, min(100, final_score))


class NewsAndSocialMediaData():
    def __init__(self):
        self.session = None
        try:
            self.twitter_client = tweepy.Client(
                bearer_token=TWITTER_BEARER_TOKEN,
                wait_on_rate_limit=True
            )
        except Exception as e:
            logger.warning(f"Twitter client initialization failed: {e}")

    async def _make_request(self, endpoint: str, params: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Make HTTP request with optional headers"""
        try:
            logger.info(f"#### API request to {endpoint} - {headers} - {params}" )
            async with aiohttp.ClientSession() as session:
                async with session.get(endpoint, params=params, headers=headers) as response:
                    response.raise_for_status()
                    data = await response.json()
                    logger.debug(f"API request to {endpoint} successful")
                    return data
        except Exception as e:
            logger.error(f"API request failed for {endpoint}: {e}")
            raise Exception(f"API request failed: {e}")

    async def get_social_sentiment(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get social media sentiment analysis for a token"""
        try:
            token = params.get("token", "")
            limit = params.get("limit", 100)

            twitter_posts = await self.fetch_twitter_posts(token, limit // 2)
            reddit_posts = await self.fetch_reddit_posts(token, limit // 2)

            all_posts = twitter_posts + reddit_posts
            sentiment_scores = []
            analyzed_posts = []

            for post in all_posts:
                content = post.get("text", "")
                if not content:
                    continue
                    
                blob = TextBlob(content)
                sentiment_score = (blob.sentiment.polarity + 1) * 50
                sentiment_scores.append(sentiment_score)

                analyzed_posts.append({
                    "platform": post.get("platform", ""),
                    "text": content[:200],  # Truncated
                    "author": post.get("author", ""),
                    "created_at": post.get("created_at", ""),
                    "engagement": post.get("engagement", 0),
                    "sentiment_score": sentiment_score,
                    "sentiment_label": self.get_sentiment_label(sentiment_score)
                })

            overall_sentiment_score = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 50
            overall_sentiment_label = self.get_sentiment_label(overall_sentiment_score)

            confidence = min(len(sentiment_scores) / 50, 1.0) * 0.6
            if sentiment_scores:
                score_variance = np.var(sentiment_scores)
                confidence += (1 - min(score_variance / 625, 1.0)) * 0.4

            buzz_score = min(len(all_posts) / 100, 1.0) * 100

            response_data = {
                "token": token,
                "overall_sentiment": overall_sentiment_label,
                "sentiment_score": overall_sentiment_score,
                "confidence": confidence,
                "buzz_score": buzz_score,
                "posts_analyzed": len(sentiment_scores),
                "platform_breakdown": {
                    "twitter": len(twitter_posts),
                    "reddit": len(reddit_posts)
                },
                "top_posts": analyzed_posts[:10],
                "timestamp": datetime.now().isoformat()
            }

            return {"success": True, "data": response_data}

        except Exception as e:
            logger.error(f"Social sentiment analysis failed: {e}")
            return {"success": False, "error": str(e)}

    async def fetch_reddit_posts(self, token: str, limit: int) -> List[Dict[str, Any]]:
        """Fetch Reddit posts about a token using praw"""
        posts = []
        try:
            reddit = praw.Reddit(
                client_id=REDDIT_CLIENT_ID,
                client_secret=REDDIT_CLIENT_SECRET,
                user_agent=REDDIT_USER_AGENT
            )
            for post in reddit.subreddit("all").search(token, limit=limit):
                engagement = (
                    (post.num_comments or 0) +
                    (post.clicked or 0) +
                    (post.score or 0)
                )
                posts.append({ 
                    "platform": "reddit",
                    "text": post.selftext or "",
                    "author": str(post.author) if post.author else "",
                    "created_at": datetime.utcfromtimestamp(post.created_utc).isoformat(),
                    "engagement": engagement
                })

        except Exception as e:
            logger.warning(f"Reddit fetch failed: {e}")
        return posts

    async def fetch_twitter_posts(self, token: str, limit: int) -> List[Dict[str, Any]]:
        """Fetch Twitter posts about a token"""
        posts = []
        
        if not self.twitter_client:
            return posts
        
        try:
            query = f"${token} OR #{token} OR {token} -is:retweet lang:en"
            tweets = self.twitter_client.search_recent_tweets(
                query=query,
                max_results=min(limit, 100),
                tweet_fields=["created_at", "author_id", "public_metrics"]
            )
            
            if tweets.data:
                for tweet in tweets.data:
                    engagement = (
                        tweet.public_metrics.get("retweet_count", 0) +
                        tweet.public_metrics.get("like_count", 0) +
                        tweet.public_metrics.get("reply_count", 0)
                    )
                    posts.append({
                        "platform": "twitter",
                        "text": tweet.text,
                        "author": tweet.author_id,
                        "created_at": tweet.created_at.isoformat() if tweet.created_at else "",
                        "engagement": engagement
                    })
        
        except Exception as e:
            logger.warning(f"Twitter fetch failed: {e}")
        
        return posts

    async def get_twitter_metrics(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get Twitter-specific metrics for a token"""
        try:
            token = params.get("token", "")
            if not self.twitter_client:
                return {"success": False, "error": "Twitter client not initialized"}
            query = f"${token} OR #{token} OR {token} -is:retweet lang:en"
            tweets = self.twitter_client.search_recent_tweets(
                query=query,
                max_results=100,
                tweet_fields=["created_at", "author_id", "public_metrics"]
            )
            total_tweets = len(tweets.data) if tweets.data else 0
            total_likes = sum(tweet.public_metrics.get("like_count", 0) for tweet in tweets.data) if tweets.data else 0
            total_retweets = sum(tweet.public_metrics.get("retweet_count", 0) for tweet in tweets.data) if tweets.data else 0
            total_replies = sum(tweet.public_metrics.get("reply_count", 0) for tweet in tweets.data) if tweets.data else 0
            response_data = {
                "token": token,
                "total_tweets": total_tweets,
                "total_likes": total_likes,
                "total_retweets": total_retweets,
                "total_replies": total_replies,
                "timestamp": datetime.now().isoformat()
            }
            return {"success": True, "data": response_data}
        except Exception as e:
            logger.error(f"Twitter metrics retrieval failed: {e}")
            return {"success": False, "error": str(e)}

    def get_sentiment_label(self, score: float) -> str:
        """Convert sentiment score to label"""
        if score >= 60:
            return "BULLISH"
        elif score <= 40:
            return "BEARISH"
        else:
            return "NEUTRAL"

    async def get_sentiment(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get news sentiment analysis for a token"""
        try:
            token = params.get("token", "")
            days = params.get("days", 7)
            news_articles = await self.fetch_news_articles(token, days)
            sentiment_scores = []
            article_sentiments = []
            for article in news_articles:
                title = article.get("title", "")
                description = article.get("description", "")
                content = f"{title}. {description}"
                blob = TextBlob(content)
                sentiment_score = blob.sentiment.polarity
                normalized_score = (sentiment_score + 1) * 50
                sentiment_scores.append(normalized_score)
                article_sentiments.append({
                    "title": title,
                    "url": article.get("url", ""),
                    "published_at": article.get("publishedAt", ""),
                    "sentiment_score": normalized_score,
                    "sentiment_label": self.get_sentiment_label(normalized_score)
                })
            overall_sentiment_score = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 50
            overall_sentiment_label = self.get_sentiment_label(overall_sentiment_score)
            confidence = min(len(sentiment_scores) / 10, 1.0) * 0.5
            if sentiment_scores:
                score_variance = np.var(sentiment_scores)
                confidence += (1 - min(score_variance / 625, 1.0)) * 0.5
            response_data = {
                "token": token,
                "overall_sentiment": overall_sentiment_label,
                "sentiment_score": overall_sentiment_score,
                "confidence": confidence,
                "articles_analyzed": len(sentiment_scores),
                "articles": article_sentiments[:10],
                "timestamp": datetime.now().isoformat()
            }
            return {"success": True, "data": response_data}
        except Exception as e:
            logger.error(f"News sentiment analysis failed: {e}")
            return {"success": False, "error": str(e)}

    async def fetch_news_articles(self, token: str, days: int) -> List[Dict[str, Any]]:
        """Fetch news articles for a token"""
        articles = []
        try:
            from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
            endpoint = "https://newsapi.org/v2/everything"
            params = {
                "q": f"{token} cryptocurrency OR {token} crypto OR {token} blockchain",
                "from": from_date,
                "sortBy": "publishedAt",
                "apiKey": NEWS_API_KEY,
                "pageSize": 50
            }
            data = await self._make_request(endpoint, params)
            articles.extend(data.get("articles", []))
        except Exception as e:
            logger.warning(f"NewsAPI request failed: {e}")
        try:
            feed_url = "https://www.coindesk.com/arc/outboundfeeds/rss/"
            feed_data = feedparser.parse(feed_url)
            for entry in feed_data.entries[:20]:
                if token.lower() in entry.title.lower() or token.lower() in entry.summary.lower():
                    articles.append({
                        "title": entry.title,
                        "description": entry.summary,
                        "url": entry.link,
                        "publishedAt": entry.published
                    })
        except Exception as e:
            logger.warning(f"CoinDesk RSS fetch failed: {e}")
        return articles
    
    