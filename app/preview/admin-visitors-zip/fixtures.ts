import type { VisitorRecord } from "@/lib/visitors-types";

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export const ADMIN_VISITORS_ZIP_FIXTURES: VisitorRecord[] = [
  {
    vid: "11111111-1111-4111-8111-111111111111",
    firstSeen: hoursAgo(48),
    lastSeen: hoursAgo(0.2),
    pageviews: 86,
    ip: "73.162.10.4",
    geo: {
      city: "Westport",
      region: "Connecticut",
      postal: "06880",
      country: "United States",
      org: "Optimum Online",
    },
    pages: [
      { path: "/market-pulse", at: hoursAgo(0.2) },
      { path: "/admin?tab=visitors", at: hoursAgo(0.4) },
      { path: "/listings/24123456", at: hoursAgo(1) },
    ],
    zip: "06880",
    name: "Mather",
    email: "you@tmre.example",
    isAdmin: true,
  },
  {
    vid: "22222222-2222-4222-8222-222222222222",
    firstSeen: hoursAgo(6),
    lastSeen: hoursAgo(1),
    pageviews: 11,
    ip: "108.44.20.9",
    geo: {
      city: "Norwalk",
      region: "Connecticut",
      postal: "06854",
      country: "United States",
      org: "Frontier Communications",
    },
    pages: [
      { path: "/listings/24123456", at: hoursAgo(1) },
      { path: "/open-houses", at: hoursAgo(2) },
    ],
    zip: "06854",
    isAdmin: false,
  },
  {
    vid: "33333333-3333-4333-8333-333333333333",
    firstSeen: hoursAgo(30),
    lastSeen: hoursAgo(3),
    pageviews: 4,
    ip: "66.249.66.1",
    geo: {
      city: "New York",
      region: "New York",
      postal: "10001",
      country: "United States",
      org: "Google",
    },
    pages: [{ path: "/", at: hoursAgo(3) }],
    zip: "10001",
    isAdmin: false,
  },
  {
    vid: "44444444-4444-4444-8444-444444444444",
    firstSeen: hoursAgo(12),
    lastSeen: hoursAgo(5),
    pageviews: 7,
    ip: "174.198.8.2",
    geo: {
      city: "Westport",
      region: "Connecticut",
      postal: "06880",
      country: "United States",
      org: "T-Mobile",
    },
    pages: [
      { path: "/listings/24123456", at: hoursAgo(5) },
      { path: "/list-with-me", at: hoursAgo(6) },
    ],
    zip: "06880",
    email: "buyer@example.com",
    name: "Alex Buyer",
    audienceType: "buyer",
    identitySources: ["lead"],
    isAdmin: false,
  },
  {
    vid: "55555555-5555-4555-8555-555555555555",
    firstSeen: hoursAgo(2),
    lastSeen: hoursAgo(1.5),
    pageviews: 2,
    ip: null,
    geo: {
      city: null,
      region: null,
      postal: null,
      country: null,
      org: null,
    },
    pages: [{ path: "/", at: hoursAgo(1.5) }],
    isAdmin: false,
  },
];

export const ADMIN_VISITORS_ZIP_LABELS: Record<string, string> = {
  "24123456": "16 Sea Spray Rd, Westport",
};
