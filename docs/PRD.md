# Product Requirements Document (PRD)
## Corridor Scout - Phase 0

**Version:** 1.0  
**Date:** February 2026  
**Author:** Product Team  
**Status:** Ready for Development

---

## 1. Executive Summary

### 1.1 Product Vision
Corridor Scout is a public dashboard that provides real-time visibility into cross-chain bridge health, helping DeFi users, protocols, and researchers understand corridor reliability, liquidity conditions, and potential risks before executing cross-chain transfers.

### 1.2 Problem Statement
Cross-chain transfers are opaque. Users have no visibility into:
- Current corridor health and reliability
- Expected settlement times vs actual performance
- Liquidity conditions that could impact large transfers
- Early warning signs of bridge stress or failure

This leads to stuck transfers, unexpected slippage, and poor user experiences.

### 1.3 Solution
A real-time monitoring dashboard that surfaces:
- Corridor health status across major bridges
- Settlement time percentiles (p50, p90)
- Liquidity fragility indicators
- Impact preview for large transfers
- Anomaly detection and alerts

### 1.4 Success Metrics (60-day targets)
| Metric | Target |
|--------|--------|
| Daily Active Users | 100+ |
| Weekly Return Rate | 30%+ |
| Impact Calculations/Week | 500+ |
| GitHub Stars | 50+ |
| Twitter Followers | 500+ |
| Inbound Conversations | 10+ |

---

## 2. User Personas

### 2.1 DeFi Power User (Primary)
**Profile:** Experienced DeFi user moving $10K-$1M across chains regularly
**Goals:** 
- Execute transfers reliably
- Minimize settlement time
- Avoid getting stuck
**Pain Points:**
- No way to compare bridge performance
- Blindsided by stuck transfers
- Uncertainty about large transfer impact

### 2.2 Protocol Treasury Manager
**Profile:** Manages multi-million dollar treasury across chains
**Goals:**
- Move large amounts safely
- Understand liquidity conditions
- Plan transfers during optimal conditions
**Pain Points:**
- No impact preview for large transfers
- No historical performance data
- Fragmented information across bridges

### 2.3 DeFi Researcher/Analyst
**Profile:** Studies cross-chain dynamics, writes reports
**Goals:**
- Access clean, reliable data
- Identify trends and patterns
- Monitor system health
**Pain Points:**
- Data is scattered across explorers
- No unified view of corridor health
- Hard to track historical patterns

---

## 3. Feature Requirements

### 3.1 Dashboard Overview (P0)

**Description:** Landing page showing system-wide health at a glance

**Requirements:**
- FR-1.1: Display total corridors monitored, broken down by health status
- FR-1.2: Show live indicator confirming real-time data connection
- FR-1.3: Display last update timestamp
- FR-1.4: Auto-refresh every 30 seconds (configurable)
- FR-1.5: Show active anomaly count with severity breakdown

**Acceptance Criteria:**
- Dashboard loads in <3 seconds
- Health counts are accurate within 1 minute
- Live indicator reflects actual WebSocket connection state

### 3.2 Liquidity Flight Velocity Display (P0)

**Description:** Per-chain visualization of net liquidity flows

**Requirements:**
- FR-2.1: Show each monitored chain with 24h LFV percentage
- FR-2.2: Color code by interpretation (flight=red, stable=green, inflow=blue)
- FR-2.3: Display visual bar showing relative TVL
- FR-2.4: Flag chains experiencing rapid flight (>10% outflow)
- FR-2.5: Show tooltip with absolute USD amounts on hover

**Acceptance Criteria:**
- LFV calculation matches specification formula
- Visual updates reflect new data within 5 minutes
- Hover interactions are smooth (<100ms)

### 3.3 Alert List (P0)

**Description:** Active anomalies requiring attention

**Requirements:**
- FR-3.1: Display all unresolved anomalies sorted by severity
- FR-3.2: Show anomaly type icon (latency, failure, liquidity)
- FR-3.3: Display affected corridor and bridge
- FR-3.4: Show time since detection
- FR-3.5: Link to corridor detail page
- FR-3.6: Max 5 alerts visible, expandable for more

**Acceptance Criteria:**
- New anomalies appear within 1 minute of detection
- Resolved anomalies disappear within 5 minutes
- Clicking alert navigates to correct corridor

### 3.4 Impact Calculator (P0)

**Description:** Preview liquidity impact before transfer

**Requirements:**
- FR-4.1: Input fields: amount (USD), bridge, source chain, destination chain
- FR-4.2: Calculate pool share percentage
- FR-4.3: Estimate slippage in basis points
- FR-4.4: Display impact level (negligible/low/moderate/high/severe)
- FR-4.5: Show warning message for moderate+ impact
- FR-4.6: Display current corridor health alongside estimate
- FR-4.7: Include disclaimer: "Directional estimate only. Not an execution guarantee."

**Acceptance Criteria:**
- Calculation completes in <500ms
- Results match specification formulas
- Disclaimer is always visible

### 3.5 Corridor Table (P0)

**Description:** Comprehensive list of all monitored corridors

**Requirements:**
- FR-5.1: Columns: Bridge, Route (source→dest), Health, p50, p90, Fragility
- FR-5.2: Sortable by any column
- FR-5.3: Filterable by bridge, source chain, destination chain
- FR-5.4: Health indicator with color coding
- FR-5.5: Click row to navigate to corridor detail
- FR-5.6: Show "Last transfer" timestamp

**Acceptance Criteria:**
- Table renders <100 corridors without lag
- Sort/filter operations are instant (<100ms)
- Mobile view shows key columns only

### 3.6 Corridor Detail Page (P1)

**Description:** Deep dive into single corridor performance

**Requirements:**
- FR-6.1: Show corridor identification (bridge, source, dest)
- FR-6.2: Display current health with explanation
- FR-6.3: 24h transfer count and success rate
- FR-6.4: Settlement time chart (histogram or time series)
- FR-6.5: Pool metrics: TVL, utilization, fragility
- FR-6.6: Recent transfers table (last 20)
- FR-6.7: Active anomalies for this corridor
- FR-6.8: Historical health trend (7 days)

**Acceptance Criteria:**
- Page loads in <2 seconds
- Charts render correctly on all screen sizes
- Historical data is accurate

### 3.7 API Access (P1)

**Description:** Public API for programmatic access

**Requirements:**
- FR-7.1: RESTful endpoints matching specification
- FR-7.2: JSON response format
- FR-7.3: Rate limiting: 100 requests/minute per IP
- FR-7.4: CORS enabled for browser access
- FR-7.5: OpenAPI/Swagger documentation
- FR-7.6: Versioned API paths (/api/v1/...)

**Acceptance Criteria:**
- All endpoints return valid JSON
- Rate limits are enforced
- Documentation is accurate and up-to-date

---

## 4. Non-Functional Requirements

### 4.1 Performance
- NFR-1: Page load <3 seconds on 4G connection
- NFR-2: API response <500ms p95
- NFR-3: Real-time updates <30 second latency
- NFR-4: Support 1000 concurrent users

### 4.2 Reliability
- NFR-5: 99.5% uptime target
- NFR-6: Graceful degradation when data sources fail
- NFR-7: No data loss for processed transfers
- NFR-8: Automatic recovery from transient failures

### 4.3 Security
- NFR-9: No authentication required for public data
- NFR-10: Rate limiting to prevent abuse
- NFR-11: Input validation on all API endpoints
- NFR-12: No sensitive data exposure

### 4.4 Accessibility
- NFR-13: WCAG 2.1 AA compliance
- NFR-14: Screen reader compatible
- NFR-15: Keyboard navigable
- NFR-16: Color-blind friendly indicators

### 4.5 Mobile
- NFR-17: Fully responsive design
- NFR-18: Touch-friendly interactions
- NFR-19: Usable on 320px width screens

---

## 5. Data Requirements

### 5.1 Data Collection
- Collect ALL transfer events (initiation + completion)
- Capture pool TVL snapshots every 5 minutes
- Store raw event data for future analysis
- Retain at least 90 days of historical data

### 5.2 Data Accuracy
- Match 99%+ of completions to initiations
- Pool TVL accurate within 5 minutes
- Settlement times accurate to the second
- Anomaly detection within 5 minutes of occurrence

### 5.3 Data Privacy
- No PII collection
- Wallet addresses are public blockchain data
- No user tracking beyond basic analytics

---

## 6. Technical Constraints

### 6.1 Infrastructure Budget
- Target: $0-50/month (free tiers)
- Database: Neon/Supabase free tier
- Redis: Upstash free tier
- Hosting: Vercel free tier
- RPC: Alchemy free tier (300M compute units/month)

### 6.2 Technology Choices
- Next.js 14 (App Router) - Required
- TypeScript - Required
- Tailwind CSS - Required
- PostgreSQL - Required
- Redis - Required for event queue

### 6.3 Integration Points
- Ethereum RPC (Mainnet, L2s)
- No external price feeds (use on-chain when possible)
- No external APIs except RPC

---

## 7. Out of Scope (Phase 0)

- User accounts/authentication
- Custom alerts/notifications
- Historical data export
- Multiple bridge comparison tool
- Webhook integrations
- Telegram/Discord bots
- Premium tier features
- Native mobile apps

---

## 8. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| RPC rate limits hit | Data gaps | Medium | Multi-provider fallback, aggressive caching |
| Bridge contract changes | Scout breaks | Medium | Monitor for upgrades, version ABIs |
| Database overwhelmed | Slow queries | Low | Proper indexing, archive old data |
| Low user adoption | Wasted effort | Medium | Open source, free API, Twitter presence |

---

## 9. Timeline

| Week | Milestone |
|------|-----------|
| 1-2 | Foundation: Next.js setup, database schema, Across scout |
| 3 | Core scouts: CCTP, Stargate + transfer processor |
| 4 | Calculators: Fragility, impact, LFV + anomaly detection |
| 5 | API: All endpoints implemented and documented |
| 6 | Dashboard: Main page with all components |
| 7 | Polish: Corridor detail page, mobile, error handling |
| 8 | Launch: Deploy, open source, announce |

---

## 10. Appendix

### 10.1 Glossary
- **Corridor**: A specific path (bridge + source + destination chain)
- **LFV**: Liquidity Flight Velocity - net flow rate of stablecoins
- **Fragility**: Risk indicator based on utilization and flow patterns
- **Settlement Time**: Duration from initiation to completion
- **Anomaly**: Detected deviation from normal behavior

### 10.2 Related Documents
- [System Specification](./SYSTEM-SPEC.md)
- [Architecture Diagrams](./ARCHITECTURE.md)
- [API Documentation](./API-SPEC.md)
- [Development Guide](./CLAUDE.md)