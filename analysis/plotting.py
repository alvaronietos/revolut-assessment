"""Shared matplotlib styling for the report figures.

One base colour for general series, one red reserved for fraud/risk, and a
blue ordinal ramp for staged charts. Keeping this in one place so every
figure in the report looks like it belongs to the same document.
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

FIG_DIR = Path(__file__).resolve().parent / "figures"

BLUE = "#2a78d6"   # base series
RED = "#d03b3b"    # fraud / risk accent, never used for anything else
INK = "#0b0b0b"
SUB = "#52514e"
MUTED = "#898781"
LIGHT = "#c3c2b7"
GRID = "#e1e0d9"
BLUE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"]
# Fixed categorical order for the rare multi-series chart.
CATEGORICAL = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7"]


def apply_style():
    plt.rcParams.update({
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "axes.edgecolor": LIGHT,
        "axes.linewidth": 0.8,
        "axes.labelcolor": SUB,
        "axes.titlecolor": INK,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": GRID,
        "grid.linewidth": 0.8,
        "axes.axisbelow": True,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "text.color": INK,
        "font.size": 10,
        "font.family": "sans-serif",
        "legend.frameon": False,
    })


def save(fig, name):
    FIG_DIR.mkdir(exist_ok=True)
    out = FIG_DIR / f"{name}.png"
    fig.savefig(out, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"saved figures/{name}.png")
