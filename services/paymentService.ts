// services/paymentService.ts

import crypto from "crypto";
import { env } from "../utils/env.js";

const PAYSTACK_BASE = "https://api.paystack.co";
const FARMER_AMOUNT_PESEWAS = 5000; // 50 GHS
const FARMER_PLAN_CODE = "FARMER_MONTHLY";

type InitializeParams = {
  userId: string;
  email: string;
  // optional client reference – we still prefer Paystack's returned reference
  reference?: string;
};

type InitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

type VerifyResult = {
  status: string; // "success" | "failed" | "abandoned" | ...
  amount: number; // pesewas
  currency: string;
  reference: string;
  paidAt: string | null;
  metadata: Record<string, unknown> | null;
  customerEmail: string | null;
};

export const paymentService = {
  //  create a Paystack checkout session
  async createCheckout(params: InitializeParams): Promise<InitializeResult> {
    if (!env.PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack is not configured on the server.");
    }

    const body: Record<string, unknown> = {
      email: params.email,
      amount: String(FARMER_AMOUNT_PESEWAS), // subunit of GHS = pesewas
      currency: "GHS",
      // metadata is returned in webhooks + verify so we know which user paid
      metadata: {
        userId: params.userId,
        planCode: FARMER_PLAN_CODE,
        custom_fields: [
          {
            display_name: "Plan",
            variable_name: "plan_code",
            value: FARMER_PLAN_CODE,
          },
        ],
      },
    };

    // Only send reference if the client provided one (alphanumeric + - . =)
    if (params.reference) {
      body.reference = params.reference;
    }

    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as {
      status: boolean;
      message: string;
      data?: {
        authorization_url: string;
        access_code: string;
        reference: string;
      };
    };

    if (!response.ok || !json.status || !json.data) {
      throw new Error(json.message || "Unable to start Paystack checkout.");
    }

    return {
      authorizationUrl: json.data.authorization_url,
      accessCode: json.data.access_code,
      reference: json.data.reference,
    };
  },

  //  confirm a transaction after the user returns from checkout
  async verifyTransaction(reference: string): Promise<VerifyResult> {
    if (!env.PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack is not configured on the server.");
    }

    const response = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const json = (await response.json()) as {
      status: boolean;
      message: string;
      data?: {
        status: string;
        amount: number;
        currency: string;
        reference: string;
        paid_at: string | null;
        metadata: Record<string, unknown> | null;
        customer?: { email?: string };
      };
    };

    if (!response.ok || !json.status || !json.data) {
      throw new Error(json.message || "Unable to verify payment.");
    }

    return {
      status: json.data.status,
      amount: json.data.amount,
      currency: json.data.currency,
      reference: json.data.reference,
      paidAt: json.data.paid_at,
      metadata: json.data.metadata,
      customerEmail: json.data.customer?.email ?? null,
    };
  },

  //  HMAC SHA512 signature check for webhooks
  // rawBody must be the exact bytes Paystack sent (string or Buffer)
  isValidWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
  ): boolean {
    if (!env.PAYSTACK_SECRET_KEY || !signatureHeader) return false;

    const hash = crypto
      .createHmac("sha512", env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    // constant-time compare to avoid timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash, "utf8"),
        Buffer.from(signatureHeader, "utf8"),
      );
    } catch {
      return false;
    }
  },

  //  helpers used by controller
  getExpectedAmountPesewas(): number {
    return FARMER_AMOUNT_PESEWAS;
  },

  getExpectedPlanCode(): string {
    return FARMER_PLAN_CODE;
  },
};
