// app/terms/page.tsx
export const metadata = {
  title: "Terms of Service | ClearSked",
  description:
    "ClearSked Terms of Service. Please read these terms before using the site or receiving SMS notifications.",
};

export default function TermsPage() {
  const updated = "August 16, 2025";
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "16px 0 64px" }}>
      <h1 style={{ margin: "0 0 8px" }}>ClearSked Terms of Service</h1>
      <p style={{ color: "#475569", marginTop: 0 }}>Last updated: {updated}</p>

      <p>
        These Terms of Service (“Terms”) govern your access to and use of the
        ClearSked website, SMS notifications, and related services (collectively,
        the “Service”). By using the Service, you agree to these Terms. If you
        do not agree, do not use the Service.
      </p>

      <h2>1) What ClearSked Does</h2>
      <p>
        ClearSked sends daily text messages suggesting a time window for outdoor
        activities based on weather conditions and preferences you provide (for
        example: temperature, wind, UV, and air quality ranges). Scores and
        recommendations are informational and not guarantees.
      </p>

      <h2>2) Eligibility</h2>
      <p>
        You must be at least 13 years old to use the Service. If you are under
        the age of majority where you live, you represent you have your parent’s
        or guardian’s consent.
      </p>

      <h2>3) Your Account & Information</h2>
      <p>
        You may provide information such as ZIP code, duration preferences,
        mobile phone number, delivery time, and weather tolerances. You agree to
        provide accurate information and to update it as needed. You are
        responsible for any charges from your mobile carrier.
      </p>

      <h2>4) SMS Program Terms</h2>
      <ul>
        <li>Message frequency: typically 1 text per day.</li>
        <li>
          Message and data rates may apply. Check your carrier plan for details.
        </li>
        <li>
          To opt out, reply <strong>STOP</strong> to any ClearSked message. For
          help, reply <strong>HELP</strong>.
        </li>
        <li>
          Not all carriers or devices are supported; delivery is not guaranteed.
        </li>
      </ul>

      <h2>5) Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service in any unlawful or harmful way;</li>
        <li>
          Interfere with or disrupt the Service or attempt to reverse engineer
          any part of it;
        </li>
        <li>Misuse the Service to spam, harass, or violate others’ rights.</li>
      </ul>

      <h2>6) Weather & Third-Party Services</h2>
      <p>
        The Service may rely on third-party providers (e.g., Apple WeatherKit
        for weather data; Twilio for SMS; cloud hosting and database vendors).
        ClearSked is not responsible for their availability, accuracy, or
        performance. Weather forecasts are inherently uncertain; use judgment and
        consider local conditions.
      </p>

      <h2>7) Health & Safety</h2>
      <p>
        ClearSked is not a medical, fitness, or safety service. Do not rely on
        the Service as a substitute for professional advice, emergency alerts, or
        common-sense precautions. Always follow local guidelines and your own
        health needs.
      </p>

      <h2>8) Beta; Changes to the Service</h2>
      <p>
        The Service may be offered as a free beta and may change or end at any
        time. Features can be added, removed, or modified without notice.
      </p>

      <h2>9) Intellectual Property</h2>
      <p>
        ClearSked and its licensors own all rights in the Service, including
        content, logos, and software, except for user inputs and third-party
        materials. You receive a limited, non-exclusive, non-transferable,
        revocable license to use the Service for personal, non-commercial
        purposes.
      </p>

      <h2>10) Feedback</h2>
      <p>
        If you submit feedback or suggestions, you grant ClearSked a perpetual,
        irrevocable, royalty-free license to use them without restriction.
      </p>

      <h2>11) Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” CLEARSKED DISCLAIMS
        ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF ACCURACY,
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        CLEARSKED DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
        OR SECURE, OR THAT MESSAGES WILL ARRIVE ON TIME.
      </p>

      <h2>12) Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, CLEARSKED AND ITS PROVIDERS WILL
        NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
        PUNITIVE DAMAGES, OR ANY LOSS OF DATA, PROFITS, OR GOODWILL, ARISING OUT
        OF OR RELATED TO YOUR USE OF THE SERVICE. CLEARSKED’S TOTAL LIABILITY FOR
        ANY CLAIM WILL NOT EXCEED ONE HUNDRED U.S. DOLLARS (US$100).
      </p>

      <h2>13) Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless ClearSked from any claims,
        losses, or expenses (including reasonable attorneys’ fees) arising from
        your use of the Service or violation of these Terms.
      </p>

      <h2>14) Termination</h2>
      <p>
        We may suspend or terminate the Service at any time, with or without
        notice. You may stop using the Service at any time (including by texting
        STOP to opt out of SMS).
      </p>

      <h2>15) Governing Law & Venue</h2>
      <p>
        These Terms are governed by the laws of the State of Illinois, USA,
        without regard to its conflict of law principles. You agree to the
        exclusive jurisdiction and venue of the state and federal courts located
        in Illinois for any dispute not subject to arbitration or other dispute
        resolution.
      </p>

      <h2>16) Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. If changes are material, we
        may provide additional notice (e.g., on the site or via SMS). Your
        continued use of the Service after changes become effective means you
        accept the revised Terms.
      </p>

      <h2>17) Contact</h2>
      <p>
        Questions? Email <a href="mailto:support@clearsked.com">support@clearsked.com</a>.
      </p>

      <p style={{ fontSize: 12, color: "#64748b", marginTop: 24 }}>
        This page is provided for convenience and general information. It is not
        legal advice.
      </p>
    </main>
  );
}
