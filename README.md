# Loan Calculator (Python + Web GUI)

Full functional loan calculator with:

- Input validation in both browser and backend
- Monthly amortization schedule
- Fixed table header for easier scrolling
- Yearly principal vs interest stacked bar chart
- Extra chart modes (cumulative interest, ending balance by year)
- Excel-ready CSV export (loan summary, monthly schedule, yearly breakdown)
- Primarily generated with Cursor
- (if invoked from Facebook use External browser command to download csv)

## Run 
Simply go to: <http://dmlsoftware.pythonanywhere.com> - Or:

1. Create a virtual environment (optional but recommended)
2. Install dependencies
3. Start Flask app

```powershell
cd ...\loan-calculator
git clone https://github.com/dlaub123/loan-calculator.git
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>.
