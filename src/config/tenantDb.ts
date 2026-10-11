import mongoose from "mongoose";
import { env } from "./env";

let tenantClusterConnection: mongoose.Connection | null = null;

/**
 * Returns the full MongoDB connection string for a specific tenant database.
 * Formats the base TENANT_MONGO_URI by injecting the tenant dbName.
 */
export function getTenantMongoUri(dbName: string): string {
  const baseUri = env.TENANT_MONGO_URI || env.MONGO_URI;
  const qIndex = baseUri.indexOf("?");

  if (qIndex !== -1) {
    const beforeQ = baseUri.substring(0, qIndex).replace(/\/+$/, "");
    const afterQ = baseUri.substring(qIndex);
    const lastSlash = beforeQ.lastIndexOf("/");
    const prefix = beforeQ.substring(0, lastSlash + 1);
    return `${prefix}${dbName}${afterQ}`;
  } else {
    const clean = baseUri.replace(/\/+$/, "");
    const lastSlash = clean.lastIndexOf("/");
    const prefix = clean.substring(0, lastSlash + 1);
    return `${prefix}${dbName}`;
  }
}

/**
 * Connects to or reuses the dedicated Tenant MongoDB cluster connection.
 */
export async function getTenantClusterConnection(): Promise<mongoose.Connection> {
  const tenantUri = env.TENANT_MONGO_URI;
  if (!tenantUri) {
    return mongoose.connection;
  }

  if (tenantClusterConnection && tenantClusterConnection.readyState === 1) {
    return tenantClusterConnection;
  }

  try {
    tenantClusterConnection = mongoose.createConnection(tenantUri);
    await tenantClusterConnection.asPromise();
    console.log("✅ Connected to Tenant MongoDB Cluster");
    return tenantClusterConnection;
  } catch (err: any) {
    console.error("❌ Failed to connect to Tenant MongoDB Cluster:", err.message);
    throw err;
  }
}

/**
 * Gets the tenant-specific Mongoose connection for a given database name.
 */
export async function getTenantDatabase(dbName: string): Promise<mongoose.Connection> {
  const clusterConn = await getTenantClusterConnection();
  return clusterConn.useDb(dbName, { useCache: true });
}
