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
  between("extractQuoteMetadata", "normalizeQuoteNumber"),
  between("normalizeQuoteNumber", "groupedTextItems"),
  between("groupedTextItems", "extractHaltonRows"),
  between("extractHaltonRows", "cleanSpecificationLine"),
  between("cleanSpecificationLine", "extractLtiRows"),
  between("extractLtiRows", "extractProjectDetails"),
  between("extractRows", "clinesCategoryFromSpec"),
  between("extractClinesRows", "parseEquipmentLine"),
  between("parseEquipmentLine", "normalizeItemIdentifier"),
  between("normalizeItemIdentifier", "splitDescriptionAndNumbers"),
  between("splitDescriptionAndNumbers", "normalizePrice"),
  between("normalizePrice", "updateProjectFromQuotes"),
  between("buildExportRow", "tableData"),
].join("\n");

const context = {
  FACTORIES: {
    halton: { manufacturer: "Halton" },
    lti: { manufacturer: "LTI" },
  },
  MANUFACTURER: "CWF",
};
vm.createContext(context);
vm.runInContext(source, context);

const pdfItem = (x, y, str) => ({ transform: [1, 0, 0, 1, x, y], str });
const plain = value => JSON.parse(JSON.stringify(value));

test("factory metadata uses the new quote and revision formats", () => {
  assert.deepEqual(plain(context.extractQuoteMetadata(["Estimate 1276"], "clines")), { quoteNumber: "1276", revision: "", model: "Q#1276" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote No. QUOTE31066", "Revision No.: 6/23/2026"], "halton")), { quoteNumber: "31066", revision: "6.23.26", model: "Q#31066 Rev6.23.26" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote 2435", "Revision: 2"], "lti")), { quoteNumber: "2435", revision: "2", model: "Q#2435 Rev2" });
});

test("per-row model numbers match each factory convention", () => {
  assert.equal(context.modelForItem("clines", { quoteNumber: "1276" }, "15"), "Q#1276 Item15");
  assert.equal(context.modelForItem("halton", { quoteNumber: "31066", revision: "6.23.26" }, "2.30L/M/R"), "Q#31066 Rev6.23.26 Item#2.30L/M/R");
  assert.equal(context.modelForItem("lti", { quoteNumber: "2435", revision: "2" }, "30"), "Q#2435 Rev2 Item 30");
});

test("Cline's and LTI export the required manufacturer abbreviations", () => {
  const clines=context.extractRows([
    "ACTIVITY DESCRIPTION QTY RATE AMOUNT",
    "Equipment Item15 Work table 1 100.00 100.00",
    "SUBTOTAL 100.00",
  ],{quoteNumber:"1276"});
  const lti=context.extractLtiRows([
    "401 1 Serving Counter $100.00 $100.00",
    "Total $100.00",
  ],{quoteNumber:"56033"});
  assert.equal(clines[0].manufacturer,"CWF");
  assert.equal(lti[0].manufacturer,"LTI");
});

test("Halton keeps categories separate and carries multiline specifications across pages", () => {
  const firstPage = [
    pdfItem(97, 700, "Item No."), pdfItem(144, 700, "Description"), pdfItem(398, 700, "Quantity"), pdfItem(451, 700, "Unit Price"), pdfItem(510, 700, "Total Price"),
    pdfItem(97, 680, "2.30L/M/R"), pdfItem(144, 680, "Capture-Jet Hood"), pdfItem(398, 680, "3"), pdfItem(451, 680, "26,241.67"), pdfItem(510, 680, "78,725.00"),
    pdfItem(144, 660, "Hood Qty:"), pdfItem(300, 660, "3"),
  ];
  const secondPage = [
    pdfItem(97, 700, "Item No."), pdfItem(144, 700, "Description"), pdfItem(398, 700, "Quantity"), pdfItem(451, 700, "Unit Price"), pdfItem(510, 700, "Total Price"),
    pdfItem(144, 680, "Hood Width (In):"), pdfItem(300, 680, "72"),
    pdfItem(97, 660, "FSS"), pdfItem(144, 660, "Ansul R-102 Fire System"), pdfItem(398, 660, "1"), pdfItem(451, 660, "20,275.00"), pdfItem(510, 660, "20,275.00"),
  ];
  const rows = context.extractHaltonRows([firstPage, secondPage], { quoteNumber: "31066", revision: "6.23.26" });
  assert.deepEqual(plain(rows.map(({ item, category, spec, price, model }) => ({ item, category, spec, price, model }))), [
    { item: "2.30L/M/R", category: "Capture-Jet Hood", spec: "Hood Qty: 3 Hood Width (In): 72", price: "26241.67", model: "Q#31066 Rev6.23.26 Item#2.30L/M/R" },
    { item: "FSS", category: "Ansul R-102 Fire System", spec: "", price: "20275.00", model: "Q#31066 Rev6.23.26 Item#FSS" },
  ]);
});

test("Cline's keeps full descriptions, simplifies categories, and exports one freight row", () => {
  const rows = context.extractRows([
    "ACTIVITY DESCRIPTION QTY RATE AMOUNT",
    "Equipment Item15 Mobile work table 5' with 2 2,035.00 4,070.00",
    "drawer",
    "Equipment Item20 S/S Wall Cap 12' 1 660.00 660.00",
    "Shipping Estimated freight to job site $1,400.00 NET",
    "SUBTOTAL 6,130.00",
  ], { quoteNumber: "1276", revision: "" });
  assert.deepEqual(plain(rows.map(({ item, category, spec, price, model }) => ({ item, category, spec, price, model }))), [
    { item: "15", category: "Mobile Work Table", spec: "Mobile work table 5' with drawer", price: "2035.00", model: "Q#1276 Item15" },
    { item: "20", category: "S/S Wall Cap", spec: "S/S Wall Cap 12'", price: "660.00", model: "Q#1276 Item20" },
    { item: "", category: "Freight", spec: "Estimated freight to job site", price: "1400.00", model: "Q#1276 Freight" },
  ]);
});

test("Cline's coordinate parser keeps every unit price and joins wrapped descriptions into one line", () => {
  const pages=[[
    pdfItem(107,700,"ACTIVITY"),pdfItem(222,700,"DESCRIPTION"),pdfItem(422,700,"QTY"),pdfItem(475,700,"RATE"),pdfItem(523,700,"AMOUNT"),
    pdfItem(107,680,"Equipment"),pdfItem(222,680,"Item15 Mobile work table 5' with"),pdfItem(435,680,"2"),pdfItem(459,680,"2,035.00"),pdfItem(523,680,"4,070.00"),
    pdfItem(222,660,"drawer"),
    pdfItem(107,640,"Equipment"),pdfItem(222,640,"Item20 S/S Wall Cap 12'"),pdfItem(435,640,"1"),pdfItem(459,640,"660.00"),pdfItem(523,640,"660.00"),
    pdfItem(475,620,"SUBTOTAL"),pdfItem(523,620,"4,730.00"),
  ]];
  const rows=context.extractClinesRows(pages,{quoteNumber:"1276",revision:""});
  assert.deepEqual(plain(rows.map(({item,spec,qty,price})=>({item,spec,qty,price}))),[
    {item:"15",spec:"Mobile work table 5' with drawer",qty:"2",price:"2035.00"},
    {item:"20",spec:"S/S Wall Cap 12'",qty:"1",price:"660.00"},
  ]);
});

test("Cline's line-item count is dynamic from one through at least one hundred rows", () => {
  for (const count of [1, 10, 70, 100]) {
    const quoteLines=["ACTIVITY DESCRIPTION QTY RATE AMOUNT"];
    for (let item=1;item<=count;item++) quoteLines.push(`Equipment Item${item} Work table ${item}' 1 100.00 100.00`);
    quoteLines.push(`SUBTOTAL ${count * 100}.00`);
    const rows=context.extractRows(quoteLines,{quoteNumber:"9999",revision:""});
    assert.equal(rows.length,count);
    assert.equal(rows.at(-1).item,String(count));
  }
});

test("LTI keeps the title as category and all following lines as the full specification", () => {
  const rows = context.extractLtiRows([
    "401 1 Selectline (SLTE-4852-HC) Serving Counter $96,269.00 $96,269.00",
    "T-shaped, Approx. 541\" x 88\" x 34\" High",
    "Top - 14 ga. Stainless Steel",
    "401A.1 1 Load Center",
    "Included with Item #401",
    "Total $96,269.00",
  ], { quoteNumber: "56033", revision: "" });
  assert.deepEqual(plain(rows.map(({ item, category, spec, price, model }) => ({ item, category, spec, price, model }))), [
    { item: "401", category: "Selectline (SLTE-4852-HC) Serving Counter", spec: "T-shaped, Approx. 541\" x 88\" x 34\" High Top - 14 ga. Stainless Steel", price: "96269.00", model: "Q#56033 Item 401" },
    { item: "401A.1", category: "Load Center", spec: "Included with Item #401", price: "", model: "Q#56033 Item 401A.1" },
  ]);
});

test("main export row is headerless A-I with constants and unit price", () => {
  assert.deepEqual(plain(context.buildExportRow({ item: "Item20.1", manufacturer: "Halton", model: "Q#31066 Item#20.1", qty: "2", spec: "Full\nspec", price: "123.45" })), [
    "D", "20.1", 0, "Halton", "Q#31066 Item#20.1", "2", "Full\nspec", 123.45, 0,
  ]);
});
