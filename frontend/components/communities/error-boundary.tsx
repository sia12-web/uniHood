"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export class CommunitiesErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
	public state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		if (process.env.NODE_ENV !== "production") {
			console.error("Communities shell error", error, info);
		}
	}

	handleReset = () => {
		this.setState({ hasError: false });
		if (typeof window !== "undefined") {
			window.location.reload();
		}
	};

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
					<h2 className="text-xl font-semibold text-slate-900">Something went wrong.</h2>
					<p className="max-w-md text-sm text-slate-600">Try reloading the Communities workspace. If the issue continues, reach out to support.</p>
					<button
						type="button"
						onClick={this.handleReset}
						className="inline-flex items-center rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-navy"
					>
						Reload
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}

export default CommunitiesErrorBoundary;
