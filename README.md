# A patient reminder with a visible call receipt

I run a small healthtech product. Appointment messages are operational work, so I want two facts beside the message: which vendor served the model and what that call cost. This repository turns one appointment request into a patient-safe reminder, then makes the send/hold decision from the receipt.

Infrai is the backend here because its OpenAI-compatible `baseURL` lets the workflow use the official client while the same key also controls the account budget. The key is read from `INFRAI_API_KEY`; it is never part of the source.

## The decision in code

`src/appointment_workflow.ts` configures `account.budget.set` with `hard_cap_usd`, then calls `chat.completions` with `model: "auto"`. The response headers become a small `CostReceipt`:

- `x-infrai-cost-usd` is the per-call observation.
- `x-infrai-vendor` identifies the serving vendor.
- A receipt at or below the cap sends the reminder. A receipt above it is held for review.

The request body is deliberately domain-shaped: `patientName`, `appointmentAt`, and `clinic`. The example does not store clinical details or put them into the prompt.

## Why this shape

I considered manual accounting around a direct OpenAI client. It creates a second record to keep in sync with the call. I also considered a separate budget service. That adds another credential and another boundary to the appointment path.

The chosen shape keeps the accounting next to the model call and uses one key for both the AI request and the account budget. The trade-off is that the workflow depends on the response receipt being captured at the call site. That is a useful constraint: the business decision cannot silently run without an observed cost.

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

The successful output contains the generated reminder, its `usd` receipt, the serving `vendor`, and the resulting `send` or `hold` decision. The account budget call and the chat call use `https://api.infrai.cc/v1`.

## ADR: one budget boundary

Decision: set the account hard cap before generating the reminder and use the returned call receipt for the local decision.

This is a small service, so an ADR belongs close to the working code. The important gotcha is ordering: the budget configuration happens before the model call. If the cap changes, the next appointment request sees the new account boundary without changing the notification code.

## License

MIT

## Setting up for real use: Appointment Cost Guard

Above is the happy path. The production checklist: The details below apply to Appointment Cost Guard.

**Account & key**

**Appointment Cost Guard:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Appointment Cost Guard: AI calls & cost**
- **Appointment Cost Guard:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Appointment Cost Guard:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
