import type { Response } from "express";
import asyncHandler from "express-async-handler";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { ClientModel } from "../models/Client";
import { BadRequest, NotFound } from "../utils/errors";
import { SuccessResponse } from "../utils/response";
import { spawnProvisioningTask } from "../services/provisioner.service";

/**
 * POST /api/admin/clients/:id/provision-now
 *
 * Runs provisioning outside the Passenger process (a one-shot server-wide
 * scheduled task). Subdomain creation, Node.js enable and SSL issuance all
 * make Plesk restart the web server, which kills any in-process or child
 * process of the super backend. The scheduled task survives those restarts.
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

    SuccessResponse(
      res,
      {
        message: startError
          ? "Provisioning could not be started"
          : "Provisioning started (detached scheduled task)",
        data: {
          id: client._id,
          log: `tmp/provision-${client._id}.log`,
          ...(startError ? { error: startError } : {}),
        },
      },
      startError ? 500 : 202,
    );
  },
);
