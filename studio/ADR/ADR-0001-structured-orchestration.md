# ADR-0001: Structured Studio Orchestration

## Status
Accepted

## Context
Automation of the coding workflow requires deterministic artifacts (state, plans, runs) rather than relying on prose in memory.

## Decision
All core orchestration files must follow the schemas defined in `/studio/PLANS/` and `/studio/REVIEWS/`.

## Consequences
- Higher reliability in automated runs.
- Easier auditing of logic.
- Automated gating enforcement.
