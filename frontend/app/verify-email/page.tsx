import { redirect } from "next/navigation";

type VerifyEmailPageProps = {
  searchParams?: {
    token?: string;
  };
};

export default function VerifyEmailRedirect({ searchParams }: VerifyEmailPageProps) {
  const token = searchParams?.token?.trim();
  if (token) {
    redirect(`/verify/${encodeURIComponent(token)}`);
  }
  redirect("/");
}
