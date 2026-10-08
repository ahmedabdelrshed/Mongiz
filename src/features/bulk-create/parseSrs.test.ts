import { describe, it, expect } from "vitest";
import { parseSrs } from "./parseSrs";
describe("SRS paste parsing", () => {
  it("puts every block into its title and leaves descriptions empty", () => {
    const r = parseSrs(
      "SRS.7.7.48: Create work order\nChoose multiple standards.\n\nSRS.7.7.49: Display inactive status\nShow a badge.",
    );
    expect(r.error).toBeUndefined();
    expect(r.stories).toHaveLength(2);
    expect(r.stories[0].title).toBe(
      "SRS.7.7.48: Create work order Choose multiple standards.",
    );
    expect(r.stories[0].criteria).toBe("");
    expect(r.stories[1].title).toBe(
      "SRS.7.7.49: Display inactive status Show a badge.",
    );
    expect(r.stories[1].criteria).toBe("");
  });
  it("supports CRLF, bullets, lowercase IDs and spaced IDs", () => {
    const r = parseSrs(
      "• srs.04.08.02.62 Include assemblies\r\nDetails\r\n2. SRS 7.7.48 Transform work order",
    );
    expect(r.stories).toHaveLength(2);
    expect(r.stories[0].title).toBe(
      "SRS.04.08.02.62 Include assemblies Details",
    );
    expect(r.stories[1].title).toBe("SRS.7.7.48 Transform work order");
  });
  it("does not split an SRS reference inside a sentence", () => {
    const r = parseSrs(
      "SRS.7.7.48 Create work order\nDepends on SRS.7.7.47 and existing permissions.",
    );
    expect(r.stories).toHaveLength(1);
    expect(r.stories[0].title).toContain("SRS.7.7.47");
    expect(r.stories[0].criteria).toBe("");
  });
  it("reports missing and repeated identifiers instead of creating unintended drafts", () => {
    expect(parseSrs("just plain titles").error).toContain("No stories found");
    expect(parseSrs("SRS.1.2 First\nSRS.1.2 Second").error).toContain(
      "Repeated identifier",
    );
  });
  it("warns about preamble, preserves long title text and generates independent IDs", () => {
    const text =
      "Overview\nSRS.1.2 " + "a".repeat(300) + "\nDetails\nSRS.1.3 Next";
    const r = parseSrs(text);
    expect(r.warnings).toHaveLength(2);
    expect(r.stories[0].title.length).toBeGreaterThan(255);
    expect(r.stories[0].title).toContain("a".repeat(300));
    expect(r.stories[0].criteria).toBe("");
    expect(r.stories[0].id).not.toBe(r.stories[1].id);
  });
});
