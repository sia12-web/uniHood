import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Privacy Policy - Radius",
	description: "Radius privacy policy and data practices",
};

export default function PrivacyPolicyPage() {
	return (
		<article className="prose prose-gray dark:prose-invert max-w-none">
			<h1>Privacy Policy</h1>
			<p className="text-sm text-gray-500 dark:text-gray-400">Last updated: December 5, 2025</p>

			<p>
				Radius (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your privacy.
				This policy explains how we collect, use, and protect your personal information when you use our platform.
			</p>

			<h2>1. Information We Collect</h2>

			<h3>Account Information</h3>
			<p>When you create an account, we collect:</p>
			<ul>
				<li><strong>Email address</strong> — Required for account creation and communication</li>
				<li><strong>Username/Handle</strong> — Your chosen public identifier</li>
				<li><strong>Display name</strong> — Your chosen display name</li>
				<li><strong>Password</strong> — Stored securely using industry-standard hashing (Argon2id)</li>
			</ul>

			<h3>Profile Information (Optional)</h3>
			<ul>
				<li>Profile photo/avatar</li>
				<li>Bio and interests</li>
				<li>Campus/university affiliation</li>
				<li>Courses and academic information</li>
			</ul>

			<h3>Activity Information</h3>
			<ul>
				<li>Messages and conversations</li>
				<li>Posts and interactions in communities</li>
				<li>Friend connections</li>
				<li>Activity participation and game stats</li>
			</ul>

			<h3>Technical Information</h3>
			<ul>
				<li>IP address and device information (for security)</li>
				<li>Browser type and version</li>
				<li>Session data and authentication tokens</li>
			</ul>

			<h3>Location Information (Optional)</h3>
			<p>
				If you enable proximity features, we collect approximate location data to help you discover
				nearby users. This data is retained for only 7 days and can be disabled at any time.
			</p>

			<h2>2. How We Use Your Information</h2>
			<table>
				<thead>
					<tr>
						<th>Purpose</th>
						<th>Data Used</th>
						<th>Legal Basis</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Provide the service</td>
						<td>Account, profile</td>
						<td>Contract</td>
					</tr>
					<tr>
						<td>Authenticate you</td>
						<td>Email, password, 2FA</td>
						<td>Contract</td>
					</tr>
					<tr>
						<td>Match with other users</td>
						<td>Profile, interests</td>
						<td>Consent</td>
					</tr>
					<tr>
						<td>Proximity features</td>
						<td>Location</td>
						<td>Consent</td>
					</tr>
					<tr>
						<td>Security and fraud prevention</td>
						<td>IP, device info</td>
						<td>Legitimate interest</td>
					</tr>
					<tr>
						<td>Service improvement</td>
						<td>Aggregated usage</td>
						<td>Legitimate interest</td>
					</tr>
				</tbody>
			</table>

			<h2>3. Data Sharing</h2>
			<p><strong>We do not sell your personal information.</strong></p>
			<p>We share data only in these circumstances:</p>
			<ul>
				<li><strong>With your consent</strong> — When you explicitly agree</li>
				<li><strong>Service providers</strong> — Cloud hosting, email delivery (under strict data processing agreements)</li>
				<li><strong>Legal requirements</strong> — When required by valid legal process</li>
				<li><strong>Safety</strong> — To protect users from imminent harm</li>
			</ul>

			<h2>4. Data Retention</h2>
			<table>
				<thead>
					<tr>
						<th>Data Type</th>
						<th>Retention Period</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Profile (active account)</td>
						<td>While account is active</td>
					</tr>
					<tr>
						<td>Profile (after deletion)</td>
						<td>30 days grace period, then purged</td>
					</tr>
					<tr>
						<td>Messages</td>
						<td>365 days</td>
					</tr>
					<tr>
						<td>Location history</td>
						<td>7 days</td>
					</tr>
					<tr>
						<td>Session/login history</td>
						<td>180 days</td>
					</tr>
				</tbody>
			</table>

			<h2>5. Your Rights</h2>
			<p>Under PIPEDA (Canada) and similar privacy laws, you have the right to:</p>
			<ul>
				<li><strong>Access</strong> — Request a copy of your data (Settings → Privacy → Export Data)</li>
				<li><strong>Correction</strong> — Update inaccurate information via your profile</li>
				<li><strong>Deletion</strong> — Delete your account (Settings → Account → Delete Account)</li>
				<li><strong>Portability</strong> — Export your data in machine-readable format (JSON)</li>
				<li><strong>Withdraw consent</strong> — Disable optional data collection in settings</li>
			</ul>

			<h2>6. Security Measures</h2>
			<p>We protect your data using:</p>
			<ul>
				<li><strong>Encryption in transit</strong> — TLS 1.3 for all connections</li>
				<li><strong>Encryption at rest</strong> — AES-256 for stored data</li>
				<li><strong>Password security</strong> — Argon2id hashing with secure parameters</li>
				<li><strong>Two-factor authentication</strong> — Optional TOTP and WebAuthn/Passkeys</li>
				<li><strong>Access control</strong> — Role-based access with audit logging</li>
				<li><strong>Security monitoring</strong> — 24/7 automated threat detection</li>
			</ul>

			<h2>7. Children&apos;s Privacy</h2>
			<p>
				Radius is intended for users 18 years of age and older. We do not knowingly collect
				personal information from children. If you believe a child has provided us personal
				information, please contact us immediately.
			</p>

			<h2>8. International Data Transfers</h2>
			<p>
				Your data may be processed in Canada and other countries where our service providers
				operate. We ensure appropriate safeguards are in place for any international transfers.
			</p>

			<h2>9. Policy Updates</h2>
			<p>
				We may update this policy periodically. Material changes will be announced via email
				and in-app notification at least 30 days before taking effect.
			</p>

			<h2>10. Contact Us</h2>
			<p>For privacy questions or to exercise your rights:</p>
			<ul>
				<li>Email: <a href="mailto:privacy@radius.app">privacy@radius.app</a></li>
				<li>Settings: Use the Privacy section in your account settings</li>
			</ul>

			<p>
				For complaints, you may also contact the{" "}
				<a href="https://www.priv.gc.ca/en/" target="_blank" rel="noopener noreferrer">
					Office of the Privacy Commissioner of Canada
				</a>.
			</p>

			<hr className="my-8" />

			<p className="text-sm text-gray-500">
				<Link href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">
					Terms of Service
				</Link>
				{" · "}
				<Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
					Back to Radius
				</Link>
			</p>
		</article>
	);
}
