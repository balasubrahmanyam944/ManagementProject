import type { SVGProps } from 'react';

export function ProjectInsightsLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2l10 6.5v7L12 22 2 15.5v-7L12 2z" />
      <path d="M12 22v-8" />
      <path d="M22 8.5l-10 4-10-4" />
      <path d="M2 15.5l10-4 10 4" />
      <path d="M7 11.5v3" />
      <path d="M12 10v5" />
      <path d="M17 8.5v7" />
    </svg>
  );
}

// Official Jira brand logo (three overlapping document shapes)
export function JiraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84H11.53z" />
      <path d="M6.77 6.8a4.362 4.362 0 0 0 4.34 4.34h1.78v1.72c0 2.4 1.94 4.34 4.34 4.35V7.63a.84.84 0 0 0-.84-.84H6.77z" opacity=".65" />
      <path d="M2 11.6a4.362 4.362 0 0 0 4.34 4.34h1.78v1.72c.01 2.39 1.95 4.33 4.35 4.34v-9.56a.84.84 0 0 0-.84-.84H2z" opacity=".4" />
    </svg>
  );
}

// Official Trello brand logo (board with two columns)
export function TrelloIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="1" y="1" width="22" height="22" rx="3" ry="3" opacity=".15" />
      <rect x="3.5" y="3.5" width="7" height="14" rx="1.5" ry="1.5" />
      <rect x="13.5" y="3.5" width="7" height="9.5" rx="1.5" ry="1.5" />
    </svg>
  );
}
