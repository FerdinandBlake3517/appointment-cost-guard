import assert from "node:assert/strict";
import { notificationDecision } from "./appointment_workflow.ts";

assert.equal(notificationDecision({ usd: 0.01, vendor: "example" }, 0.05), "send");
assert.equal(notificationDecision({ usd: 0.06, vendor: "example" }, 0.05), "hold");
console.log("appointment cost decision: passed");
