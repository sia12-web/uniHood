import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Terms of Service - Radius",
	description: "Radius terms of service and user agreement",
};

export default function TermsOfServicePage() {
	return (
		<article className="prose prose-gray dark:prose-invert max-w-none">
			<h1>Terms of Service</h1>
			<p className="text-sm text-gray-500 dark:text-gray-400">Last updated: December 5, 2025</p>

			<p>
				Welcome to Radius. By accessing or using our platform, you agree to be bound by these
				Terms of Service and our <Link href="/privacy">Privacy Policy</Link>. If you disagree
				with any part of these terms, please do not use our service.
			</p>

			<h2>1. Eligibility</h2>
			<p>To use Radius, you must:</p>
			<ul>
				<li>Be at least 18 years old</li>
				<li>Have the legal capacity to enter into a binding agreement</li>
				<li>Not be prohibited from using the service under applicable law</li>
				<li>Provide accurate and complete registration information</li>
				<li>Be a current student, faculty, or staff member at a supported campus (if using campus features)</li>
			</ul>

			<h2>2. Your Account</h2>
			<p>You are responsible for:</p>
			<ul>
				<li>Maintaining the security of your account credentials</li>
				<li>All activity that occurs under your account</li>
				<li>Notifying us immediately of any unauthorized access</li>
				<li>Keeping your contact information current</li>
			</ul>
			<p>
				We reserve the right to suspend or terminate accounts that violate these terms or
				engage in harmful behavior.
			</p>

			<h2>3. Acceptable Use</h2>
			<p><strong>You agree NOT to:</strong></p>
			<ul>
				<li>Harass, bully, threaten, or intimidate other users</li>
				<li>Post content that is illegal, harmful, hateful, or sexually explicit</li>
				<li>Impersonate others or misrepresent your identity or affiliation</li>
				<li>Share others&apos; personal information without consent</li>
				<li>Use the service for any illegal purpose</li>
				<li>Attempt to gain unauthorized access to accounts or systems</li>
				<li>Interfere with or disrupt the service or servers</li>
				<li>Use automated tools to scrape or collect data</li>
				<li>Create multiple accounts to evade restrictions</li>
				<li>Violate any applicable laws or regulations</li>
			</ul>

			<h2>4. Content</h2>

			<h3>Your Content</h3>
			<p>
				You retain ownership of content you create and post. By posting content, you grant us
				a non-exclusive, worldwide, royalty-free license to display, distribute, and modify
				(for formatting purposes) your content as necessary to operate the service.
			</p>

			<h3>Content Moderation</h3>
			<p>
				We reserve the right to remove content that violates these terms or our community
				guidelines. Repeated violations may result in account suspension or termination.
			</p>

			<h3>Reporting</h3>
			<p>
				If you encounter content that violates these terms, please report it using the
				in-app reporting features.
			</p>

			<h2>5. Intellectual Property</h2>
			<p>
				The Radius platform, including its design, logos, and features, is our property and
				protected by intellectual property laws. You may not copy, modify, distribute, or
				reverse-engineer any part of our service without written permission.
			</p>

			<h2>6. Third-Party Services</h2>
			<p>
				Our service may integrate with or link to third-party services. We are not responsible
				for the content, privacy practices, or availability of these services. Your use of
				third-party services is subject to their respective terms and policies.
			</p>

			<h2>7. Service Availability</h2>
			<p>
				We strive to provide reliable service but cannot guarantee uninterrupted access. We may:
			</p>
			<ul>
				<li>Modify, suspend, or discontinue features at any time</li>
				<li>Perform maintenance that temporarily affects availability</li>
				<li>Restrict access for security or legal reasons</li>
			</ul>
			<p>
				We will provide reasonable notice of material changes when possible.
			</p>

			<h2>8. Disclaimers</h2>
			<p>
				<strong>THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND,
					EXPRESS OR IMPLIED.</strong>
			</p>
			<p>We do not guarantee:</p>
			<ul>
				<li>Uninterrupted or error-free operation</li>
				<li>That content posted by users is accurate or appropriate</li>
				<li>That users are who they claim to be</li>
				<li>Any specific outcomes from using the service</li>
			</ul>
			<p>You use the service at your own risk.</p>

			<h2>9. Limitation of Liability</h2>
			<p>
				<strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW:</strong>
			</p>
			<ul>
				<li>We are not liable for indirect, incidental, or consequential damages</li>
				<li>We are not liable for lost profits, data, or opportunities</li>
				<li>We are not liable for conduct or content of other users</li>
				<li>
					Our total liability is limited to the amount you paid us in the 12 months
					before the claim, or $100 CAD, whichever is greater
				</li>
			</ul>

			<h2>10. Indemnification</h2>
			<p>
				You agree to indemnify and hold harmless Radius and its affiliates from any claims,
				damages, or expenses arising from:
			</p>
			<ul>
				<li>Your use of the service</li>
				<li>Your content</li>
				<li>Your violation of these terms</li>
				<li>Your violation of any rights of another party</li>
			</ul>

			<h2>11. Dispute Resolution</h2>

			<h3>Governing Law</h3>
			<p>
				These terms are governed by the laws of Ontario, Canada, without regard to conflict
				of law principles.
			</p>

			<h3>Informal Resolution</h3>
			<p>
				Before filing a formal dispute, you agree to contact us at{" "}
				<a href="mailto:legal@radius.app">legal@radius.app</a> to attempt to resolve the
				matter informally.
			</p>

			<h3>Arbitration</h3>
			<p>
				If informal resolution fails, disputes will be resolved through binding arbitration,
				except for:
			</p>
			<ul>
				<li>Claims that may be brought in small claims court</li>
				<li>Intellectual property disputes</li>
				<li>Claims for injunctive relief</li>
			</ul>

			<h3>Class Action Waiver</h3>
			<p>
				You agree to resolve disputes individually and waive the right to participate in
				class action lawsuits or class-wide arbitration.
			</p>

			<h2>12. Termination</h2>
			<p><strong>By You:</strong> You may delete your account at any time through Settings.</p>
			<p><strong>By Us:</strong> We may terminate your account for:</p>
			<ul>
				<li>Violation of these terms</li>
				<li>Illegal activity</li>
				<li>Extended inactivity (with notice)</li>
				<li>Service discontinuation</li>
			</ul>
			<p>
				Upon termination, your right to use the service ends immediately. Sections that
				should survive (liability, disputes, indemnification) will remain in effect.
			</p>

			<h2>13. Changes to Terms</h2>
			<p>
				We may update these terms periodically. Material changes will be announced via email
				and in-app notification at least 30 days before taking effect. Continued use after
				changes constitutes acceptance of the new terms.
			</p>

			<h2>14. General Provisions</h2>
			<ul>
				<li>
					<strong>Entire Agreement:</strong> These terms constitute the entire agreement
					between you and Radius regarding use of the service.
				</li>
				<li>
					<strong>Severability:</strong> If any provision is found unenforceable, the
					remaining provisions will continue in effect.
				</li>
				<li>
					<strong>No Waiver:</strong> Failure to enforce any provision does not waive
					our right to enforce it later.
				</li>
				<li>
					<strong>Assignment:</strong> You may not assign your rights under these terms.
					We may assign our rights to a successor entity.
				</li>
			</ul>

			<h2>15. Contact</h2>
			<p>For questions about these terms:</p>
			<ul>
				<li>Email: <a href="mailto:legal@radius.app">legal@radius.app</a></li>
			</ul>

			<hr className="my-8" />

			<p className="text-sm text-gray-500">
				<Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
					Privacy Policy
				</Link>
				{" · "}
				<Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
					Back to Radius
				</Link>
			</p>
		</article>
	);
}
