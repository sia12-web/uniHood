import CaseDetailView from "@/components/mod/case-detail/view";

export default function CaseDetailPage({ params }: { params: { caseId: string } }) {
	return <CaseDetailView caseId={params.caseId} />;
}
