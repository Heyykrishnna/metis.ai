import { expect, it } from "vitest";
import PrivacyPage, { metadata as privacyMeta } from "../src/app/privacy/page";
import TermsPage, { metadata as termsMeta } from "../src/app/terms/page";

it("exports valid metadata for legal compliance pages", () => {
  expect(privacyMeta.title).toBe("Privacy Policy · metis.ai");
  expect(termsMeta.title).toBe("Terms of Service · metis.ai");
  expect(privacyMeta.description).toContain("zero-retention");
  expect(termsMeta.description).toContain("acceptable database use");
});

it("renders privacy policy with zero-retention and AST safety guarantees", () => {
  const jsx = PrivacyPage();
  expect(jsx).toBeDefined();
  expect(jsx.type).toBe("div");
  expect(jsx.props.className).toBe("legal-container");
});

it("renders terms of service with read-only and ownership clauses", () => {
  const jsx = TermsPage();
  expect(jsx).toBeDefined();
  expect(jsx.type).toBe("div");
  expect(jsx.props.className).toBe("legal-container");
});
