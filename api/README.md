# Qonversion Attribution API

Receives webhook events from Qonversion and stores them for attribution analytics with Apple Search Ads.

## Architecture

```
Qonversion Webhooks → POST /webhook → PostgreSQL (events, user_attributions)
                                          ↓
                                   attribution_summary (ROAS)
```

## Quick Start (Local)

```bash
# 1. Create database
createdb qonversion_analytics
psql -d qonversion_analytics -f ../db/schema.sql

# 2. Configure environment
cp ../.env.example ../.env
# Edit .env with your DATABASE_URL

# 3. Install dependencies
npm install

# 4. Start server
npm start
```

## Quick Start (Docker)

```bash
cd ~/scripts/qonversion
docker compose up -d
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | / | API info |
| GET | /health | Health check |
| POST | /webhook | Receive Qonversion events |
| GET | /webhook/stats | Event statistics |

## Test Webhook

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "event-123",
    "user_id": "user-456",
    "event": "trial_started",
    "product_id": "chat.yearly.null.v1.0423",
    "platform": "iOS",
    "environment": "production",
    "created_at": 1709740800
  }'
```

## Qonversion Dashboard Setup

1. Go to Qonversion Dashboard → Integrations → Webhooks
2. Add new webhook URL: `https://your-domain/webhook`
3. Select events: trial_started, subscription_started, subscription_renewed, etc.
4. Copy the webhook secret to WEBHOOK_SECRET env var (optional)

## Database Schema

- `events` - All webhook events (source of truth)
- `user_attributions` - Apple Search Ads attribution per user
- `apple_ads_campaigns` - Campaign spend data (from Apple Ads API)
- `attribution_summary` - View for ROAS analysis
