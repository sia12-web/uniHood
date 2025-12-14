"""
Docker Log Monitor - Main Entry Point

A real-time log monitoring agent that attaches to Docker container logs,
detects error patterns, and triggers configurable alerts.
"""
import argparse
import signal
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

import docker
from docker.models.containers import Container

from alerting import AlertManager
from config import MonitorConfig, load_config_from_env
from metrics import MetricsCollector
from patterns import PatternMatcher


class LogMonitor:
    """
    Main log monitoring agent.
    
    Attaches to Docker container logs and processes them in real-time.
    """
    
    def __init__(self, config: MonitorConfig):
        self.config = config
        self.client = docker.from_env()
        
        # Initialize components
        self.pattern_matcher = PatternMatcher(config.patterns)
        self.alert_manager = AlertManager(config.alerts)
        self.metrics_collector: Optional[MetricsCollector] = None
        
        if config.metrics.enabled:
            self.metrics_collector = MetricsCollector(
                config.metrics,
                self.client,
                on_threshold_breach=self.alert_manager.send_metrics_alert
            )
        
        self._running = False
        self._threads: List[threading.Thread] = []
    
    def get_target_containers(self) -> List[Container]:
        """Get list of containers to monitor based on config."""
        all_containers = self.client.containers.list()
        targets = []
        
        for container in all_containers:
            name = container.name
            
            # Check exclusions first
            if name in self.config.exclude_containers:
                continue
            
            # If specific names are configured, use those
            if self.config.container_names:
                if name in self.config.container_names:
                    targets.append(container)
                continue
            
            # If prefix is configured, filter by prefix
            if self.config.container_name_prefix:
                if name.startswith(self.config.container_name_prefix):
                    targets.append(container)
                continue
            
            # No filter - include all non-excluded containers
            targets.append(container)
        
        return targets
    
    def process_log_line(self, container_name: str, line: str) -> None:
        """Process a single log line from a container."""
        line = line.strip()
        if not line:
            return
        
        # Match against patterns
        result = self.pattern_matcher.match(line, container_name)
        
        if result.matched:
            self.alert_manager.send_alert(result)
    
    def monitor_container(self, container: Container) -> None:
        """
        Monitor a single container's logs.
        
        Runs in its own thread.
        """
        container_name = container.name
        print(f"📋 Attached to container: {container_name}")
        
        try:
            # Stream logs (blocking iterator)
            for log in container.logs(
                stream=True,
                follow=True,
                tail=self.config.tail_lines,
                timestamps=True
            ):
                if not self._running:
                    break
                
                try:
                    log_line = log.decode("utf-8", errors="replace")
                    self.process_log_line(container_name, log_line)
                except Exception as e:
                    print(f"Error processing log from {container_name}: {e}")
        
        except docker.errors.NotFound:
            print(f"⚠️ Container {container_name} was removed")
        except Exception as e:
            print(f"❌ Error monitoring {container_name}: {e}")
    
    def start(self) -> None:
        """Start monitoring all target containers."""
        self._running = True
        
        containers = self.get_target_containers()
        if not containers:
            print("⚠️ No containers found to monitor!")
            print(f"   Config: prefix='{self.config.container_name_prefix}', "
                  f"names={self.config.container_names}")
            return
        
        print(f"\n🔍 Docker Log Monitor Started")
        print(f"   Monitoring {len(containers)} container(s):")
        for c in containers:
            print(f"   - {c.name}")
        print()
        
        # Start metrics collection if enabled
        if self.metrics_collector:
            self.metrics_collector.start_background_collection(containers)
        
        # Start a thread for each container
        for container in containers:
            thread = threading.Thread(
                target=self.monitor_container,
                args=(container,),
                daemon=True
            )
            thread.start()
            self._threads.append(thread)
        
        print("📡 Listening for log events... (Ctrl+C to stop)\n")
    
    def stop(self) -> None:
        """Stop monitoring."""
        print("\n🛑 Stopping log monitor...")
        self._running = False
        
        if self.metrics_collector:
            self.metrics_collector.stop()
        
        # Wait for threads to finish
        for thread in self._threads:
            thread.join(timeout=2)
        
        self._threads.clear()
        print("✅ Log monitor stopped")
    
    def run_forever(self) -> None:
        """Run the monitor until interrupted."""
        self.start()
        
        try:
            while self._running:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Docker Log Monitor - Real-time container log monitoring and alerting"
    )
    parser.add_argument(
        "--containers", "-c",
        nargs="+",
        help="Specific container names to monitor"
    )
    parser.add_argument(
        "--prefix", "-p",
        default=None,
        help="Container name prefix to filter (e.g., 'unihood-')"
    )
    parser.add_argument(
        "--tail", "-t",
        type=int,
        default=100,
        help="Number of historical log lines to process (default: 100)"
    )
    parser.add_argument(
        "--no-metrics",
        action="store_true",
        help="Disable container metrics monitoring"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose output"
    )
    
    args = parser.parse_args()
    
    # Load config from environment
    config = load_config_from_env()
    
    # Override with CLI args
    if args.containers:
        config.container_names = args.containers
    if args.prefix:
        config.container_name_prefix = args.prefix
    if args.tail:
        config.tail_lines = args.tail
    if args.no_metrics:
        config.metrics.enabled = False
    
    # Setup graceful shutdown
    def signal_handler(sig, frame):
        print("\nReceived interrupt signal...")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Create and run monitor
    monitor = LogMonitor(config)
    monitor.run_forever()


if __name__ == "__main__":
    main()
