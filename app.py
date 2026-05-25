from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP, getcontext
from typing import Any

from flask import Flask, Response, jsonify, render_template, request

getcontext().prec = 28

MONTH_NAMES = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)

app = Flask(__name__)


@dataclass
class LoanInput:
    principal: Decimal
    annual_rate: Decimal
    years: int
    start_month: int
    start_year: int


def parse_decimal(value: Any, field_name: str) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except Exception as exc:  # pragma: no cover
        raise ValueError(f"{field_name} must be a valid number.") from exc
    return parsed


def parse_int(value: Any, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a whole number.") from exc


def validate_payload(payload: dict[str, Any]) -> LoanInput:
    required = ["principal", "annualRate", "years", "startMonth", "startYear"]
    missing = [key for key in required if key not in payload]
    if missing:
        raise ValueError(f"Missing required field(s): {', '.join(missing)}")

    principal = parse_decimal(payload["principal"], "Principal")
    annual_rate = parse_decimal(payload["annualRate"], "Annual interest rate")
    years = parse_int(payload["years"], "Loan term in years")
    start_month = parse_int(payload["startMonth"], "Start month")
    start_year = parse_int(payload["startYear"], "Start year")

    if principal <= 0:
        raise ValueError("Principal must be greater than 0.")
    if annual_rate < 0:
        raise ValueError("Annual interest rate cannot be negative.")
    if not (1 <= years <= 50):
        raise ValueError("Loan term in years must be between 1 and 50.")
    if not (1 <= start_month <= 12):
        raise ValueError("Start month must be from 1 to 12.")
    if not (1900 <= start_year <= 2200):
        raise ValueError("Start year must be from 1900 to 2200.")

    return LoanInput(
        principal=principal,
        annual_rate=annual_rate,
        years=years,
        start_month=start_month,
        start_year=start_year,
    )


def money(value: Decimal) -> float:
    quantized = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(quantized)


def build_amortization(loan: LoanInput) -> dict[str, Any]:
    months = loan.years * 12
    monthly_rate = (loan.annual_rate / Decimal("100")) / Decimal("12")

    if monthly_rate == 0:
        payment = loan.principal / Decimal(months)
    else:
        one = Decimal("1")
        factor = (one + monthly_rate) ** months
        payment = loan.principal * monthly_rate * factor / (factor - one)

    schedule: list[dict[str, Any]] = []
    yearly_breakdown: dict[int, dict[str, Decimal]] = {}

    balance = loan.principal
    total_interest = Decimal("0")
    total_paid = Decimal("0")

    current_month = loan.start_month
    current_year = loan.start_year

    for period in range(1, months + 1):
        interest_payment = balance * monthly_rate
        principal_payment = payment - interest_payment

        if period == months:
            principal_payment = balance
            payment_amount = principal_payment + interest_payment
        else:
            payment_amount = payment

        balance = balance - principal_payment
        if balance < Decimal("0.005"):
            balance = Decimal("0")

        total_interest += interest_payment
        total_paid += payment_amount

        if current_year not in yearly_breakdown:
            yearly_breakdown[current_year] = {
                "principal": Decimal("0"),
                "interest": Decimal("0"),
            }

        yearly_breakdown[current_year]["principal"] += principal_payment
        yearly_breakdown[current_year]["interest"] += interest_payment

        schedule.append(
            {
                "period": period,
                "month": current_month,
                "year": current_year,
                "payment": money(payment_amount),
                "principal": money(principal_payment),
                "interest": money(interest_payment),
                "balance": money(balance),
            }
        )

        current_month += 1
        if current_month > 12:
            current_month = 1
            current_year += 1

    chart_rows = []
    for year in sorted(yearly_breakdown):
        chart_rows.append(
            {
                "year": year,
                "principal": money(yearly_breakdown[year]["principal"]),
                "interest": money(yearly_breakdown[year]["interest"]),
            }
        )

    return {
        "summary": {
            "monthlyPayment": money(payment),
            "totalInterest": money(total_interest),
            "totalPaid": money(total_paid),
            "loanMonths": months,
        },
        "schedule": schedule,
        "yearlyBreakdown": chart_rows,
    }


def format_money_csv(value: float) -> str:
    return f"{value:.2f}"


def build_csv(loan: LoanInput, result: dict[str, Any]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")

    writer.writerow(["Loan Amortization Schedule"])
    writer.writerow([])
    writer.writerow(["Principal", format_money_csv(float(loan.principal))])
    writer.writerow(["Annual Rate (%)", str(loan.annual_rate)])
    writer.writerow(["Term (Years)", loan.years])
    writer.writerow(
        ["Start Date", f"{MONTH_NAMES[loan.start_month - 1]} {loan.start_year}"]
    )
    writer.writerow([])

    summary = result["summary"]
    writer.writerow(["Monthly Payment", format_money_csv(summary["monthlyPayment"])])
    writer.writerow(["Total Interest", format_money_csv(summary["totalInterest"])])
    writer.writerow(["Total Paid", format_money_csv(summary["totalPaid"])])
    writer.writerow(["Loan Months", summary["loanMonths"]])
    writer.writerow([])

    writer.writerow(
        ["Period", "Month", "Payment", "Principal", "Interest", "Ending Balance"]
    )
    for row in result["schedule"]:
        writer.writerow(
            [
                row["period"],
                f"{MONTH_NAMES[row['month'] - 1]} {row['year']}",
                format_money_csv(row["payment"]),
                format_money_csv(row["principal"]),
                format_money_csv(row["interest"]),
                format_money_csv(row["balance"]),
            ]
        )

    writer.writerow([])
    writer.writerow(["Yearly Breakdown"])
    writer.writerow(["Year", "Principal Paid", "Interest Paid"])
    for row in result["yearlyBreakdown"]:
        writer.writerow(
            [
                row["year"],
                format_money_csv(row["principal"]),
                format_money_csv(row["interest"]),
            ]
        )

    return "\ufeff" + buffer.getvalue()


@app.route("/", methods=["GET"])
def index() -> str:
    return render_template("index.html")


@app.route("/api/calculate", methods=["POST"])
def calculate() -> Any:
    try:
        payload = request.get_json(silent=True) or {}
        loan = validate_payload(payload)
        result = build_amortization(loan)
        return jsonify({"ok": True, "result": result})
    except ValueError as err:
        return jsonify({"ok": False, "error": str(err)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Unexpected error while calculating."}), 500


@app.route("/api/export-csv", methods=["POST"])
def export_csv() -> Any:
    try:
        payload = request.get_json(silent=True) or {}
        loan = validate_payload(payload)
        result = build_amortization(loan)
        csv_text = build_csv(loan, result)
        filename = f"amortization-{date.today().isoformat()}.csv"
        return Response(
            csv_text,
            mimetype="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as err:
        return jsonify({"ok": False, "error": str(err)}), 400
    except Exception:
        return jsonify({"ok": False, "error": "Unexpected error while exporting CSV."}), 500


if __name__ == "__main__":
    #app.run(debug=True)
    app.run(host="0.0.0.0", port=5000, debug=True)



