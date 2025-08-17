// app/privacy/page.tsx
export const metadata = {
  title: "Privacy Policy | ClearSked",
  description:
    "ClearSked Privacy Policy. Learn what we collect, how we use it, and your choices.",
};

export default function PrivacyPage() {
  const updated = "August 16, 2025";
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "16px 0 64px" }}>
      <h1 style={{ margin: "0 0 8px" }}>ClearSked Privacy Policy</h1>
      <p style={{ color: "#475569", marginTop: 0 }}>Last updated: {updated}</p>

      <p>
        This Privacy Policy explains how ClearSked (“we,” “our,” “us”) collects,
        uses, and shares information when you use our website, SMS notifications,
        and related services (the “Service”).
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li>
          <strong>Contact Information:</strong> Mobile phone number to send you
          text messages.
        </li>
        <li>
          <strong>Location & Preferences:</strong> ZIP code, activity duration,
          delivery time, and weather tolerance ranges (e.g., temperature, wind,
          UV, AQI).
        </li>
        <li>
          <strong>Service Usage:</strong> Message delivery status, opt-in/opt-out
          signals (e.g., STOP/HELP), and basic interaction logs.
        </li>
        <li>
          <strong>Device/Technical Data:</strong> IP address, browser/user agent,
          and similar diagnostics when you visit our website.
        </li>
        <li>
          <strong>Third-Party Data:</strong> Weather and environmental data from
          providers (e.g., Apple WeatherKit) for your ZIP-based location.
        </li>
      </ul>

      <h2>How We Use Information</h2>
      <ul>
        <li>Provide, maintain, and improve the Service;</li>
        <li>Send daily SMS recommendations you requested;</li>
        <li>Personalize content and scoring to your preferences;</li>
        <li>Monitor performance, security, and abuse prevention;</li>
        <li>Comply with law, respond to requests, and enforce terms;</li>
        <li>Communicate about updates, features, or policy changes.</li>
      </ul>

      <h2>SMS Program</h2>
      <p>
        Message frequency is typically 1/day. Message and data rates may apply.
        Reply <strong>STOP</strong> to opt out; reply <strong>HELP</strong> for
        assistance. We process your phone number and messaging metadata to deliver
        SMS through our provider(s) (e.g., Twilio).
      </p>

      <h2>Cookies & Similar Technologies</h2>
      <p>
        We may use minimal cookies or similar technologies on the site for basic
        functionality and analytics. You can control cookies in your browser
        settings; disabling cookies may limit certain features.
      </p>

      <h2>How We Share Information</h2>
      <ul>
        <li>
          <strong>Vendors/Service Providers:</strong> We share necessary data
          with vendors that help run the Service (e.g., SMS (Twilio), hosting
          (Vercel), database/storage (e.g., Neon), analytics, error monitoring).
          These providers may process data on our behalf under contractual
          obligations.
        </li>
        <li>
          <strong>Legal/Compliance:</strong> We may share information to comply
          with law, protect rights and safety, or respond to lawful requests.
        </li>
        <li>
          <strong>Business Transfers:</strong> In the event of a merger, sale, or
          similar transaction, information may be transferred as part of the
          deal, subject to this Policy.
        </li>
      </ul>
      <p>
        We do not sell your personal information. We do not share it for
        cross-context behavioral advertising as defined by certain U.S. state
        laws.
      </p>

      <h2>Data Retention</h2>
      <p>
        We keep information as long as needed to provide the Service and for
        legitimate business or legal purposes. If you opt out of SMS (reply
        STOP), we may retain limited records to honor the opt-out and for fraud
        prevention, auditing, and compliance.
      </p>

      <h2>International Data Transfers</h2>
      <p>
        We may process and store information in the United States and other
        countries where we or our providers operate. These locations may have
        different data protection laws than your country of residence.
      </p>

      <h2>Your Choices & Rights</h2>
      <ul>
        <li>
          <strong>SMS Opt-Out:</strong> Reply STOP to any message to stop
          receiving texts.
        </li>
        <li>
          <strong>Access/Deletion/Update:</strong> You may request access to, or
          deletion or correction of, your personal information by emailing{" "}
          <a href="mailto:privacy@clearsked.com">privacy@clearsked.com</a>. We
          may ask you to verify your identity.
        </li>
        <li>
          <strong>Do Not Track:</strong> We currently do not respond to browser
          “Do Not Track” signals.
        </li>
      </ul>

      <h2>Children’s Privacy</h2>
      <p>
        The Service is not directed to children under 13. If you believe a child
        under 13 has provided us personal information, please contact us and we
        will take appropriate steps to remove it.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable administrative, technical, and physical safeguards to
        protect information. No method of transmission or storage is 100% secure,
        and we cannot guarantee absolute security.
      </p>

      <h2>Links & Third Parties</h2>
      <p>
        The Service may link to third-party sites or services that we do not
        control. Their privacy practices are governed by their own policies.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy periodically. If changes are material,
        we may provide additional notice (e.g., on the site or via SMS). Your
        continued use of the Service after changes means you accept the updated
        Policy.
      </p>

      <h2>Contact Us</h2>
      <p>
        Questions or requests? Email{" "}
        <a href="mailto:privacy@clearsked.com">privacy@clearsked.com</a> or{" "}
        <a href="mailto:support@clearsked.com">support@clearsked.com</a>.
      </p>

      <p style={{ fontSize: 12, color: "#64748b", marginTop: 24 }}>
        This page is provided for convenience and general information. It is not
        legal advice.
      </p>
    </main>
  );
}
