import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Cookie Policy - uniHood",
	description: "How uniHood uses cookies and local storage.",
};

export default function CookiePolicyPage() {
	return (
		<article className="prose prose-gray dark:prose-invert max-w-none">
			<h1>Cookie Policy</h1>
			<p className="text-sm text-gray-500 dark:text-gray-400">Last updated: December 16, 2025</p>

			<p>
				This policy explains how uniHood uses cookies, local storage, and similar technologies
				to operate the service, keep you signed in, and measure performance.
			</p>

			<h2>1. What we store</h2>
			<ul>
				<li><strong>Session cookies</strong>: keep you signed in across pages.</li>
				<li><strong>CSRF token</strong>: protects forms and API calls from cross-site attacks.</li>
				<li><strong>Feature flags</strong>: remember UI experiments you&apos;ve opted into.</li>
				<li><strong>Metrics & errors</strong>: lightweight identifiers to improve reliability.</li>
			</ul>

			<h2>2. Why we use them</h2>
			<table>
				<thead>
					<tr>
						<th>Purpose</th>
						<th>Examples</th>
						<th>Retention</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Authentication</td>
						<td>Access token, refresh token (HttpOnly)</td>
						<td>Until you sign out or tokens expire</td>
					</tr>
					<tr>
						<td>Security</td>
						<td>CSRF token, rate-limit markers</td>
						<td>Rolling 24 hours</td>
					</tr>
					<tr>
						<td>Performance</td>
						<td>Web vitals sampling, retry throttles</td>
						<td>Up to 30 days</td>
					</tr>
					<tr>
						<td>Preferences</td>
						<td>Theme, language, in-product tours</td>
						<td>Until cleared by you</td>
					</tr>
				</tbody>
			</table>

			<h2>3. Managing cookies</h2>
			<ul>
				<li>Use your browser settings to clear cookies or block third-party storage.</li>
				<li>Toggle optional analytics in <strong>Settings → Privacy</strong>.</li>
				<li>Private/incognito windows limit storage to the session.</li>
			</ul>

			<h2>4. Third parties</h2>
			<p>
				uniHood primarily uses first-party cookies. If third-party analytics are enabled for your campus,
				they are configured with privacy-preserving defaults (IP anonymization, short retention).
			</p>

			<h2>5. Contact</h2>
			<p>
				Questions? Email <a href="mailto:privacy@unihood.app">privacy@unihood.app</a> or submit a request from{" "}
				<Link href="/contact">Contact Support</Link>.
			</p>
		</article>
	);
}
