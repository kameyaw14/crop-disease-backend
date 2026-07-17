// services/pushService.ts
//@ts-nocheck
import { prisma } from "../config/connectDb.js";


const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

// Expo accepts a maximum of 100 messages per request, so larger batches must be split into chunks
const CHUNK_SIZE = 100;

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, any>;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export const pushService = {
  async sendToUser(userId: string, payload: PushPayload) {
    const tokens = await prisma.pushToken.findMany({ where: { userId } });

    if (tokens.length === 0) {
      return;
    }

    const messages = tokens.map((t) => ({
      to: t.token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      priority: "high", // ensures Android treats this as a heads-up notification
      channelId: "default", // must match the channel created on the frontend
    }));

    const chunks = chunkArray(messages, CHUNK_SIZE);

    for (const chunk of chunks) {
      try {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(chunk),
        });

        const result = await response.json();
        const tickets = result?.data || [];

        // Tickets come back in the same order as the messages we sent,
        // so we can match ticket[i] to chunk[i]'s token
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          const sentToken = chunk[i]?.to;

          if (ticket?.status === "error") {
            if (ticket.details?.error === "DeviceNotRegistered") {
              // The app was uninstalled or permissions were revoked on that device.
              // Remove the dead token so we stop wasting requests on it.
              await prisma.pushToken
                .deleteMany({ where: { token: sentToken } })
                .catch(() => {});
              console.log("🗑️ Removed stale push token (DeviceNotRegistered)");
            } else {
              console.error("⚠️ Push ticket error:", ticket.message);
            }
          }
        }
      } catch (error) {
        console.error("❌ Failed to send push notification chunk:", error);
      }
    }
  },
};
