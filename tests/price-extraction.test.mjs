import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../public/converter.html", import.meta.url), "utf8");

function between(start, end) {
  const from = html.indexOf(`function ${start}`);
  const to = html.indexOf(`function ${end}`, from);
  assert.ok(from >= 0 && to > from, `Could not extract ${start}`);
  return html.slice(from, to);
}

const source = [
  between("groupedTextItems", "extractHaltonRows"),
  between("extractHaltonRows", "extractAmerikoolerRows"),
  between("extractAmerikoolerRows", "extractLtiRows"),
  between("extractLtiRows", "extractProjectDetails"),
  between("extractRows", "parseEquipmentLine"),
  between("parseEquipmentLine", "normalizeItemIdentifier"),
  between("normalizeItemIdentifier", "splitDescriptionAndNumbers"),
  between("splitDescriptionAndNumbers", "normalizePrice"),
  between("normalizePrice", "shippingDescription"),
  between("shippingDescription", "updateProjectFromQuotes"),
  between("factoryPriceTotals", "downloadPriceWorkbook"),
].join("\n");

const context = {
  FACTORIES: {
    halton: { manufacturer: "Halton" },
    amerikooler: { manufacturer: "AmeriKooler" },
    lti: { manufacturer: "Low Temp Industries" },
  },
  MANUFACTURER: "Cline's Welding and Fabrication",
  MODEL: "Custom Fabrication",
  quoteImports: [],
};
vm.createContext(context);
vm.runInContext(source, context);

const pdfItem = (x, y, str) => ({ transform: [1, 0, 0, 1, x, y], str });
const plain = value => JSON.parse(JSON.stringify(value));

test("Halton keeps row order, uses total prices, and preserves blank prices", () => {
  const page = [
    pdfItem(97, 700, "Item No."), pdfItem(144, 700, "Description"), pdfItem(398, 700, "Quantity"), pdfItem(451, 700, "Unit Price"), pdfItem(510, 700, "Total Price"),
    pdfItem(97, 680, "2.30/L/M/R"), pdfItem(144, 680, "Capture Jet Hood"), pdfItem(398, 680, "3"), pdfItem(451, 680, "1,000.00"), pdfItem(510, 680, "3,000.00"),
    pdfItem(97, 660, "2.48L/R"), pdfItem(144, 660, "Blank-price accessory"), pdfItem(398, 660, "1"),
  ];
  const rows = context.extractHaltonRows([page], "Custom");
  assert.deepEqual(plain(rows.map(({ item, qty, price }) => ({ item, qty, price }))), [
    { item: "2.30/L/M/R", qty: "3", price: "3000.00" },
    { item: "2.48L/R", qty: "1", price: "" },
  ]);
});

test("Cline's uses extended totals and recognizes freight", () => {
  const rows = context.extractRows([
    "ACTIVITY DESCRIPTION QTY RATE AMOUNT",
    "Equipment ItemA12 Custom shelf 3 100.00 300.00",
    "Freight Estimated freight to job site $50.00 NET",
    "SUBTOTAL 350.00",
  ]);
  assert.deepEqual(plain(rows.map(({ qty, type, price }) => ({ qty, type, price }))), [
    { qty: "3", type: "equipment", price: "300.00" },
    { qty: "1", type: "shipping", price: "50.00" },
  ]);
});

test("LTI uses total prices while retaining blank rows", () => {
  const rows = context.extractLtiRows([
    "401 3 Serving Counter $100.00 $300.00",
    "402 1 Included accessory",
  ], "Quote 56033");
  assert.deepEqual(plain(rows.map(({ item, price }) => ({ item, price }))), [
    { item: "401", price: "300.00" },
    { item: "402", price: "" },
  ]);
});

test("AmeriKooler maps the first price to panels and second to equipment", () => {
  const rows = context.extractAmerikoolerRows([
    "Actual Overall Dimension: 13'-0\" x 16'-0\" x 8'-0\" (Rectangular)",
    "Box Price: 13 X 16 COMBO $19,070.00",
    "Equipment: refrigeration package",
    "$7,099.00",
    "Total: $26,169.00",
  ], "Quote #123");
  assert.deepEqual(plain(rows.map(({ item, price }) => ({ item, price }))), [
    { item: "1", price: "19070.00" },
    { item: "2", price: "7099.00" },
  ]);
});

test("factory quote totals are written in the requested D/E order", () => {
  context.quoteImports.push(
    { factoryKey: "halton", totalAmount: 3000 },
    { factoryKey: "clines", totalAmount: 350 },
    { factoryKey: "amerikooler", totalAmount: 26169 },
    { factoryKey: "lti", totalAmount: null },
  );
  assert.deepEqual(plain(context.factoryPriceTotals()), [
    ["Cline's", 350],
    ["LTI", ""],
    ["Halton", 3000],
    ["AmeriKooler", 26169],
  ]);
});
