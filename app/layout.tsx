// app/layout.tsx
export const metadata = {
  metadataBase: new URL("https://clearsked.com"),
  title: "Best Time to Run Today (by ZIP) | ClearSked",
  description:
    "Text alerts with the best hour to train based on your temperature, wind, UV, and air quality preferences. Free while in beta.",
  openGraph: {
    title: "ClearSked — Daily text: your best training window",
    description:
      "Pick your ranges. We score every minute and text you the top window at 5am.",
    url: "https://clearsked.com",
    siteName: "ClearSked",
    images: [
      {
        url: "/og.png", // (Optional) replace with your own OG image
        width: 1200,
        height: 630,
        alt: "ClearSked — Your best hour today",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClearSked — Daily text: your best training window",
    description:
      "Pick your ranges. We score every minute and text you the top window at 5am.",
    images: ["/og.png"],
  },
  alternates: {
    canonical: "https://clearsked.com",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Minimal global styles (no Tailwind required)
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
          color: "#0f172a",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            padding: "32px 20px 80px",
          }}
        >
          {children}
          <footer
            style={{
              marginTop: 64,
              paddingTop: 24,
              borderTop: "1px solid #e5e7eb",
              fontSize: 13,
              color: "#475569",
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span>© {new Date().getFullYear()} ClearSked</span>
            <a href="/terms" style={{ color: "#2563eb" }}>
              Terms
            </a>
            <a href="/privacy" style={{ color: "#2563eb" }}>
              Privacy
            </a>
          </footer>
        </div>
      </body>
    </html>
  );
}
