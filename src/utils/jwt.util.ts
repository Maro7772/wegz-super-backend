import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "./errors";

export interface JwtPayload {
  sub: string;
}

export function signAdminToken(adminId: string): string {
  return jwt.sign({ sub: adminId } as JwtPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

export function verifyAdminToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
