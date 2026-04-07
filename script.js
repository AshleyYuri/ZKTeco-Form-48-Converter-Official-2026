let parsedEmployees = [];
let sourceWorkbook = null;
let generationMode = "selected";

/* =========================
   DOM ELEMENTS
========================= */

const fileInput = document.getElementById("fileInput");
const generateBtn = document.getElementById("generateBtn");
const generateAllBtn = document.getElementById("generateAllBtn");
const downloadBtn = document.getElementById("downloadBtn");
const printBtn = document.getElementById("printBtn");
const previewArea = document.getElementById("previewArea");
const statusBox = document.getElementById("status");
const monthInput = document.getElementById("monthInput");
const inChargeNameInput = document.getElementById("inChargeName");
const regularHoursInput = document.getElementById("regularHours");
const saturdayHoursInput = document.getElementById("saturdayHours");
const paperSizeInput = document.getElementById("paperSize");



/* NEW UI ELEMENTS */
const employeeCheckboxList = document.getElementById("employeeCheckboxList");
const selectAllEmployeesBtn = document.getElementById("selectAllEmployeesBtn");
const clearAllEmployeesBtn = document.getElementById("clearAllEmployeesBtn");
const employeeTypeOverrideInput = document.getElementById("employeeTypeOverride");


/* =========================
   EVENT LISTENERS
========================= */
document.addEventListener("DOMContentLoaded", function () {
    const fileInput = document.getElementById("fileInput");

    if (fileInput) {
        fileInput.addEventListener("change", function () {
            const text = document.querySelector(".upload-text strong");
            const uploadBox = document.querySelector(".file-upload-ui");

            if (!text || !uploadBox) return;

            if (this.files.length > 0) {
                text.textContent = this.files[0].name;

                // ✅ add success class
                uploadBox.classList.add("success");
            } else {
                text.textContent = "Upload your file here";

                // remove success
                uploadBox.classList.remove("success");
            }
        });
    }
});



if (generateBtn) {
    generateBtn.addEventListener("click", () => {
        if (!validateEmployeeTypeSelection()) return;

        generationMode = "selected";
        processFile();
    });
}

if (generateAllBtn) {
    generateAllBtn.addEventListener("click", () => {
        if (!validateEmployeeTypeSelection()) return;

        generationMode = "all";
        processFile();
    });
}
if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadExcel);
}

if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
}

if (selectAllEmployeesBtn) {
    selectAllEmployeesBtn.addEventListener("click", () => {
        document.querySelectorAll(".employee-checkbox").forEach(cb => {
            cb.checked = true;
        });
        generationMode = "selected";
        syncRegularHoursBySelection();
        renderPreview();
    });
}

if (clearAllEmployeesBtn) {
    clearAllEmployeesBtn.addEventListener("click", () => {
        document.querySelectorAll(".employee-checkbox").forEach(cb => {
            cb.checked = false;
        });
        generationMode = "selected";
        syncRegularHoursBySelection();
        renderPreview();
    });
}

if (employeeTypeOverrideInput) {
    employeeTypeOverrideInput.addEventListener("change", () => {
        syncRegularHoursBySelection();

        if (sourceWorkbook) {
            parsedEmployees = parseAttLogWorkbook(sourceWorkbook);
            populateEmployeeFilter(parsedEmployees);
        }

        renderPreview();
    });
}

if (monthInput) monthInput.addEventListener("input", renderPreview);
if (inChargeNameInput) inChargeNameInput.addEventListener("input", renderPreview);
if (regularHoursInput) regularHoursInput.addEventListener("input", renderPreview);
if (saturdayHoursInput) saturdayHoursInput.addEventListener("input", renderPreview);
if (paperSizeInput) paperSizeInput.addEventListener("change", renderPreview);

/* =========================
   STATUS
========================= */

let statusTimeout;

function setStatus(message, isError = false) {
    if (!statusBox) return;

    const messageEl = statusBox.querySelector(".status-message");
    const iconEl = statusBox.querySelector(".status-icon");

    if (!messageEl || !iconEl) return;

    messageEl.textContent = message;

    statusBox.classList.remove("success", "error", "info");

    if (isError) {
        statusBox.classList.add("error");
        iconEl.textContent = "❌";
    } else {
        statusBox.classList.add("success");
        iconEl.textContent = "✅";
    }

    statusBox.classList.add("show");
}


document.addEventListener("click", function (e) {
    if (
        e.target.classList.contains("status-close") ||
        e.target.classList.contains("status-overlay")
    ) {
        statusBox?.classList.remove("show");
    }
});


function validateEmployeeTypeSelection() {
    const selectedType = employeeTypeOverrideInput?.value;

   if (!selectedType || !["auto", "teaching", "nonteaching"].includes(selectedType)) {
        setStatus("Please select Employee Type first: Teaching Personnel or Non-Teaching Personnel.", true);

        if (employeeTypeOverrideInput) {
            employeeTypeOverrideInput.focus();
        }

        return false;
    }

    return true;
}


/* =========================
   MAIN FILE PROCESSOR
========================= */
function processFile() {
    const file = fileInput?.files?.[0];

    if (!file) {
        setStatus("Please upload the ZKTeco Excel file first.", true);
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            sourceWorkbook = XLSX.read(data, { type: "array" });

            parsedEmployees = parseAttLogWorkbook(sourceWorkbook);

            if (!parsedEmployees.length) {
                if (previewArea) previewArea.innerHTML = "";
                if (employeeCheckboxList) employeeCheckboxList.innerHTML = "";
                setStatus("No employee data found in sheet 'Att.log report'.", true);
                return;
            }

            const detectedMonth = detectMonthFromAttLogWorkbook(sourceWorkbook);
            if (detectedMonth && monthInput) {
                monthInput.value = detectedMonth;
            }

            populateEmployeeFilter(parsedEmployees);
            syncRegularHoursBySelection();
            renderPreview();

            if (generationMode === "all") {
                setStatus(`Generated all employees: ${parsedEmployees.length} DTR(s), 3 copies per page.`);
            } else {
                setStatus("Generated selected preview successfully.");
            }
        } catch (error) {
            console.error(error);
            setStatus(`Failed to read or parse the Excel file: ${error.message}`, true);
        }
    };

    reader.readAsArrayBuffer(file);
}

/* =========================
   PARSE WORKBOOK / SHEET
========================= */
function parseAttLogWorkbook(workbook) {
    if (!workbook || !workbook.SheetNames?.length) return [];

    const targetSheetName = workbook.SheetNames.find(
        name => normalizeCell(name).toLowerCase() === "att.log report"
    );

    if (!targetSheetName) return [];

    const sheet = workbook.Sheets[targetSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    return parseAttLogSheet(rows);
}

function parseAttLogSheet(rows) {
    const employees = [];

    if (!Array.isArray(rows) || !rows.length) return employees;

    let headerRowIndex = -1;
    let dayColumns = [];

    for (let r = 0; r < rows.length; r++) {
        const row = (rows[r] || []).map(normalizeCell);

        const numericCols = row
            .map((cell, colIndex) => ({ cell, colIndex }))
            .filter(item => /^\d{1,2}$/.test(item.cell))
            .map(item => ({ dayNumber: Number(item.cell), colIndex: item.colIndex }))
            .filter(item => item.dayNumber >= 1 && item.dayNumber <= 31);

        if (numericCols.length >= 20) {
            headerRowIndex = r;
            dayColumns = numericCols;
            break;
        }
    }

    if (headerRowIndex === -1 || !dayColumns.length) {
        return employees;
    }

    for (let r = headerRowIndex + 1; r < rows.length - 1; r++) {
        const row = (rows[r] || []).map(normalizeCell);
        const idIndex = row.findIndex(cell => cell === "ID:");

        if (idIndex === -1) continue;

        const employeeId = row[idIndex + 2] || row[idIndex + 1] || "";

        const nameIndex = row.findIndex(cell => /^name:?$/i.test(cell));
        const deptIndex = row.findIndex(cell => /^dept\.?:?$/i.test(cell));

        const employeeName =
            nameIndex !== -1
                ? (row[nameIndex + 2] || row[nameIndex + 1] || "")
                : "";

        const department =
            deptIndex !== -1
                ? (row[deptIndex + 2] || row[deptIndex + 1] || "")
                : "";

        const logRow = (rows[r + 1] || []).map(normalizeCell);

       const logs = [];
const effectiveDepartmentForParse =
    (employeeTypeOverrideInput?.value === "teaching")
        ? "Teaching"
        : (employeeTypeOverrideInput?.value === "nonteaching")
            ? "Non-Teaching"
            : department;

for (let day = 1; day <= 31; day++) {
    const dayCol = dayColumns.find(item => item.dayNumber === day);
    const rawValue = dayCol ? normalizeCell(logRow[dayCol.colIndex] || "") : "";
    logs.push(buildDayLogFromCell(day, rawValue, effectiveDepartmentForParse));
}
        employees.push({
            employeeId,
            name: employeeName,
            department,
            logs
        });

        r += 1;
    }

    return employees.filter(emp => normalizeCell(emp.name) !== "");
}

/* =========================
   DAY LOG BUILD
========================= */
function buildDayLogFromCell(dayNumber, rawValue, department = "") {
    const clean = normalizeCell(rawValue);

    if (!clean) {
        return emptyLog(dayNumber);
    }

    const times = extractCompactTimes(clean);

    // pass department so slot assignment follows teaching / non-teaching rules
    const slots = assignTimesToSlots(times, department);

    const mapped = mapFourSlotsToForm48(slots, department);

    return {
        dayNumber,
        ...mapped
    };
}

function extractCompactTimes(text) {
    const clean = normalizeCell(text).replace(/\s+/g, "");
    if (!clean) return [];

    const matches = clean.match(/\d{1,2}:\d{2}/g) || [];

    const normalized = matches
        .map(normalizeTime)
        .filter(Boolean)
        .filter(time => time !== "00:00")
        .sort((a, b) => toMinutes(a) - toMinutes(b));

    const deduplicated = [];

    for (const time of normalized) {
        if (!deduplicated.length) {
            deduplicated.push(time);
            continue;
        }

        const lastTime = deduplicated[deduplicated.length - 1];
        const diff = toMinutes(time) - toMinutes(lastTime);

        if (diff <= 1) {
            continue;
        }

        deduplicated.push(time);
    }

    return deduplicated;
}

/* =========================
   SLOT ASSIGNMENT RULES
========================= */
/*
Slot 1 = Morning In      -> below 10:30 AM
Slot 2 = Morning Out     -> 10:30 AM to 12:30 PM
Slot 3 = Afternoon In    -> 11:00 AM to 1:00 PM
Slot 4 = Afternoon Out   -> 3:00 PM to 10:00 PM
*/
function assignTimesToSlots(times, department = "") {
    const schedule = getScheduleByDepartment(department);

    const punches = times
        .map(normalizeTime)
        .filter(Boolean)
        .map(t => ({
            text: t,
            mins: toMinutes(t)
        }))
        .filter(p => p.mins !== null)
        .sort((a, b) => a.mins - b.mins);

    let amIn = "";
    let amOut = "";
    let pmIn = "";
    let pmOut = "";

    const used = new Set();

    function firstUnusedInRange(start, end) {
        for (let i = 0; i < punches.length; i++) {
            if (used.has(i)) continue;
            if (punches[i].mins >= start && punches[i].mins <= end) {
                used.add(i);
                return punches[i].text;
            }
        }
        return "";
    }

    function lastUnusedInRange(start, end) {
        for (let i = punches.length - 1; i >= 0; i--) {
            if (used.has(i)) continue;
            if (punches[i].mins >= start && punches[i].mins <= end) {
                used.add(i);
                return punches[i].text;
            }
        }
        return "";
    }

   // Slot 1 = Morning In -> earliest within AM IN window
amIn = firstUnusedInRange(schedule.slot1Start, schedule.slot1End);

// Slot 2 = Morning Out -> latest within AM OUT window
amOut = lastUnusedInRange(schedule.slot2Start, schedule.slot2End);

// Slot 3 = Afternoon In -> earliest within PM IN window
pmIn = firstUnusedInRange(schedule.slot3Start, schedule.slot3End);

// Slot 4 = Afternoon Out -> latest within PM OUT window
pmOut = lastUnusedInRange(schedule.slot4Start, schedule.slot4End);

    return [amIn, amOut, pmIn, pmOut];
}

function mapFourSlotsToForm48(slots, department = "") {
    const amArrival = slots[0] || "";
    const amDeparture = slots[1] || "";
    const pmArrival = slots[2] || "";
    const pmDeparture = slots[3] || "";

    const hasAnyTime = !!(amArrival || amDeparture || pmArrival || pmDeparture);

    const undertime = computeUndertimeByDepartment(
        amArrival,
        amDeparture,
        pmArrival,
        pmDeparture,
        department
    );

    return {
        amArrival,
        amDeparture,
        pmArrival,
        pmDeparture,
        undertimeHours: undertime.hours,
        undertimeMinutes: undertime.minutes,
        status: hasAnyTime ? "Present" : ""
    };
}

/* =========================
   DEPARTMENT SCHEDULE
========================= */
function getScheduleByDepartment(department = "") {
    const dept = normalizeCell(department).toLowerCase().replace(/[\s-]+/g, "");

    // Non-Teaching
    if (dept.includes("nonteaching")) {
        return {
            type: "Non-Teaching",

            // official schedule for undertime
            amIn: "08:00",
            amOut: "12:00",
            pmIn: "13:00",
            pmOut: "17:00",

            // slot assignment windows
            slot1Start: hm("00:00"),
            slot1End: hm("11:59"),

            slot2Start: hm("12:00"),
            slot2End: hm("12:30"),

            slot3Start: hm("12:31"),
            slot3End: hm("13:00"),

            slot4Start: hm("17:00"),
            slot4End: hm("23:00")
        };
    }

    // Teaching
    if (dept.includes("teaching")) {
        return {
            type: "Teaching",

            // official schedule for undertime
            amIn: "07:15",
            amOut: "11:45",
            pmIn: "13:00",
            pmOut: "16:30",

            // slot assignment windows
            slot1Start: hm("00:00"),
            slot1End: hm("11:44"),

            slot2Start: hm("11:45"),
            slot2End: hm("12:30"),

            slot3Start: hm("12:31"),
            slot3End: hm("13:00"),

            slot4Start: hm("16:30"),
            slot4End: hm("23:00")
        };
    }

    // default = Teaching
    return {
        type: "Default",

        amIn: "07:15",
        amOut: "11:45",
        pmIn: "13:00",
        pmOut: "16:30",

        slot1Start: hm("00:00"),
        slot1End: hm("11:44"),

        slot2Start: hm("11:45"),
        slot2End: hm("12:30"),

        slot3Start: hm("12:31"),
        slot3End: hm("13:00"),

        slot4Start: hm("16:30"),
        slot4End: hm("23:00")
    };
}

function computeUndertimeByDepartment(amArrival, amDeparture, pmArrival, pmDeparture, department = "") {
    const schedule = getScheduleByDepartment(department);

    let totalUndertimeMinutes = 0;

    const actualAmIn = toMinutes(amArrival);
    const actualAmOut = toMinutes(amDeparture);
    const actualPmIn = toMinutes(pmArrival);
    const actualPmOut = toMinutes(pmDeparture);

    const officialAmIn = toMinutes(schedule.amIn);
    const officialAmOut = toMinutes(schedule.amOut);
    const officialPmIn = toMinutes(schedule.pmIn);
    const officialPmOut = toMinutes(schedule.pmOut);

    if (actualAmIn !== null && actualAmIn > officialAmIn) {
        totalUndertimeMinutes += actualAmIn - officialAmIn;
    }

    if (actualAmOut !== null && actualAmOut < officialAmOut) {
        totalUndertimeMinutes += officialAmOut - actualAmOut;
    }

    if (actualPmIn !== null && actualPmIn > officialPmIn) {
        totalUndertimeMinutes += actualPmIn - officialPmIn;
    }

    if (actualPmOut !== null && actualPmOut < officialPmOut) {
        totalUndertimeMinutes += officialPmOut - actualPmOut;
    }

    return {
        hours: totalUndertimeMinutes ? Math.floor(totalUndertimeMinutes / 60) : "",
        minutes: totalUndertimeMinutes ? totalUndertimeMinutes % 60 : ""
    };
}

function summarizeUndertime(logs) {
    let totalMinutes = 0;

    (logs || []).forEach(log => {
        const hours = Number(log.undertimeHours || 0);
        const minutes = Number(log.undertimeMinutes || 0);
        totalMinutes += (hours * 60) + minutes;
    });

    return {
        hours: totalMinutes ? Math.floor(totalMinutes / 60) : "",
        minutes: totalMinutes ? totalMinutes % 60 : ""
    };
}

/* =========================
   EMPLOYEE CHECKBOX FILTER
========================= */
function populateEmployeeFilter(employees) {
    if (!employeeCheckboxList) return;

    employeeCheckboxList.innerHTML = "";

    employees.forEach((emp, index) => {
        const item = document.createElement("label");
        item.className = "employee-checkbox-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "employee-checkbox";
        checkbox.value = String(index);
        checkbox.checked = true;

        checkbox.addEventListener("change", () => {
            generationMode = "selected";
            syncRegularHoursBySelection();
            renderPreview();
        });

        const text = document.createElement("span");
        text.textContent = `${emp.name}${emp.employeeId ? " (" + emp.employeeId + ")" : ""}`;

        item.appendChild(checkbox);
        item.appendChild(text);
        employeeCheckboxList.appendChild(item);
    });
}

function getSelectedEmployeeIndexes() {
    return Array.from(document.querySelectorAll(".employee-checkbox:checked"))
        .map(cb => Number(cb.value))
        .filter(index => !Number.isNaN(index));
}

function getEmployeesToRender() {
    if (!parsedEmployees.length) return [];

    if (generationMode === "all") {
        return parsedEmployees;
    }

    const checkedIndexes = getSelectedEmployeeIndexes();

    if (!checkedIndexes.length) return [];

    return checkedIndexes
        .map(index => parsedEmployees[index])
        .filter(Boolean);
}

/* =========================
   MONTH / DISPLAY HELPERS
========================= */
function detectMonthFromAttLogWorkbook(workbook) {
    const targetSheetName = workbook.SheetNames.find(
        name => normalizeCell(name).toLowerCase() === "att.log report"
    );

    if (!targetSheetName) return "";

    const sheet = workbook.Sheets[targetSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    for (const row of rows) {
        for (const cell of row) {
            const text = normalizeCell(cell);
            const match = text.match(/(\d{4})-(\d{2})-\d{2}\s*~\s*(\d{4})-(\d{2})-\d{2}/);
            if (match) {
                return `${match[1]}-${match[2]}`;
            }
        }
    }

    return "";
}

/* =========================
   SCHEDULE OVERRIDE HELPERS
========================= */
function getEffectiveDepartment(emp) {
    const override = employeeTypeOverrideInput?.value;

    // ✅ PRIORITY: manual dropdown
    if (override === "teaching") return "Teaching";
    if (override === "nonteaching") return "Non-Teaching";

    // ✅ FALLBACK: detect from department string
    const deptRaw = normalizeCell(emp?.department);
    const dept = deptRaw.toLowerCase().replace(/[\s-_]+/g, "");

    // detect NON-TEACHING first (important!)
    if (dept.includes("nonteaching")) {
        return "Non-Teaching";
    }

    // detect TEACHING
    if (dept.includes("teaching")) {
        return "Teaching";
    }

    // default fallback
    return "Teaching";
}

function getRegularHoursTextByDepartment(department = "") {
    const schedule = getScheduleByDepartment(department);

    if (schedule.type === "Non-Teaching") {
        return "8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM";
    }

    return "7:15 AM - 11:45 AM / 1:00 PM - 4:30 PM";
}

function getEffectiveRegularHours(emp) {
    return getRegularHoursTextByDepartment(getEffectiveDepartment(emp));
}

function getResolvedLog(log, emp) {
    const effectiveDepartment = getEffectiveDepartment(emp);
    const undertime = computeUndertimeByDepartment(
        log.amArrival || "",
        log.amDeparture || "",
        log.pmArrival || "",
        log.pmDeparture || "",
        effectiveDepartment
    );

    return {
        ...log,
        undertimeHours: undertime.hours,
        undertimeMinutes: undertime.minutes
    };
}

function summarizeResolvedUndertime(emp) {
    let totalMinutes = 0;

    (emp.logs || []).forEach(log => {
        const resolved = getResolvedLog(log, emp);
        const hours = Number(resolved.undertimeHours || 0);
        const minutes = Number(resolved.undertimeMinutes || 0);
        totalMinutes += (hours * 60) + minutes;
    });

    return {
        hours: totalMinutes ? Math.floor(totalMinutes / 60) : "",
        minutes: totalMinutes ? totalMinutes % 60 : ""
    };
}

function syncRegularHoursBySelection() {
    if (!regularHoursInput) return;

    const override = employeeTypeOverrideInput?.value || "auto";

    if (override === "teaching") {
        regularHoursInput.value = "7:15 AM - 11:45 AM / 1:00 PM - 4:30 PM";
        return;
    }

    if (override === "nonteaching") {
        regularHoursInput.value = "8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM";
        return;
    }

    const checkedIndexes = getSelectedEmployeeIndexes();

    if (checkedIndexes.length === 1 && parsedEmployees[checkedIndexes[0]]) {
        regularHoursInput.value = getEffectiveRegularHours(parsedEmployees[checkedIndexes[0]]);
    } else {
        regularHoursInput.value = "Auto by employee type";
    }
}

/* =========================
   PREVIEW
========================= */
function getPreviewConfig() {
    return {
        titleTop: "10.4px",
        titleMain: "12.9px",
        divider: "8.9px",
        metaLabel: "8px",
        metaLine: "10.1px",
        metaNote: "8.5px",
        hours: "7.5px",
        table: "9px",
        subhead: "7.5px",
        certification: "7.5px",
        verified: "8px",
        incharge: "8.8px",
        inchargeLabel: "8px",
        dailyRowHeight: "13px",
        lineHeight: "1"
    };
}

function renderPreview() {
    if (!previewArea) return;

    if (!parsedEmployees.length) {
        previewArea.innerHTML = "";
        return;
    }

    const employeesToShow = getEmployeesToRender();
    const monthText = formatMonthDisplay(monthInput?.value || "");
    const inChargeName = inChargeNameInput?.value?.trim() || "";
    const saturdayHours = saturdayHoursInput?.value?.trim() || "";
    const paperSize = paperSizeInput?.value || "a4";
    const previewConfig = getPreviewConfig();

    if (!employeesToShow.length) {
        previewArea.innerHTML = "";
        setStatus("No employee selected for preview.", true);
        return;
    }

    previewArea.innerHTML = employeesToShow.map(emp => `
        <div class="form48-page ${paperSize}">
            <div class="form48-row">
                ${buildForm48CopyHTML(emp, monthText, saturdayHours, inChargeName, previewConfig)}
                <div class="cut-gap"></div>
                ${buildForm48CopyHTML(emp, monthText, saturdayHours, inChargeName, previewConfig)}
                <div class="cut-gap"></div>
                ${buildForm48CopyHTML(emp, monthText, saturdayHours, inChargeName, previewConfig)}
            </div>
        </div>
    `).join("");
}

function buildForm48CopyHTML(emp, monthText, saturdayHours, inChargeName, cfg) {
    const effectiveRegularHours = getEffectiveRegularHours(emp);
    const totals = summarizeResolvedUndertime(emp);

    return `
        <div class="form48-copy">
            <div class="copy-top">
                <div class="form48-header">
                    <div class="form48-title-top" style="font-size:${cfg.titleTop}">Civil Service Form No. 48</div>
                    <div class="form48-title-main" style="font-size:${cfg.titleMain}">DAILY TIME RECORD</div>
                    <div class="form48-divider" style="font-size:${cfg.divider}">-----o0o-----</div>
                </div>

                <div class="meta-label" style="font-size:${cfg.metaLabel}">&nbsp;</div>
                <div class="meta-line" style="font-size:${cfg.metaLine}">${escapeHtml(emp.name)}</div>
                <div class="meta-note" style="font-size:${cfg.metaNote}">(Name)</div>

                <div class="meta-label" style="font-size:${cfg.metaLabel}">For the month of</div>
                <div class="meta-line" style="font-size:${cfg.metaLine}">${escapeHtml(monthText)}</div>

                <div class="hours-block" style="font-size:${cfg.hours}">
                    <div>Official hours for arrival and departure</div>
                    <div class="hours-row">
                        <div>Regular days</div>
                        <div class="hours-value">${escapeHtml(effectiveRegularHours)}</div>
                    </div>
                    <div class="hours-row">
                        <div>Saturdays</div>
                        <div class="hours-value">${escapeHtml(saturdayHours)}</div>
                    </div>
                </div>

                <table class="form48-table" style="font-size:${cfg.table}">
                    <thead>
                        <tr>
                            <th rowspan="2" style="width:10%;">Day</th>
                            <th colspan="2" style="width:30%;">A.M.</th>
                            <th colspan="2" style="width:30%;">P.M.</th>
                            <th colspan="2" style="width:30%;">Undertime</th>
                        </tr>
                        <tr class="subhead" style="font-size:${cfg.subhead}">
                            <th>Arrival</th>
                            <th>Departure</th>
                            <th>Arrival</th>
                            <th>Departure</th>
                            <th>Hours</th>
                            <th>Minutes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Array.from({ length: 31 }, (_, index) => {
                            const day = index + 1;
                            const originalLog = emp.logs.find(item => Number(item.dayNumber) === day) || emptyLog(day);
                            const resolved = getResolvedLog(originalLog, emp);

                            return `
                                <tr style="height:${cfg.dailyRowHeight}; line-height:${cfg.lineHeight}">
                                    <td>${day}</td>
                                    <td>${displayTime(resolved, "amArrival")}</td>
                                    <td>${displayTime(resolved, "amDeparture")}</td>
                                    <td>${displayTime(resolved, "pmArrival")}</td>
                                    <td>${displayTime(resolved, "pmDeparture")}</td>
                                    <td>${displayUndertime(resolved, "hours")}</td>
                                    <td>${displayUndertime(resolved, "minutes")}</td>
                                </tr>
                            `;
                        }).join("")}
                        <tr class="total-row" style="height:${cfg.dailyRowHeight}; line-height:${cfg.lineHeight}">
                            <td>Total</td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td>${totals.hours}</td>
                            <td>${totals.minutes}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="copy-bottom">
                <div class="certification" style="font-size:${cfg.certification}">
                    I certify on my honor that the above is a true and correct report of the hours of work performed,
                    record of which was made daily at the time of arrival and departure from office.
                </div>

                <div class="verified" style="font-size:${cfg.verified}">
                    <div class="verified-line"></div>
                    <strong>VERIFIED as to the prescribed office hours:</strong>
                    <div class="incharge-wrap">
                        <div class="incharge-line" style="font-size:${cfg.incharge}">${escapeHtml(inChargeName)}</div>
                        <div class="incharge-label" style="font-size:${cfg.inchargeLabel}">In Charge</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function displayTime(log, key) {
    if (log.status === "Absent") {
        return key === "amArrival" ? "ABSENT" : "";
    }
    return escapeHtml(log[key] || "");
}

function displayUndertime(log, type) {
    if (log.status === "Absent") return "";
    return type === "hours" ? (log.undertimeHours ?? "") : (log.undertimeMinutes ?? "");
}

function getExcelPaperSize(selectedPaperSize) {
    switch ((selectedPaperSize || "").toLowerCase()) {
        case "legal":
            return 5;
        case "folio":
            return 14;
        case "a4":
        default:
            return 9;
    }
}

/* =========================
   EXCEL DOWNLOAD
========================= */
async function downloadExcel() {


    if (!parsedEmployees.length) {
        setStatus("No generated DTR to export yet.", true);
        return;
    }

    if (typeof ExcelJS === "undefined") {
        setStatus("ExcelJS library is missing. Please load exceljs.min.js in your HTML.", true);
        return;
    }

    if (typeof saveAs === "undefined") {
        setStatus("FileSaver library is missing. Please load FileSaver.min.js in your HTML.", true);
        return;
    }

    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "ChatGPT";
        workbook.created = new Date();

        const employeesToExport = getEmployeesToRender();
        const monthText = formatMonthDisplay(monthInput?.value || "");
        const saturdayHours = saturdayHoursInput?.value?.trim() || "";
        const inChargeName = inChargeNameInput?.value?.trim() || "";
        const paperSize = paperSizeInput?.value || "a4";

        if (!employeesToExport.length) {
            setStatus("No employee selected for Excel export.", true);
            return;
        }

        for (const emp of employeesToExport) {
            const uniqueSheetName = getUniqueSheetName(
                workbook,
                `${emp.name}${emp.employeeId ? " - " + emp.employeeId : ""}`
            );

            const ws = workbook.addWorksheet(uniqueSheetName, {
                pageSetup: {
                    paperSize: getExcelPaperSize(paperSize),
                    orientation: "landscape",
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: 1,
                    margins: {
                        left: 0.05,
                        right: 0.05,
                        top: 0.05,
                        bottom: 0.05,
                        header: 0.03,
                        footer: 0.03
                    }
                }
            });

            buildExcelHorizontalTriplicate(ws, emp, {
                monthText,
                regularHours: getEffectiveRegularHours(emp),
                saturdayHours,
                inChargeName
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const filename =
            generationMode === "all"
                ? `CS_Form48_AttLog_AllEmployees_${paperSize.toUpperCase()}_3Copies.xlsx`
                : `CS_Form48_AttLog_Selected_${paperSize.toUpperCase()}_3Copies.xlsx`;

        saveAs(
            new Blob([buffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }),
            filename
        );

        setStatus(`Excel downloaded successfully in ${paperSize.toUpperCase()} size.`);
    } catch (error) {
        console.error(error);
        setStatus(`Failed to generate the Excel file: ${error.message}`, true);
    }
}

/* =========================
   EXCEL BUILDERS
========================= */
function buildExcelHorizontalTriplicate(ws, emp, options) {
    const { monthText, regularHours, saturdayHours, inChargeName } = options;

    const leftStart = 1;
    const midStart = 10;
    const rightStart = 19;

    ws.columns = [
        { width: 6.8 }, { width: 8.3 }, { width: 8.3 }, { width: 8.3 }, { width: 8.3 }, { width: 6.4 }, { width: 6.4 }, { width: 1.3 }, { width: 1.3 },
        { width: 6.8 }, { width: 8.3 }, { width: 8.3 }, { width: 8.3 }, { width: 8.3 }, { width: 6.4 }, { width: 6.4 }, { width: 1.3 }, { width: 1.3 },
        { width: 6.8 }, { width: 8.3 }, { width: 8.3 }, { width: 8.3 }, { width: 8.3 }, { width: 6.4 }, { width: 6.4 }
    ];

    const center = { vertical: "middle", horizontal: "center", wrapText: true };
    const leftAlign = { vertical: "middle", horizontal: "left", wrapText: true };
    const thinBorder = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
    };
    const texturedFill = {
        type: "pattern",
        pattern: "darkVertical",
        fgColor: { argb: "FFF1F1F1" },
        bgColor: { argb: "FFFFFFFF" }
    };
    const dashedGap = {
        left: { style: "dashed" },
        right: { style: "dashed" }
    };

    buildSingleHorizontalCopy(ws, leftStart, emp, monthText, regularHours, saturdayHours, inChargeName, center, leftAlign, thinBorder);
    buildSingleHorizontalCopy(ws, midStart, emp, monthText, regularHours, saturdayHours, inChargeName, center, leftAlign, thinBorder);
    buildSingleHorizontalCopy(ws, rightStart, emp, monthText, regularHours, saturdayHours, inChargeName, center, leftAlign, thinBorder);

    ws.getRow(1).height = 12;
    ws.getRow(2).height = 13;
    ws.getRow(3).height = 10;
    ws.getRow(4).height = 7;
    ws.getRow(5).height = 13;
    ws.getRow(6).height = 9;
    ws.getRow(7).height = 7;
    ws.getRow(8).height = 12;
    ws.getRow(9).height = 7;
    ws.getRow(10).height = 10;
    ws.getRow(11).height = 11;
    ws.getRow(12).height = 11;
    ws.getRow(13).height = 7;
    ws.getRow(14).height = 12;
    ws.getRow(15).height = 13;

    for (let r = 16; r <= 46; r++) {
        ws.getRow(r).height = 16.5;
    }

    ws.getRow(47).height = 12;
    ws.getRow(48).height = 12;
    ws.getRow(49).height = 12;

    for (let r = 1; r <= 49; r++) {
        [8, 9, 17, 18].forEach(col => {
            ws.getCell(r, col).fill = texturedFill;
            ws.getCell(r, col).border = dashedGap;
        });
    }
}

function buildSingleHorizontalCopy(ws, startCol, emp, monthText, regularHours, saturdayHours, inChargeName, center, leftAlign, thinBorder) {
    const totals = summarizeResolvedUndertime(emp);
    const col = i => ws.getColumn(startCol + i - 1).letter;

    const A = col(1);
    const B = col(2);
    const C = col(3);
    const D = col(4);
    const E = col(5);
    const F = col(6);
    const G = col(7);

    ws.mergeCells(`${A}1:${G}1`);
    ws.getCell(`${A}1`).value = "Civil Service Form No. 48";
    ws.getCell(`${A}1`).font = { bold: false, size: 9.4 };
    ws.getCell(`${A}1`).alignment = center;

    ws.mergeCells(`${A}2:${G}2`);
    ws.getCell(`${A}2`).value = "DAILY TIME RECORD";
    ws.getCell(`${A}2`).font = { bold: true, size: 12.9 };
    ws.getCell(`${A}2`).alignment = center;

    ws.mergeCells(`${A}3:${G}3`);
    ws.getCell(`${A}3`).value = "-----o0o-----";
    ws.getCell(`${A}3`).font = { size: 8.9 };
    ws.getCell(`${A}3`).alignment = center;

    ws.mergeCells(`${B}5:${F}5`);
    ws.getCell(`${B}5`).value = emp.name;
    ws.getCell(`${B}5`).font = { bold: true, size: 10.1 };
    ws.getCell(`${B}5`).alignment = center;
    ws.getCell(`${B}5`).border = { bottom: { style: "thin" } };

    ws.mergeCells(`${B}6:${F}6`);
    ws.getCell(`${B}6`).value = "(Name)";
    ws.getCell(`${B}6`).font = { size: 8.5 };
    ws.getCell(`${B}6`).alignment = center;

    ws.getCell(`${A}8`).value = "For the month of";
    ws.getCell(`${A}8`).font = { size: 8 };

    ws.mergeCells(`${C}8:${G}8`);
    ws.getCell(`${C}8`).value = monthText;
    ws.getCell(`${C}8`).font = { bold: true, size: 8.7 };
    ws.getCell(`${C}8`).alignment = center;
    ws.getCell(`${C}8`).border = { bottom: { style: "thin" } };

    ws.mergeCells(`${A}10:${G}10`);
    ws.getCell(`${A}10`).value = "Official hours for arrival and departure";
    ws.getCell(`${A}10`).font = { size: 7.5 };
    ws.getCell(`${A}10`).alignment = leftAlign;

    ws.getCell(`${A}11`).value = "Regular days";
    ws.getCell(`${A}11`).font = { size: 7.5 };

    ws.mergeCells(`${C}11:${G}11`);
    ws.getCell(`${C}11`).value = regularHours;
    ws.getCell(`${C}11`).font = { size: 7.5 };
    ws.getCell(`${C}11`).border = { bottom: { style: "thin" } };
    ws.getCell(`${C}11`).alignment = center;

    ws.getCell(`${A}12`).value = "Saturdays";
    ws.getCell(`${A}12`).font = { size: 7.5 };

    ws.mergeCells(`${C}12:${G}12`);
    ws.getCell(`${C}12`).value = saturdayHours;
    ws.getCell(`${C}12`).font = { size: 7.5 };
    ws.getCell(`${C}12`).border = { bottom: { style: "thin" } };
    ws.getCell(`${C}12`).alignment = center;

    ws.mergeCells(`${A}14:${A}15`);
    ws.getCell(`${A}14`).value = "Day";
    ws.getCell(`${A}14`).font = { bold: true, size: 7.5 };
    ws.getCell(`${A}14`).alignment = center;

    ws.mergeCells(`${B}14:${C}14`);
    ws.getCell(`${B}14`).value = "A.M.";
    ws.getCell(`${B}14`).font = { bold: true, size: 7.5 };
    ws.getCell(`${B}14`).alignment = center;

    ws.mergeCells(`${D}14:${E}14`);
    ws.getCell(`${D}14`).value = "P.M.";
    ws.getCell(`${D}14`).font = { bold: true, size: 7.5 };
    ws.getCell(`${D}14`).alignment = center;

    ws.mergeCells(`${F}14:${G}14`);
    ws.getCell(`${F}14`).value = "Undertime";
    ws.getCell(`${F}14`).font = { bold: true, size: 7.5 };
    ws.getCell(`${F}14`).alignment = center;

    ws.getCell(`${B}15`).value = "Arrival";
    ws.getCell(`${C}15`).value = "Departure";
    ws.getCell(`${D}15`).value = "Arrival";
    ws.getCell(`${E}15`).value = "Departure";
    ws.getCell(`${F}15`).value = "Hours";
    ws.getCell(`${G}15`).value = "Minutes";

    [B, C, D, E, F, G].forEach(letter => {
        ws.getCell(`${letter}15`).font = { bold: true, size: 7.5 };
        ws.getCell(`${letter}15`).alignment = center;
    });

    let rowNum = 16;

    for (let day = 1; day <= 31; day++) {
        const originalLog = emp.logs.find(item => Number(item.dayNumber) === day) || emptyLog(day);
        const log = getResolvedLog(originalLog, emp);

        ws.getCell(`${A}${rowNum}`).value = day;
        ws.getCell(`${B}${rowNum}`).value = log.status === "Absent" ? "ABSENT" : (log.amArrival || "");
        ws.getCell(`${C}${rowNum}`).value = log.status === "Absent" ? "" : (log.amDeparture || "");
        ws.getCell(`${D}${rowNum}`).value = log.status === "Absent" ? "" : (log.pmArrival || "");
        ws.getCell(`${E}${rowNum}`).value = log.status === "Absent" ? "" : (log.pmDeparture || "");
        ws.getCell(`${F}${rowNum}`).value = log.status === "Absent" ? "" : (log.undertimeHours || "");
        ws.getCell(`${G}${rowNum}`).value = log.status === "Absent" ? "" : (log.undertimeMinutes || "");

        rowNum++;
    }

    ws.getCell(`${A}${rowNum}`).value = "Total";
    ws.getCell(`${F}${rowNum}`).value = totals.hours;
    ws.getCell(`${G}${rowNum}`).value = totals.minutes;

    for (let r = 14; r <= rowNum; r++) {
        [A, B, C, D, E, F, G].forEach(letter => {
            ws.getCell(`${letter}${r}`).border = thinBorder;
            ws.getCell(`${letter}${r}`).alignment = center;

            if (!ws.getCell(`${letter}${r}`).font || !ws.getCell(`${letter}${r}`).font.size) {
                ws.getCell(`${letter}${r}`).font = { size: 9 };
            }
        });
    }

    const gap = 2;

    ws.mergeCells(`${A}${rowNum + gap}:${G}${rowNum + gap}`);
    ws.getCell(`${A}${rowNum + gap}`).value =
        "I certify on my honor that the above is a true and correct report of the hours of work performed,";
    ws.getCell(`${A}${rowNum + gap}`).font = { size: 7.5 };
    ws.getCell(`${A}${rowNum + gap}`).alignment = {
        ...leftAlign,
        wrapText: true
    };
    ws.getRow(rowNum + gap).height = 18;

    ws.mergeCells(`${A}${rowNum + gap + 1}:${G}${rowNum + gap + 1}`);
    ws.getCell(`${A}${rowNum + gap + 1}`).value =
        "record of which was made daily at the time of arrival and departure from office.";
    ws.getCell(`${A}${rowNum + gap + 1}`).font = { size: 7.5 };
    ws.getCell(`${A}${rowNum + gap + 1}`).alignment = {
        ...leftAlign,
        wrapText: true
    };
    ws.getRow(rowNum + gap + 1).height = 18;

    ws.mergeCells(`${A}${rowNum + gap + 2}:${G}${rowNum + gap + 2}`);
    ws.getCell(`${A}${rowNum + gap + 2}`).border = {
        bottom: { style: "thin" }
    };

    ws.mergeCells(`${A}${rowNum + gap + 3}:${G}${rowNum + gap + 3}`);
    ws.getCell(`${A}${rowNum + gap + 3}`).value =
        "VERIFIED as to the prescribed office hours:";
    ws.getCell(`${A}${rowNum + gap + 3}`).font = { bold: true, size: 8 };
    ws.getCell(`${A}${rowNum + gap + 3}`).alignment = leftAlign;

    ws.mergeCells(`${D}${rowNum + gap + 5}:${G}${rowNum + gap + 5}`);
    ws.getCell(`${D}${rowNum + gap + 5}`).value = inChargeName;
    ws.getCell(`${D}${rowNum + gap + 5}`).font = { bold: true, size: 8.8 };
    ws.getCell(`${D}${rowNum + gap + 5}`).alignment = center;
    ws.getCell(`${D}${rowNum + gap + 5}`).border = {
        bottom: { style: "thin" }
    };

    ws.mergeCells(`${D}${rowNum + gap + 6}:${G}${rowNum + gap + 6}`);
    ws.getCell(`${D}${rowNum + gap + 6}`).value = "In Charge";
    ws.getCell(`${D}${rowNum + gap + 6}`).font = { size: 8 };
    ws.getCell(`${D}${rowNum + gap + 6}`).alignment = center;
}

/* =========================
   SHEET NAME HELPERS
========================= */
function safeSheetName(name) {
    return String(name || "DTR")
        .replace(/[\\/*?:[\]]/g, "")
        .trim()
        .slice(0, 31) || "DTR";
}

function getUniqueSheetName(workbook, baseName) {
    const cleanedBase = safeSheetName(baseName);
    const existingNames = new Set(workbook.worksheets.map(ws => ws.name));

    if (!existingNames.has(cleanedBase)) {
        return cleanedBase;
    }

    let counter = 2;

    while (true) {
        const suffix = ` (${counter})`;
        const maxBaseLength = 31 - suffix.length;
        const candidate = `${cleanedBase.slice(0, maxBaseLength)}${suffix}`;

        if (!existingNames.has(candidate)) {
            return candidate;
        }

        counter++;
    }
}

/* =========================
   BASIC HELPERS
========================= */
function emptyLog(dayNumber) {
    return {
        dayNumber,
        amArrival: "",
        amDeparture: "",
        pmArrival: "",
        pmDeparture: "",
        undertimeHours: "",
        undertimeMinutes: "",
        status: ""
    };
}

function normalizeCell(cell) {
    if (cell === null || cell === undefined) return "";
    return String(cell).trim();
}

function normalizeTime(value) {
    const str = normalizeCell(value);
    if (!/^\d{1,2}:\d{2}$/.test(str)) return "";

    const [h, m] = str.split(":").map(Number);

    if (Number.isNaN(h) || Number.isNaN(m)) return "";
    if (h < 0 || h > 23 || m < 0 || m > 59) return "";

    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isTimeString(value) {
    return /^\d{1,2}:\d{2}$/.test(String(value).trim());
}

function toMinutes(timeStr) {
    if (!isTimeString(timeStr)) return null;
    const [h, m] = String(timeStr).split(":").map(Number);
    return (h * 60) + m;
}

function hm(timeStr) {
    return toMinutes(timeStr);
}

function formatMonthDisplay(value) {
    if (!value) return "";
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return "";

    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
    });
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

