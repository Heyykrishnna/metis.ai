import { Writable } from "node:stream";
import { expect, it } from "vitest";
import { createLogger } from "../src/logger.js";

it("redacts credentials and internal error details from structured logs", () => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const logger = createLogger(stream);
  logger.level = "info";
  logger.error(
    {
      password: "private-password",
      req: {
        headers: { authorization: "private-token" },
        body: { rows: ["private-result"] },
      },
      err: new Error("private-database-url"),
    },
    "Dependency failed",
  );
  expect(output).not.toContain("private-");
  expect(output).toContain("Dependency failed");
});
