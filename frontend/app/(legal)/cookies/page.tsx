/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Cookie Policy - uniHood",
	description: "How uniHood uses cookies and similar technologies to power your experience.",
};

export default function CookiePolicyPage() {
	return (
		<article className="prose prose-gray dark:prose-invert max-w-none">
			<h1>Cookie Policy</h1>
			<p className="text-sm text-gray-500 dark:text-gray-400">Last updated: December 19, 2024</p>

			<p>
				Hey there! We know legal documents can be a snooze, so we've tried to make this one as straightforward as possible.
				Here's the deal with cookies on uniHood and why we use them.
			</p>

			<br />

			<h2>What are Cookies, Anyway?</h2>
			<p>
				Think of cookies like little sticky notes your browser keeps to remember things about you. They help us recognize
				you when you come back, keep you logged in, and remember your preferences (like if you prefer dark mode).
			</p>
			<p>
				We also use something called "local storage" which is similar but lives directly on your device instead of being
				sent back and forth to our servers.
			</p>

			<br />

			<h2>The Cookies We Use</h2>
			<p>
				We only use cookies that directly make your uniHood experience better. We're not tracking you around the web or
				building creepy advertising profiles. Here's what we do use:
			</p>

			<br />

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Cookie Type</th>
							<th>What They Do</th>
							<th>Why We Need Them</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>Essential</strong></td>
							<td>Keep you logged in and manage your session</td>
							<td>Without these, you'd have to sign in every time you click a link. Not fun.</td>
						</tr>
						<tr>
							<td><strong>Security</strong></td>
							<td>Protect your account from attacks and unauthorized access</td>
							<td>These are your digital bodyguards, keeping the bad guys out.</td>
						</tr>
						<tr>
							<td><strong>Preferences</strong></td>
							<td>Remember your settings like dark mode, language, and dismissed tips</td>
							<td>So uniHood feels like YOUR uniHood every time you visit.</td>
						</tr>
						<tr>
							<td><strong>Performance</strong></td>
							<td>Help us understand what's working and what's not</td>
							<td>If something breaks, these help us figure out what happened so we can fix it faster.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<br />
			<br />

			<h2>What Exactly Gets Stored?</h2>
			<p>
				Transparency matters to us. Here's a breakdown of what we actually save and for how long:
			</p>

			<br />

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Purpose</th>
							<th>What's Stored</th>
							<th>How Long We Keep It</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>Authentication</strong></td>
							<td>Access and refresh tokens (extra secure, HttpOnly cookies)</td>
							<td>Until you sign out or your session expires</td>
						</tr>
						<tr>
							<td><strong>Security</strong></td>
							<td>Anti-tampering tokens and rate-limit markers</td>
							<td>Refreshes every 24 hours</td>
						</tr>
						<tr>
							<td><strong>App Features</strong></td>
							<td>Feature flags and experiment IDs for beta features</td>
							<td>30 days or until the test ends</td>
						</tr>
						<tr>
							<td><strong>Your Preferences</strong></td>
							<td>Theme (light/dark), language, onboarding tours you've completed</td>
							<td>Until you manually clear your browser data</td>
						</tr>
					</tbody>
				</table>
			</div>

			<br />
			<br />

			<h2>You're in Control</h2>
			<p>
				You have complete control over cookies. Here are your options:
			</p>

			<br />

			<ul>
				<li>
					<strong>Browser Settings:</strong> You can clear cookies or block them entirely in your browser's privacy
					settings. Just know that blocking essential cookies will break some core features (like staying signed in).
				</li>
				<li>
					<strong>Privacy Dashboard:</strong> Head to <strong>Settings → Privacy</strong> in uniHood to toggle optional
					analytics and performance monitoring on or off.
				</li>
				<li>
					<strong>Private Browsing:</strong> Using incognito or private mode? Cookies won't stick around after you
					close the window.
				</li>
			</ul>

			<br />
			<br />

			<h2>Do You Share Cookies with Anyone?</h2>
			<p>
				We keep most things in-house, but we do work with a few trusted partners to keep uniHood running smoothly.
				Here's who they are and what they do:
			</p>

			<br />

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Partner</th>
							<th>What They Help With</th>
							<th>Their Privacy Policy</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>uniHood (us!)</strong></td>
							<td>All core features, authentication, and session security</td>
							<td><Link href="/privacy">Our Privacy Policy</Link></td>
						</tr>
						<tr>
							<td><strong>Sentry</strong></td>
							<td>Error tracking so we can fix bugs quickly</td>
							<td><a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">Sentry Privacy</a></td>
						</tr>
						<tr>
							<td><strong>PostHog</strong></td>
							<td>Product analytics to understand which features you love (totally optional)</td>
							<td><a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer">PostHog Privacy</a></td>
						</tr>
					</tbody>
				</table>
			</div>

			<br />
			<br />

			<h2>Will This Policy Ever Change?</h2>
			<p>
				As uniHood grows and evolves, we might need to update how we use cookies. If we make any significant changes,
				we'll let you know through the app—no sneaky updates without a heads up.
			</p>

			<br />
			<br />

			<h2>Questions?</h2>
			<p>
				We're here to help. If you have any questions about cookies or anything privacy-related, shoot us an email at{" "}
				<a href="mailto:unihoodapp@gmail.com">unihoodapp@gmail.com</a> or visit our{" "}
				<Link href="/contact">Support Center</Link>.
			</p>

			<br />

			<p className="text-sm text-gray-500 dark:text-gray-400">
				Thanks for being part of uniHood. We're committed to keeping your data safe and your experience awesome.
			</p>
		</article>
	);
}
