const webhooks: Record<string, string | undefined> = {
  competitive_watch: process.env.N8N_WEBHOOK_COMPETITIVE,
  import_supplier: process.env.N8N_WEBHOOK_IMPORT,
  descriptions: process.env.N8N_WEBHOOK_DESCRIPTIONS,
  weekly_report: process.env.N8N_WEBHOOK_WEEKLY,
};

export interface WebhookResult {
  success: boolean;
  reason?: string;
}

export async function triggerN8nWebhook(
  name: string,
  payload?: Record<string, unknown>,
): Promise<WebhookResult> {
  const url = webhooks[name];
  if (!url) {
    return {
      success: false,
      reason: `Configurer N8N_WEBHOOK_${name.toUpperCase()} dans .env.local`,
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, triggered_at: new Date().toISOString() }),
    });
    return { success: res.ok };
  } catch (err) {
    return { success: false, reason: String(err) };
  }
}
