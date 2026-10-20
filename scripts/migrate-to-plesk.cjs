#!/usr/bin/env node
/**
 * Migrate the Wegz Super DB + tenant DBs from Atlas to the MongoDB on the Plesk server.
 *
 * Run on the Plesk server, from the project root:
 *
 *   SOURCE_MONGO_URI="mongodb+srv://..." CONFIRM=YES node scripts/migrate-to-plesk.cjs
 *
 * Optional env:
 *   SOURCE_DB=test           Source database name (default: test)
 *   TARGET_DB=SuperWegz      Target database name (default: SuperWegz)
 *   MIGRATE_TENANTS=false    Skip tenant databases (default: true)
 *   DRY_RUN=1                Print the plan only, no writes
 *
 * The target connection is built from PLESK_MONGO_URI / PLESK_MONGO_USER /
 * PLESK_MONGO_PASS in .env, exactly like the application does.
 */

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { mongo } = require("mongoose");
const { MongoClient } = mongo;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const sourceUri = process.env.SOURCE_MONGO_URI;
const sourceDbName = process.env.SOURCE_DB || "test";
const targetDbName = process.env.TARGET_DB || "SuperWegz";
const tenantPrefix = process.env.TENANT_DB_PREFIX || "sc_";
const migrateTenants = process.env.MIGRATE_TENANTS !== "false";
const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const confirmed = process.env.CONFIRM === "YES";

const SKIP_COLLECTIONS = new Set(["packages", "subscriptions"]);

function buildPleskUri() {
  let uri = process.env.PLESK_MONGO_URI || "mongodb://127.0.0.1:27017";
  const user = process.env.PLESK_MONGO_USER;

  if (user && !/^mongodb(\+srv)?:\/\/[^/@]+@/.test(uri)) {
    uri = uri.replace(
      /^mongodb(\+srv)?:\/\//,
      `mongodb$1://${encodeURIComponent(user)}:${encodeURIComponent(
        process.env.PLESK_MONGO_PASS || "",
      )}@`,
    );
  }

  if (user && !/[?&]authSource=/.test(uri)) {
    uri += (uri.includes("?") ? "&" : "?") + "authSource=admin";
  }

  return uri;
}

function redact(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//***:***@");
}

function toIndexSpec(index) {
  const spec = { key: index.key, name: index.name };
  const optional = [
    "unique",
    "sparse",
    "expireAfterSeconds",
    "partialFilterExpression",
    "collation",
    "weights",
    "default_language",
    "language_override",
    "textIndexVersion",
    "2dsphereIndexVersion",
    "bits",
    "min",
    "max",
    "bucketSize",
    "wildcardProjection",
  ];
  for (const key of optional) {
    if (index[key] !== undefined) spec[key] = index[key];
  }
  return spec;
}

async function collectionNames(db, skip = new Set()) {
  const cols = await db.listCollections({}, { nameOnly: true }).toArray();
  return cols
    .map((c) => c.name)
    .filter((name) => !skip.has(name))
    .sort();
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

async function copyDatabase(srcDb, dstDb, label, skip = new Set()) {
  const names = await collectionNames(srcDb, skip);
  let totalDocs = 0;

  for (const name of names) {
    const srcCol = srcDb.collection(name);
    const count = await srcCol.countDocuments();
    const sourceIndexes = await srcCol.indexes();

    const exists = await dstDb
      .listCollections({ name }, { nameOnly: true })
      .hasNext();
    if (exists) await dstDb.collection(name).drop();

    let copied = 0;
    if (count > 0) {
      const cursor = srcCol.find({}).batchSize(500);
      let batch = [];

      for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= 500) {
          await dstDb.collection(name).insertMany(batch, { ordered: false });
          copied += batch.length;
          batch = [];
        }
      }

      if (batch.length > 0) {
        await dstDb.collection(name).insertMany(batch, { ordered: false });
        copied += batch.length;
      }
    } else {
      await dstDb.createCollection(name).catch(() => {});
    }

    const indexes = sourceIndexes
      .filter((i) => i.name !== "_id_")
      .map(toIndexSpec);
    if (indexes.length > 0) {
      await dstDb.collection(name).createIndexes(indexes);
    }

    totalDocs += copied;
    console.log(
      `  [${label}] ${name}: ${copied}/${count} copied` +
        (indexes.length ? `, ${indexes.length} index(es)` : ""),
    );
  }

  return totalDocs;
}

async function cleanupSuperDb(db) {
  for (const obsolete of ["packages", "subscriptions"]) {
    const exists = await db
      .listCollections({ name: obsolete }, { nameOnly: true })
      .hasNext();
    if (exists) {
      await db.collection(obsolete).drop();
      console.log(`  Dropped obsolete collection: ${obsolete}`);
    }
  }

  const clients = await db.collection("clients").find({}).toArray();
  for (const client of clients) {
    const dbName = client.db_name || `${tenantPrefix}${client._id.toString()}`;
    await db.collection("clients").updateOne(
      { _id: client._id },
      {
        $set: { db_name: dbName },
        $unset: { package_id: "" },
      },
    );
    console.log(`  Client ${client._id} → db_name=${dbName}`);
  }
}

async function verify(srcDb, dstDb, label, skip = new Set()) {
  const names = await collectionNames(srcDb, skip);
  let ok = true;

  for (const name of names) {
    const before = await srcDb.collection(name).countDocuments();
    const after = await dstDb.collection(name).countDocuments();
    if (before !== after) {
      ok = false;
      console.error(
        `  ❌ [${label}] ${name}: source=${before}, target=${after}`,
      );
    }
  }

  if (ok) console.log(`  ✅ [${label}] counts match`);
  return ok;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!sourceUri) {
    console.error(
      [
        "Missing SOURCE_MONGO_URI.",
        "",
        "Copy the old Atlas URI from .env (the commented MONGO_URI line) and run:",
        '  SOURCE_MONGO_URI="mongodb+srv://..." CONFIRM=YES node scripts/migrate-to-plesk.cjs',
      ].join("\n"),
    );
    process.exit(1);
  }

  const targetUri = buildPleskUri();

  console.log("Source :", redact(sourceUri), "| db:", sourceDbName);
  console.log("Target :", redact(targetUri), "| db:", targetDbName);
  console.log("Tenants:", migrateTenants ? "yes" : "no");

  const source = new MongoClient(sourceUri, {
    serverSelectionTimeoutMS: 30_000,
  });
  await source.connect();

  const srcDb = source.db(sourceDbName);
  const superCollections = await collectionNames(srcDb, SKIP_COLLECTIONS);

  const clients = await srcDb
    .collection("clients")
    .find({}, { projection: { _id: 1, db_name: 1 } })
    .toArray();

  const wantedTenants = [
    ...new Set(
      clients.map(
        (c) => c.db_name || `${tenantPrefix}${c._id.toString()}`,
      ),
    ),
  ];

  const allDatabases = (
    await source.db().admin().listDatabases({ nameOnly: true })
  ).databases.map((d) => d.name);

  const tenantsToCopy = migrateTenants
    ? wantedTenants.filter((name) => allDatabases.includes(name))
    : [];
  const orphanTenants = allDatabases.filter(
    (name) => name.startsWith(tenantPrefix) && !wantedTenants.includes(name),
  );

  console.log("\nSuper DB collections:");
  for (const name of superCollections) {
    console.log(
      `  - ${name}: ${await srcDb.collection(name).countDocuments()}`,
    );
  }

  console.log(
    "\nTenant DBs to copy:",
    tenantsToCopy.length ? tenantsToCopy.join(", ") : "(none)",
  );
  if (orphanTenants.length > 0) {
    console.log("Orphan tenant DBs (skipped):", orphanTenants.join(", "));
  }

  if (dryRun) {
    console.log("\nDRY_RUN=1 — no writes performed.");
    await source.close();
    return;
  }

  if (!confirmed) {
    console.log("\nRefusing to write without CONFIRM=YES.");
    await source.close();
    process.exit(1);
  }

  const target = new MongoClient(targetUri, {
    serverSelectionTimeoutMS: 30_000,
  });
  await target.connect();
  await target.db("admin").command({ ping: 1 });
  console.log("\n✅ Connected to Plesk MongoDB\n");

  let ok = true;

  try {
    console.log(`Copying super DB → ${targetDbName}`);
    await copyDatabase(
      srcDb,
      target.db(targetDbName),
      "super",
      SKIP_COLLECTIONS,
    );
    await cleanupSuperDb(target.db(targetDbName));

    for (const name of tenantsToCopy) {
      console.log(`\nCopying tenant DB → ${name}`);
      await copyDatabase(source.db(name), target.db(name), name);
    }

    console.log("\nVerifying:");
    ok =
      (await verify(srcDb, target.db(targetDbName), "super", SKIP_COLLECTIONS)) &&
      ok;
    for (const name of tenantsToCopy) {
      ok = (await verify(source.db(name), target.db(name), name)) && ok;
    }
  } finally {
    await target.close();
    await source.close();
  }

  if (!ok) {
    console.error("\n❌ Migration finished with mismatches. Check the log.");
    process.exit(1);
  }

  console.log(
    [
      "",
      "✅ Migration complete.",
      "",
      "Next steps:",
      `  1. Keep MONGO_URI=mongodb://...@127.0.0.1:32768/${targetDbName}?authSource=admin in .env`,
      "  2. Restart the Node app",
      "  3. Log in and check GET /api/admin/diagnostics/mongo",
      "  4. For the existing client, call POST /api/admin/clients/<id>/retry-provisioning",
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("\n❌ Migration failed:", err.message);
  process.exit(1);
});
