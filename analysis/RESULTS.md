# Working notes - headline numbers

Everything below comes from re-running the four scripts in this folder against
`data/fin_crime_data.csv`. Keeping the numbers in one place so the report and
the app stay consistent.

## Dataset

688,651 transactions, 8,021 users, no timestamps. 14,543 fraud transactions
(2.11%) across 299 users (3.73%). Fraud users by KYC: 260 PASSED, 22 FAILED,
17 PENDING, 0 NONE. Every flagged account has 100% of its history tagged as
fraud, so the label behaves as an account-level tag - these are dedicated
fraud accounts, not customers with one bad payment.

Data quality: 12,023 zero-amount rows, 0 negative, 207,743 exact duplicate
rows (no tx id or timestamp to tell repeat payments apart - left in place and
documented), 6,212 rows in currencies outside the FX table (0.9%, includes
crypto), merchant-country field unparseable for 0.32% of non-null values.

Assumptions shared by all scripts (analysis/common.py): static FX table to
GBP (14 currencies), amounts in minor units except JPY/KRW/VND/CLP/ISK,
age = 2020 - BIRTH_YEAR, spend = any type except TOPUP.

## Brief 1 - conversion

- Marketing's ~78% reproduces exactly as "KYC passed AND at least one spend":
  77.9%.
- Candidates: top-up 96.8% / spend 82.9% / KYC 87.1% / top-up+spend 79.7% /
  KYC+top-up+spend 76.5%.
- My headline: 76.5% = verified, funded account with at least one real spend.
- Sensitivity (also excluding the 299 fraud accounts): N=1 73.4%, N=3 65.6%,
  N=5 61.4%, N=10 54.4%. The 78% is activation, not sustainable conversion.
- Caveat for the report: the file only contains users who transacted, so both
  numbers overstate conversion from signup.

## Brief 2A - geography

Thresholds for rate rankings: >=500 tx and >=30 users (22 of 56 residence
countries qualify).

- GB: 13,088 fraud tx (90% of all fraud), 3.40% tx rate [3.34, 3.45],
  6.9% of GB users hit, 3.79M GBP exposure - highest on volume, exposure and
  user rate. GB is my answer.
- DE: 5.64% tx rate, top of the rate table - but all 508 fraud tx belong to
  ONE account (4ee8690a..., KYC passed, 508/508 tx fraud). User-level rate
  0.68%. That account owns 89.2% of the DE->CY merchant corridor (58 of 65 tx).
- Merchant lens: GB also leads (6,631 fraud tx, 4.5%); oddity: Gibraltar,
  15.7% fraud rate on 880 tx. US exposure is second (464k GBP).
- Exposure top 5 (GBP): GB 3.79M, ES 94k, PL 87k, FR 37k, DE 28k.

## Brief 2B - KYC-passed fraud accounts

Cohort 260 vs control 6,729 (both KYC passed). Ratios are cohort mean over
control mean with bootstrap 95% CI.

Separates well:
- ATM share of activity: 15.3% vs 6.1% (x2.52 [2.12, 2.94])
- median transaction: 168 vs 39 GBP (x4.27 [3.27, 5.38])
- round amounts: 17.6% vs 9.3% (x1.88 [1.64, 2.15])
- foreign-merchant share: 16.6% vs 63.5% (x0.26 [0.20, 0.32]) - fraud
  accounts are narrow and domestic, not exotic
- distinct merchant countries: 1.5 vs 3.7 (x0.41)
- age: 32.4 vs 36.9 (x0.88) - younger

Does NOT separate (worth saying out loud): tiny card payments (card-testing
signature) and merchant-country diversity - clean users score higher on both.

Archetypes (rule-based, priority order, all >=30 accounts):
- The Mule: ATM out >= 50% of top-up in, 3+ ATM withdrawals - 78 accounts
  (30%), median 39 tx, 35% ATM share, 24% round amounts.
- The Grinder: not mule, 30+ tx - 63 accounts (24%), median 60 tx.
- The Hit-and-Run: not mule, <=10 tx - 53 accounts (20%), median 6 tx.
- Mixed: 66 accounts (25%).

Controls I would propose: ATM caps + step-up on young accounts with rising
ATM share; round-amount velocity checks on top-up->ATM chains; first-spend
review for accounts that go heavy in their first few transactions (the
hit-and-run pattern); count-based limits since we lack timestamps.

## Bonus - top 5

Score per flagged account = 0.30 impact (loss GBP, single tx capped at p99.5
= 5,000) + 0.25 intensity (sqrt of fraud tx count x fraud share) + 0.15
sophistication (70 if KYC passed + 30 if money left via transfer/ATM) + 0.15
breadth (currencies + merchant countries + tx types) + 0.15 persistence
(fraud share of activity - constant 100 here, kept for completeness).
Dimensions in percentiles within the 299.

Top 5 (stability = share of 243 weight perturbations keeping the account in
the top 5):
1. b8271606 - score 98.5, 100% stable, 45k GBP, 340 tx, 4 currencies
2. 25c2ecb3 - score 97.3, 100% stable, 36k GBP, 460 tx
3. 2ba04c04 - score 96.8, 78%, 61k GBP, 200 tx
4. 3c11dc04 - score 96.5, 78%, 36k GBP, 189 tx, 9 merchant countries
5. 4ee8690a - score 96.4, 78%, 28k GBP, 508 tx - the DE account from 2A

First alternate: 6eb51e3f (590 tx, stability 41%). Clear stability cliff
after rank 5 (78% -> 41% -> 26% -> 0%).

The raw-loss ranking would instead crown dc283b17: 610k GBP, 1,029 fraud tx,
but KYC PENDING - it never got through identity checks, so the existing gate
already catches that profile. It lands at rank 27 on my score. The five above
all PASSED KYC: they beat the control this brief is about. Capped vs uncapped
ranking overlap: 4/5.

8 accounts have >80% of their loss in a single transaction - flagged in the
table, none reach the top 5.
