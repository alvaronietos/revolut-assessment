# Financial-crime home task

Audit of a transaction dataset (688,651 transactions, 8,021 users) answering
four business questions, plus **FraudLens**, an in-browser tool that runs the
same detection logic on any transactions CSV.

**FraudLens is live at https://revolut-assessment.vercel.app/** — drop in a CSV
or click "Try the demo dataset".

The written report with the findings and charts is in
[`report/report.pdf`](report/report.pdf).

## What's here

```
analysis/     Python analysis, one script per brief, shared helpers in common.py
report/       report.md, the build script, and the exported report.pdf
app/fraudlens/  React + TypeScript dashboard (Vite), runs fully client-side
```

## Reproducing the analysis

The scripts read the dataset from `data/fin_crime_data.csv`, which is not in
the repo. Drop the file there first, then:

```
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python analysis/brief1_conversion.py     # and the other three
```

Each script prints its headline numbers and writes its charts to
`analysis/figures/`. `analysis/common.py` holds the shared assumptions (FX
table, the merchant-country parser, the definition of "spend"), so every
script and the app agree on them.

Rebuild the report PDF with `python report/build.py` (needs Chrome or
Chromium on PATH, or set `CHROME`).

## Running FraudLens

```
cd app/fraudlens
npm install
npm run dev
```

Open the printed URL and either drop in a CSV or click "Try the demo
dataset". A small synthetic sample is in
`app/fraudlens/public/sample_transactions.csv`. See
[`app/fraudlens/README.md`](app/fraudlens/README.md) for details.

## Headline findings

- Real conversion is about 76.5%, not the 78% Marketing quotes; the gap is the
  difference between activation and a funded account that actually spends.
- The United Kingdom carries 90% of confirmed fraud and the largest exposure.
- Germany's high fraud *rate* is a single account, not a country trend.
- 260 of 299 fraud accounts passed KYC; they move money in via top-ups and out
  via ATMs rather than looking exotic.
- The five highest-priority accounts all beat KYC; the single biggest loss came
  from an account that never did, which the existing gate already catches.
