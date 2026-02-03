/**
 * CSV Parser Utility for Bulk Import
 * Handles CSV parsing, validation, and data transformation
 */

import { parse } from "csv-parse/sync";

/**
 * CSV Template columns configuration
 */
export const CSV_COLUMNS = {
  name: { required: true, type: "string" },
  sku: { required: true, type: "string" },
  barcode: { required: false, type: "string" },
  category: { required: true, type: "string" },
  subcategory: { required: false, type: "string" },
  costPrice: { required: true, type: "number" },
  sellingPrice: { required: true, type: "number" },
  wholesalePrice: { required: false, type: "number" },
  stockQuantity: { required: false, type: "number", default: 0 },
  unit: { required: false, type: "string", default: "pcs" },
  taxRate: { required: false, type: "number", default: 0 },
  minStockLevel: { required: false, type: "number", default: 5 },
  warrantyMonths: { required: false, type: "number" },
  warrantyType: { required: false, type: "string" },
  offerType: { required: false, type: "string" },
  offerValue: { required: false, type: "number" },
  offerEndDate: { required: false, type: "date" },
  description: { required: false, type: "string" }
};

/**
 * Generate CSV template header row
 */
export const getTemplateHeader = () => {
  return Object.keys(CSV_COLUMNS).join(",");
};

/**
 * Generate sample CSV row for template
 */
export const getTemplateSampleRow = () => {
  return [
    "iPhone 15 Pro Case",
    "IP15-CASE-001",
    "8901234567890",
    "Accessories",
    "Phone Cases",
    "500",
    "750",
    "650",
    "100",
    "pcs",
    "5",
    "10",
    "12",
    "MANUFACTURER",
    "PERCENTAGE",
    "10",
    "2026-12-31",
    "Premium protective case for iPhone 15 Pro"
  ].join(",");
};

/**
 * Generate complete CSV template content
 */
export const generateTemplate = () => {
  const header = getTemplateHeader();
  const sample = getTemplateSampleRow();
  const instructions = [
    "# INSTRUCTIONS (Delete this section before importing)",
    "# - name, sku, category, costPrice, sellingPrice are REQUIRED",
    "# - Categories and subcategories will be auto-created if they don't exist",
    "# - warrantyType: MANUFACTURER, SHOP, or EXTENDED",
    "# - offerType: PERCENTAGE or FIXED",
    "# - offerEndDate format: YYYY-MM-DD",
    "# - Delete this sample row and add your products below",
    ""
  ].join("\n");
  
  return `${instructions}${header}\n${sample}\n`;
};

/**
 * Parse CSV content to array of objects
 */
export const parseCSV = (csvContent) => {
  // Remove comment lines (starting with #)
  const cleanContent = csvContent
    .split("\n")
    .filter(line => !line.trim().startsWith("#"))
    .join("\n");

  const records = parse(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true
  });

  return records;
};

/**
 * Validate a single row of data
 */
export const validateRow = (row, rowIndex) => {
  const errors = [];
  const validatedData = {};

  for (const [column, config] of Object.entries(CSV_COLUMNS)) {
    let value = row[column];

    // Check required fields
    if (config.required && (!value || value.trim() === "")) {
      errors.push(`${column} is required`);
      continue;
    }

    // Apply default if empty
    if (!value || value.trim() === "") {
      validatedData[column] = config.default !== undefined ? config.default : null;
      continue;
    }

    // Type conversion and validation
    switch (config.type) {
      case "number":
        const num = parseFloat(value);
        if (isNaN(num)) {
          errors.push(`${column} must be a valid number`);
        } else if (num < 0 && ["costPrice", "sellingPrice", "stockQuantity"].includes(column)) {
          errors.push(`${column} cannot be negative`);
        } else {
          validatedData[column] = num;
        }
        break;

      case "date":
        if (value) {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            errors.push(`${column} must be a valid date (YYYY-MM-DD)`);
          } else {
            validatedData[column] = date;
          }
        }
        break;

      case "string":
      default:
        validatedData[column] = value.trim();
        break;
    }
  }

  // Validate warranty type
  if (validatedData.warrantyType && 
      !["MANUFACTURER", "SHOP", "EXTENDED"].includes(validatedData.warrantyType.toUpperCase())) {
    errors.push("warrantyType must be MANUFACTURER, SHOP, or EXTENDED");
  } else if (validatedData.warrantyType) {
    validatedData.warrantyType = validatedData.warrantyType.toUpperCase();
  }

  // Validate offer type
  if (validatedData.offerType && 
      !["PERCENTAGE", "FIXED"].includes(validatedData.offerType.toUpperCase())) {
    errors.push("offerType must be PERCENTAGE or FIXED");
  } else if (validatedData.offerType) {
    validatedData.offerType = validatedData.offerType.toUpperCase();
  }

  // Business logic validations
  if (validatedData.sellingPrice && validatedData.costPrice) {
    if (validatedData.sellingPrice < validatedData.costPrice) {
      errors.push("sellingPrice should be greater than or equal to costPrice");
    }
  }

  return {
    row: rowIndex + 2, // +2 for header row and 0-indexing
    sku: validatedData.sku || row.sku || `row-${rowIndex}`,
    valid: errors.length === 0,
    errors,
    data: validatedData
  };
};

/**
 * Parse and validate entire CSV
 */
export const parseAndValidateCSV = (csvContent) => {
  const records = parseCSV(csvContent);
  const results = {
    valid: [],
    invalid: [],
    totalRows: records.length
  };

  records.forEach((row, index) => {
    const validation = validateRow(row, index);
    if (validation.valid) {
      results.valid.push(validation);
    } else {
      results.invalid.push(validation);
    }
  });

  return results;
};
