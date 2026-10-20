import type { Response } from "express";
import asyncHandler from "express-async-handler";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";

/**
 * POST /api/admin/clients/:id/provision-now
 *
 * Runs provisioning in a detached child process so it survives the HTTP
 * request. Plesk Passenger may suspend the request process right after the
 * response, which kills fire-and-forget promises (the old retry endpoint).
 */
export const provisionNow = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    if (client.provisioning_status === "completed") {
      throw new BadRequest("Client provisioning is already completed");
    }

    const script = path.join(
      process.cwd(),
      "dist",
      "scripts",
      "provision.js",
    );
    if (!fs.existsSync(script)) {
      throw new BadRequest(
        "dist/scripts/provision.js not found. Rebuild with the provision entry.",
      );
    }

    await ClientModel.findByIdAndUpdate(client._id, {
      provisioning_status: "pending",
      provisioning_error: null,
    });

    const logDir = path.join(process.cwd(), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `provision-${client._id}.log`);
    const out = fs.openSync(logPath, "a");

    const child = spawn(process.execPath, [script, client._id.toString()], {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", out, out],
      env: process.env,
    });
    child.unref();
    fs.closeSync(out);

    SuccessResponse(
      res,
      {
        message: "Provisioning started in a detached process",
        data: {
          id: client._id,
          log: `logs/provision-${client._id}.log`,
        },
      },
      202,
    );
  },
);
