import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Cookie Policy - Divan",
	description: "How Divan uses cookies and similar technologies to power your experience.",
};

export default function CookiePolicyPage() {
	return (
		<article className="prose prose-gray dark:prose-invert max-w-none">
			<h1>Cookie Policy</h1>
			<p className="text-sm text-gray-500 dark:text-gray-400">Last updated: December 19, 2025</p>

			<p>
				At Divan, we believe in being clear about how we collect and use data. This policy explains how we use cookies, local storage, and similar technologies to keep you signed in, remember your preferences, and understand how our platform is performing.
			</p>

			<h2>1. What are Cookies?</h2>
			<p>
				Cookies are small text files stored in your browser. They help us recognize you as you move between pages and ensure that your session remains secure. We also use local storage for similar purposes, which allows us to save preferences directly on your device.
			</p>

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Cookie Type</th>
							<th>What they do</th>
							<th>Why we need them</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>Essential</strong></td>
							<td>Handle authentication and session management.</td>
							<td>Without these, you wouldn't be able to stay signed in.</td>
						</tr>
						<tr>
							<td><strong>Security</strong></td>
							<td>Protect against cross-site request forgery (CSRF) and other attacks.</td>
							<td>Essential for keeping your account and data safe from malicious actors.</td>
						</tr>
						<tr>
							<td><strong>Functional</strong></td>
							<td>Remember UI preferences like dark mode and language settings.</td>
							<td>These make Divan feel personal and consistent every time you visit.</td>
						</tr>
						<tr>
							<td><strong>Performance</strong></td>
							<td>Collect anonymous data on how the app is used and where errors occur.</td>
							<td>Helps our engineering team find bugs and improve the speed of the platform.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>2. Why We Use Them</h2>
			<p>
				We use cookies for a variety of reasons, ranging from core functionality to performance monitoring. We never use cookies to track you across the web or build a profile for advertising.
			</p>

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Purpose</th>
							<th>Data Stored</th>
							<th>Retention Period</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>Authentication</strong></td>
							<td>Access & refresh tokens (HttpOnly)</td>
							<td>Until you sign out or the session expires.</td>
						</tr>
						<tr>
							<td><strong>Security</strong></td>
							<td>CSRF tokens, rate-limit markers</td>
							<td>Rolling 24 hours.</td>
						</tr>
						<tr>
							<td><strong>Application State</strong></td>
							<td>Feature flags, UI experiment IDs</td>
							<td>30 days or until the experiment ends.</td>
						</tr>
						<tr>
							<td><strong>User Preferences</strong></td>
							<td>Theme (Light/Dark), Language, Dismissed tours</td>
							<td>Until you manually clear your browser data.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>3. Managing Your Cookies</h2>
			<p>
				You have full control over how cookies are stored on your device.
			</p>
			<ul>
				<li><strong>Browser Settings:</strong> You can clear cookies or block them entirely in your browser's "Privacy" or "Settings" menu.</li>
				<li><strong>Privacy Settings:</strong> Within Divan, you can toggle optional analytics and performance monitoring in <strong>Settings → Privacy</strong>.</li>
				<li><strong>Incognito Mode:</strong> Using a private window will prevent cookies from being saved after you close your browser.</li>
			</ul>

			<h2>4. Third-Party Providers</h2>
			<p>
				We prioritize first-party storage, but we do use a small number of trusted partners to help us maintain platform stability and performance.
			</p>

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Provider</th>
							<th>Purpose</th>
							<th>Privacy Info</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>Divan Internal</strong></td>
							<td>Core functionality and session security.</td>
							<td><Link href="/privacy">Privacy Policy</Link></td>
						</tr>
						<tr>
							<td><strong>Sentry</strong></td>
							<td>Error reporting and platform stability.</td>
							<td><a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">Sentry Privacy</a></td>
						</tr>
						<tr>
							<td><strong>PostHog</strong></td>
							<td>Feature usage and product analytics (if enabled).</td>
							<td><a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer">PostHog Privacy</a></td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>5. Updates to this Policy</h2>
			<p>
				We may update this policy as our technology evolves. If we make any significant changes to how we use cookies, we will notify you through the app.
			</p>

			<h2>6. Contact</h2>
			<p>
				If you have any questions about our use of cookies, please email us at <a href="mailto:privacy@divan.app">privacy@divan.app</a> or reach out through our <Link href="/contact">Support Center</Link>.
			</p>
		</article>
	);
}
