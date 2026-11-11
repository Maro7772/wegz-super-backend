import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { env } from "../config/env";
import { spawnProvisioningTask, provisionClient } from "../services/provisioner.service";

/**
 * POST /api/admin/clients/:id/provision-now
 */
export const provisionNow = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const client = await ClientModel.findById(req.params.id);
    if (!client) throw new NotFound("Client not found");

    if (client.provisioning_status === "completed") {
      throw new BadRequest("Client provisioning is already completed");
    }

    await ClientModel.findByIdAndUpdate(client._id, {
      provisioning_status: "pending",
      provisioning_error: null,
    });

    let startError: string | null = null;

    if (env.PROVISIONING_MODE === "wildcard") {
      await provisionClient(client._id.toString()).catch(async (err) => {
        startError = `Could not start wildcard provisioning: ${err?.message || err}`;
        console.error(`❌ Could not provision for ${client._id}:`, err);
      });
    } else {
      await spawnProvisioningTask(client._id.toString()).catch(async (err) => {
        startError = `Could not start provisioning: ${err?.message || err}`;
        console.error(
          `❌ Could not start provisioning for ${client._id}:`,
          err,
        );
        await ClientModel.findByIdAndUpdate(client._id, {
          provisioning_status: "failed",
          provisioning_error: startError,
        }).catch(() => {});
      });
    }

    SuccessResponse(
      res,
      {
        message: startError
          ? "Provisioning could not be started"
          : (env.PROVISIONING_MODE === "wildcard"
              ? "Wildcard provisioning completed successfully"
              : "Provisioning started (detached scheduled task)"),
        data: {
          id: client._id,
          mode: env.PROVISIONING_MODE,
          ...(startError ? { error: startError } : {}),
        },
      },
      startError ? 500 : 202,
    );
  },
);
