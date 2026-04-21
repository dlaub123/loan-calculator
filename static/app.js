const form = document.getElementById("loanForm");
const messageEl = document.getElementById("message");
const tbody = document.querySelector("#scheduleTable tbody");
const monthlyPaymentEl = document.getElementById("monthlyPayment");
const totalInterestEl = document.getElementById("totalInterest");
const totalPaidEl = document.getElementById("totalPaid");
const chartModeEl = document.getElementById("chartMode");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const printReportBtn = document.getElementById("printReportBtn");
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let yearlyChart = null;
let lastResult = null;
let lastInput = null;

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

function toCsv(rows) {
  const header = ["Period", "Month", "Year", "Payment", "Principal", "Interest", "Balance"];
  const body = rows.map((row) => [
    row.period,
    monthNames[row.month - 1],
    row.year,
    row.payment.toFixed(2),
    row.principal.toFixed(2),
    row.interest.toFixed(2),
    row.balance.toFixed(2),
  ]);
  return [header, ...body].map((r) => r.join(",")).join("\n");
}

function downloadCsv(content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute("download", `amortization-${stamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function openPrintableReport(input, result) {
  const reportWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!reportWindow) {
    showMessage("Pop-up blocked. Please allow pop-ups for printable report.");
    return;
  }

  const rowsHtml = result.schedule
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

  reportWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Loan Amortization Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1, h2 { margin-bottom: 8px; }
          .meta, .summary { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
          .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: right; }
          th:nth-child(1), th:nth-child(2), td:nth-child(1), td:nth-child(2) { text-align: center; }
          thead th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>Loan Amortization Report</h1>
        <div class="meta">
          <div class="card">Principal: <strong>${formatMoney(input.principal)}</strong></div>
          <div class="card">Annual Rate: <strong>${input.annualRate}%</strong></div>
          <div class="card">Term: <strong>${input.years} years</strong></div>
        </div>
        <div class="summary">
          <div class="card">Monthly Payment: <strong>${formatMoney(result.summary.monthlyPayment)}</strong></div>
          <div class="card">Total Interest: <strong>${formatMoney(result.summary.totalInterest)}</strong></div>
          <div class="card">Total Paid: <strong>${formatMoney(result.summary.totalPaid)}</strong></div>
        </div>
        <h2>Monthly Schedule</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Month</th>
              <th>Payment</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
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
    lastInput = input;
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

exportCsvBtn.addEventListener("click", () => {
  if (!lastResult) {
    showMessage("Run a calculation first, then export CSV.");
    return;
  }
  downloadCsv(toCsv(lastResult.schedule));
});

printReportBtn.addEventListener("click", () => {
  if (!lastResult || !lastInput) {
    showMessage("Run a calculation first, then create a report.");
    return;
  }
  openPrintableReport(lastInput, lastResult);
});

// Pre-fill with a useful example for first run.
document.getElementById("principal").value = "350000";
document.getElementById("annualRate").value = "6.25";
document.getElementById("years").value = "30";
document.getElementById("startMonth").value = "1";
document.getElementById("startYear").value = String(new Date().getFullYear());
