import mongoose from "mongoose";
import { env } from "../config/env";
import { provisionClient } from "./provisioner.service";
import { ClientModel } from "../models/Client";

/**
 * Standalone runner — يعمل في process منفصل تمامًا.
 * يُستدعى من client.controller.ts عبر child_process.fork().
 *
 * Usage: node provisioner.runner.js <clientId>
 */
async function main() {
  const clientId = process.argv[2];
  if (!clientId) {
    console.error("❌ No clientId provided");
    process.exit(1);
  }

  console.log(`\n🚀 Provisioning runner started`);
  console.log(`   Client: ${clientId}`);
  console.log(`   PID: ${process.pid}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);

  try {
    await mongoose.connect(env.MONGO_URI);
    console.log("✅ MongoDB connected (runner)\n");

    await provisionClient(clientId);

    console.log(`\n✅ Provisioning runner finished successfully\n`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌ Provisioning runner failed: ${err.message}\n`);
    console.error(err.stack);

    // ضمان إن الـ status اتحدّث حتى لو حصل خطأ
    try {
      await ClientModel.findByIdAndUpdate(clientId, {
        provisioning_status: "failed",
        provisioning_error: err.message,
        provisioning_updated_at: new Date(),
      });
    } catch {}

    try {
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
}

main();
