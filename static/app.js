const form = document.getElementById("loanForm");
const messageEl = document.getElementById("message");
const tbody = document.querySelector("#scheduleTable tbody");
const monthlyPaymentEl = document.getElementById("monthlyPayment");
const totalInterestEl = document.getElementById("totalInterest");
const totalPaidEl = document.getElementById("totalPaid");
const chartModeEl = document.getElementById("chartMode");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let yearlyChart = null;
let lastResult = null;

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function clearMessage() {
  messageEl.textContent = "";
}

function showMessage(text) {
  messageEl.textContent = text;
}

function readFormValues() {
  return {
    principal: Number(document.getElementById("principal").value),
    annualRate: Number(document.getElementById("annualRate").value),
    years: Number(document.getElementById("years").value),
    startMonth: Number(document.getElementById("startMonth").value),
    startYear: Number(document.getElementById("startYear").value),
  };
}

function validateInput(input) {
  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    return "Principal must be greater than 0.";
  }
  if (!Number.isFinite(input.annualRate) || input.annualRate < 0) {
    return "Annual rate cannot be negative.";
  }
  if (!Number.isInteger(input.years) || input.years < 1 || input.years > 50) {
    return "Loan term must be a whole number from 1 to 50.";
  }
  if (!Number.isInteger(input.startMonth) || input.startMonth < 1 || input.startMonth > 12) {
    return "Start month must be from 1 to 12.";
  }
  if (!Number.isInteger(input.startYear) || input.startYear < 1900 || input.startYear > 2200) {
    return "Start year must be from 1900 to 2200.";
  }
  return null;
}

function renderSchedule(rows) {
  tbody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>${row.period}</td>
        <td>${monthNames[row.month - 1]} ${row.year}</td>
        <td>${formatMoney(row.payment)}</td>
        <td>${formatMoney(row.principal)}</td>
        <td>${formatMoney(row.interest)}</td>
        <td>${formatMoney(row.balance)}</td>
      </tr>`
    )
    .join("");
}

function renderSummary(summary) {
  monthlyPaymentEl.textContent = formatMoney(summary.monthlyPayment);
  totalInterestEl.textContent = formatMoney(summary.totalInterest);
  totalPaidEl.textContent = formatMoney(summary.totalPaid);
}

function buildYearlyEndingBalance(schedule) {
  const yearRows = [];
  const byYear = new Map();
  schedule.forEach((row) => byYear.set(row.year, row.balance));
  [...byYear.entries()].forEach(([year, balance]) => {
    yearRows.push({ year, balance });
  });
  return yearRows;
}

function buildCumulativeInterest(yearlyBreakdown) {
  let running = 0;
  return yearlyBreakdown.map((row) => {
    running += row.interest;
    return { year: row.year, cumulativeInterest: running };
  });
}

function renderChart(result, chartMode) {
  const canvas = document.getElementById("yearlyChart");
  if (!canvas) {
    return;
  }
  const yearlyBreakdown = result.yearlyBreakdown;
  const labels = yearlyBreakdown.map((x) => String(x.year));
  let chartType = "bar";
  let datasets = [];
  let stacked = false;

  if (chartMode === "cumulativeInterest") {
    chartType = "line";
    const cumulative = buildCumulativeInterest(yearlyBreakdown);
    datasets = [
      {
        label: "Cumulative Interest",
        data: cumulative.map((x) => x.cumulativeInterest),
        borderColor: "#365fbf",
        backgroundColor: "rgba(54, 95, 191, 0.2)",
        fill: true,
        tension: 0.2,
      },
    ];
  } else if (chartMode === "endingBalance") {
    chartType = "line";
    const yearlyBalance = buildYearlyEndingBalance(result.schedule);
    datasets = [
      {
        label: "Ending Balance",
        data: yearlyBalance.map((x) => x.balance),
        borderColor: "#6f42c1",
        backgroundColor: "rgba(111, 66, 193, 0.2)",
        fill: true,
        tension: 0.2,
      },
    ];
  } else {
    stacked = true;
    datasets = [
      {
        label: "Principal",
        data: yearlyBreakdown.map((x) => x.principal),
        backgroundColor: "#2f64d9",
      },
      {
        label: "Interest",
        data: yearlyBreakdown.map((x) => x.interest),
        backgroundColor: "#96b4ff",
      },
    ];
  }

  if (yearlyChart) {
    yearlyChart.destroy();
  }

  yearlyChart = new Chart(canvas, {
    type: chartType,
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked,
        },
        y: {
          stacked,
          ticks: {
            callback(value) {
              return formatMoney(value);
            },
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label(context) {
              const yValue = typeof context.parsed === "number" ? context.parsed : context.parsed.y;
              return `${context.dataset.label}: ${formatMoney(yValue)}`;
            },
          },
        },
      },
    },
  });
}

function filenameFromDisposition(header) {
  if (!header) {
    return null;
  }
  const match = header.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match ? match[1].trim() : null;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function exportCsv(input) {
  const response = await fetch("/api/export-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const contentType = response.headers.get("Content-Type") || "";
  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      throw new Error(data.error || "CSV export failed.");
    }
    throw new Error("CSV export failed.");
  }

  const blob = await response.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ||
    `amortization-${stamp}.csv`;
  downloadBlob(blob, filename);
}

async function calculateLoan(payload) {
  const response = await fetch("/api/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  const input = readFormValues();
  const validationError = validateInput(input);
  if (validationError) {
    showMessage(validationError);
    return;
  }

  try {
    const data = await calculateLoan(input);
    if (!data.ok) {
      showMessage(data.error || "Calculation failed.");
      return;
    }
    lastResult = data.result;
    renderSummary(data.result.summary);
    renderSchedule(data.result.schedule);
    if (chartModeEl && document.getElementById("yearlyChart")) {
      renderChart(data.result, chartModeEl.value);
    }
  } catch (err) {
    showMessage("Network error while calculating loan.");
  }
});

if (chartModeEl) {
  chartModeEl.addEventListener("change", () => {
    if (!lastResult) {
      return;
    }
    renderChart(lastResult, chartModeEl.value);
  });
}

exportCsvBtn.addEventListener("click", async () => {
  clearMessage();
  const input = readFormValues();
  const validationError = validateInput(input);
  if (validationError) {
    showMessage(validationError);
    return;
  }
  if (!lastResult) {
    showMessage("Run a calculation first, then export CSV.");
    return;
  }

  try {
    await exportCsv(input);
  } catch (err) {
    showMessage(err.message || "Network error while exporting CSV.");
  }
});

// Pre-fill with a useful example for first run.
document.getElementById("principal").value = "350000";
document.getElementById("annualRate").value = "6.25";
document.getElementById("years").value = "30";
document.getElementById("startMonth").value = "1";
document.getElementById("startYear").value = String(new Date().getFullYear());
