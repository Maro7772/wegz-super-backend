import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { provisionClient } from "../services/provisioner.service";

const clientId = process.argv[2];

if (!clientId) {
  console.error("Usage: node dist/provision.js <clientId>");
  process.exit(1);
}

(async () => {
  await connectDB();
  try {
    const result = await provisionClient(clientId);
    console.log(
      `[Provision] Finished for ${clientId}: ${JSON.stringify(result)}`,
    );
  } catch (err: any) {
    console.error(
      `[Provision] Failed for ${clientId}:`,
      err?.stack || err?.message || err,
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
