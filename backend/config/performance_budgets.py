"""
Performance Budget Configuration

Defines measurable KPIs and thresholds for monitoring.
All optimizations must have a measurable target from this file.
"""

from dataclasses import dataclass
from typing import Dict
from enum import Enum


class MetricUnit(Enum):
    MILLISECONDS = "ms"
    SECONDS = "s"
    BYTES = "bytes"
    KILOBYTES = "KB"
    MEGABYTES = "MB"
    PERCENTAGE = "%"
    COUNT = "count"
    UNITLESS = ""


@dataclass
class PerformanceBudget:
    """A performance budget with target and warning thresholds."""
    
    name: str
    description: str
    target: float  # Good threshold
    warning: float  # Needs improvement threshold
    unit: MetricUnit
    category: str
    
    def evaluate(self, value: float) -> str:
        """Evaluate a metric value against thresholds."""
        if value <= self.target:
            return "good"
        elif value <= self.warning:
            return "needs-improvement"
        else:
            return "poor"


# ===== FRONTEND CORE WEB VITALS =====

FRONTEND_BUDGETS = {
    # Core Web Vitals (Google's metrics)
    "LCP": PerformanceBudget(
        name="Largest Contentful Paint",
        description="Time until the largest content element is rendered",
        target=2500,
        warning=4000,
        unit=MetricUnit.MILLISECONDS,
        category="core-web-vitals",
    ),
    "FCP": PerformanceBudget(
        name="First Contentful Paint",
        description="Time until first content is rendered",
        target=1800,
        warning=3000,
        unit=MetricUnit.MILLISECONDS,
        category="core-web-vitals",
    ),
    "CLS": PerformanceBudget(
        name="Cumulative Layout Shift",
        description="Visual stability score",
        target=0.1,
        warning=0.25,
        unit=MetricUnit.UNITLESS,
        category="core-web-vitals",
    ),
    "FID": PerformanceBudget(
        name="First Input Delay",
        description="Time from first interaction to browser response",
        target=100,
        warning=300,
        unit=MetricUnit.MILLISECONDS,
        category="core-web-vitals",
    ),
    "INP": PerformanceBudget(
        name="Interaction to Next Paint",
        description="Responsiveness to user interactions",
        target=200,
        warning=500,
        unit=MetricUnit.MILLISECONDS,
        category="core-web-vitals",
    ),
    "TTFB": PerformanceBudget(
        name="Time to First Byte",
        description="Server response time",
        target=800,
        warning=1800,
        unit=MetricUnit.MILLISECONDS,
        category="core-web-vitals",
    ),
    "TTI": PerformanceBudget(
        name="Time to Interactive",
        description="Time until page is fully interactive",
        target=3800,
        warning=7300,
        unit=MetricUnit.MILLISECONDS,
        category="core-web-vitals",
    ),
    
    # Bundle Size Budgets
    "JS_BUNDLE_SIZE": PerformanceBudget(
        name="JavaScript Bundle Size",
        description="Total JS transferred (compressed)",
        target=300,
        warning=500,
        unit=MetricUnit.KILOBYTES,
        category="bundle-size",
    ),
    "CSS_BUNDLE_SIZE": PerformanceBudget(
        name="CSS Bundle Size",
        description="Total CSS transferred (compressed)",
        target=50,
        warning=100,
        unit=MetricUnit.KILOBYTES,
        category="bundle-size",
    ),
    "TOTAL_PAGE_SIZE": PerformanceBudget(
        name="Total Page Size",
        description="Total transferred bytes",
        target=1500,
        warning=3000,
        unit=MetricUnit.KILOBYTES,
        category="bundle-size",
    ),
    "THIRD_PARTY_JS": PerformanceBudget(
        name="Third-Party JavaScript",
        description="JS from external domains",
        target=100,
        warning=200,
        unit=MetricUnit.KILOBYTES,
        category="bundle-size",
    ),
}


# ===== BACKEND API BUDGETS =====

BACKEND_BUDGETS = {
    # API Latency
    "API_P50": PerformanceBudget(
        name="API P50 Latency",
        description="50th percentile API response time",
        target=50,
        warning=100,
        unit=MetricUnit.MILLISECONDS,
        category="api-latency",
    ),
    "API_P95": PerformanceBudget(
        name="API P95 Latency",
        description="95th percentile API response time",
        target=150,
        warning=300,
        unit=MetricUnit.MILLISECONDS,
        category="api-latency",
    ),
    "API_P99": PerformanceBudget(
        name="API P99 Latency",
        description="99th percentile API response time",
        target=300,
        warning=500,
        unit=MetricUnit.MILLISECONDS,
        category="api-latency",
    ),
    
    # Specific Endpoint Budgets
    "AUTH_LATENCY": PerformanceBudget(
        name="Authentication Latency",
        description="Auth endpoint response time (P95)",
        target=200,
        warning=400,
        unit=MetricUnit.MILLISECONDS,
        category="endpoint-specific",
    ),
    "CHAT_MESSAGE_LATENCY": PerformanceBudget(
        name="Chat Message Latency",
        description="Chat send message response time (P95)",
        target=100,
        warning=200,
        unit=MetricUnit.MILLISECONDS,
        category="endpoint-specific",
    ),
    "DISCOVERY_LATENCY": PerformanceBudget(
        name="Discovery Search Latency",
        description="Discovery/search endpoint (P95)",
        target=300,
        warning=500,
        unit=MetricUnit.MILLISECONDS,
        category="endpoint-specific",
    ),
    
    # Database
    "DB_QUERY_P95": PerformanceBudget(
        name="Database Query P95",
        description="95th percentile database query time",
        target=50,
        warning=100,
        unit=MetricUnit.MILLISECONDS,
        category="database",
    ),
    
    # Error Rates
    "ERROR_RATE_5XX": PerformanceBudget(
        name="5xx Error Rate",
        description="Percentage of 5xx responses",
        target=0.1,
        warning=1.0,
        unit=MetricUnit.PERCENTAGE,
        category="reliability",
    ),
    "ERROR_RATE_4XX": PerformanceBudget(
        name="4xx Error Rate",
        description="Percentage of 4xx responses",
        target=5.0,
        warning=10.0,
        unit=MetricUnit.PERCENTAGE,
        category="reliability",
    ),
}


# ===== INFRASTRUCTURE BUDGETS =====

INFRA_BUDGETS = {
    "CPU_USAGE": PerformanceBudget(
        name="CPU Usage",
        description="Average CPU utilization",
        target=50,
        warning=80,
        unit=MetricUnit.PERCENTAGE,
        category="infrastructure",
    ),
    "MEMORY_USAGE": PerformanceBudget(
        name="Memory Usage",
        description="Average memory utilization",
        target=60,
        warning=85,
        unit=MetricUnit.PERCENTAGE,
        category="infrastructure",
    ),
    "REDIS_LATENCY": PerformanceBudget(
        name="Redis P95 Latency",
        description="Redis command latency",
        target=5,
        warning=20,
        unit=MetricUnit.MILLISECONDS,
        category="infrastructure",
    ),
}


# ===== BUDGET HELPERS =====

def get_all_budgets() -> Dict[str, PerformanceBudget]:
    """Get all performance budgets."""
    return {
        **FRONTEND_BUDGETS,
        **BACKEND_BUDGETS,
        **INFRA_BUDGETS,
    }


def get_budget_by_category(category: str) -> Dict[str, PerformanceBudget]:
    """Get budgets filtered by category."""
    return {
        name: budget
        for name, budget in get_all_budgets().items()
        if budget.category == category
    }


def evaluate_metrics(metrics: Dict[str, float]) -> Dict[str, Dict]:
    """
    Evaluate a dictionary of metric values against budgets.
    
    Returns:
        Dict with evaluation results for each metric
    """
    budgets = get_all_budgets()
    results = {}
    
    for name, value in metrics.items():
        if name in budgets:
            budget = budgets[name]
            results[name] = {
                "value": value,
                "unit": budget.unit.value,
                "target": budget.target,
                "warning": budget.warning,
                "status": budget.evaluate(value),
                "description": budget.description,
            }
    
    return results


def generate_budget_report(metrics: Dict[str, float]) -> str:
    """Generate a human-readable budget report."""
    evaluated = evaluate_metrics(metrics)
    
    lines = ["# Performance Budget Report", ""]
    
    # Group by status
    good = []
    needs_improvement = []
    poor = []
    
    for name, result in evaluated.items():
        entry = f"- {name}: {result['value']}{result['unit']} (target: {result['target']}{result['unit']})"
        if result["status"] == "good":
            good.append(entry)
        elif result["status"] == "needs-improvement":
            needs_improvement.append(entry)
        else:
            poor.append(entry)
    
    if poor:
        lines.append("## 🔴 Critical (Over Budget)")
        lines.extend(poor)
        lines.append("")
    
    if needs_improvement:
        lines.append("## 🟡 Warning (Needs Improvement)")
        lines.extend(needs_improvement)
        lines.append("")
    
    if good:
        lines.append("## 🟢 Good (Within Budget)")
        lines.extend(good)
        lines.append("")
    
    return "\n".join(lines)
