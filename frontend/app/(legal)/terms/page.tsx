/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Terms of Service - Divan",
	description: "Divan terms of service and user agreement",
};

export default function TermsOfServicePage() {
	return (
		<article className="prose prose-gray dark:prose-invert max-w-none">
			<h1>Terms of Service</h1>
			<p className="text-sm text-gray-500 dark:text-gray-400">Last updated: December 19, 2025</p>

			<p>
				Welcome to Divan. We’re glad you’re here. These Terms of Service ("Terms") govern your access to and use of our platform. By accessing or using Divan, you agree to be bound by these Terms and our <Link href="/privacy">Privacy Policy</Link>. If any part of these terms doesn't work for you, please do not use our service.
			</p>

			<h2>1. Eligibility</h2>
			<p>
				We want to keep Divan a safe and reliable space for our community. To use our platform, you must:
			</p>
			<ul>
				<li>Be at least 18 years old.</li>
				<li>Have the legal capacity to enter into a binding agreement.</li>
				<li>Not be prohibited from using the service under applicable laws.</li>
				<li>Provide accurate and complete information during registration.</li>
				<li>Be a current student, faculty, or staff member at a supported campus if you are using campus-specific features.</li>
			</ul>

			<h2>2. Your Account</h2>
			<p>
				Your account is your personal gateway to the Divan community. Keeping it secure is a shared responsibility.
			</p>

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>User Responsibility</th>
							<th>What this means for you</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>Account Security</strong></td>
							<td>You are responsible for protecting your credentials and not sharing access.</td>
						</tr>
						<tr>
							<td><strong>Activity Ownership</strong></td>
							<td>You are responsible for all activity that occurs under your account.</td>
						</tr>
						<tr>
							<td><strong>Instant Notification</strong></td>
							<td>If you suspect unauthorized access, let us know immediately.</td>
						</tr>
						<tr>
							<td><strong>Profile Maintenance</strong></td>
							<td>Keep your contact information current so we can reach you when needed.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>3. Acceptable Use</h2>
			<p>
				Divan is built on trust and respect. We have a zero-tolerance policy for behavior that undermines the safety of our users.
			</p>

			<h3>Prohibited Activities</h3>
			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Category</th>
							<th>Strictly Forbidden Actions</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>Harassment</strong></td>
							<td>Bullying, threatening, stalking, or intimidating other users.</td>
						</tr>
						<tr>
							<td><strong>Harmful Content</strong></td>
							<td>Posting illegal, hateful, sexually explicit, or violent material.</td>
						</tr>
						<tr>
							<td><strong>Deception</strong></td>
							<td>Impersonating others or misrepresenting your identity or affiliation.</td>
						</tr>
						<tr>
							<td><strong>Privacy</strong></td>
							<td>Sharing others' personal information (doxing) without their explicit consent.</td>
						</tr>
						<tr>
							<td><strong>Technical Abuse</strong></td>
							<td>Using automated tools to scrape data or disrupting our servers and systems.</td>
						</tr>
						<tr>
							<td><strong>Evasion</strong></td>
							<td>Creating multiple accounts to bypass restrictions or bans.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>4. Content & Ownership</h2>
			<p>
				You retain ownership of the content you create and post on Divan. However, to make the platform work, we need certain permissions.
			</p>

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Feature</th>
							<th>Policy Details</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>User Ownership</strong></td>
							<td>You own your content. Period.</td>
						</tr>
						<tr>
							<td><strong>Usage License</strong></td>
							<td>You grant us a worldwide, royalty-free license to display and distribute your content as needed to operate the service.</td>
						</tr>
						<tr>
							<td><strong>Moderation Rights</strong></td>
							<td>We reserve the right to remove content that violates these terms or community guidelines.</td>
						</tr>
						<tr>
							<td><strong>Reporting</strong></td>
							<td>Users can report content that violates our terms using in-app tools.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>5. Intellectual Property</h2>
			<p>
				The Divan platform—including its design, code, logos, and features—is our property and is protected by intellectual property laws. You may not copy, modify, distribute, or reverse-engineer any part of our service without our express written permission.
			</p>

			<h2>6. Third-Party Services</h2>
			<p>
				Our service may link to or integrate with third-party tools. We don’t control these services and aren’t responsible for their content or privacy practices. Your use of third-party tools is subject to their own respective terms.
			</p>

			<h2>7. Service Availability</h2>
			<p>
				While we strive for 100% reliability, we cannot guarantee uninterrupted access.
			</p>

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Platform Right</th>
							<th>Description</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>Modifications</strong></td>
							<td>We may modify, suspend, or discontinue features to improve the platform.</td>
						</tr>
						<tr>
							<td><strong>Maintenance</strong></td>
							<td>Availability may be temporarily affected by scheduled maintenance.</td>
						</tr>
						<tr>
							<td><strong>Security</strong></td>
							<td>We may restrict access if we detect a security threat or legal risk.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>8. Disclaimers</h2>
			<p>
				<strong>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.</strong>
			</p>
			<p>
				We do not guarantee that the service will always be error-free, that user-posted content is always accurate, or that users are always who they claim to be. You use the service at your own risk.
			</p>

			<h2>9. Limitation of Liability</h2>
			<p>
				<strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW:</strong>
			</p>
			<ul>
				<li>We are not liable for indirect, incidental, or consequential damages.</li>
				<li>We are not liable for lost profits, data, or business opportunities.</li>
				<li>We are not liable for the conduct or content of other users.</li>
				<li>Our total liability is limited to $100 CAD or the amount you paid us in the last 12 months, whichever is greater.</li>
			</ul>

			<h2>10. Indemnification</h2>
			<p>
				You agree to indemnify and hold harmless Divan and its affiliates from any claims, damages, or expenses (including legal fees) arising from your use of the service, your content, or your violation of these Terms.
			</p>

			<h2>11. Dispute Resolution</h2>
			<p><strong>Governing Law:</strong> These terms are governed by the laws of Ontario, Canada.</p>
			<p>
				<strong>Informal Resolution:</strong> Before filing a formal dispute, you agree to contact us at <a href="mailto:legal@divan.app">legal@divan.app</a> to attempt to resolve the matter informally.
			</p>
			<p>
				<strong>Arbitration:</strong> If informal resolution fails, disputes will be resolved through binding arbitration, except for small claims court matters or intellectual property disputes.
			</p>
			<p>
				<strong>Class Action Waiver:</strong> You agree to resolve disputes individually and waive the right to participate in class actions.
			</p>

			<h2>12. Termination</h2>
			<p>
				Relationships change. You can stop using Divan at any time, and we may suspend access if our rules are not followed.
			</p>

			<div className="overflow-x-auto">
				<table className="min-w-full">
					<thead>
						<tr>
							<th>Trigger</th>
							<th>Resulting Action</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>User Request</strong></td>
							<td>You can delete your account at any time via Settings.</td>
						</tr>
						<tr>
							<td><strong>Policy Violation</strong></td>
							<td>Serious or repeated violations of these terms lead to immediate termination.</td>
						</tr>
						<tr>
							<td><strong>Illegal Activity</strong></td>
							<td>Any use of the platform for illegal acts will result in an account ban.</td>
						</tr>
						<tr>
							<td><strong>Inactivity</strong></td>
							<td>We may close accounts that remain inactive for extended periods, following notice.</td>
						</tr>
					</tbody>
				</table>
			</div>

			<h2>13. Changes to Terms</h2>
			<p>
				As Divan grows, we may update these terms. If we make significant changes, we will notify you via email or in-app notification at least 30 days before they take effect. Continued use after changes constitutes acceptance of the new terms.
			</p>

			<h2>14. General Provisions</h2>
			<ul>
				<li><strong>Entire Agreement:</strong> These terms constitute the entire agreement between you and Divan.</li>
				<li><strong>Severability:</strong> If any provision is found unenforceable, the rest of the terms remain in effect.</li>
				<li><strong>No Waiver:</strong> Failure to enforce a provision does not mean we waive our right to do so later.</li>
			</ul>

			<h2>15. Contact</h2>
			<p>For questions regarding these terms, please reach out to us:</p>
			<ul>
				<li>Email: <a href="mailto:legal@divan.app">legal@divan.app</a></li>
			</ul>

			<hr className="my-8" />

			<p className="text-sm text-gray-500">
				<Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
					Privacy Policy
				</Link>
				{" · "}
				<Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
					Back to Divan
				</Link>
			</p>
		</article>
	);
}
