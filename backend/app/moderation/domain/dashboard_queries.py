"""SQL helpers powering the moderation admin dashboards."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Literal, Sequence

import asyncpg

_DEFAULT_RANGE_HOURS = 24


def _ensure_iter(seq: Sequence[str] | Iterable[str] | None) -> list[str]:
    return list(seq) if seq else []


async def fetch_kpis(
    conn: asyncpg.Connection,
    *,
    campus_filter: Sequence[str] | None = None,
) -> dict[str, Any]:
    campuses = _ensure_iter(campus_filter)
    params: list[Any] = []
    campus_clause_cases = ""
    campus_clause_reports = ""
    campus_clause_actions = ""
    campus_clause_appeals = ""
    if campuses:
        params.append(campuses)
        bind = len(params)
        campus_clause_cases = f"WHERE CAST(c.campus_id AS text) = ANY(${bind}::text[])"
        campus_clause_reports = (
            f"AND CAST(c.campus_id AS text) = ANY(${bind}::text[])"
        )
        campus_clause_actions = (
            f"AND CAST(c.campus_id AS text) = ANY(${bind}::text[])"
        )
        campus_clause_appeals = (
            f"AND CAST(c.campus_id AS text) = ANY(${bind}::text[])"
        )
    row = await conn.fetchrow(
        f"""
        WITH first_actions AS (
            SELECT c.id, MIN(a.created_at) AS first_action_at
            FROM mod_case c
            JOIN mod_action a ON a.case_id = c.id
            {campus_clause_cases}
            GROUP BY c.id
        ),
        actions_7d AS (
            SELECT COUNT(*) AS total
            FROM mod_action a
            JOIN mod_case c ON c.id = a.case_id
            WHERE a.created_at >= now() - interval '7 days'
            {campus_clause_actions}
        ),
        appeals AS (
            SELECT
                COUNT(*) FILTER (WHERE ap.created_at >= now() - interval '7 days') AS opened,
                COUNT(*) FILTER (WHERE ap.status = 'accepted' AND ap.reviewed_at >= now() - interval '7 days') AS accepted
            FROM mod_appeal ap
            JOIN mod_case c ON c.id = ap.case_id
            WHERE ap.created_at >= now() - interval '7 days'
            {campus_clause_appeals}
        )
        SELECT
            (SELECT COUNT(*) FROM mod_case c {campus_clause_cases})::bigint AS open_cases,
            (
                SELECT COUNT(*)
                FROM mod_report r
                JOIN mod_case c ON c.id = r.case_id
                WHERE r.created_at >= now() - interval '24 hours'
                {campus_clause_reports}
            )::bigint AS new_reports_24h,
            (
                SELECT COUNT(*)
                FROM mod_action a
                JOIN mod_case c ON c.id = a.case_id
                WHERE a.created_at >= now() - interval '24 hours'
                {campus_clause_actions}
            )::bigint AS actions_24h,
            COALESCE(
                (
                    SELECT percentile_cont(0.5) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (fa.first_action_at - c.created_at)) / 60.0
                    )
                    FROM mod_case c
                    JOIN first_actions fa ON fa.id = c.id
                    WHERE c.created_at >= now() - interval '7 days'
                ),
                0
            )::double precision AS median_tta_minutes_7d,
            COALESCE((SELECT opened FROM appeals), 0)::double precision AS appeals_opened_7d,
            COALESCE((SELECT accepted FROM appeals), 0)::double precision AS appeals_accepted_7d,
            COALESCE((SELECT total FROM actions_7d), 0)::double precision AS actions_7d
        """,
        *params,
    )
    if row is None:
        return {
            "open_cases": 0,
            "new_reports_24h": 0,
            "actions_24h": 0,
            "median_tta_minutes_7d": 0.0,
            "appeal_rate_7d": 0.0,
            "reversal_rate_7d": 0.0,
        }
    appeals = float(row["appeals_opened_7d"])
    appeals_accepted = float(row["appeals_accepted_7d"])
    actions_7d = float(row["actions_7d"]) or 0.0
    appeal_rate = appeals / actions_7d if actions_7d else 0.0
    reversal_rate = appeals_accepted / actions_7d if actions_7d else 0.0
    return {
        "open_cases": int(row["open_cases"] or 0),
        "new_reports_24h": int(row["new_reports_24h"] or 0),
        "actions_24h": int(row["actions_24h"] or 0),
        "median_tta_minutes_7d": float(row["median_tta_minutes_7d"] or 0.0),
        "appeal_rate_7d": round(appeal_rate, 6),
        "reversal_rate_7d": round(reversal_rate, 6),
    }


async def fetch_trends(
    conn: asyncpg.Connection,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    bucket: Literal["hour", "day"] | None = None,
    campus_filter: Sequence[str] | None = None,
) -> list[dict[str, Any]]:
    campuses = _ensure_iter(campus_filter)
    end = end or datetime.now(timezone.utc)
    start = start or end - timedelta(hours=_DEFAULT_RANGE_HOURS)
    bucket = bucket or ("day" if (end - start) > timedelta(days=7) else "hour")
    interval = "1 day" if bucket == "day" else "1 hour"
    params: list[Any] = [start, end, interval, bucket]
    campus_clause_cases = ""
    campus_clause_join = ""
    if campuses:
        params.append(campuses)
        bind = len(params)
        campus_clause_cases = f"AND CAST(c.campus_id AS text) = ANY(${bind}::text[])"
        campus_clause_join = f"AND CAST(c.campus_id AS text) = ANY(${bind}::text[])"
    rows = await conn.fetch(
        f"""
        WITH buckets AS (
            SELECT generate_series($1::timestamptz, $2::timestamptz, $3::interval) AS bucket
        ),
        report_counts AS (
            SELECT date_trunc($4, r.created_at) AS bucket, COUNT(*) AS count
            FROM mod_report r
            JOIN mod_case c ON c.id = r.case_id
            WHERE r.created_at BETWEEN $1 AND $2
            {campus_clause_join}
            GROUP BY 1
        ),
        case_counts AS (
            SELECT date_trunc($4, c.created_at) AS bucket, COUNT(*) AS count
            FROM mod_case c
            WHERE c.created_at BETWEEN $1 AND $2
            {campus_clause_cases}
            GROUP BY 1
        ),
        action_counts AS (
            SELECT date_trunc($4, a.created_at) AS bucket, COUNT(*) AS count
            FROM mod_action a
            JOIN mod_case c ON c.id = a.case_id
            WHERE a.created_at BETWEEN $1 AND $2
            {campus_clause_join}
            GROUP BY 1
        ),
        appeals_received AS (
            SELECT date_trunc($4, ap.created_at) AS bucket, COUNT(*) AS count
            FROM mod_appeal ap
            JOIN mod_case c ON c.id = ap.case_id
            WHERE ap.created_at BETWEEN $1 AND $2
            {campus_clause_join}
            GROUP BY 1
        ),
        appeals_accepted AS (
            SELECT date_trunc($4, ap.reviewed_at) AS bucket, COUNT(*) AS count
            FROM mod_appeal ap
            JOIN mod_case c ON c.id = ap.case_id
            WHERE ap.reviewed_at BETWEEN $1 AND $2 AND ap.status = 'accepted'
            {campus_clause_join}
            GROUP BY 1
        )
        SELECT
            b.bucket,
            COALESCE(r.count, 0) AS reports,
            COALESCE(cc.count, 0) AS cases_opened,
            COALESCE(ac.count, 0) AS actions_applied,
            COALESCE(ar.count, 0) AS appeals_received,
            COALESCE(aa.count, 0) AS appeals_accepted
        FROM buckets b
        LEFT JOIN report_counts r ON r.bucket = b.bucket
        LEFT JOIN case_counts cc ON cc.bucket = b.bucket
        LEFT JOIN action_counts ac ON ac.bucket = b.bucket
        LEFT JOIN appeals_received ar ON ar.bucket = b.bucket
        LEFT JOIN appeals_accepted aa ON aa.bucket = b.bucket
        ORDER BY b.bucket
        """,
        *params,
    )
    result: list[dict[str, Any]] = []
    for row in rows:
        result.append(
            {
                "bucket": row["bucket"].isoformat() if row["bucket"] else None,
                "reports": int(row["reports"] or 0),
                "cases_opened": int(row["cases_opened"] or 0),
                "actions_applied": int(row["actions_applied"] or 0),
                "appeals_received": int(row["appeals_received"] or 0),
                "appeals_accepted": int(row["appeals_accepted"] or 0),
            }
        )
    return result


async def fetch_workload(
    conn: asyncpg.Connection,
    *,
    campus_filter: Sequence[str] | None = None,
) -> dict[str, Any]:
    campuses = _ensure_iter(campus_filter)
    params: list[Any] = []
    campus_clause = ""
    if campuses:
        params.append(campuses)
        bind = len(params)
        campus_clause = f"AND CAST(c.campus_id AS text) = ANY(${bind}::text[])"
    queue_rows = await conn.fetch(
        f"""
        SELECT
            COALESCE(CAST(c.campus_id AS text), 'unknown') AS campus_id,
            c.severity,
            COUNT(*) FILTER (WHERE c.status = 'open') AS open_cases,
            COUNT(*) FILTER (WHERE c.status = 'escalated') AS escalated_cases
        FROM mod_case c
        WHERE c.status IN ('open','escalated')
        {campus_clause}
        GROUP BY 1, 2
        ORDER BY 1, 2
        """,
        *params,
    )
    sla_rows = await conn.fetch(
        f"""
        SELECT
            COALESCE(CAST(c.campus_id AS text), 'unknown') AS campus_id,
            c.severity,
            COUNT(*) AS breaches
        FROM mod_case c
        WHERE c.status = 'open'
          {campus_clause}
          AND EXTRACT(EPOCH FROM (now() - c.created_at)) / 60.0 > CASE
                WHEN c.severity >= 4 THEN 30
                WHEN c.severity >= 2 THEN 60
                ELSE 120
            END
        GROUP BY 1, 2
        ORDER BY 1, 2
        """,
        *params,
    )
    return {
        "queues": [
            {
                "campus_id": row["campus_id"],
                "severity": int(row["severity"]),
                "open": int(row["open_cases"] or 0),
                "escalated": int(row["escalated_cases"] or 0),
            }
            for row in queue_rows
        ],
        "sla_breaches": [
            {
                "campus_id": row["campus_id"],
                "severity": int(row["severity"]),
                "breaches": int(row["breaches"] or 0),
            }
            for row in sla_rows
        ],
    }


async def fetch_moderator_performance(
    conn: asyncpg.Connection,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    campus_filter: Sequence[str] | None = None,
    moderator_id: str | None = None,
) -> list[dict[str, Any]]:
    campuses = _ensure_iter(campus_filter)
    end = end or datetime.now(timezone.utc)
    start = start or end - timedelta(days=7)
    params: list[Any] = [start, end]
    campus_clause = ""
    if campuses:
        params.append(campuses)
        campus_idx = len(params)
        campus_clause = f"AND CAST(c.campus_id AS text) = ANY(${campus_idx}::text[])"
    moderator_clause = ""
    if moderator_id:
        params.append(moderator_id)
        moderator_clause = f"AND a.actor_id = ${len(params)}"
    rows = await conn.fetch(
        f"""
        WITH action_windows AS (
            SELECT
                a.case_id,
                a.actor_id,
                MIN(a.created_at) AS first_action_at,
                MAX(a.created_at) AS last_action_at
            FROM mod_action a
            JOIN mod_case c ON c.id = a.case_id
            WHERE a.created_at BETWEEN $1 AND $2
              AND a.actor_id IS NOT NULL
              {campus_clause}
              {moderator_clause}
            GROUP BY a.case_id, a.actor_id
        ),
        appeal_rollup AS (
            SELECT
                ap.reviewed_by AS actor_id,
                COUNT(*) FILTER (WHERE ap.status = 'accepted') AS appeals_accepted,
                COUNT(*) AS appeals_total
            FROM mod_appeal ap
            JOIN mod_case c ON c.id = ap.case_id
            WHERE ap.reviewed_at BETWEEN $1 AND $2
              AND ap.reviewed_by IS NOT NULL
              {campus_clause}
              {moderator_clause.replace('a.actor_id', 'ap.reviewed_by')}
            GROUP BY ap.reviewed_by
        )
        SELECT
            aw.actor_id,
            COUNT(DISTINCT aw.case_id) AS cases_closed,
            COALESCE(
                percentile_cont(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (aw.first_action_at - c.created_at)) / 60.0
                ),
                0
            ) AS median_tta_minutes,
            AVG(EXTRACT(EPOCH FROM (aw.last_action_at - aw.first_action_at)) / 60.0) AS working_time_est,
            COALESCE(ar.appeals_accepted, 0) AS appeals_accepted,
            COALESCE(ar.appeals_total, 0) AS appeals_total
        FROM action_windows aw
        JOIN mod_case c ON c.id = aw.case_id
        LEFT JOIN appeal_rollup ar ON ar.actor_id = aw.actor_id
        GROUP BY aw.actor_id, ar.appeals_accepted, ar.appeals_total
        ORDER BY cases_closed DESC
        """,
        *params,
    )
    result: list[dict[str, Any]] = []
    for row in rows:
        appeals_total = int(row["appeals_total"] or 0)
        appeal_accept_rate = (
            int(row["appeals_accepted"] or 0) / appeals_total if appeals_total else 0.0
        )
        result.append(
            {
                "moderator_id": row["actor_id"],
                "cases_closed": int(row["cases_closed"] or 0),
                "median_tta_minutes": float(row["median_tta_minutes"] or 0.0),
                "appeal_accept_rate": round(appeal_accept_rate, 6),
                "working_time_est": float(row["working_time_est"] or 0.0),
            }
        )
    return result
