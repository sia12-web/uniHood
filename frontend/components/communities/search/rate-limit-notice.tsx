"use client";

type RateLimitNoticeProps = {
  retryAfter?: number;
};

export function RateLimitNotice({ retryAfter }: RateLimitNoticeProps) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p className="font-semibold">We are getting a lot of search requests right now.</p>
      <p>Please try again in {retryAfter ? `${retryAfter} seconds` : "a few moments"}.</p>
    </div>
  );
}
