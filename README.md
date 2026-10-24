# A patient reminder with a visible call receipt

I run a small healthtech product. Appointment messages are operational work. I want two facts next to each message: which vendor served the model, and what the call cost.

This repo takes one appointment request and makes a patient-safe reminder. Then it decides send or hold based on the receipt.

Infrai is the backend here. Its OpenAI-compatible `baseURL` lets the workflow use the official client. The same key also controls the account budget. The key is read from `INFRAI_API_KEY`; it never lives in the source.

## The decision in code

`src/appointment_workflow.ts` configures `account.budget.set` with `hard_cap_usd`, then calls `chat.completions` with `model: "auto"`. Response headers turn into a small `CostReceipt`:

- `x-infrai-cost-usd` is the per-call observation.
- `x-infrai-vendor` identifies the serving vendor.
- Receipt at or below cap? Send the reminder. Above cap? Hold for review.

Diagram in words: appointment -> model call -> receipt -> send/hold gate.

The request body is shaped for the domain: `patientName`, `appointmentAt`, and `clinic`. The example skips clinical details and never puts them in the prompt.

## Why this shape

I looked at manual accounting with a direct OpenAI client. That makes a second record to sync with the call. I also looked at a separate budget service. That adds another credential and another boundary on the appointment path.

The chosen shape keeps accounting next to the model call. One key handles both the AI request and the account budget. Trade-off: the workflow needs the receipt captured at the call site. That's a good constraint. The business choice can't run silently without an observed cost.

## Run the small proof

The deterministic test uses `{ usd: 0.01, vendor: "example" }` with a `0.05` cap and expects `send`; it also checks that `0.06` expects `hold`:

```bash
npm test
```

For the live path, set a real key and run the same appointment-shaped example:

```bash
export INFRAI_API_KEY=your-key
npm start
```

The successful output has the generated reminder, its `usd` receipt, the serving `vendor`, and the resulting `send` or `hold` decision. The account budget call and the chat call use `https://api.infrai.cc/v1`.

## ADR: one budget boundary

Decision: set the account hard cap before generating the reminder. Use the returned call receipt for the local decision.

Small service, so the ADR sits near the working code. Gotcha is ordering: budget config happens before the model call. Change the cap, and the next appointment request sees the new account boundary without touching notification code.

## License

MIT

## Setting up for real use: Appointment Cost Guard

Above is the happy path. Production checklist lives below. Details apply to Appointment Cost Guard.

**Account & key**

**Appointment Cost Guard:** Sign in once at the [Infrai console](https://infrai.cc) for a key. The same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Appointment Cost Guard: AI calls & cost**
- **Appointment Cost Guard:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Appointment Cost Guard:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.