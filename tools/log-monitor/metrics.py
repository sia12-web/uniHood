"""
Container metrics collection for Docker Log Monitor.
Monitors CPU, memory, and restart counts.
"""
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Dict, Optional

import docker
from docker.models.containers import Container

from config import MetricsConfig


@dataclass
class ContainerMetrics:
    """Snapshot of container resource usage."""
    container_name: str
    cpu_percent: float
    memory_percent: float
    memory_usage_mb: float
    memory_limit_mb: float
    restart_count: int
    timestamp: datetime
    
    def __str__(self) -> str:
        return (
            f"{self.container_name}: "
            f"CPU={self.cpu_percent:.1f}%, "
            f"Memory={self.memory_percent:.1f}% ({self.memory_usage_mb:.0f}MB/{self.memory_limit_mb:.0f}MB), "
            f"Restarts={self.restart_count}"
        )


class MetricsCollector:
    """
    Collects container metrics and triggers alerts on threshold breaches.
    """
    
    def __init__(
        self,
        config: MetricsConfig,
        docker_client: docker.DockerClient,
        on_threshold_breach: Optional[Callable[[str, str, float, float], None]] = None
    ):
        self.config = config
        self.client = docker_client
        self.on_threshold_breach = on_threshold_breach
        
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._previous_restart_counts: Dict[str, int] = {}
    
    def get_container_metrics(self, container: Container) -> Optional[ContainerMetrics]:
        """Get current metrics for a container."""
        try:
            stats = container.stats(stream=False)
            
            # Calculate CPU percentage
            cpu_percent = self._calculate_cpu_percent(stats)
            
            # Calculate memory usage
            memory_stats = stats.get("memory_stats", {})
            memory_usage = memory_stats.get("usage", 0)
            memory_limit = memory_stats.get("limit", 1)
            
            # Subtract cache from usage for more accurate reading
            cache = memory_stats.get("stats", {}).get("cache", 0)
            actual_usage = memory_usage - cache
            
            memory_percent = (actual_usage / memory_limit) * 100 if memory_limit > 0 else 0
            
            # Get restart count
            container.reload()  # Refresh container info
            restart_count = container.attrs.get("RestartCount", 0)
            
            return ContainerMetrics(
                container_name=container.name,
                cpu_percent=cpu_percent,
                memory_percent=memory_percent,
                memory_usage_mb=actual_usage / (1024 * 1024),
                memory_limit_mb=memory_limit / (1024 * 1024),
                restart_count=restart_count,
                timestamp=datetime.now(),
            )
        except Exception as e:
            print(f"Failed to get metrics for {container.name}: {e}")
            return None
    
    def _calculate_cpu_percent(self, stats: dict) -> float:
        """Calculate CPU percentage from Docker stats."""
        try:
            cpu_stats = stats.get("cpu_stats", {})
            precpu_stats = stats.get("precpu_stats", {})
            
            cpu_usage = cpu_stats.get("cpu_usage", {})
            precpu_usage = precpu_stats.get("cpu_usage", {})
            
            cpu_delta = cpu_usage.get("total_usage", 0) - precpu_usage.get("total_usage", 0)
            system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)
            
            if system_delta > 0 and cpu_delta > 0:
                num_cpus = len(cpu_usage.get("percpu_usage", [])) or 1
                cpu_percent = (cpu_delta / system_delta) * num_cpus * 100
                return min(cpu_percent, 100.0)  # Cap at 100%
            
            return 0.0
        except Exception:
            return 0.0
    
    def check_thresholds(self, metrics: ContainerMetrics) -> None:
        """Check if metrics exceed configured thresholds."""
        if not self.on_threshold_breach:
            return
        
        if metrics.cpu_percent > self.config.cpu_threshold_percent:
            self.on_threshold_breach(
                metrics.container_name,
                "CPU",
                metrics.cpu_percent,
                self.config.cpu_threshold_percent
            )
        
        if metrics.memory_percent > self.config.memory_threshold_percent:
            self.on_threshold_breach(
                metrics.container_name,
                "Memory",
                metrics.memory_percent,
                self.config.memory_threshold_percent
            )
        
        # Check for restarts
        prev_restarts = self._previous_restart_counts.get(metrics.container_name, 0)
        if metrics.restart_count > prev_restarts:
            self.on_threshold_breach(
                metrics.container_name,
                "Restart detected",
                float(metrics.restart_count),
                float(prev_restarts)
            )
        self._previous_restart_counts[metrics.container_name] = metrics.restart_count
    
    def collect_all(self, containers: list) -> Dict[str, ContainerMetrics]:
        """Collect metrics from all specified containers."""
        results = {}
        for container in containers:
            metrics = self.get_container_metrics(container)
            if metrics:
                results[container.name] = metrics
                self.check_thresholds(metrics)
        return results
    
    def start_background_collection(self, containers: list) -> None:
        """Start background metrics collection thread."""
        if self._running:
            return
        
        self._running = True
        self._thread = threading.Thread(
            target=self._collection_loop,
            args=(containers,),
            daemon=True
        )
        self._thread.start()
        print(f"📊 Started metrics collection (interval: {self.config.poll_interval_seconds}s)")
    
    def _collection_loop(self, containers: list) -> None:
        """Background collection loop."""
        while self._running:
            try:
                metrics = self.collect_all(containers)
                # Optionally log metrics (uncomment for verbose output)
                # for name, m in metrics.items():
                #     print(f"📊 {m}")
            except Exception as e:
                print(f"Metrics collection error: {e}")
            
            time.sleep(self.config.poll_interval_seconds)
    
    def stop(self) -> None:
        """Stop background collection."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
