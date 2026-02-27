# Pre-Setup Guide
## Before You Start with Claude Code

Complete these steps BEFORE giving Claude Code the first prompt.

---

## Development Environment Options

You have two paths:

| Approach | Best For | Cost |
|----------|----------|------|
| **Local Development** | Building & testing, faster iteration | $0 |
| **Cloud Services** | Production, collaboration | $0 (free tiers) |

**Recommendation:** Start with local development, then migrate to cloud when you're ready to deploy.

---

## Option A: Local Development Setup (Recommended for Building)

### A1. PostgreSQL (You already have this!)

Since you have Postgres installed locally:

```bash
# Create the database
psql -U postgres
CREATE DATABASE corridor_scouts;
CREATE DATABASE corridor_scouts_test;  # For testing
\q
```

Your connection string will be:
```
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/corridor_scouts"
```

### A2. Redis via Docker (Recommended)

```bash
# Start Redis in Docker
docker run -d --name corridor-redis -p 6379:6379 redis:alpine

# Verify it's running
docker ps
```

Your Redis URL:
```
REDIS_URL="redis://localhost:6379"
```

**Alternative:** Install Redis locally
- Mac: `brew install redis && brew services start redis`
- Ubuntu: `sudo apt install redis-server`
- Windows: Use Docker or WSL

### A3. RPC Provider: Alchemy (Still needed)

You still need Alchemy for blockchain data - no local alternative:

1. Go to [alchemy.com](https://alchemy.com)
2. Sign up (free tier: 300M compute units/month)
3. Create an app, copy your API key

### A4. Local Environment File

Create `.env.local`:

```bash
# Local Database
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/corridor_scouts"

# Local Redis (Docker)
REDIS_URL="redis://localhost:6379"

# Alchemy (still cloud - no local alternative for RPC)
ALCHEMY_API_KEY="your-alchemy-api-key"

# Cron secret (for local testing, any value works)
CRON_SECRET="local-dev-secret"

# Environment flag
NODE_ENV="development"
```

### A5. Docker Compose (Optional but Nice)

If you want everything in Docker (including Postgres), create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: corridor-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: corridor_scouts
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    container_name: corridor-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

Then run:
```bash
docker-compose up -d
```

---

## Option B: Cloud Services Setup (For Production)

Use this when you're ready to deploy or want to collaborate.

### B1. Database: Neon PostgreSQL
1. Go to [neon.tech](https://neon.tech)
2. Sign up (free tier: 0.5 GB storage)
3. Create project "corridor-scouts"
4. Copy connection string

### B2. Redis: Upstash
1. Go to [upstash.com](https://upstash.com)
2. Sign up (free tier: 10K commands/day)
3. Create Redis database
4. Copy REST URL

### B3. Cloud Environment File

Create `.env.production`:

```bash
# Neon Database
DATABASE_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"

# Upstash Redis
REDIS_URL="rediss://default:xxx@us1-xxx.upstash.io:6379"

# Alchemy
ALCHEMY_API_KEY="your-alchemy-api-key"

# Cron secret (generate secure value)
CRON_SECRET="generate-a-random-32-char-string"

NODE_ENV="production"
```

---

## Migration Strategy: Local → Cloud

The project is designed to make migration easy:

### What Makes Migration Simple

1. **Prisma ORM** - Same schema works everywhere
   ```bash
   # Local
   DATABASE_URL="postgresql://localhost..." npx prisma migrate deploy
   
   # Cloud (just change the URL)
   DATABASE_URL="postgresql://neon.tech..." npx prisma migrate deploy
   ```

2. **Environment Variables** - Just swap `.env` files
   ```bash
   # Development
   cp .env.local .env
   
   # Production
   cp .env.production .env
   ```

3. **Redis** - Same ioredis client works with local and Upstash
   - Local: `redis://localhost:6379`
   - Upstash: `rediss://...upstash.io:6379`

### Migration Steps (When Ready)

**Step 1: Set up cloud services** (Neon, Upstash)

**Step 2: Export local data (if you have data worth keeping)**
```bash
# Export from local Postgres
pg_dump -U postgres corridor_scouts > backup.sql

# Import to Neon
psql "postgresql://user:pass@neon.tech/db" < backup.sql
```

**Step 3: Run migrations on cloud**
```bash
DATABASE_URL="your-neon-url" npx prisma migrate deploy
```

**Step 4: Update Vercel environment variables**
- Add production DATABASE_URL, REDIS_URL, etc.

**Step 5: Deploy**
```bash
vercel --prod
```

### Data Considerations for Phase 0

Since this is the data collection phase:

| Data Type | Volume (Est. 60 days) | Migration Notes |
|-----------|----------------------|-----------------|
| Transfers | ~500K-1M rows | Export/import via pg_dump |
| Pool Snapshots | ~250K rows | Same |
| Anomalies | ~5K rows | Same |

**Total estimated size:** 200-500 MB (well within Neon's free tier)

**Recommendation:** 
- Develop locally for the first few weeks
- Migrate to cloud once you're ready to run 24/7 data collection
- The data you collect during development is test data anyway

---

## Project Setup

### Required Software
- **Node.js 18+** - Check with `node --version`
- **Docker** (optional) - For Redis, or full stack
- **Git** - Check with `git --version`

### Create Project Structure

```bash
# Create project directory
mkdir corridor-scouts
cd corridor-scouts

# Create docs folder
mkdir docs
```

### Add Documentation Files

```
corridor-scouts/
├── CLAUDE.md                    # Root level
├── UPDATED-SPEC.md              # Root level (source of truth)
├── .env.local                   # Your local credentials
├── .env.production              # Cloud credentials (create later)
├── docker-compose.yml           # Optional
└── docs/
    ├── PRD.md
    ├── SYSTEM-SPEC.md
    ├── API-SPEC.md
    └── ARCHITECTURE-DIAGRAMS.md
```

---

## Quick Start Checklist

### For Local Development:
- [ ] PostgreSQL running locally (you have this!)
- [ ] Create `corridor_scouts` database
- [ ] Redis running (Docker: `docker run -d -p 6379:6379 redis:alpine`)
- [ ] Alchemy account + API key
- [ ] `.env.local` created
- [ ] Documentation files in place
- [ ] Node.js 18+ installed

### Ready to go! First prompt:

```
First, read the following documentation files to understand the project:
1. Read CLAUDE.md completely
2. Read UPDATED-SPEC.md completely (this is the source of truth)
3. Read docs/PRD.md for product requirements
4. Read docs/SYSTEM-SPEC.md for technical architecture

After reading, confirm you understand the project...
[rest of Prompt 0.1]
```

---

## Troubleshooting

### Local Postgres connection refused
```bash
# Check if Postgres is running
pg_isready

# If not, start it
# Mac: brew services start postgresql
# Linux: sudo systemctl start postgresql
```

### Docker Redis won't start
```bash
# Check if port 6379 is in use
lsof -i :6379

# Kill existing process or use different port
docker run -d -p 6380:6379 redis:alpine
# Then use REDIS_URL="redis://localhost:6380"
```

### Prisma can't connect to database
```bash
# Test connection directly
psql $DATABASE_URL

# Common fixes:
# - Check password doesn't have special chars (or URL-encode them)
# - Ensure database exists
# - Check pg_hba.conf allows local connections
```

---

## Cost Summary

### Local Development
| Service | Cost |
|---------|------|
| Local Postgres | $0 |
| Docker Redis | $0 |
| Alchemy (free tier) | $0 |
| **Total** | **$0** |

### Cloud Production
| Service | Free Tier | Our Usage |
|---------|-----------|-----------|
| Neon | 0.5 GB | ~200-500 MB |
| Upstash | 10K cmd/day | ~5K/day |
| Alchemy | 300M CU/mo | ~50M/mo |
| Vercel | 100 GB BW | ~5 GB/mo |
| **Total** | | **$0** |

You only pay if you significantly exceed free tier limits.