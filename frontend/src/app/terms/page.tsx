import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · metis.ai",
  description:
    "Enterprise terms of service, analytical governance, and acceptable database use policy.",
};

export default function TermsPage() {
  return (
    <div className="legal-container">
      <header className="legal-header">
        <Link href="/" className="legal-back-button">
          ← Back to Metis Workspace
        </Link>
        <div className="legal-brand">
          <span className="brand-dot" />
          <span className="brand-text">metis.ai</span>
        </div>
      </header>

      <main className="legal-main">
        <div className="legal-hero">
          <span className="badge">Legal Terms</span>
          <h1>Terms of Service</h1>
          <p className="legal-lead">
            Clear commitments and boundaries for using the Metis analytical
            platform, execution engines, and Truth Ledger systems.
          </p>
          <div className="legal-meta">
            <span>Last Updated: October 2026</span>
            <span>Version: 2.0 (Foundation Certified)</span>
          </div>
        </div>

        <section className="legal-section">
          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using the Metis application, APIs, or analytical
            services, you agree to be bound by these Terms of Service and our
            accompanying <Link href="/privacy">Privacy Policy</Link>. If you are
            using Metis on behalf of an organization, you represent that you
            have the legal authority to bind that entity.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Permitted Use & Database Credentials</h2>
          <h3>2.1 Least-Privilege Requirement</h3>
          <p>
            You agree to supply only least-privilege, read-only database
            credentials to Metis analytical connectors. While Metis implements
            strict multi-tier AST filtering and transactional read-only
            enforcement, customers are responsible for configuring
            database-level permissions that restrict access to authorized
            analytical schemas.
          </p>

          <h3>2.2 Credential Protection</h3>
          <p>
            You are responsible for safeguarding your workspace tokens and
            secret references. Any connection credential configured within Metis
            is stored using AES-256-GCM encryption and is accessible only to
            authorized actors within your workspace.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Analytical Verification & Human Governance</h2>
          <p>
            Metis is designed to provide unprecedented analytical transparency
            through:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Deterministic Verification</strong>: Validating result
              shape, entity grain, null policy, period consistency, and
              aggregation invariants.
            </li>
            <li>
              <strong>Truth Ledgers</strong>: Directly mapping claims to
              verified source rows and candidate SQL queries.
            </li>
            <li>
              <strong>Explicit Abstention & Clarification</strong>: Refusing to
              invent ungrounded numbers when questions contain material
              ambiguity or lack necessary denominator coverage.
            </li>
          </ul>
          <p>
            However, critical policy, medical, financial, or regulatory
            decisions must always involve human-in-the-loop review. Metis serves
            as an intelligence partner; final accountability for decisions made
            using analytical results rests with the analyst.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Acceptable Use Policy</h2>
          <p>You agree not to:</p>
          <ul className="legal-list">
            <li>
              Attempt to bypass AST SQL security filters or inject destructive
              data-modification commands.
            </li>
            <li>
              Target databases or schemas for which you do not possess verified
              authorization.
            </li>
            <li>
              Subvert workspace isolation boundaries or attempt unauthorized
              cross-tenant data access.
            </li>
            <li>
              Overload the system with abusive concurrency exceeding configured
              workspace budget thresholds.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Intellectual Property & Customer Recipes</h2>
          <p>
            You retain 100% ownership and copyright of your analytical
            questions, domain metric definitions, and saved analysis recipes
            created within Metis. Metis claims no ownership interest in your
            data, schema definitions, or query results.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Operational Budgets & Rate Limits</h2>
          <p>
            To preserve cluster stability and predictability, all analytical
            queries run subject to foundation policy bounds:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Statement Timeout</strong>: Default 10-second hard timeout
              on PostgreSQL database operations.
            </li>
            <li>
              <strong>Result Row Limits</strong>: Up to 50,000 rows returned per
              query, with memory previews capped at 1,000 rows.
            </li>
            <li>
              <strong>Model Call Budget</strong>: Configurable per-run quota
              preventing recursive runaway inference.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>7. Disclaimer of Warranties & Limitation of Liability</h2>
          <p>
            Except as explicitly provided in an enterprise service agreement,
            Metis is provided &quot;as is&quot; without warranties of any kind,
            whether express or implied. In no event shall Metis or its
            affiliates be liable for indirect, consequential, or punitive
            damages resulting from query execution or data reliance.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Termination & Revocation</h2>
          <p>
            You may terminate access or revoke any database connection at any
            time. Revocation immediately renders all associated secrets
            inoperable and blocks future query submissions.
          </p>
        </section>

        <footer className="legal-footer">
          <p>© 2026 metis.ai Inc. All rights reserved.</p>
          <div className="legal-footer-links">
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/">Workspace</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
