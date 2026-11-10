# Account Focus · Design

Why the product works the way it does. For components, tables and APIs see [ARCHITECTURE.md](ARCHITECTURE.md). Living version: [Claude doc](https://claude.ai/artifact/HrF1873SL55bKFe817RCNU).

## The decision the product makes

**Where should this seller spend the next unit of selling time, and what should they do with it?** The primary user is an account executive who owns 30–150 accounts and can actively work 10–15. The constraint is attention, not information.

| Question | Output |
| --- | --- |
| Which accounts deserve attention today? | Five picks per seller |
| Why this account, why now? | One cited sentence |
| Who should I engage, and who is missing? | Buying-group map with gaps |
| What do I say to the executive? | Exec prep one-pager |
| What do I do next? | One action from a fixed catalog |
| Did it work? | Acceptance, meetings and pipeline vs a holdout |

## Five design choices

1. **Four numbers, not one blended score.** Attractiveness (worth winning?), Momentum (moving now?), Readiness (can we reach the people who decide?) and Confidence (how much do we trust the evidence?). Attractiveness and Momentum set the rank. Readiness changes the action; it never buries a hot account.
2. **The unit is account × motion.** New logo, expansion and renewal risk use different signals and actions. Each brief allows at most three picks per motion.
3. **Trackers find candidates; reading confirms them.** A tracker hit on "budget" fires when our rep asks "do you have budget?" just as readily as when the CFO says it is set aside. Only customer-spoken statements count; a speaker we cannot match to a contact counts half.
4. **Outside-in joined to inside.** Public strategy, executive changes and hiring are mapped to the seller's value propositions and to what the customer has said on calls. Contradictions become their own insight.
5. **Deterministic numbers, model-written narrative.** The engine computes every score. Wording comes from scripted drafts or Cortex and passes a validator that removes any sentence without valid evidence.

## Scoring

**Attractiveness** = 0.5 × ICP fit + 0.3 × whitespace + 0.2 × strategic alignment.

**Momentum.** Signals that describe the same thing (a CFO's budget remark and the opportunity it created) form one event; corroboration is the number of distinct sources behind it.

```
M = 100 × (1 − exp(−Σ s × w × c × 2^(−age / half_life) × (1 + 0.25 × min(k − 1, 2))))
```

s = event strength, w = family weight, c = count weight (1, 0.5 for an unmatched speaker, 0 for our own side), k = corroborating sources. The saturating curve stops one noisy account from running away with the brief. For the renewal-risk motion, momentum is built from risk signals.

| Signal family | Half-life (days) | Weight |
| --- | --- | --- |
| Customer-spoken call signal | 30 | 1.0 |
| Opportunity created or advanced | 21 | 0.9 |
| Usage threshold | 21 | 0.8 |
| Renewal | 60 | 0.8 |
| Executive change | 90 | 0.7 |
| Engagement | 14 | 0.5 |
| Third-party intent | 10 | 0.4 |
| Hiring | 45 | 0.3 |
| Stated strategy | 180 | 0.3 |

**Readiness** counts required roles, not contacts: economic buyer, champion, technical evaluator, executive sponsor. Engaged in the last 60 days = 1, mapped = 0.5, missing = 0. Fifty contacts with no economic buyer is low readiness.

**Confidence** starts at 92 and loses points for a missing or stale baseline score, an unmatched call speaker, public-only evidence, missing firmographics, no customer call in 90 days and unmapped roles.

**Priority** = √(Attractiveness × Momentum). The geometric mean means an account has to be good on both.

**Action routing**, in order: not scored → Research; attractiveness < 40 → Deprioritize; confidence < 50 → Verify; renewal risk → Rescue; momentum < 35 → Hold (watch); readiness < 40 → Multithread; expansion → Expand; otherwise Pursue.

**The brief.** Four ranked picks plus one exploration slot (the most attractive remaining account the model is less sure about). Without exploration, the model only learns from accounts it already likes. A rejection keeps an account out for 14 days unless a strong new event (strength ≥ 0.7) arrives.

## Signal taxonomy

| Type | Example customer statement |
| --- | --- |
| Pain | "Our techs log into four apps before the first job." |
| Priority alignment | "The goal is to consolidate scheduling onto one platform." |
| Budget | "We have budget set aside for this in Q1." |
| Timeline | "We want every technician on one schedule before spring." |
| Process | "Procurement now wants every new tool to replace one." |
| Commitment | "Let's do a full review with my regional directors." |
| Expansion | "The Midwest depots want in after the pilot." |
| Objection / risk | "Nothing new until the network build finishes." |

## Gaps and contradictions

| Gap | Rule |
| --- | --- |
| Narrative mismatch | The customer asks for consolidation; our opportunity is an add-on |
| New executive, no relationship | Executive change in 90 days; nobody has met them |
| Single-threaded | Momentum ≥ 60 and only one customer speaker in 90 days |
| Champion risk | Champion not engaged for 45+ days |
| Stalled commitment or next step | A customer commitment over 21 days old, or a next step open 14+ days |
| Identity unverified | A call speaker is not matched to a CRM contact |
| Executive sponsor not engaged | Sponsor mapped but never on a call |

## Exec prep

Point of view ("We believe X is costing you Y, because Z"), their three priorities in their words, three discovery questions, one proof point, landmines and the ask. Every line is tagged public or internal so a seller never repeats a private remark as if it were public.

## Evaluation

The evaluation proves two separate things: the ranking finds accounts that convert, and the language says only true things. A persuasive explanation of a bad ranking is the failure to guard against. Offline: precision@5 and top-decile lift on point-in-time snapshots; call-signal precision against planted labels; groundedness. Online: treatment vs holdout matched on segment, territory and tenure, with accepted → acted → meeting → opportunity → pipeline counted separately.

## Boundary with the rest of GTM Orbit

| Account Focus owns | Other Orbit capabilities own |
| --- | --- |
| Which accounts, why now, who's missing, what action | Composing and sending outreach |
| Signals, scores, briefs, exec prep | Agent conversations |
| Feedback and outcome measurement | Seller approval of drafted messages |
