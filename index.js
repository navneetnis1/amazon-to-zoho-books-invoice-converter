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
  upperStateName = stateName.toUpperCase();
  return stateCodeMap[upperStateName] || "Unknown"; // Return 'Unknown' if state not found
};
const amazonInvoiceCheck = async (req, res, next) => {
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

function jsonToCSV(jsonData) {
  try {
    const csv = parse(jsonData);
    return csv;
  } catch (err) {
    console.error(err);
    return "";
  }
}
const generateCsv = async (jsonData, fileName) => {
  // Convert JSON to CSV
  const csv = jsonToCSV(jsonData);

  //   console.log(csv);
  // Write CSV to a file
  fs.writeFile("results/" + fileName + ".csv", csv, (err) => {
    if (err) {
      console.error("Error writing CSV file:", err);
      return false;
    } else {
      console.log("CSV file saved successfully");
      return true;
    }
  });
};

const convertInvoice = async (req, res) => {
  const source = req.source; // data containing all the fields
  const invoices = []; // filtered data
  const creditNotes = []; // filtered data
  const appliedCreditNotes = []; // filtered data

  for (var i = 0; i < source.length; i++) {
    if (source[i]["Transaction Type"] == "Shipment") {
      var oneRow = {
        "Invoice Number": "24-25/" + source[i]["Invoice Number"],
        "Invoice Date": moment(new Date(source[i]["Invoice Date"])).format(
          "YYYY-MM-DD"
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
          "YYYY-MM-DD"
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
        "Credit Note Number": "24-25/" + source[i]["Credit Note No"],
        "Credit Note Date": moment(
          new Date(source[i]["Credit Note Date"])
        ).format("YYYY-MM-DD"),
        "Invoice#": "24-25/" + source[i]["Invoice Number"],
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
        "Item Name": source[i]["Item Description"],
        SKU: source[i]["Sku"],
        "Item Type": "goods",
        "HSN/SAC": source[i]["Hsn/sac"],
        Quantity: source[i]["Quantity"],
        "Item Price": Math.abs(
          source[i]["Tax Exclusive Gross"] / source[i]["Quantity"]
        ),
      };

      var creditRow = {
        "Credit Note Number": "24-25/" + source[i]["Credit Note No"],
        Date: moment(new Date(source[i]["Credit Note Date"])).format(
          "YYYY-MM-DD"
        ),
        "Invoice Number": "24-25/" + source[i]["Invoice Number"],
        "Associated Invoice Date": moment(
          new Date(source[i]["Invoice Date"])
        ).format("YYYY-MM-DD"),

        Amount: Math.abs(source[i]["Invoice Amount"]),
      };
      appliedCreditNotes.push(creditRow);
      creditNotes.push(oneRow);
    }
  }

  await generateCsv(invoices, "Invoices");
  await generateCsv(creditNotes, "CreditNotes");
  await generateCsv(appliedCreditNotes, "AppliedCreditNotes");

  res.sendStatus(200);
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/", upload.single("file"), [amazonInvoiceCheck], convertInvoice);

app.listen(port, () => {
  console.log(`Invoice converter app listening at http://localhost:${port}`);
});
