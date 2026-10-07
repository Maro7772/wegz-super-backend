import cron from "node-cron";
import { SubscriptionModel } from "../models/Subscription";

/**
 * كل يوم الساعة 00:05 — يحدّث الاشتراكات المنتهية.
 * - active + end_date < now  →  expired
 */
export function startSubscriptionCron() {
  cron.schedule("5 0 * * *", async () => {
    console.log("[Cron] Checking for expired subscriptions...");

    try {
      const now = new Date();
      const result = await SubscriptionModel.updateMany(
        {
          status: "active",
          end_date: { $lt: now },
        },
        { $set: { status: "expired" } },
      );

      console.log(
        `[Cron] Marked ${result.modifiedCount} subscriptions as expired`,
      );
    } catch (err: any) {
      console.error("[Cron] Subscription expiry update failed:", err.message);
    }
  });

  console.log("⏰ Subscription cron job scheduled (daily at 00:05)");
}
