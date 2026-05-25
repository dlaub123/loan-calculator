# Loan Calculator (Python + Web GUI)

Slick loan calculator with:

- Input validation in both browser and backend
- Monthly amortization schedule
- Fixed table header for easier scrolling
- Yearly principal vs interest stacked bar chart
- Extra chart modes (cumulative interest, ending balance by year)
- Excel-ready CSV export (loan summary, monthly schedule, yearly breakdown)

## Run

1. Create a virtual environment (optional but recommended)
2. Install dependencies
3. Start Flask app

```powershell
cd C:\Users\dmlau\loan-calculator
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>.

## Python on Windows PATH

Python 3.12 was installed to:

- `C:\Users\dmlau\AppData\Local\Programs\Python\Python312`
- `C:\Users\dmlau\AppData\Local\Programs\Python\Python312\Scripts`

If `python --version` still does not work in an existing terminal, close and reopen the terminal (or sign out/in) so it picks up the updated user PATH.
