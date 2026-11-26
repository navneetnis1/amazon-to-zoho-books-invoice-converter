const express = require("express");
const app = express();
const port = 3000;
const multer = require("multer"); // multer middleware for files management
const csvtojson = require("csvtojson");
const Joi = require("joi");
var upload = multer({ dest: "uploads/temp_csv" });
var moment = require("moment"); // require
const { parse } = require("json2csv");
const fs = require("fs");

const stateCodeGenerater = async (stateName) => {
  const stateCodeMap = {
    "ANDHRA PRADESH": "AD",
    "ARUNACHAL PRADESH": "AR",
    ASSAM: "AS",
    BIHAR: "BR",
    CHHATTISGARH: "CG",
    DELHI: "DL",
    GOA: "GA",
    GUJARAT: "GJ",
    HARYANA: "HR",
    "HIMACHAL PRADESH": "HP",
    "JAMMU KASHMIR": "JK",
    "JAMMU AND KASHMIR": "JK",
    "JAMMU & KASHMIR": "JK",
    "JAMMU   KASHMIR": "JK",
    JHARKHAND: "JH",
    KARNATAKA: "KA",
    KERALA: "KL",
    "LAKSHADWEEP ISLANDS": "LD",
    "MADHYA PRADESH": "MP",
    MAHARASHTRA: "MH",
    MANIPUR: "MN",
    MEGHALAYA: "ML",
    MIZORAM: "MZ",
    NAGALAND: "NL",
    ODISHA: "OD",
    PUDUCHERRY: "PY",
    PUNJAB: "PB",
    RAJASTHAN: "RJ",
    SIKKIM: "SK",
    "TAMIL NADU": "TN",
    TELANGANA: "TS",
    TRIPURA: "TR",
    "UTTAR PRADESH": "UP",
    UTTARAKHAND: "UK",
    "WEST BENGAL": "WB",
    "Andaman and Nicobar Islands": "AN",
    "ANDAMAN & NICOBAR ISLANDS": "AN",
    CHANDIGARH: "CH",
    "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "DN",
    "DADRA AND NAGAR HAVELI": "DN",
    "DAMAN DIU": "DD",
    "DAMAN   DIU": "DD",
    LADAKH: "LA",
    "Other Territory": "OT",
  };
  const upperStateName = stateName.trim().toUpperCase();
  return stateCodeMap[upperStateName] || "Unknown"; // Return 'Unknown' if state not found
};
const amazonInvoiceCheck = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ errors: ["Upload a CSV using the file field"] });
  const fileName = req.file.path;
  const schema = Joi.object({
    "Transaction Type": Joi.string().required(),
  }).options({ stripUnknown: true }); // allowed unknown colums

  csvtojson()
    .fromFile(fileName)
    .then(async (source) => {
      let errors = [];

      let i = 0;
      source.forEach((obj) => {
        let value = schema.validate(obj);
        if (value.error) {
          value.error.details.forEach((err) => {
            errors.push(err.message + i);
          });
        }
        i++;
      });

      if (errors.length > 0) {
        //console.log("validation error from the CSV file");
        return res.status(403).json({ errors });
      } else {
        req.source = source;
        //console.log("CSV validated successfully..");
        next();
      }
    })
    .catch((err) => {
      //console.log(err);
      return res.status(403).json({ errors: err.message });
    });
};

function financialYearPrefix(date) {
  const parsed = moment(date, ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD"], true);
  if (!parsed.isValid()) throw new Error(`Invalid document date: ${date}`);
  const year = parsed.year() - (parsed.month() < 3 ? 1 : 0);
  return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}/`;
}

function refundItem(row) {
  const quantity = Number(row.Quantity);
  const amount = Number(row["Tax Exclusive Gross"]);
  if (quantity > 0 && Number.isFinite(amount)) {
    return { "Item Name": row["Item Description"], SKU: row.Sku,
      "Item Type": "goods", "HSN/SAC": row["Hsn/sac"],
      Quantity: row.Quantity, "Item Price": Math.abs(amount / quantity) };
  }
  const shipping = Number(row["Shipping Amount Basis"]) + Number(row["Shipping Promo Discount Basis"]);
  if (row.Quantity === "0" && Number(row["Principal Amount Basis"]) === 0 &&
      Number.isFinite(shipping) && shipping !== 0 && Math.abs(amount - shipping) < 0.005) {
    return { "Item Name": "Shipping refund", SKU: "", "Item Type": "services",
      "HSN/SAC": "", Quantity: 1, "Item Price": Math.abs(shipping) };
  }
  throw new Error(`Cannot convert refund ${row["Credit Note No"]}: invalid quantity or amount`);
}

const generateCsv = async (jsonData, fileName) => {
  const csv = jsonData.length ? parse(jsonData) : "";
  await fs.promises.mkdir("results", { recursive: true });
  await fs.promises.writeFile("results/" + fileName + ".csv", csv);
};

const convertInvoice = async (req, res) => {
  const source = req.source; // data containing all the fields
  const invoices = []; // filtered data
  const creditNotes = []; // filtered data
  const appliedCreditNotes = []; // filtered data
  const skipped = {};

  for (var i = 0; i < source.length; i++) {
    let locationName =
      source[i]["Seller Gstin"] == "08BAAPC6813L2ZR"
        ? "Rajasthan"
        : source[i]["Seller Gstin"] == "29BAAPC6813L1ZO"
          ? "Karnataka"
          : "";

    if (source[i]["Transaction Type"] == "Shipment") {
      var oneRow = {
        "Location Name": locationName,
        "Invoice Number": financialYearPrefix(source[i]["Invoice Date"]) + source[i]["Invoice Number"],
        "Invoice Date": moment(new Date(source[i]["Invoice Date"])).format(
          "YYYY-MM-DD",
        ),
        "Place of Supply": await stateCodeGenerater(source[i]["Ship To State"]),
        "Invoice Status": "overdue",
        "Customer Name": source[i]["Buyer Name"]
          ? source[i]["Buyer Name"]
          : source[i]["Order Id"],
        "GST Treatment": source[i]["Customer Bill To Gstid"]
          ? "business_gst"
          : "consumer",
        "GST Identification Number (GSTIN)": source[i]["Customer Bill To Gstid"]
          ? source[i]["Customer Bill To Gstid"]
          : "",
        "Due Date": moment(new Date(source[i]["Invoice Date"])).format(
          "YYYY-MM-DD",
        ),
        "Item Name": source[i]["Item Description"],
        SKU: source[i]["Sku"],
        "Item Type": "goods",
        "HSN/SAC": source[i]["Hsn/sac"],
        Quantity: source[i]["Quantity"],
        "Item Price": source[i]["Tax Exclusive Gross"] / source[i]["Quantity"],
        "Is Inclusive Tax": "FALSE",
        "Template Name": "Spreadsheet Template",
      };
      invoices.push(oneRow);
    } else if (source[i]["Transaction Type"] == "Refund") {
      var oneRow = {
        "Location Name": locationName,
        "Credit Note Number": financialYearPrefix(source[i]["Credit Note Date"]) + source[i]["Credit Note No"],
        "Credit Note Date": moment(
          new Date(source[i]["Credit Note Date"]),
        ).format("YYYY-MM-DD"),
        "Invoice#": financialYearPrefix(source[i]["Invoice Date"]) + source[i]["Invoice Number"],
        "Place of Supply": await stateCodeGenerater(source[i]["Ship To State"]),
        "Credit Note Status": "Open",
        Reason: "Sales Return",
        "Customer Name": source[i]["Buyer Name"]
          ? source[i]["Buyer Name"]
          : source[i]["Order Id"],
        "GST Treatment": source[i]["Customer Bill To Gstid"]
          ? "business_gst"
          : "consumer",
        "GST Identification Number (GSTIN)": source[i]["Customer Bill To Gstid"]
          ? source[i]["Customer Bill To Gstid"]
          : "",
        ...refundItem(source[i]),
      };

      var creditRow = {
        "Credit Note Number": financialYearPrefix(source[i]["Credit Note Date"]) + source[i]["Credit Note No"],
        Date: moment(new Date(source[i]["Credit Note Date"])).format(
          "YYYY-MM-DD",
        ),
        "Invoice Number": financialYearPrefix(source[i]["Invoice Date"]) + source[i]["Invoice Number"],
        "Associated Invoice Date": moment(
          new Date(source[i]["Invoice Date"]),
        ).format("YYYY-MM-DD"),

        Amount: Math.abs(source[i]["Invoice Amount"]),
      };
      appliedCreditNotes.push(creditRow);
      creditNotes.push(oneRow);
    } else {
      const type = source[i]["Transaction Type"];
      skipped[type] = (skipped[type] || 0) + 1;
    }
  }

  await generateCsv(invoices, "Invoices");
  await generateCsv(creditNotes, "CreditNotes");
  await generateCsv(appliedCreditNotes, "AppliedCreditNotes");

  res.json({ invoiceRows: invoices.length, creditNoteRows: creditNotes.length,
    appliedCreditNoteRows: appliedCreditNotes.length, skipped });
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/", upload.single("file"), [amazonInvoiceCheck], (req, res, next) => {
  convertInvoice(req, res).catch(next);
});
app.use((error, req, res, next) => {
  res.status(400).json({ errors: [error.message] });
});

if (require.main === module) app.listen(port, () => {
  console.log(`Invoice converter app listening at http://localhost:${port}`);
});

module.exports = { app, financialYearPrefix, refundItem };
