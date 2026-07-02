"""Brief 2B - what do the fraudsters who passed KYC look like?

Compares the 260 KYC-passed accounts with confirmed fraud against the 6,729
KYC-passed accounts without any, on behaviour only (the fraud tag itself is
never used as a feature). Groups the fraud accounts into archetypes with
explicit rules and attaches a control proposal to each.

One property of the data shapes everything here: every flagged account has
100% of its history tagged as fraud. These are dedicated fraud accounts,
not customers with one bad transaction.
"""

import matplotlib.pyplot as plt
import numpy as np

from common import ZERO_DECIMAL, load_data
from plotting import BLUE, INK, MUTED, RED, SUB, apply_style, save

RNG = np.random.default_rng(7)
TYPES = ["CARD_PAYMENT", "TOPUP", "P2P", "ATM", "BANK_TRANSFER"]


def build_features(df):
    conv = df[df.FX_CONVERTED].copy()
    major = np.where(conv.CURRENCY.isin(ZERO_DECIMAL), conv.AMOUNT, conv.AMOUNT / 100)
    conv["is_round"] = (major > 0) & (major % 100 == 0)
    conv["is_tiny_card"] = (conv.TYPE == "CARD_PAYMENT") & (conv.AMOUNT_GBP < 1)

    u = df.groupby("USER_ID").agg(
        kyc=("KYC", "first"),
        residence=("COUNTRY", "first"),
        age=("AGE", "first"),
        n_tx=("TYPE", "size"),
        n_currencies=("CURRENCY", "nunique"),
        has_fraud=("IS_FRAUD", "any"),
    )
    for t in TYPES:
        n_t = df[df.TYPE == t].groupby("USER_ID").size()
        u[f"share_{t}"] = (n_t.reindex(u.index).fillna(0) / u.n_tx)
    u["topup_gbp"] = conv[conv.TYPE == "TOPUP"].groupby("USER_ID").AMOUNT_GBP.sum() \
        .reindex(u.index).fillna(0)
    u["atm_gbp"] = conv[conv.TYPE == "ATM"].groupby("USER_ID").AMOUNT_GBP.sum() \
        .reindex(u.index).fillna(0)
    u["atm_topup_ratio"] = np.where(u.topup_gbp > 0, u.atm_gbp / u.topup_gbp, np.nan)
    u["n_atm"] = df[df.TYPE == "ATM"].groupby("USER_ID").size().reindex(u.index).fillna(0)
    u["median_gbp"] = conv.groupby("USER_ID").AMOUNT_GBP.median().reindex(u.index)
    u["p95_gbp"] = conv.groupby("USER_ID").AMOUNT_GBP.quantile(0.95).reindex(u.index)
    u["max_gbp"] = conv.groupby("USER_ID").AMOUNT_GBP.max().reindex(u.index)
    u["share_round"] = conv.groupby("USER_ID").is_round.mean().reindex(u.index).fillna(0)
    u["share_tiny_card"] = conv.groupby("USER_ID").is_tiny_card.mean().reindex(u.index).fillna(0)

    mk = df[df.MERCHANT_ISO2.notna() & (df.MERCHANT_ISO2 != "UNKNOWN")]
    u["n_merchant_countries"] = mk.groupby("USER_ID").MERCHANT_ISO2.nunique() \
        .reindex(u.index).fillna(0)
    foreign = mk[mk.MERCHANT_ISO2 != mk.COUNTRY]
    n_mk = mk.groupby("USER_ID").size().reindex(u.index)
    u["share_foreign_merchant"] = (foreign.groupby("USER_ID").size()
                                   .reindex(u.index).fillna(0) / n_mk)
    return u


def ratio_ci(cohort_vals, control_vals, draws=2000):
    """Bootstrap 95% CI for the ratio of means."""
    a = cohort_vals.dropna().to_numpy()
    b = control_vals.dropna().to_numpy()
    if a.mean() == 0 or b.mean() == 0:
        return np.nan, (np.nan, np.nan)
    idx_a = RNG.integers(0, len(a), (draws, len(a)))
    idx_b = RNG.integers(0, len(b), (draws, len(b)))
    ratios = a[idx_a].mean(axis=1) / b[idx_b].mean(axis=1)
    return a.mean() / b.mean(), tuple(np.percentile(ratios, [2.5, 97.5]))


def main():
    apply_style()
    df = load_data()
    u = build_features(df)

    passed = u[u.kyc == "PASSED"]
    cohort = passed[passed.has_fraud]
    control = passed[~passed.has_fraud]
    others = u[u.has_fraud & (u.kyc != "PASSED")]
    print(f"cohort (KYC passed, fraud): {len(cohort)}  |  control (KYC passed, clean): "
          f"{len(control)}  |  fraud with other KYC: {len(others)} "
          f"({others.kyc.value_counts().to_dict()})")

    share = df[df.IS_FRAUD].groupby("USER_ID").size() / u.loc[u.has_fraud, "n_tx"]
    print(f"fraud share of own history, flagged accounts: min={share.min():.0%} "
          f"median={share.median():.0%} - the label is account-level in practice\n")

    features = [
        ("share_ATM", "share of ATM withdrawals"),
        ("atm_topup_ratio", "ATM out / top-up in (GBP)"),
        ("share_TOPUP", "share of top-ups"),
        ("share_round", "share of round amounts"),
        ("share_tiny_card", "share of card payments under 1 GBP"),
        ("n_merchant_countries", "distinct merchant countries"),
        ("n_currencies", "distinct currencies"),
        ("share_foreign_merchant", "share of foreign-merchant tx"),
        ("median_gbp", "median transaction (GBP)"),
        ("age", "age (assumed 2020)"),
    ]
    print(f"{'feature':38s} {'fraud':>9s} {'clean':>9s} {'ratio':>7s}  95% CI")
    rows = []
    for col, label in features:
        m_c, m_k = cohort[col].mean(), control[col].mean()
        r, (lo, hi) = ratio_ci(cohort[col], control[col])
        rows.append((label, m_c, m_k, r, lo, hi))
        print(f"{label:38s} {m_c:9.3f} {m_k:9.3f} {r:7.2f}  [{lo:.2f}, {hi:.2f}]")

    # Archetypes. Rules first, in priority order, so every account lands in
    # exactly one bucket. Thresholds chosen from the cohort's own distribution
    # with a floor of ~30 accounts per bucket.
    mule = (cohort.atm_topup_ratio >= 0.5) & (cohort.n_atm >= 3)
    grinder = ~mule & (cohort.n_tx >= 30)
    hitrun = ~mule & ~grinder & (cohort.n_tx <= 10)
    residual = ~(mule | grinder | hitrun)
    print("\nArchetypes among the 260 KYC-passed fraud accounts:")
    for name, mask in [("The Mule (top-up in, ATM out)", mule),
                       ("The Grinder (30+ tx, long-running)", grinder),
                       ("The Hit-and-Run (10 tx or fewer)", hitrun),
                       ("Mixed / unclassified", residual)]:
        sub = cohort[mask]
        print(f"  {name:38s} {len(sub):3d} accounts ({len(sub)/len(cohort):.0%})  "
              f"median tx={sub.n_tx.median():.0f}, ATM share={sub.share_ATM.median():.0%}, "
              f"round={sub.share_round.median():.0%}")

    # Signals that do NOT separate in this data, despite the classic catalog:
    print("\nSignals that do not separate here (clean users score higher):")
    print(f"  tiny card payments: fraud {cohort.share_tiny_card.mean():.3f} "
          f"vs clean {control.share_tiny_card.mean():.3f}")
    print(f"  merchant-country diversity: fraud {cohort.n_merchant_countries.mean():.1f} "
          f"vs clean {control.n_merchant_countries.mean():.1f} "
          "- fraud accounts are narrow, not exotic")

    # Figure 1: transaction mix.
    fig, ax = plt.subplots(figsize=(8, 3.8))
    x = np.arange(len(TYPES))
    w = 0.38
    ax.bar(x - w / 2, [cohort[f"share_{t}"].mean() * 100 for t in TYPES], w,
           color=RED, label="fraud accounts (260)")
    ax.bar(x + w / 2, [control[f"share_{t}"].mean() * 100 for t in TYPES], w,
           color=BLUE, label="clean accounts (6,729)")
    ax.set_xticks(x, [t.replace("_", " ").title() for t in TYPES])
    ax.set_ylabel("Mean share of the account's transactions, %")
    ax.set_title("KYC-passed accounts: fraud money moves through top-ups and ATMs")
    ax.legend(loc="upper right")
    ax.grid(axis="x", visible=False)
    save(fig, "brief2b_txmix")

    # Figure 2: the features that separate most, side by side.
    top = [("share_ATM", "ATM share", 100, "%"),
           ("median_gbp", "Median transaction, GBP", 1, ""),
           ("share_round", "Round amounts", 100, "%"),
           ("n_merchant_countries", "Merchant countries", 1, "")]
    fig, axes = plt.subplots(1, 4, figsize=(10, 3))
    for ax, (col, label, scale, unit) in zip(axes, top):
        vals = [cohort[col].mean() * scale, control[col].mean() * scale]
        bars = ax.bar(["fraud", "clean"], vals, color=[RED, BLUE], width=0.6)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v, f"{v:,.1f}{unit}",
                    ha="center", va="bottom", fontsize=9, color=INK)
        ax.set_title(label, fontsize=10)
        ax.grid(axis="x", visible=False)
        ax.margins(y=0.18)
    fig.suptitle("Where the two populations actually differ", fontweight="bold")
    fig.tight_layout()
    save(fig, "brief2b_features")

    # Figure 3: the mule pattern in one picture.
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.scatter(control.share_TOPUP * 100, control.share_ATM * 100, s=10,
               color=BLUE, alpha=0.25, label="clean accounts", edgecolors="none")
    ax.scatter(cohort.share_TOPUP * 100, cohort.share_ATM * 100, s=26,
               color=RED, alpha=0.8, label="fraud accounts", edgecolors="white",
               linewidths=0.4)
    ax.set_xlabel("Top-ups, % of the account's transactions")
    ax.set_ylabel("ATM withdrawals, % of the account's transactions")
    ax.set_title("The mule corner: heavy top-up plus heavy ATM")
    ax.legend(loc="upper right")
    save(fig, "brief2b_mule_scatter")


if __name__ == "__main__":
    main()
