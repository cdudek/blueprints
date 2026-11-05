import { vi } from "vitest";

// No test may reach the network through the global fetch. Ports take a fetch as a parameter;
// a test that needs one injects a fake.
vi.stubGlobal(
  "fetch",
  vi.fn(() => {
    throw new Error("global fetch reached in a test: inject a fetch into the port instead");
  }),
);
