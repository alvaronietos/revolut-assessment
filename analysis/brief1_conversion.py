"""Brief 1 - how real is the ~78% conversion rate?

Rebuilds the funnel at user level, reverse-engineers the definition that
produces Marketing's number, and proposes a stricter one based on economic
behaviour rather than activation.
"""

import matplotlib.pyplot as plt

from common import load_data
from plotting import BLUE, BLUE_RAMP, GRID, INK, LIGHT, MUTED, RED, SUB, apply_style, save


def user_table(df):
    users = df.groupby("USER_ID").agg(
        kyc=("KYC", "first"),
        has_topup=("TYPE", lambda s: (s == "TOPUP").any()),
        n_spend=("IS_SPEND", "sum"),
        has_fraud=("IS_FRAUD", "any"),
    )
    users["has_spend"] = users.n_spend > 0
    return users


def main():
    apply_style()
    df = load_data()
    u = user_table(df)
    n = len(u)
    passed = u.kyc == "PASSED"

    print(f"users: {n:,}\n")
    print("Candidate definitions of 'converted user':")
    candidates = {
        "has a top-up": u.has_topup.mean(),
        "has at least 1 spend": u.has_spend.mean(),
        "KYC passed": passed.mean(),
        "top-up AND spend": (u.has_topup & u.has_spend).mean(),
        "KYC passed AND spend": (passed & u.has_spend).mean(),
        "KYC passed AND top-up AND spend": (passed & u.has_topup & u.has_spend).mean(),
    }
    for name, rate in candidates.items():
        print(f"  {name:35s} {rate:6.1%}")
    print("\n'KYC passed AND spend' lands on 77.9% - that is the ~78% Marketing quotes.")
    print("Proposed stricter definition: KYC passed AND funded AND at least one spend = "
          f"{candidates['KYC passed AND top-up AND spend']:.1%}")

    # Sensitivity: how the strict rate moves if we also demand N spends and
    # drop the accounts that turned out to be fraudulent.
    strict_base = passed & u.has_topup & ~u.has_fraud
    ns = range(1, 11)
    curve = [(strict_base & (u.n_spend >= k)).mean() for k in ns]
    print("\nSensitivity (KYC + funded + >=N spends, fraud accounts excluded):")
    for k, rate in zip(ns, curve):
        print(f"  N={k:2d}  {rate:6.1%}")

    # Figure 1: the funnel.
    stages = [
        ("All users in the data", 1.0),
        ("KYC passed", passed.mean()),
        ("+ funded (top-up)", (passed & u.has_topup).mean()),
        ("+ at least 1 spend", (passed & u.has_topup & u.has_spend).mean()),
    ]
    fig, ax = plt.subplots(figsize=(8, 3.6))
    labels = [s[0] for s in stages][::-1]
    values = [s[1] * 100 for s in stages][::-1]
    colors = BLUE_RAMP[:4][::-1]  # darkest bar = final stage, drawn first
    bars = ax.barh(labels, values, color=colors, height=0.62)
    for bar, val in zip(bars, values):
        count = int(round(val / 100 * n))
        ax.text(val + 1, bar.get_y() + bar.get_height() / 2,
                f"{val:.1f}%  ({count:,})", va="center", color=SUB, fontsize=9)
    ax.axvline(78, color=RED, linewidth=1.2, linestyle="--")
    ax.text(79, -0.28, "Marketing's ~78%", color=RED, fontsize=9, va="center")
    ax.set_ylim(-0.55, 3.5)
    ax.set_xlim(0, 112)
    ax.set_xlabel("% of users")
    ax.set_title("Conversion funnel: verified, funded accounts that actually spend")
    ax.grid(axis="y", visible=False)
    save(fig, "brief1_funnel")

    # Figure 2: sensitivity curve.
    fig, ax = plt.subplots(figsize=(7, 3.8))
    ax.axhspan(77, 79, color=GRID, alpha=0.7, zorder=0)
    ax.text(10.1, 78, "Marketing's ~78%", color=MUTED, fontsize=9, va="center", ha="right")
    ax.plot(list(ns), [c * 100 for c in curve], color=BLUE, linewidth=2,
            marker="o", markersize=5)
    for k, val in [(1, curve[0]), (3, curve[2]), (10, curve[9])]:
        ax.annotate(f"{val:.1%}", (k, val * 100), textcoords="offset points",
                    xytext=(6, 8), fontsize=9, color=INK)
    ax.set_xticks(list(ns))
    ax.set_xlabel("Minimum number of spend transactions required (N)")
    ax.set_ylabel("% of users converted")
    ax.set_title("Stricter definitions never get close to 78%")
    ax.grid(axis="x", visible=False)
    save(fig, "brief1_sensitivity")


if __name__ == "__main__":
    main()
