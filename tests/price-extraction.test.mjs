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
  between("extractBrowneProducts", "itemsToLines"),
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
  between("csvCell", "setStatus"),
].join("\n");

const context = {
  FACTORIES: {
    halton: { manufacturer: "Halton" },
    lti: { manufacturer: "LTI" },
    amerikooler: { manufacturer: "Ameri" },
  },
  MANUFACTURER: "CWF",
};
vm.createContext(context);
vm.runInContext(source, context);

const pdfItem = (x, y, str, height=12, fontName="F-bold") => ({ transform: [1, 0, 0, height, x, y], str, height, fontName });
const plain = value => JSON.parse(JSON.stringify(value));

test("factory metadata uses the new quote and revision formats", () => {
  assert.deepEqual(plain(context.extractQuoteMetadata(["Estimate 1276"], "clines")), { quoteNumber: "1276", revision: "", model: "Q#1276" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Estimate 1359_FROM_CLINES_WELDING_AND_FABRICATION"], "clines")), { quoteNumber: "1359", revision: "", model: "Q#1359" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote No. QUOTE31066", "Revision No.: 6/23/2026"], "halton")), { quoteNumber: "31066", revision: "6.23.26", model: "Q#31066 Rev6.23.26" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote 2435", "Revision: 2"], "lti")), { quoteNumber: "2435", revision: "2", model: "Q#2435 Rev2" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote #: 26-23524", "Revision: 1"], "amerikooler")), { quoteNumber: "26-23524", revision: "1", model: "Q#26-23524 Rev1" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote #: 26 - 23524 Date: 08/14/2026", "Revision: 1"], "amerikooler")), { quoteNumber: "26-23524", revision: "1", model: "Q#26-23524 Rev1" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote #: 26-24587", "Quoted by: Clara Philip Revision:", "Phone: 305.884.8384"], "amerikooler")), { quoteNumber: "26-24587", revision: "", model: "Q#26-24587" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote #: 26-259 60 Date: 08/26/2026"], "amerikooler", "26-25960-quote (1).pdf")), { quoteNumber: "26-25960", revision: "", model: "Q#26-25960" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote #: 26-259 Date: 08/26/2026"], "amerikooler", "26-25960-quote (1).pdf")), { quoteNumber: "26-25960", revision: "", model: "Q#26-25960" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Estimate 127"], "clines", "Estimate-12765.pdf")), { quoteNumber: "12765", revision: "", model: "Q#12765" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote No. QUOTE310"], "halton", "Qte-31066.pdf")), { quoteNumber: "31066", revision: "", model: "Q#31066" });
  assert.deepEqual(plain(context.extractQuoteMetadata(["Quote 560"], "lti", "LTI Quote 56033.pdf")), { quoteNumber: "56033", revision: "", model: "Q#56033" });
});

test("Browne keeps product rows and rejects trailing placeholder rows", () => {
  const rows=context.extractBrowneProducts([
    ["Account Name","Taziki's"],
    ["Item no.","Description","UOM","Regular Net","Special Net"],
    [503803,'WIN2 Dinner Fork, 7.5"/19.1cm,18/0 SS, Mirror Finish',"DZ",8.38,6.29],
    ["PC12002",'Sharpening Steel, Black Handle Blade-12"/30.5cm',"EA",44.44,33.33],
    ["114","114","114","114","114"],
  ]);
  assert.deepEqual(plain(rows),[
    [503803,'WIN2 Dinner Fork, 7.5"/19.1cm,18/0 SS, Mirror Finish',"DZ",8.38,6.29],
    ["PC12002",'Sharpening Steel, Black Handle Blade-12"/30.5cm',"EA",44.44,33.33],
  ]);
});

test("per-row model numbers match each factory convention", () => {
  assert.equal(context.modelForItem("clines", { quoteNumber: "1276" }, "15"), "Q#1276ITEM15");
  assert.equal(context.modelForItem("halton", { quoteNumber: "31066", revision: "6.23.26" }, "2.30L/M/R"), "Q#31066 Rev6.23.26 Item#2.30L/M/R");
  assert.equal(context.modelForItem("lti", { quoteNumber: "2435", revision: "2" }, "30"), "Q#2435 Rev2 Item 30");
  assert.equal(context.modelForItem("amerikooler", { quoteNumber: "26-23524", revision: "1" }, "1"), "Q#26-23524 Rev1");
});

test("AmeriKooler always exports box and equipment as two wrapped rows", () => {
  const rows=context.extractAmeriKoolerRows([
    "Walk-in: 8 X 18 FRZ",
    "Actual Overall Dimension: 7'-10\" x 17'-7 1/2\" x 7'-7\" (Rectangular)",
    "Description: Indoor Freezer, with Floor",
    "Freight Freight included to NC 28711",
    "Approximate Total Shipping Weight: 2484 lb",
    "Box Price: 8 X 18 FRZ $18,606.00",
    "Equipment: (1) 4 HP Bohn DOE Compliant Outdoor Condensing Unit, $11,327.00",
    "Model BCH0045LBBCZA0300, 208-230/1/60",
    "Refrigeration excludes lines and Refrigerant.",
    "Total: $29,933.00",
  ],{quoteNumber:"26-23524",revision:"1"});
  assert.deepEqual(plain(rows.map(({item,qty,category,manufacturer,model,price,spec})=>({item,qty,category,manufacturer,model,price,spec}))),[
    {item:"1",qty:"1",category:"Box, Panels Only",manufacturer:"Ameri",model:"Q#26-23524 Rev1",price:"18606.00",spec:"Walk-in: 8 X 18 FRZ\nActual Overall Dimension: 7'-10\" x 17'-7 1/2\" x 7'-7\" (Rectangular)\nDescription: Indoor Freezer, with Floor\nFreight Freight included to NC 28711"},
    {item:"2",qty:"1",category:"Equipment",manufacturer:"Ameri",model:"Q#26-23524 Rev1",price:"11327.00",spec:"(1) 4 HP Bohn DOE Compliant Outdoor Condensing Unit,\nModel BCH0045LBBCZA0300, 208-230/1/60\nRefrigeration excludes lines and Refrigerant."},
  ]);
});

test("AmeriKooler accepts any bold box heading immediately above the dimensions", () => {
  for (const heading of [
    "Two Compartment Walk-in: 10 X 16 OUTDR. COMBO",
    "7 Compartment Walk-in: 40 X 60 CUSTOM COMBO",
    "Custom Outdoor Refrigerated Box: 12 X 24",
  ]) {
    const rows=context.extractAmeriKoolerRows([
      heading,
      "Actual Overall Dimension: 10'-2\" x 16'-2\" x 7'-7\" (Rectangular)",
      "Description: Compartment 1 of 2 - Outdoor Freezer, with Floor",
      "Approximate Total Shipping Weight: 3682 lb",
      "Box Price: 10 X 16 OUTDR. COMBO $23,062.00",
      "Equipment: (1) 2 HP Bohn Condensing Unit $11,515.00",
      "Total: $34,577.00",
    ],{quoteNumber:"26-24587",revision:""});
    assert.equal(rows.length,2);
    assert.equal(rows[0].spec.split("\n")[0],heading);
    assert.equal(rows[0].price,"23062.00");
    assert.equal(rows[1].price,"11515.00");
  }
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

test("Halton stops the final specification before totals and quote footer text", () => {
  const page = [
    pdfItem(97, 700, "Item No."), pdfItem(144, 700, "Description"), pdfItem(398, 700, "Quantity"), pdfItem(451, 700, "Unit Price"), pdfItem(510, 700, "Total Price"),
    pdfItem(97, 680, "FSS"), pdfItem(144, 680, "Ansul R-102 Fire System"), pdfItem(398, 680, "1"), pdfItem(451, 680, "20,275.00"), pdfItem(510, 680, "20,275.00"),
    pdfItem(144, 660, "System includes tanks and detection."),
    pdfItem(144, 120, "Total"), pdfItem(510, 120, "20,275.00"),
    pdfItem(144, 95, "Terms and Conditions: pricing is valid for 30 days."),
    pdfItem(144, 75, "Thank you for your business."),
  ];
  const rows = context.extractHaltonRows([page], { quoteNumber: "31066", revision: "" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].spec, "System includes tanks and detection.");
});

test("project saving accepts Halton or AmeriKooler as the only factory", () => {
  const workerSource = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const options = workerSource.match(/const FACTORY_OPTIONS = new Set\(\[([^\]]+)\]\)/)?.[1] || "";
  assert.match(options, /"Halton"/);
  assert.match(options, /"AmeriKooler"/);
});

test("past projects support dealer sorting, Excel export, and factory running totals", () => {
  const source = readFileSync(new URL("../public/converter.html", import.meta.url), "utf8");
  assert.match(source, /id="sortProjectsByDealer"/);
  assert.match(source, /id="exportPastProjects"/);
  assert.match(source, /function exportAllPastProjects\(\)/);
  assert.match(source, /let filteredPastProjects = \[\];/);
  assert.match(source, /filteredPastProjects=\[\.\.\.filtered\]/);
  assert.match(source, /for \(const project of projectsToExport\)/);
  assert.match(source, /Export Filtered to Excel/);
  assert.match(source, /function renderFactoryTotals\(projects\)/);
  assert.match(source, /\["Bid Date","Upload Date","Project Name","MAFSI Territory","Factory","Dealer","Dollar Amount"\]/);
  assert.match(source, /id="projectTerritoryFilter/);
  assert.match(source, /id="mafsiTerritory/);
  assert.match(source, /renderFactoryTotals\(filtered\)/);
  assert.match(source, /Both: MAFSI 11 & 12/);
  assert.match(source, /function territoryMatches\(projectTerritory,filterTerritory\)/);
  assert.match(source, /<option value="factory">Factory<\/option>/);
  assert.match(source, /id="projectFactoryFilter/);
  assert.match(source, /getElementById\("sortProjectsByDealer"\)\.remove\(\)/);
  assert.match(source, /function projectDisplayTotal\(project\)/);
  assert.match(source, /else if \(\(rowAmounts\.get\(factory\)\|\|0\)>0\)/);
});

test("saving an opened project updates it instead of creating a duplicate", () => {
  const pageSource = readFileSync(new URL("../public/converter.html", import.meta.url), "utf8");
  const workerSource = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(pageSource, /let activeProjectId = ""/);
  assert.match(pageSource, /id:activeProjectId/);
  assert.match(pageSource, /activeProjectId=project\.id/);
  assert.match(workerSource, /UPDATE projects SET name = \?/);
  assert.match(workerSource, /WHERE id = \? AND owner_key = \?/);
});

test("Past Projects is a separate view and save returns to it", () => {
  const source = readFileSync(new URL("../public/converter.html", import.meta.url), "utf8");
  assert.match(source, /function showPastProjectsView\(\)/);
  assert.match(source, /dropZone\.hidden=true/);
  assert.match(source, /results\.hidden=true/);
  assert.match(source, /await loadPastProjects\(true\);\s*showPastProjectsView\(\)/);
  assert.match(source, /function showProjectView\(\)/);
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
    { item: "15", category: "Mobile Work Table", spec: "Mobile work table 5' with drawer", price: "2035.00", model: "Q#1276ITEM15" },
    { item: "20", category: "S/S Wall Cap", spec: "S/S Wall Cap 12'", price: "660.00", model: "Q#1276ITEM20" },
    { item: "", category: "Freight", spec: "Estimated freight to job site", price: "1400.00", model: "Q#1276FREIGHT" },
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

test("Cline's categories include wrapped descriptive lines and stop before dimensions", () => {
  const pages=[[
    pdfItem(107,700,"ACTIVITY"),pdfItem(222,700,"DESCRIPTION"),pdfItem(422,700,"QTY"),pdfItem(475,700,"RATE"),pdfItem(523,700,"AMOUNT"),
    pdfItem(107,680,"Equipment"),pdfItem(222,680,"Item16 Work Table w/ Drawer &"),pdfItem(435,680,"2"),pdfItem(459,680,"2,640.00"),pdfItem(523,680,"5,280.00"),
    pdfItem(222,660,"Shelf 6'"),
    pdfItem(107,640,"Equipment"),pdfItem(222,640,"Item30 1-Comp Sink Prep Table"),pdfItem(435,640,"1"),pdfItem(459,640,"4,015.00"),pdfItem(523,640,"4,015.00"),
    pdfItem(222,620,"w/ Drawer & Pot Rack 8'"),
    pdfItem(107,600,"Equipment"),pdfItem(222,600,"Item67 Wall Mounted Over Shelf"),pdfItem(435,600,"1"),pdfItem(459,600,"429.00"),pdfItem(523,600,"429.00"),
    pdfItem(222,580,"w/ Utensil Rail 6'"),
    pdfItem(475,560,"SUBTOTAL"),pdfItem(523,560,"9,724.00"),
  ]];
  const rows=context.extractClinesRows(pages,{quoteNumber:"1139",revision:""});
  assert.deepEqual(plain(rows.map(({item,category})=>({item,category}))),[
    {item:"16",category:"Work Table W/ Drawer & Shelf"},
    {item:"30",category:"1-Comp Sink Prep Table W/ Drawer & Pot Rack"},
    {item:"67",category:"Wall Mounted Over Shelf W/ Utensil Rail"},
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

test("LTI joins a wrapped bold category and never treats bold prices as category text", () => {
  const pages=[[
    pdfItem(62,700,"Item"),pdfItem(115,700,"Qty"),pdfItem(145,700,"Description"),pdfItem(445,700,"Unit Price"),pdfItem(530,700,"Total"),
    pdfItem(62,500,"431"),pdfItem(115,500,"1"),
    pdfItem(145,506,"Specline (SPC-TA-LP-20-05-84) Tempest-Air Cold"),
    pdfItem(145,494,"Food Counter"),
    // Some LTI PDFs position the bold unit price inside the description cutoff.
    pdfItem(410,500,"$20,126.00 $20,126.00"),
    pdfItem(145,478,"Approx. 84-3/8 x 32 x 36 High",10,"F-regular"),
    pdfItem(145,464,"14 Ga. Stainless Steel Top",10,"F-regular"),
  ]];
  const rows=context.extractLtiRows([
    "Specline (SPC-TA-LP-20-05-84) Tempest-Air Cold",
    "431 1 $20,126.00 $20,126.00",
    "Food Counter",
    "Approx. 84-3/8 x 32 x 36 High",
    "14 Ga. Stainless Steel Top",
    "Total $20,126.00",
  ],{quoteNumber:"58636",revision:"1"},pages);
  assert.deepEqual(plain(rows.map(({item,category,spec,price})=>({item,category,spec,price}))),[
    {
      item:"431",
      category:"Specline (SPC-TA-LP-20-05-84) Tempest-Air Cold Food Counter",
      spec:"Approx. 84-3/8 x 32 x 36 High 14 Ga. Stainless Steel Top",
      price:"20126.00",
    },
  ]);
});

test("main export row is headerless A-I with constants and unit price", () => {
  assert.deepEqual(plain(context.buildExportRow({ item: "Item20.1", manufacturer: "Halton", model: "Q#31066 Item#20.1", qty: "2", spec: "Full\nspec", price: "123.45" })), [
    "D", "20.1", 0, "Halton", "Q#31066 Item#20.1", "2", "Full\nspec", 123.45, 0,
  ]);
});

test("CSV export keeps wrapped specifications on one physical import row", () => {
  const cell=context.csvCell('Line one\nLine two, with 2" insulation');
  assert.equal(cell,'"Line one Line two, with 2"" insulation"');
  assert.equal(cell.includes("\n"),false);
});
