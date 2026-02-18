#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function findHeaderIndex(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function sqlEscape(value) {
  return value.replace(/'/g, "''");
}

function usage() {
  console.error("Usage: node scripts/clerk-csv-to-sql.mjs <path-to-clerk-export.csv>");
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) usage();

const fullPath = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(fullPath)) {
  console.error(`CSV not found: ${fullPath}`);
  process.exit(1);
}

const csvText = fs.readFileSync(fullPath, "utf8");
const parsed = parseCsv(csvText);
if (parsed.length < 2) {
  console.error("CSV appears empty.");
  process.exit(1);
}

const headers = parsed[0].map(normalizeHeader);
const idIndex = findHeaderIndex(headers, ["id", "user_id", "userid", "clerk_user_id"]);
const emailIndex = findHeaderIndex(headers, [
  "email_address",
  "email",
  "primary_email_address",
  "primaryemailaddress",
]);
const usernameIndex = findHeaderIndex(headers, ["username", "user_name"]);

if (idIndex === -1) {
  console.error(`Unable to find Clerk user id column. Headers: ${headers.join(", ")}`);
  process.exit(1);
}

const records = [];
for (let r = 1; r < parsed.length; r += 1) {
  const row = parsed[r];
  const clerkUserId = (row[idIndex] || "").trim();
  if (!clerkUserId) continue;
  const email = emailIndex >= 0 ? (row[emailIndex] || "").trim() : "";
  const username = usernameIndex >= 0 ? (row[usernameIndex] || "").trim() : "";
  records.push({ clerkUserId, email, username });
}

if (records.length === 0) {
  console.error("No valid users found in CSV.");
  process.exit(1);
}

const values = records
  .map(
    (r) =>
      `('${sqlEscape(r.clerkUserId)}', '${sqlEscape(r.email)}', '${sqlEscape(r.username)}')`
  )
  .join(",\n");

const output = `insert into tmp_clerk_users (clerk_user_id, email, username) values\n${values};`;
process.stdout.write(output + "\n");

