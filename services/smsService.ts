// services/smsService.ts

import { env } from "../utils/env.js";

interface SendSmsParams {
  to: string; // full international format e.g. +233244123456
  message: string;
}

export const smsService = {

  async sendSms({ to, message }: SendSmsParams): Promise<void> {
    //Guard - never send if API key is missing (should already be caught by checkEnv)
    if (!env.ARKESEL_API_KEY) {
      throw new Error("ARKESEL_API_KEY is not configured");
    }

    const url = "https://sms.arkesel.com/api/v2/sms/send";

    const payload = {
      sender: "FarmDoc", //Registered Sender ID
      message,
      recipients: [to], // Arkesel expects an array
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": env.ARKESEL_API_KEY, //Authentication header required by Arkesel
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    //Basic success check (Arkesel returns status: "success" on success)
    if (!response.ok || data.status !== "success") {
      console.error("Arkesel SMS error:", data);
      // We throw so the caller can decide what to do (we still return generic success to user for security)
      throw new Error(data.message || "Failed to send SMS via Arkesel");
    }

    // Optional: you can log the message id for debugging if needed later
    // console.log("Arkesel message id:", data.data?.id);
  },
};
