"""Brief 2A - which country carries the most fraud risk?

Looks at fraud through two separate lenses (where users live vs where the
money goes), keeps volume and probability explicitly apart, and puts
confidence intervals on every rate so small countries can't win on noise.
"""

import math

import matplotlib.pyplot as plt
import numpy as np

from common import load_data
from plotting import BLUE, INK, LIGHT, MUTED, RED, SUB, apply_style, save

MIN_TX = 500     # a rate needs volume behind it before it can compete
MIN_USERS = 30


def wilson(k, n, z=1.96):
    """95% Wilson interval for a proportion."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1 + z**2 / n
    centre = (p + z**2 / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z**2 / (4 * n**2)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def country_table(df, country_col):
    grouped = df.groupby(country_col)
    out = grouped.agg(
        tx=("IS_FRAUD", "size"),
        fraud_tx=("IS_FRAUD", "sum"),
        users=("USER_ID", "nunique"),
    )
    out["fraud_users"] = df[df.IS_FRAUD].groupby(country_col)["USER_ID"].nunique()
    out["fraud_users"] = out["fraud_users"].fillna(0).astype(int)
    out["tx_rate"] = out.fraud_tx / out.tx
    out["user_rate"] = out.fraud_users / out.users
    ci = out.apply(lambda r: wilson(r.fraud_tx, r.tx), axis=1)
    out["ci_lo"] = [c[0] for c in ci]
    out["ci_hi"] = [c[1] for c in ci]
    exposure = df[df.IS_FRAUD & df.FX_CONVERTED].groupby(country_col)["AMOUNT_GBP"].sum()
    out["fraud_gbp"] = exposure.reindex(out.index).fillna(0)
    return out


def main():
    apply_style()
    df = load_data()

    # Lens 1: user residence.
    res = country_table(df, "COUNTRY")
    eligible = res[(res.tx >= MIN_TX) & (res.users >= MIN_USERS)].copy()
    small = res[(res.tx < MIN_TX) | (res.users < MIN_USERS)]
    print(f"residence lens: {len(res)} countries, {len(eligible)} clear the "
          f"n>={MIN_TX} tx and >={MIN_USERS} users bar ({len(small)} reported apart)\n")

    print("Top 10 by fraud volume (residence):")
    top_vol = eligible.sort_values("fraud_tx", ascending=False).head(10)
    print(top_vol[["fraud_tx", "tx", "tx_rate", "user_rate", "fraud_gbp"]]
          .to_string(float_format=lambda x: f"{x:,.3f}"))

    print("\nTop 10 by fraud rate (residence, thresholded):")
    top_rate = eligible.sort_values("tx_rate", ascending=False).head(10)
    print(top_rate[["tx_rate", "ci_lo", "ci_hi", "fraud_tx", "users", "fraud_users"]]
          .to_string(float_format=lambda x: f"{x:,.4f}"))

    # The Germany anomaly: one account generates the whole rate.
    de_fraud = df[(df.COUNTRY == "DE") & df.IS_FRAUD]
    de_accounts = de_fraud.USER_ID.unique()
    print(f"\nDE check: {de_fraud.shape[0]} fraud tx from {len(de_accounts)} account(s): "
          f"{de_accounts[0][:8]}...")
    de_user_tx = df[df.USER_ID == de_accounts[0]]
    print(f"  that account: {len(de_user_tx)} tx total, "
          f"{int(de_user_tx.IS_FRAUD.sum())} fraud, KYC={de_user_tx.KYC.iloc[0]}")
    de_cy = df[(df.COUNTRY == "DE") & (df.MERCHANT_ISO2 == "CY")]
    share = (de_cy.USER_ID == de_accounts[0]).mean()
    print(f"  DE->CY corridor: {len(de_cy)} tx, {share:.1%} of them from that single account")
    de_rate_excl = res.loc["DE", "fraud_tx"] / res.loc["DE", "tx"]
    print(f"  DE tx-level rate {de_rate_excl:.2%} vs user-level rate "
          f"{res.loc['DE', 'user_rate']:.2%} - the gap IS the finding")

    # Lens 2: merchant country (card payments and ATM only; the other types
    # simply have no merchant, so there is nothing to impute).
    card_atm = df[df.MERCHANT_ISO2.notna() & (df.MERCHANT_ISO2 != "UNKNOWN")]
    mer = country_table(card_atm, "MERCHANT_ISO2")
    mer_eligible = mer[(mer.tx >= MIN_TX) & (mer.users >= MIN_USERS)]
    print("\nTop 10 merchant countries by fraud volume:")
    print(mer_eligible.sort_values("fraud_tx", ascending=False).head(10)
          [["fraud_tx", "tx", "tx_rate", "fraud_gbp"]]
          .to_string(float_format=lambda x: f"{x:,.3f}"))

    # Expected-loss view: which country actually costs the most.
    print("\nFraud exposure in GBP (residence, top 5):")
    print(eligible.sort_values("fraud_gbp", ascending=False).head(5)["fraud_gbp"]
          .to_string(float_format=lambda x: f"{x:,.0f}"))

    # Figure 1: volume vs probability, bubble = exposure.
    plot = eligible[eligible.fraud_tx > 0]
    fig, ax = plt.subplots(figsize=(8, 5))
    size = 40 + 500 * (plot.fraud_gbp / plot.fraud_gbp.max())
    ax.scatter(plot.fraud_tx, plot.tx_rate * 100, s=size, color=BLUE,
               alpha=0.55, edgecolors="white", linewidths=1, zorder=3)
    gb = plot.loc["GB"]
    ax.scatter([gb.fraud_tx], [gb.tx_rate * 100], s=40 + 500 * gb.fraud_gbp / plot.fraud_gbp.max(),
               color=RED, edgecolors="white", linewidths=1, zorder=4)
    ax.set_xscale("log")
    ax.axvline(plot.fraud_tx.median(), color=LIGHT, linewidth=1, linestyle="--", zorder=1)
    ax.axhline(plot.tx_rate.median() * 100, color=LIGHT, linewidth=1, linestyle="--", zorder=1)
    offsets = {"GB": (10, 6), "DE": (10, 6), "PL": (10, 6), "ES": (8, 8),
               "FR": (8, -14), "LT": (-18, -14)}
    for iso, xy in offsets.items():
        if iso in plot.index:
            row = plot.loc[iso]
            note = "DE (one single account)" if iso == "DE" else iso
            ax.annotate(note, (row.fraud_tx, row.tx_rate * 100),
                        textcoords="offset points", xytext=xy,
                        fontsize=9, color=INK if iso in ("GB", "DE") else SUB)
    ax.set_xlabel("Confirmed fraud transactions (log scale)\nBubble size = confirmed fraud exposure in GBP")
    ax.set_ylabel("Fraud rate, % of the country's transactions")
    ax.set_title("Volume and probability are different questions - GB wins the one that costs money")
    save(fig, "brief2a_scatter")

    # Figure 2: the two rankings side by side.
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    vol = top_vol.head(8).iloc[::-1]
    colors = [RED if i == "GB" else BLUE for i in vol.index]
    axes[0].barh(vol.index, vol.fraud_tx, color=colors, height=0.62)
    axes[0].set_xscale("log")
    axes[0].set_title("Fraud volume (# transactions)")
    axes[0].set_xlabel("Confirmed fraud transactions (log scale)")
    axes[0].grid(axis="y", visible=False)

    rate = top_rate.head(8).iloc[::-1]
    colors = [RED if i == "DE" else BLUE for i in rate.index]
    err_lo = (rate.tx_rate - rate.ci_lo) * 100
    err_hi = (rate.ci_hi - rate.tx_rate) * 100
    axes[1].barh(rate.index, rate.tx_rate * 100, xerr=[err_lo, err_hi],
                 color=colors, height=0.62, error_kw={"ecolor": MUTED, "capsize": 2})
    axes[1].set_title("Fraud rate (% of transactions, 95% CI)")
    axes[1].set_xlabel("% of the country's transactions")
    axes[1].grid(axis="y", visible=False)
    de_pos = list(rate.index).index("DE") if "DE" in rate.index else None
    if de_pos is not None:
        axes[1].text(rate.loc["DE", "ci_hi"] * 100 + 0.15, de_pos,
                     "one account", va="center", fontsize=8, color=RED)
    fig.suptitle("Two honest rankings, two different leaders", fontweight="bold")
    fig.tight_layout()
    save(fig, "brief2a_rankings")


if __name__ == "__main__":
    main()
