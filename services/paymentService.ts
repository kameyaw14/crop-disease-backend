// services\paymentService.ts

export const paymentService = {
  async createCheckout(_params: {
    userId: string;
    email: string;
    amountPesewas: number;
    planCode: string;
  }): Promise<{ authorizationUrl?: string; reference?: string }> {
    throw new Error(
      "Paystack is not configured yet. Use POST /api/subscribe for demo activation.",
    );
  },

  async handleWebhook(_payload: unknown): Promise<void> {
    throw new Error("Paystack webhooks are not configured yet.");
  },
};
