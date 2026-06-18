const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { parse } = require("csv-parse/sync");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const CSV_FILE = path.join(__dirname, "employees_import.csv");
const COLLECTION_NAME = "employees";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmployeeId(value) {
  return normalizeText(value);
}

async function main() {
  console.log("Reading CSV:", CSV_FILE);

  if (!fs.existsSync(CSV_FILE)) {
    throw new Error(`CSV file not found: ${CSV_FILE}`);
  }

  const csvContent = fs.readFileSync(CSV_FILE, "utf8");

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true
  });

  console.log(`Loaded ${records.length} employee records.`);

  const seenEmployeeIds = new Set();
  const employees = [];

  for (const row of records) {
    const employeeId = normalizeEmployeeId(row.employeeId);

    if (!employeeId) {
      console.warn("Skipped row without employeeId:", row);
      continue;
    }

    if (seenEmployeeIds.has(employeeId)) {
      throw new Error(`Duplicated employeeId found in CSV: ${employeeId}`);
    }

    seenEmployeeIds.add(employeeId);

    employees.push({
      employeeId,
      name: normalizeText(row.name),
      englishName: normalizeText(row.englishName),
      departmentCode: normalizeText(row.departmentCode),
      department: normalizeText(row.department),
      company: normalizeText(row.company),
      isActive: String(row.isActive).toLowerCase() === "true"
    });
  }

  console.log(`Validated ${employees.length} employee records.`);
  console.log(`Uploading to Firestore collection: ${COLLECTION_NAME}`);

  let batch = db.batch();
  let batchCount = 0;
  let totalUploaded = 0;

  for (const employee of employees) {
    const ref = db.collection(COLLECTION_NAME).doc(employee.employeeId);

    batch.set(
      ref,
      {
        ...employee,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    batchCount += 1;
    totalUploaded += 1;

    if (batchCount >= 450) {
      await batch.commit();
      console.log(`Committed ${totalUploaded} records...`);

      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log("Done.");
  console.log(`Total uploaded: ${totalUploaded}`);
}

main()
  .then(() => {
    console.log("Employee import completed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Employee import failed:");
    console.error(error);
    process.exit(1);
  });