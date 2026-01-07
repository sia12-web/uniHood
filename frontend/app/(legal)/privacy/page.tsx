/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Privacy Policy - uniHood",
	description: "uniHood privacy policy and data practices",
};

export default function PrivacyPolicyPage() {
	return (
		<article className="prose prose-gray dark:prose-invert max-w-none">
			<h1>Privacy Policy</h1>
			<p className="text-sm text-gray-500 dark:text-gray-400">Last updated: December 19, 2025</p>

			<section className="mb-8">
				<p>
					Welcome to uniHood (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). We believe that the foundation of a great community is trust, and that trust starts with being transparent about how we handle your personal information. This Privacy Policy details the data we collect, why we collect it, and the robust measures we take to keep it secure.
				</p>
				<p>
					By using uniHood, you agree to the practices described in this policy. We have designed our platform to minimize data collection and prioritize your privacy at every turn.
				</p>
			</section>

			<section className="mb-8">
				<h2>1. Information We Collect</h2>
				<p>
					To provide a seamless experience on uniHood, we collect several categories of information. We only ask for what is strictly necessary to run the platform and provide the features you enjoy.
				</p>
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse">
						<thead>
							<tr className="bg-gray-100 dark:bg-gray-800">
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Category</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">What we collect</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Purpose</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Account Essentials</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Email address, username, password (hashed)</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Authentication, account management, and critical security updates.</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Profile Identity</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Display name, bio, interests, university affiliation, profile photo</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Personalizing your profile and helping you connect with the right peers.</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Community Activity</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Messages, posts, interactions, friend connections, game statistics</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Powering social features, chats, and community engagement.</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Technical Logs</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">IP address, device hardware info, browser fingerprint, session tokens</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Preventing fraud, identifying compromised accounts via fingerprint matching, and optimizing platform performance.</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Proximity Data</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Approximate location (if enabled)</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Enabling "nearby" features to discover users on your campus.</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<section className="mb-8">
				<h2>2. How We Use Your Information</h2>
				<p>
					We use your information strictly to support and enhance your experience on uniHood. We process data under established legal bases as outlined below.
				</p>
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse">
						<thead>
							<tr className="bg-gray-100 dark:bg-gray-800">
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Primary Purpose</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Data Categories Used</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Legal Basis</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Service Operation</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Account Essentials, Profile Identity</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Contractual Necessity</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Safety & Security</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Technical Logs, Account Essentials</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Legitimate Interest</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Social Matching</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Profile Identity, Interests</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Consent</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Proximity Features</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Proximity Data</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Explicit Consent (Opt-in)</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Platform Analytics</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Aggregated Activity Data (Anonymized)</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Legitimate Interest</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<section className="mb-8">
				<h2>3. Data Sharing</h2>
				<p><strong>We do not sell your personal information. Period.</strong></p>
				<p>We only share data in the following limited and necessary circumstances:</p>
				<ul>
					<li><strong>At Your Request:</strong> When you explicitly authorize us to share data (e.g., connecting a third-party app).</li>
					<li><strong>Reliable Service Providers:</strong> We use trusted partners for cloud hosting and email delivery. These providers are bound by strict data processing agreements and can only use your data to provide services to us.</li>
					<li><strong>Legal Obligations:</strong> We may disclose information if required by a valid legal process (e.g., a subpoena or court order) where we have a good-faith belief that disclosure is required by law.</li>
					<li><strong>Urgent Safety Matters:</strong> We may share limited info if we believe it is necessary to prevent imminent physical harm to any person.</li>
				</ul>
			</section>

			<section className="mb-8">
				<h2>4. Data Retention Periods</h2>
				<p>
					We don&apos;t keep your data longer than we need to. Our retention policy is built around the principle of data minimization.
				</p>
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse">
						<thead>
							<tr className="bg-gray-100 dark:bg-gray-800">
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Data Type</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Retention Period</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Post-Retention Action</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Active Account Profile</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Duration of your active account</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">N/A</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Closed Account Data</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">30-day grace period</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Permanent and irreversible deletion</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Chat & Messages</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">365 days</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Automatic purging from active databases</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Proximity Logs</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">7 days</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Automatic purging</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Authentication/Security Logs</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">180 days</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Automatic purging</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<section className="mb-8">
				<h2>5. Your Rights</h2>
				<p>
					We align our practices with PIPEDA (Canada) and other modern privacy frameworks. No matter where you are, you have the following controls over your data:
				</p>
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse">
						<thead>
							<tr className="bg-gray-100 dark:bg-gray-800">
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Your Right</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">What it means</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">How to exercise it</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Access & Portability</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Download a copy of your data in a machine-readable format.</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Settings → Privacy → Export Data</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Rectification</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Fix inaccurate or incomplete profile info.</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Edit Profile in Account Settings</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Erasure</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Request complete deletion of your account and associated data.</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Settings → Account → Delete Account</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Withdrawal of Consent</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Opt-out of optional data collection (like proximity) at any time.</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Settings → Privacy → Toggles</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<section className="mb-8">
				<h2>6. Security Measures</h2>
				<p>
					Security is baked into our code, not bolted on. We use industry-best practices to ensure your data stays private.
				</p>
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse">
						<thead>
							<tr className="bg-gray-100 dark:bg-gray-800">
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Protection Layer</th>
								<th className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left">Security Mechanism</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Transport Security</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">End-to-end TLS 1.3 encryption for all data in transit.</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Storage Security</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">AES-256 encryption at rest for all database volumes and backups.</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Credential Protection</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Passwords are hashed using Argon2id with salted parameters.</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Authentication</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Support for 2FA (TOTP) and WebAuthn (Passkeys/Biometrics).</td>
							</tr>
							<tr>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2 font-semibold">Access Control</td>
								<td className="border border-gray-300 dark:border-gray-700 px-4 py-2">Strict internal Role-Based Access Control (RBAC) and audit logging.</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>

			<section className="mb-8">
				<h2>7. Children&apos;s Privacy</h2>
				<p>
					uniHood is a platform for adults and university students. You must be at least 18 years of age to use the platform. We do not knowingly collect personal information from children under 18. If we discover a minor has created an account, we will terminate it and delete their data immediately.
				</p>
			</section>

			<section className="mb-8">
				<h2>8. International Data Transfers</h2>
				<p>
					Your data is primarily processed in Canada. However, some of our service providers may operate in other jurisdictions. We ensure that any international data transfers are protected by standard contractual clauses or similar legal safeguards to ensure a consistent level of protection.
				</p>
			</section>

			<section className="mb-8">
				<h2>9. Policy Updates</h2>
				<p>
					As uniHood evolves, so will this policy. If we make significant changes, we will notify you through the app or via the email address associated with your account at least 30 days before the changes take effect.
				</p>
			</section>

			<section className="mb-8">
				<h2>10. Contact Us</h2>
				<p>
					If you have questions about this policy, want to exercise your rights, or just want to chat about how we handle data, reach out to us:
				</p>
				<ul>
					<li>Email: <a href="mailto:unihoodapp@gmail.com">unihoodapp@gmail.com</a></li>
					<li>Help Center: Use the &quot;Contact Support&quot; option in your dashboard.</li>
				</ul>
				<p>
					If you feel your concerns haven&apos;t been addressed, Canadians can contact the{" "}
					<a href="https://www.priv.gc.ca/en/" target="_blank" rel="noopener noreferrer">
						Office of the Privacy Commissioner of Canada
					</a>.
				</p>
			</section>

			<hr className="my-8" />

			<p className="text-sm text-gray-500">
				<Link href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">
					Terms of Service
				</Link>
				{" · "}
				<Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
					Back to uniHood
				</Link>
			</p>
		</article>
	);
}

