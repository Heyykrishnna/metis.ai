import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · metis.ai",
  description:
    "Enterprise data protection, zero-retention analytics, and read-only database execution policy.",
};

export default function PrivacyPage() {
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
          <span className="badge">Security & Governance</span>
          <h1>Privacy Policy</h1>
          <p className="legal-lead">
            Evidence-grounded analytics with uncompromising privacy guarantees.
            Understand how Metis protects your databases, analytical queries,
            and organizational intelligence.
          </p>
          <div className="legal-meta">
            <span>Last Updated: October 2026</span>
            <span>Version: 2.0 (Foundation Certified)</span>
          </div>
        </div>

        <section className="legal-section">
          <h2>1. Core Principles of Data Protection</h2>
          <p>
            Metis is engineered around the principle of verifiable data
            provenance without unnecessary data retention. When you connect a
            database or analyze datasets with Metis, we adhere to strict
            architectural boundaries:
          </p>
          <div className="legal-grid">
            <div className="legal-card">
              <h3>Zero Analytical Retention</h3>
              <p>
                Customer database rows and executed analytical result sets are
                processed in volatile memory and are not permanently retained in
                analytical stores without explicit analyst direction.
              </p>
            </div>
            <div className="legal-card">
              <h3>Least-Privilege Database Access</h3>
              <p>
                All PostgreSQL and database connections require dedicated
                read-only credentials. The backend engine enforces read-only
                transactions and rejects all mutating operations.
              </p>
            </div>
            <div className="legal-card">
              <h3>Strict Tenant Isolation</h3>
              <p>
                Workspaces, connection profiles, schema snapshots, and Truth
                Ledgers are strictly partitioned by cryptographic tenant
                identifiers. Cross-tenant leakage is architecturally blocked.
              </p>
            </div>
            <div className="legal-card">
              <h3>Formula Injection Immunity</h3>
              <p>
                All tabular CSV exports strictly sanitize cell contents
                according to CWE-1236 guidelines, escaping formula triggers (=,
                +, -, @) to safeguard your spreadsheets.
              </p>
            </div>
          </div>
        </section>

        <section className="legal-section">
          <h2>2. Information We Process</h2>
          <h3>2.1 Schema Metadata</h3>
          <p>
            To power schema discovery and the Schema Constellation graph, Metis
            inspects public table names, column names, data types, primary keys,
            and foreign key constraints within your designated allowed schemas.
            Private schemas, system catalogs (`pg_catalog`,
            `information_schema`), and unassigned tables are unconditionally
            denied.
          </p>

          <h3>2.2 Database Credentials & Secrets</h3>
          <p>
            Database passwords and connection secrets are encrypted at rest
            using AES-256-GCM authenticated encryption. Plaintext passwords are
            never returned in API responses, stored in client cookies, or logged
            in application traces.
          </p>

          <h3>2.3 Queries & Audit Telemetry</h3>
          <p>
            Every analysis run generates structured audit events containing
            execution timestamps, measured duration, returned row counts, model
            call quotas, and deterministic verification rule passes. Operational
            logs redact sensitive parameters and sample rows.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Query Safety & Policy Gating</h2>
          <p>
            Before any SQL query is transmitted to your database, it is analyzed
            by a multi-tier AST security parser. Metis enforces:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Single-Statement Invariant</strong>: Only single, isolated
              `SELECT` statements are permitted. Semicolon chaining and compound
              queries are rejected.
            </li>
            <li>
              <strong>Write Prevention</strong>: Any query containing `INSERT`,
              `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, or mutating CTEs
              is terminated before execution.
            </li>
            <li>
              <strong>Catalog Protection</strong>: Access to administrative
              functions, filesystem utilities, shell executors, and internal
              catalogs is permanently blocked.
            </li>
            <li>
              <strong>Schema Allowlisting</strong>: Queries may only reference
              tables within the explicitly authorized schemas configured on that
              connection.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Reproducibility & Truth Ledger Exports</h2>
          <p>
            Metis empowers analysts with complete audit portability. You can
            export:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Truth Ledgers</strong>: Documenting claims directly tied
              to verified source rows and deterministic check outcomes.
            </li>
            <li>
              <strong>Dialect SQL</strong>: Clean, read-only scripts with
              verifiable constraints.
            </li>
            <li>
              <strong>Reproducibility Bundles</strong>: Version 1.0 JSON
              manifests containing the question, schema snapshot digest, plan,
              SQL, verification metrics, and execution telemetry.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Your Rights & Control</h2>
          <p>
            You retain absolute ownership of your data, schemas, and analytical
            recipes. At any time, you can:
          </p>
          <ul className="legal-list">
            <li>
              <strong>Revoke Connections</strong>: Instantly revoke any database
              connection via the Metis API or UI. Revoked connections
              immediately terminate all active and future query executions.
            </li>
            <li>
              <strong>Delete Analyses & History</strong>: Purge analysis runs,
              cached previews, and session documents from your workspace.
            </li>
            <li>
              <strong>Manage Recipe Approvals</strong>: Transition analysis
              recipes between draft, approved, and archived states.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Security Contact & Responsible Disclosure</h2>
          <p>
            Metis maintains a zero-tolerance policy for security regressions. If
            you discover a vulnerability or have inquiries regarding our data
            protection architecture, please contact our security team at:
          </p>
          <div className="legal-callout">
            <strong>Security & Privacy Team:</strong>
            <code>security@metis.ai</code>
            <p>
              PGP key available upon request. We respond to all verified
              security inquiries within 24 hours.
            </p>
          </div>
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
