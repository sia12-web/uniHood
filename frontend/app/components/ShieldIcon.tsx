import React from "react";

export default function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 2C7.243 2 4.735 3.065 2.857 4.143A2 2 0 002 5.882V10c0 5.25 6.25 7.71 7.553 8.17a2 2 0 001.894 0C11.75 17.71 18 15.25 18 10V5.882a2 2 0 00-.857-1.739C15.265 3.065 12.757 2 10 2zm0 2c2.243 0 4.257.857 5.714 1.714A.5.5 0 0116 5.882V10c0 3.98-4.5 6.13-6 6.764C6.5 16.13 2 13.98 2 10V5.882a.5.5 0 01.286-.454C5.743 4.857 7.757 4 10 4z" />
    </svg>
  );
}
