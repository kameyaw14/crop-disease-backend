// controllers/subscriptionController.ts
// UPDATED: real Paystack initialize + verify + webhook. Demo path removed.

import type { Request, Response, NextFunction } from "express";
import { subscriptionService } from "../services/subscriptionService.js";
import { paymentService } from "../services/paymentService.js";

export const subscriptionController = {
  // NO CHANGES in behaviour – still returns current plan status
  async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const result = await subscriptionService.getStatus(userId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  // NEW ADDITION: start Paystack checkout and return authorization_url
  async initialize(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId as string;
      const email = (req.body?.email as string | undefined)?.trim();

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required to start payment.",
        });
      }

      // Block if user already has an active paid plan
      const existing =
        await subscriptionService.getActivePaidSubscription(userId);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `You already have an active plan until ${existing.endsAt.toISOString()}.`,
        });
      }

      const checkout = await paymentService.createCheckout({
        userId,
        email,
        // optional client-generated ref is fine; Paystack may still return its own
        reference:
          typeof req.body?.reference === "string"
            ? req.body.reference
            : undefined,
      });

      return res.status(200).json({
        success: true,
        message: "Checkout ready. Complete payment on Paystack.",
        authorizationUrl: checkout.authorizationUrl,
        accessCode: checkout.accessCode,
        reference: checkout.reference,
      });
    } catch (error: any) {
      console.error("Subscribe initialize error:", error?.message);
      return res.status(400).json({
        success: false,
        message: error?.message || "Unable to start payment.",
      });
    }
  },

  // NEW ADDITION: client can call this after returning from the browser
  // Verifies with Paystack then activates (webhook is still the source of truth)
  async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId as string;
      const reference = (req.body?.reference as string | undefined)?.trim();

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: "Payment reference is required.",
        });
      }

      const verified = await paymentService.verifyTransaction(reference);

      if (verified.status !== "success") {
        return res.status(400).json({
          success: false,
          message: "Payment has not been completed yet.",
        });
      }

      // Hard checks – never trust the client
      if (verified.amount !== paymentService.getExpectedAmountPesewas()) {
        return res.status(400).json({
          success: false,
          message: "Payment amount is invalid.",
        });
      }

      if (verified.currency !== "GHS") {
        return res.status(400).json({
          success: false,
          message: "Payment currency is invalid.",
        });
      }

      // Prefer userId from metadata if present (set at initialize)
      const metaUserId =
        verified.metadata && typeof verified.metadata.userId === "string"
          ? (verified.metadata.userId as string)
          : userId;

      if (metaUserId !== userId) {
        return res.status(403).json({
          success: false,
          message: "This payment does not belong to your account.",
        });
      }

      const subscription = await subscriptionService.activateFromPayment({
        userId,
        reference: verified.reference,
        amountGhs: verified.amount / 100, // pesewas → GHS
      });

      return res.status(200).json({
        success: true,
        message: "Farmer Monthly is now active.",
        plan: subscription.plan.code,
        planName: subscription.plan.name,
        startsAt: subscription.startsAt,
        endsAt: subscription.endsAt,
        amountGhs: Number(subscription.amountGhs),
        source: subscription.source,
        reference: subscription.externalRef,
      });
    } catch (error: any) {
      console.error("Subscribe verify error:", error?.message);
      return res.status(400).json({
        success: false,
        message: error?.message || "Unable to confirm payment.",
      });
    }
  },

  // NEW ADDITION: Paystack webhook – must receive RAW body for signature
  // Always respond 200 quickly so Paystack does not keep retrying
  async webhook(req: Request, res: Response) {
    try {
      const signature = req.headers["x-paystack-signature"] as
        | string
        | undefined;

      // req.body is a Buffer when using express.raw()
      const rawBody: Buffer | string = Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);

      if (!paymentService.isValidWebhookSignature(rawBody, signature)) {
        // Do not process – but still 200 to avoid noisy retries from bad actors
        return res.status(200).json({ received: true });
      }

      const event =
        typeof rawBody === "string"
          ? JSON.parse(rawBody)
          : JSON.parse(rawBody.toString("utf8"));

      // We only care about successful charges
      if (event?.event !== "charge.success") {
        return res.status(200).json({ received: true });
      }

      const data = event.data;
      if (!data || data.status !== "success") {
        return res.status(200).json({ received: true });
      }

      const reference: string = data.reference;
      const amount: number = data.amount; // pesewas
      const currency: string = data.currency;
      const metadata = data.metadata || {};
      const userId: string | undefined = metadata.userId;

      if (
        amount !== paymentService.getExpectedAmountPesewas() ||
        currency !== "GHS" ||
        !userId
      ) {
        console.error("Paystack webhook rejected: amount/currency/userId");
        return res.status(200).json({ received: true });
      }

      try {
        await subscriptionService.activateFromPayment({
          userId,
          reference,
          amountGhs: amount / 100,
        });
      } catch (err: any) {
        // Already active or duplicate reference is fine – log and move on
        console.error("Webhook activate note:", err?.message);
      }

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Paystack webhook error:", error?.message);
      // Still 200 so Paystack stops retrying on parse errors we cannot fix
      return res.status(200).json({ received: true });
    }
  },
};
