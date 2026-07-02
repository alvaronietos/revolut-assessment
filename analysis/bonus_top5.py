"""Bonus - the five accounts I would put on the Head of Risk's desk.

Loss alone is a bad ranking: it crowns whoever landed one big transaction and
ignores whether the account beat our controls or is still operationally
capable. The score below mixes five dimensions and is stress-tested by
perturbing the weights.

Two data facts shape the design. First, every flagged account has 100% of
its history tagged as fraud, so the "share of own activity" dimension is
constant across the group; it stays in the formula for completeness but the
ranking is carried by the other four. Second, amounts above the 99.5th
percentile of fraud transactions (5,000 GBP) get capped for the headline
ranking, with the uncapped ranking shown next to it.
"""

import itertools

import matplotlib.pyplot as plt
import numpy as np

from common import load_data
from plotting import BLUE, CATEGORICAL, INK, MUTED, RED, SUB, apply_style, save

WEIGHTS = {"impact": 0.30, "intensity": 0.25, "sophistication": 0.15,
           "breadth": 0.15, "persistence": 0.15}


def pct_rank(series):
    return series.rank(pct=True) * 100


def build_scores(df):
    fraud = df[df.IS_FRAUD]
    fconv = fraud[fraud.FX_CONVERTED].copy()
    cap = fconv.AMOUNT_GBP.quantile(0.995)
    fconv["capped"] = fconv.AMOUNT_GBP.clip(upper=cap)

    t = fraud.groupby("USER_ID").agg(
        n_fraud=("IS_FRAUD", "size"),
        kyc=("KYC", "first"),
        residence=("COUNTRY", "first"),
        n_types=("TYPE", "nunique"),
        n_currencies=("CURRENCY", "nunique"),
    )
    t["loss_gbp"] = fconv.groupby("USER_ID").AMOUNT_GBP.sum().reindex(t.index).fillna(0)
    t["loss_capped"] = fconv.groupby("USER_ID").capped.sum().reindex(t.index).fillna(0)
    t["max_single"] = fconv.groupby("USER_ID").AMOUNT_GBP.max().reindex(t.index).fillna(0)
    t["one_tx_share"] = np.where(t.loss_gbp > 0, t.max_single / t.loss_gbp, 0)

    mk = fraud[fraud.MERCHANT_ISO2.notna() & (fraud.MERCHANT_ISO2 != "UNKNOWN")]
    t["n_mcountries"] = mk.groupby("USER_ID").MERCHANT_ISO2.nunique().reindex(t.index).fillna(0)

    total_tx = df.groupby("USER_ID").size()
    t["fraud_share"] = t.n_fraud / total_tx.reindex(t.index)
    t["via_transfer_atm"] = fraud[fraud.TYPE.isin(["BANK_TRANSFER", "ATM"])] \
        .groupby("USER_ID").size().reindex(t.index).notna()

    dims = {}
    dims["impact"] = pct_rank(t.loss_capped)
    dims["intensity"] = pct_rank(np.sqrt(t.n_fraud * t.fraud_share.clip(lower=0)))
    # Beating identity checks is what makes an operator dangerous going
    # forward; moving money out via transfers or cash shows intent to extract.
    dims["sophistication"] = np.where(t.kyc == "PASSED", 70, 0) \
        + np.where(t.via_transfer_atm, 30, 0)
    dims["breadth"] = pct_rank(t.n_currencies + t.n_mcountries + t.n_types)
    dims["persistence"] = t.fraud_share.clip(upper=1) * 100  # constant 100 here
    for k, v in dims.items():
        t[f"dim_{k}"] = v
    t["score"] = sum(WEIGHTS[k] * t[f"dim_{k}"] for k in WEIGHTS)
    return t, cap


def stability(t, top_ids, step=0.05):
    """Share of weight perturbations under which each account stays top 5."""
    keys = list(WEIGHTS)
    hits = {i: 0 for i in top_ids}
    combos = 0
    for deltas in itertools.product((-step, 0.0, step), repeat=len(keys)):
        w = np.array([WEIGHTS[k] + d for k, d in zip(keys, deltas)])
        if (w < 0).any():
            continue
        w = w / w.sum()
        score = sum(wi * t[f"dim_{k}"] for wi, k in zip(w, keys))
        top = set(score.nlargest(5).index)
        combos += 1
        for i in top_ids:
            hits[i] += i in top
    return {i: hits[i] / combos for i in top_ids}, combos


def main():
    apply_style()
    df = load_data()
    t, cap = build_scores(df)
    print(f"{len(t)} flagged accounts scored; single-tx cap at {cap:,.0f} GBP")
    print(f"accounts where one transaction is >80% of the loss: "
          f"{int((t.one_tx_share > 0.8).sum())} (flagged, kept in the ranking)\n")

    by_loss = t.sort_values("loss_gbp", ascending=False)
    print("Ranking by raw loss (what NOT to hand over):")
    print(by_loss.head(5)[["loss_gbp", "n_fraud", "kyc", "one_tx_share"]]
          .to_string(float_format=lambda x: f"{x:,.2f}"))

    ranked = t.sort_values("score", ascending=False)
    top5 = ranked.head(5)
    stab, combos = stability(t, list(top5.index))
    print(f"\nThreat-score Top 5 (stability over {combos} weight perturbations):")
    for uid, row in top5.iterrows():
        print(f"  {uid[:8]}...  score={row.score:5.1f}  stability={stab[uid]:4.0%}  "
              f"loss={row.loss_gbp:9,.0f} GBP  fraud tx={row.n_fraud:4d}  "
              f"KYC={row.kyc}  currencies={row.n_currencies}  "
              f"merchant countries={int(row.n_mcountries)}")

    # How different is the capped ranking from the uncapped one?
    uncapped = t.assign(score_u=t.score - WEIGHTS["impact"] * t.dim_impact
                        + WEIGHTS["impact"] * pct_rank(t.loss_gbp))
    top_u = set(uncapped.sort_values("score_u", ascending=False).head(5).index)
    print(f"\ncapped vs uncapped top-5 overlap: {len(top_u & set(top5.index))}/5")

    de = [i for i in t.index if i.startswith("4ee8690a")]
    if de:
        r = t.index.get_indexer_for(de)[0]
        pos = int((t.score > t.loc[de[0], "score"]).sum()) + 1
        print(f"DE account 4ee8690a... ranks #{pos} "
              f"(score {t.loc[de[0], 'score']:.1f})")

    # Figure 1: loss vs intensity, the top 5 highlighted.
    fig, ax = plt.subplots(figsize=(8, 5))
    rest = t.drop(top5.index)
    ax.scatter(rest.loss_gbp.clip(lower=1), rest.n_fraud, s=18 + rest.n_mcountries * 6,
               color=BLUE, alpha=0.4, edgecolors="none", label="other flagged accounts")
    ax.scatter(top5.loss_gbp.clip(lower=1), top5.n_fraud,
               s=30 + top5.n_mcountries * 6, color=RED, edgecolors="white",
               linewidths=1, zorder=4, label="threat-score top 5")
    label_offsets = {"4ee8690a": (-62, 4), "25c2ecb3": (10, 2), "b8271606": (10, 2),
                     "2ba04c04": (10, -3), "3c11dc04": (-62, -12)}
    for uid, row in top5.iterrows():
        ax.annotate(uid[:8], (max(row.loss_gbp, 1), row.n_fraud),
                    textcoords="offset points",
                    xytext=label_offsets.get(uid[:8], (8, 4)), fontsize=8, color=INK)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Confirmed loss, GBP (log scale)")
    ax.set_ylabel("Confirmed fraud transactions (log scale)")
    ax.set_title("Loss alone would pick a different, worse list")
    ax.legend(loc="lower right")
    ax.text(0.02, 0.02, "Marker size = distinct merchant countries",
            transform=ax.transAxes, fontsize=8, color=MUTED)
    save(fig, "bonus_scatter")

    # Figure 2: what each top-5 score is made of.
    fig, ax = plt.subplots(figsize=(8, 3.8))
    bottoms = np.zeros(len(top5))
    labels = [uid[:8] for uid in top5.index]
    for color, key in zip(CATEGORICAL, WEIGHTS):
        vals = (WEIGHTS[key] * top5[f"dim_{key}"]).to_numpy()
        ax.bar(labels, vals, bottom=bottoms, color=color, width=0.6,
               label=key, edgecolor="white", linewidth=1)
        bottoms += vals
    for x, v in zip(labels, bottoms):
        ax.text(x, v + 1, f"{v:.0f}", ha="center", fontsize=9, color=INK)
    ax.set_ylabel("Weighted score contribution")
    ax.set_title("Score decomposition: nobody wins on one dimension alone")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.10), ncols=5, fontsize=9)
    ax.grid(axis="x", visible=False)
    ax.margins(y=0.15)
    save(fig, "bonus_decomposition")


if __name__ == "__main__":
    main()
