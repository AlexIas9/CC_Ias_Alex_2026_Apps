const { DefaultAzureCredential } = require("@azure/identity");
const { BlobServiceClient } = require("@azure/storage-blob");

const DEFAULT_CONTAINER_NAME = "datasets";
const DEFAULT_BLOB_NAME = "energy_usage_large.csv";

let cachedClient;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getBlobClient() {
  const accountName = requiredEnv("STORAGE_ACCOUNT_NAME");
  const containerName = process.env.DATASETS_CONTAINER_NAME || DEFAULT_CONTAINER_NAME;
  const blobName = process.env.DATASET_BLOB_NAME || DEFAULT_BLOB_NAME;

  if (!cachedClient || cachedClient.accountName !== accountName) {
    const credential = new DefaultAzureCredential();
    const serviceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      credential
    );

    cachedClient = {
      accountName,
      serviceClient,
    };
  }

  return cachedClient.serviceClient
    .getContainerClient(containerName)
    .getBlobClient(blobName);
}

async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    readableStream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    readableStream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    readableStream.on("error", reject);
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function parseCsv(csvText) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function statusFromKwh(kwh) {
  if (kwh >= 1.2) {
    return "critical";
  }

  if (kwh >= 1) {
    return "warning";
  }

  return "normal";
}

function toEnergyEvent(row, index) {
  const value = Number.parseFloat(row.kwh);
  const timestamp = row.timestamp ? new Date(row.timestamp).toISOString() : null;

  return {
    id: `ENERGY-${String(index + 1).padStart(5, "0")}`,
    device_id: row.device_id,
    timestamp,
    event_type: "energy_usage",
    value: Number.isFinite(value) ? value : 0,
    status: statusFromKwh(value),
    location: row.location || null,
  };
}

async function readEnergyEvents() {
  const blobClient = getBlobClient();
  const downloadResponse = await blobClient.download();
  const csvText = await streamToString(downloadResponse.readableStreamBody);

  return parseCsv(csvText).map(toEnergyEvent);
}

module.exports = {
  parseCsv,
  readEnergyEvents,
  toEnergyEvent,
};
