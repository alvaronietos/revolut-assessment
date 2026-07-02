"""Shared data loading and normalisation for the fin-crime analysis.

Every brief script imports from this module so that FX rates, the
merchant-country parser and the definition of "spend" stay consistent
across the whole project (and match the FraudLens app constants).
"""

from __future__ import annotations

import re
import urllib.parse
from pathlib import Path

import numpy as np
import pandas as pd

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "fin_crime_data.csv"

# Static FX snapshot to GBP. GBP + EUR cover ~88% of rows, so a fixed table is
# an acceptable simplification here; the residual error is bounded and noted in
# the report. Currencies not in this table (exotic fiat and crypto) are left
# unconverted and counted separately: crypto amounts are not minor units, so a
# naive AMOUNT/100 * rate would poison every aggregate they touch.
FX_TO_GBP = {
    "GBP": 1.0, "EUR": 0.85, "USD": 0.79, "PLN": 0.20, "RON": 0.17,
    "CHF": 0.88, "NOK": 0.075, "AUD": 0.52, "DKK": 0.114, "SEK": 0.075,
    "CZK": 0.034, "JPY": 0.0052, "CAD": 0.57, "HUF": 0.0021,
}

# Currencies whose smallest unit is the major unit (no /100 division).
ZERO_DECIMAL = {"JPY", "KRW", "VND", "CLP", "ISK"}

# The dataset has no timestamps. Birth years stop at 2000, so I anchor ages to
# an assumed observation year rather than today's date.
ERA_YEAR = 2020

# "Spend" = money leaving the account. Everything except TOPUP.
SPEND_TYPES = ["CARD_PAYMENT", "P2P", "ATM", "BANK_TRANSFER"]

US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
    "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
    "WI", "WY", "DC",
}

CA_PROVINCES = {
    "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK",
    "YT",
}

ISO3_TO_ISO2 = {
    "ABW": "AW", "AFG": "AF", "AGO": "AO", "AIA": "AI", "ALA": "AX",
    "ALB": "AL", "AND": "AD", "ARE": "AE", "ARG": "AR", "ARM": "AM",
    "ASM": "AS", "ATG": "AG", "AUS": "AU", "AUT": "AT", "AZE": "AZ",
    "BDI": "BI", "BEL": "BE", "BEN": "BJ", "BFA": "BF", "BGD": "BD",
    "BGR": "BG", "BHR": "BH", "BHS": "BS", "BIH": "BA", "BLR": "BY",
    "BLZ": "BZ", "BMU": "BM", "BOL": "BO", "BRA": "BR", "BRB": "BB",
    "BRN": "BN", "BTN": "BT", "BWA": "BW", "CAF": "CF", "CAN": "CA",
    "CHE": "CH", "CHL": "CL", "CHN": "CN", "CIV": "CI", "CMR": "CM",
    "COD": "CD", "COG": "CG", "COK": "CK", "COL": "CO", "CPV": "CV",
    "CRI": "CR", "CUB": "CU", "CUW": "CW", "CYM": "KY", "CYP": "CY",
    "CZE": "CZ", "DEU": "DE", "DJI": "DJ", "DMA": "DM", "DNK": "DK",
    "DOM": "DO", "DZA": "DZ", "ECU": "EC", "EGY": "EG", "ERI": "ER",
    "ESP": "ES", "EST": "EE", "ETH": "ET", "FIN": "FI", "FJI": "FJ",
    "FRA": "FR", "FRO": "FO", "FSM": "FM", "GAB": "GA", "GBR": "GB",
    "GEO": "GE", "GGY": "GG", "GHA": "GH", "GIB": "GI", "GIN": "GN",
    "GLP": "GP", "GMB": "GM", "GNB": "GW", "GNQ": "GQ", "GRC": "GR",
    "GRD": "GD", "GRL": "GL", "GTM": "GT", "GUF": "GF", "GUM": "GU",
    "GUY": "GY", "HKG": "HK", "HND": "HN", "HRV": "HR", "HTI": "HT",
    "HUN": "HU", "IDN": "ID", "IMN": "IM", "IND": "IN", "IRL": "IE",
    "IRN": "IR", "IRQ": "IQ", "ISL": "IS", "ISR": "IL", "ITA": "IT",
    "JAM": "JM", "JEY": "JE", "JOR": "JO", "JPN": "JP", "KAZ": "KZ",
    "KEN": "KE", "KGZ": "KG", "KHM": "KH", "KIR": "KI", "KNA": "KN",
    "KOR": "KR", "KWT": "KW", "LAO": "LA", "LBN": "LB", "LBR": "LR",
    "LBY": "LY", "LCA": "LC", "LIE": "LI", "LKA": "LK", "LSO": "LS",
    "LTU": "LT", "LUX": "LU", "LVA": "LV", "MAC": "MO", "MAR": "MA",
    "MCO": "MC", "MDA": "MD", "MDG": "MG", "MDV": "MV", "MEX": "MX",
    "MHL": "MH", "MKD": "MK", "MLI": "ML", "MLT": "MT", "MMR": "MM",
    "MNE": "ME", "MNG": "MN", "MOZ": "MZ", "MRT": "MR", "MTQ": "MQ",
    "MUS": "MU", "MWI": "MW", "MYS": "MY", "NAM": "NA", "NCL": "NC",
    "NER": "NE", "NGA": "NG", "NIC": "NI", "NLD": "NL", "NOR": "NO",
    "NPL": "NP", "NZL": "NZ", "OMN": "OM", "PAK": "PK", "PAN": "PA",
    "PER": "PE", "PHL": "PH", "PLW": "PW", "PNG": "PG", "POL": "PL",
    "PRI": "PR", "PRT": "PT", "PRY": "PY", "PSE": "PS", "PYF": "PF",
    "QAT": "QA", "REU": "RE", "ROU": "RO", "RUS": "RU", "RWA": "RW",
    "SAU": "SA", "SDN": "SD", "SEN": "SN", "SGP": "SG", "SLB": "SB",
    "SLE": "SL", "SLV": "SV", "SMR": "SM", "SOM": "SO", "SRB": "RS",
    "SSD": "SS", "STP": "ST", "SUR": "SR", "SVK": "SK", "SVN": "SI",
    "SWE": "SE", "SWZ": "SZ", "SXM": "SX", "SYC": "SC", "SYR": "SY",
    "TCA": "TC", "TCD": "TD", "TGO": "TG", "THA": "TH", "TJK": "TJ",
    "TKM": "TM", "TLS": "TL", "TON": "TO", "TTO": "TT", "TUN": "TN",
    "TUR": "TR", "TUV": "TV", "TWN": "TW", "TZA": "TZ", "UGA": "UG",
    "UKR": "UA", "URY": "UY", "USA": "US", "UZB": "UZ", "VAT": "VA",
    "VCT": "VC", "VEN": "VE", "VGB": "VG", "VIR": "VI", "VNM": "VN",
    "VUT": "VU", "WSM": "WS", "YEM": "YE", "ZAF": "ZA", "ZMB": "ZM",
    "ZWE": "ZW",
    # Legacy codes that still show up in card acquirer data.
    "ROM": "RO", "ANT": "AN",
}

VALID_ISO2 = set(ISO3_TO_ISO2.values())

_TRAILING_ALPHA = re.compile(r"([A-Za-z]+)[^A-Za-z]*$")


def to_major(amount, currency):
    """Convert an integer amount in minor units to major units."""
    return amount if currency in ZERO_DECIMAL else amount / 100.0


def amount_gbp(amount, currency):
    """Amount in GBP, or 0.0 for currencies outside the FX table."""
    rate = FX_TO_GBP.get(currency)
    if rate is None:
        return 0.0
    return to_major(amount, currency) * rate


def parse_merchant_country(raw):
    """Normalise the messy MERCHANT_COUNTRY field to ISO2.

    The raw field mixes ISO3 codes, US state / Canadian province codes and
    URL-encoded free text with the country tucked at the end ("PRAHA%201
    ...CZE", sometimes encoded twice). Two-letter codes are checked against
    the state sets BEFORE ISO2 on purpose: in this data "CA" is California
    and "ON" is Ontario, never Canada.

    Returns an ISO2 code, "UNKNOWN" for unparseable values, or None for
    missing ones.
    """
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return None
    s = str(raw).strip()
    if s == "":
        return None
    if len(s) > 3:
        for _ in range(3):  # handle double-encoded values
            decoded = urllib.parse.unquote(s)
            if decoded == s:
                break
            s = decoded
        match = _TRAILING_ALPHA.search(s)
        if not match:
            return "UNKNOWN"
        token = match.group(1).upper()
        if len(token) >= 3:
            return ISO3_TO_ISO2.get(token[-3:], "UNKNOWN")
        s = token  # a trailing 2-letter token: fall through to the state logic
    s = s.upper()
    if len(s) == 2:
        if s in US_STATES:
            return "US"
        if s in CA_PROVINCES:
            return "CA"
        if s in VALID_ISO2:
            return s
        return "UNKNOWN"
    if len(s) == 3:
        return ISO3_TO_ISO2.get(s, "UNKNOWN")
    return "UNKNOWN"


def load_data(path=DATA_PATH):
    """Load the transactions CSV and add the derived columns used everywhere.

    Adds:
      AMOUNT_GBP    amount converted to GBP (0.0 when the currency is not in
                    the FX table; use FX_CONVERTED to exclude those rows)
      FX_CONVERTED  whether the currency was in the FX table
      MERCHANT_ISO2 normalised merchant country (None when missing)
      AGE           ERA_YEAR - BIRTH_YEAR
      IS_SPEND      True for outbound transaction types
    """
    df = pd.read_csv(path)
    df["FX_CONVERTED"] = df["CURRENCY"].isin(FX_TO_GBP)
    rate = df["CURRENCY"].map(FX_TO_GBP).fillna(0.0)
    minor_divisor = np.where(df["CURRENCY"].isin(ZERO_DECIMAL), 1.0, 100.0)
    df["AMOUNT_GBP"] = df["AMOUNT"] / minor_divisor * rate
    df["MERCHANT_ISO2"] = df["MERCHANT_COUNTRY"].map(parse_merchant_country)
    df["AGE"] = ERA_YEAR - df["BIRTH_YEAR"]
    df["IS_SPEND"] = df["TYPE"].isin(SPEND_TYPES)
    return df


def data_quality(df):
    """Small data-quality summary for the report appendix."""
    p999 = df.loc[df["FX_CONVERTED"], "AMOUNT_GBP"].quantile(0.999)
    merchant = df["MERCHANT_ISO2"].dropna()
    checks = {
        "rows": len(df),
        "distinct users": df["USER_ID"].nunique(),
        "zero-amount rows": int((df["AMOUNT"] == 0).sum()),
        "negative-amount rows": int((df["AMOUNT"] < 0).sum()),
        "fully duplicated rows": int(df.duplicated().sum()),
        f"rows above GBP p99.9 ({p999:,.0f})": int(
            (df.loc[df["FX_CONVERTED"], "AMOUNT_GBP"] > p999).sum()
        ),
        "rows in unconverted currencies": int((~df["FX_CONVERTED"]).sum()),
        "missing merchant country": int(df["MERCHANT_ISO2"].isna().sum()),
        "unparseable merchant country": int((merchant == "UNKNOWN").sum()),
    }
    return pd.Series(checks, name="count")


if __name__ == "__main__":
    frame = load_data()
    print(f"Loaded {len(frame):,} rows, {frame['USER_ID'].nunique():,} users")
    print()
    print(data_quality(frame).to_string())
    merchant = frame["MERCHANT_ISO2"].dropna()
    unknown_share = (merchant == "UNKNOWN").mean()
    print(f"\nUnparseable merchant-country share: {unknown_share:.3%} of non-null")
