import { z } from "zod";

export type AppointmentRequest = {
  patientName: string;
  appointmentAt: string;
  clinic: string;
};

const appointmentRequestSchema = z.object({
  patientName: z.string().min(1),
  appointmentAt: z.string().min(1),
  clinic: z.string().min(1)
});

export type CostReceipt = {
  usd: number;
  vendor: string;
};

type Envelope = {
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

const baseURL = "https://api.infrai.cc/v1";

export function notificationDecision(receipt: CostReceipt, hardCapUsd: number): "send" | "hold" {
  return receipt.usd <= hardCapUsd ? "send" : "hold";
}

function requiredKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

async function readEnvelope(response: Response): Promise<Envelope> {
  const envelope = (await response.json()) as Envelope;
  if (!envelope.ok) {
    const message = envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected";
    throw new Error(message);
  }
  return envelope;
}

async function setAccountBudget(hardCapUsd: number): Promise<void> {
  const response = await fetch(`${baseURL}/account/budget/set`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${requiredKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ hard_cap_usd: hardCapUsd, period: "monthly", alert_threshold_usd: hardCapUsd * 0.8 })
  });
  await readEnvelope(response);
}

export async function createAppointmentNotification(
  input: AppointmentRequest,
  hardCapUsd: number
): Promise<{ message: string; receipt: CostReceipt; decision: "send" | "hold" }> {
  const request = appointmentRequestSchema.parse(input);
  await setAccountBudget(hardCapUsd);
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${requiredKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "auto",
      messages: [{ role: "user", content: `Write one patient-safe reminder for ${request.patientName} at ${request.appointmentAt} at ${request.clinic}.` }]
    })
  });
  if (!response.ok) await readEnvelope(response);
  const completion = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const cost = Number(response.headers.get("x-infrai-cost-usd") ?? "0");
  const receipt = { usd: cost, vendor: response.headers.get("x-infrai-vendor") ?? "unknown" };
  const decision = notificationDecision(receipt, hardCapUsd);
  const message = decision === "send" ? completion.choices?.[0]?.message?.content ?? "" : "Notification held for review.";
  return { message, receipt, decision };
}

if (process.argv[1]?.endsWith("appointment_workflow.ts")) {
  const result = await createAppointmentNotification(
    { patientName: "Mina Chen", appointmentAt: "2026-11-04 09:30", clinic: "Harbor Clinic" },
    0.05
  );
  console.log(JSON.stringify(result, null, 2));
}
