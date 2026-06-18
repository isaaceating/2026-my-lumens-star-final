const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const COLLECTION_NAME = "employees";

const EXCEL_FILES = [
  {
    fileName: "per個人基本資料簡表LTI.xls",
    company: "LTI"
  },
  {
    fileName: "per個人基本資料簡表LTP.xls",
    company: "LTP"
  }
];

// 本次 Excel 名單內的人，一律設為有效員工
const DEFAULT_IS_ACTIVE = true;

// 重要：本次 Excel 名單不存在、但 Firebase employees 裡原本存在的人，會被設成 isActive=false
const DISABLE_MISSING_EMPLOYEES = true;

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .trim();
}

function normalizeHeader(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/\//g, "")
    .replace(/-/g, "");
}

function normalizeEmployeeId(value) {
  return normalizeText(value);
}

function fileExistsOrThrow(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`找不到 Excel 檔案：${filePath}`);
  }
}

function readExcelRows(fileName) {
  const filePath = path.join(__dirname, fileName);

  fileExistsOrThrow(filePath);

  console.log(`Reading Excel: ${fileName}`);

  const workbook = xlsx.readFile(filePath, {
    cellDates: false,
    raw: false
  });

  const allRows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];

    const rows = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false
    });

    if (rows.length > 0) {
      allRows.push({
        sheetName,
        rows
      });
    }
  });

  if (!allRows.length) {
    throw new Error(`${fileName} 沒有可讀取的工作表。`);
  }

  return allRows;
}

function findHeaderRow(rows) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const normalizedCells = rows[rowIndex].map((cell) => normalizeHeader(cell));

    const hasEmployeeId = normalizedCells.some((cell) => {
      return [
        "工號",
        "員工編號",
        "員工代號",
        "employeeid",
        "employee",
        "empid",
        "empno"
      ].some((keyword) => cell.includes(keyword));
    });

    const hasName = normalizedCells.some((cell) => {
      return [
        "姓名",
        "中文姓名",
        "員工姓名",
        "name"
      ].some((keyword) => cell.includes(keyword));
    });

    if (hasEmployeeId && hasName) {
      return rowIndex;
    }
  }

  return -1;
}

function findColumnIndex(headers, aliases) {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);

    const exactIndex = normalizedHeaders.findIndex((header) => {
      return header === normalizedAlias;
    });

    if (exactIndex >= 0) return exactIndex;
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);

    const partialIndex = normalizedHeaders.findIndex((header) => {
      return header.includes(normalizedAlias);
    });

    if (partialIndex >= 0) return partialIndex;
  }

  return -1;
}

function parseEmployeesFromSheet({ sheetName, rows }, company, fileName) {
  const headerRowIndex = findHeaderRow(rows);

  if (headerRowIndex < 0) {
    console.warn(`Skipped sheet without employee header: ${fileName} / ${sheetName}`);
    return [];
  }

  const headers = rows[headerRowIndex].map((cell) => normalizeText(cell));
  const dataRows = rows.slice(headerRowIndex + 1);

  const employeeIdIndex = findColumnIndex(headers, [
    "工號",
    "員工編號",
    "員工代號",
    "Employee ID",
    "EmployeeId",
    "Emp ID",
    "Emp No"
  ]);

  const nameIndex = findColumnIndex(headers, [
    "姓名",
    "中文姓名",
    "員工姓名",
    "Name"
  ]);

  const englishNameIndex = findColumnIndex(headers, [
    "英文姓名",
    "英文名",
    "英文",
    "English Name",
    "English"
  ]);

  const departmentCodeIndex = findColumnIndex(headers, [
    "部門代號",
    "部門代碼",
    "單位代號",
    "Department Code",
    "Dept Code"
  ]);

  const departmentIndex = findColumnIndex(headers, [
    "部門名稱",
    "單位名稱",
    "部門",
    "單位",
    "Department",
    "Dept"
  ]);

  if (employeeIdIndex < 0) {
    throw new Error(`${fileName} / ${sheetName} 找不到「工號」欄位。`);
  }

  if (nameIndex < 0) {
    throw new Error(`${fileName} / ${sheetName} 找不到「姓名」欄位。`);
  }

  console.log(`Detected sheet: ${fileName} / ${sheetName}`);
  console.log(`Headers: ${headers.join(" | ")}`);
  console.log(`employeeId column: ${headers[employeeIdIndex]}`);
  console.log(`name column: ${headers[nameIndex]}`);
  console.log(`englishName column: ${englishNameIndex >= 0 ? headers[englishNameIndex] : "not found"}`);
  console.log(`departmentCode column: ${departmentCodeIndex >= 0 ? headers[departmentCodeIndex] : "not found"}`);
  console.log(`department column: ${departmentIndex >= 0 ? headers[departmentIndex] : "not found"}`);

  const employees = [];

  for (const row of dataRows) {
    const employeeId = normalizeEmployeeId(row[employeeIdIndex]);
    const name = normalizeText(row[nameIndex]);

    if (!employeeId || !name) {
      continue;
    }

    const englishName = englishNameIndex >= 0
      ? normalizeText(row[englishNameIndex])
      : "";

    const departmentCode = departmentCodeIndex >= 0
      ? normalizeText(row[departmentCodeIndex])
      : "";

    let department = departmentIndex >= 0
      ? normalizeText(row[departmentIndex])
      : "";

    if (departmentCode && department === departmentCode) {
      department = "";
    }

    employees.push({
      employeeId,
      name,
      englishName,
      departmentCode,
      department,
      company,
      isActive: DEFAULT_IS_ACTIVE
    });
  }

  return employees;
}

function parseEmployeesFromFile(fileConfig) {
  const { fileName, company } = fileConfig;
  const sheets = readExcelRows(fileName);

  const employees = [];

  sheets.forEach((sheet) => {
    const sheetEmployees = parseEmployeesFromSheet(sheet, company, fileName);
    employees.push(...sheetEmployees);
  });

  return employees;
}

function validateEmployees(employees) {
  const seenEmployeeIds = new Set();
  const duplicatedIds = [];

  employees.forEach((employee) => {
    if (seenEmployeeIds.has(employee.employeeId)) {
      duplicatedIds.push(employee.employeeId);
    }

    seenEmployeeIds.add(employee.employeeId);
  });

  if (duplicatedIds.length > 0) {
    throw new Error(`發現重複工號：${duplicatedIds.join(", ")}`);
  }

  const invalidEmployees = employees.filter((employee) => {
    return !employee.employeeId || !employee.name;
  });

  if (invalidEmployees.length > 0) {
    throw new Error(`有 ${invalidEmployees.length} 筆資料缺少工號或姓名。`);
  }
}

async function fetchExistingEmployees() {
  const snapshot = await db.collection(COLLECTION_NAME).get();

  const employees = [];

  snapshot.forEach((docSnap) => {
    employees.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  return employees;
}

function findMissingEmployees(existingEmployees, latestEmployees) {
  const latestEmployeeIdSet = new Set(
    latestEmployees.map((employee) => employee.employeeId)
  );

  return existingEmployees.filter((employee) => {
    return !latestEmployeeIdSet.has(employee.employeeId || employee.id);
  });
}

async function uploadEmployeesAndDisableMissing(latestEmployees) {
  console.log(`Uploading to Firestore collection: ${COLLECTION_NAME}`);

  const existingEmployees = await fetchExistingEmployees();
  const missingEmployees = DISABLE_MISSING_EMPLOYEES
    ? findMissingEmployees(existingEmployees, latestEmployees)
    : [];

  console.log(`Existing employees in Firebase: ${existingEmployees.length}`);
  console.log(`Latest employees from Excel: ${latestEmployees.length}`);
  console.log(`Missing employees to disable: ${missingEmployees.length}`);

  let batch = db.batch();
  let batchCount = 0;
  let totalUploaded = 0;
  let totalDisabled = 0;

  async function commitIfNeeded(force = false) {
    if (batchCount >= 450 || (force && batchCount > 0)) {
      await batch.commit();

      console.log(`Committed batch. Uploaded: ${totalUploaded}, Disabled: ${totalDisabled}`);

      batch = db.batch();
      batchCount = 0;
    }
  }

  for (const employee of latestEmployees) {
    const ref = db.collection(COLLECTION_NAME).doc(employee.employeeId);

    batch.set(
      ref,
      {
        ...employee,
        isActive: true,
        updatedAt: FieldValue.serverTimestamp(),
        importSource: "excel",
        lastSeenInImportAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    batchCount += 1;
    totalUploaded += 1;

    await commitIfNeeded();
  }

  for (const employee of missingEmployees) {
    const employeeId = employee.employeeId || employee.id;

    if (!employeeId) continue;

    const ref = db.collection(COLLECTION_NAME).doc(employeeId);

    batch.set(
      ref,
      {
        isActive: false,
        disabledAt: FieldValue.serverTimestamp(),
        disabledReason: "missing_from_latest_excel_import",
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    batchCount += 1;
    totalDisabled += 1;

    await commitIfNeeded();
  }

  await commitIfNeeded(true);

  console.log(`Total uploaded / updated active employees: ${totalUploaded}`);
  console.log(`Total disabled missing employees: ${totalDisabled}`);
}

function printSummary(employees) {
  const companyCount = employees.reduce((result, employee) => {
    const key = employee.company || "UNKNOWN";
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});

  console.log("Import summary:");
  console.log(`Total employees from Excel: ${employees.length}`);

  Object.entries(companyCount).forEach(([company, count]) => {
    console.log(`${company}: ${count}`);
  });

  console.log("Sample records:");

  employees.slice(0, 8).forEach((employee, index) => {
    console.log(
      `${index + 1}. ${employee.employeeId} | ${employee.name} | ${employee.department} | ${employee.company} | isActive=${employee.isActive}`
    );
  });
}

async function printMissingEmployeesPreview(latestEmployees) {
  if (!DISABLE_MISSING_EMPLOYEES) return;

  const existingEmployees = await fetchExistingEmployees();
  const missingEmployees = findMissingEmployees(existingEmployees, latestEmployees);

  console.log("");
  console.log("Missing employees preview:");
  console.log(`Existing employees in Firebase: ${existingEmployees.length}`);
  console.log(`Employees missing from latest Excel import: ${missingEmployees.length}`);

  if (missingEmployees.length > 0) {
    console.log("First missing employees to be disabled:");

    missingEmployees.slice(0, 20).forEach((employee, index) => {
      console.log(
        `${index + 1}. ${employee.employeeId || employee.id} | ${employee.name || ""} | ${employee.department || ""} | currently isActive=${employee.isActive}`
      );
    });

    if (missingEmployees.length > 20) {
      console.log(`...and ${missingEmployees.length - 20} more`);
    }
  }
}

async function main() {
  const allEmployees = [];

  EXCEL_FILES.forEach((fileConfig) => {
    const employees = parseEmployeesFromFile(fileConfig);

    console.log(`${fileConfig.fileName}: ${employees.length} records`);
    allEmployees.push(...employees);
  });

  validateEmployees(allEmployees);
  printSummary(allEmployees);

  const confirmedArg = process.argv.includes("--yes");

  if (!confirmedArg) {
    await printMissingEmployeesPreview(allEmployees);

    console.log("");
    console.log("目前只完成讀取與檢查，尚未上傳 Firebase。");
    console.log("");
    console.log("確認資料筆數、中文、sample records、missing employees preview 都正確後，請執行：");
    console.log("node import-employees-from-excel.js --yes");
    return;
  }

  await uploadEmployeesAndDisableMissing(allEmployees);

  console.log("Employee Excel import completed successfully.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Employee Excel import failed:");
    console.error(error);
    process.exit(1);
  });