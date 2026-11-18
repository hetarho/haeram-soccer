"""Summarize every candidate's paired lived seasons without dropping missing reads."""

import hashlib
import json
from pathlib import Path
from statistics import mean, median
import sys


WAGE_BANDS = {
    "top": (0.45, 0.65),
    "middle": (0.55, 0.75),
    "bottom": (0.60, 0.85),
    "tier2": (0.70, 1.10),
    "tier3": (0.60, 1.00),
    "tier4": (0.60, 1.00),
}
BOOK_RATIOS = (
    "wagesToIncome", "costsToIncome", "operatingResultToIncome",
    "feesReceivedToIncome", "netFeesToIncome", "cashToIncome", "debtToFixedCosts",
)


def sampled_median(values):
    samples = [value for value in values if value is not None]
    return median(samples) if samples else None


def bands_for(seasons, country=None):
    by_group = {group: [] for group in WAGE_BANDS}
    for season in seasons:
        for association, book in season["books"].items():
            if country is not None and association != country:
                continue
            for third in ("top", "middle", "bottom"):
                by_group[third].append(book["topFlightThirds"][third])
            for tier in ("tier2", "tier3", "tier4"):
                row = book["byTier"].get(f"tier{int(tier[-1]) - 1}")
                if row:
                    by_group[tier].append(row)
    result = {}
    for group, rows in by_group.items():
        reading = {
            **{key: sampled_median(row["median"][key] for row in rows) for key in BOOK_RATIOS},
            "operatingLossShare": (
                sum(row["operatingLossShare"] * row["clubs"] for row in rows if row["clubs"])
                / sum(row["clubs"] for row in rows)
                if any(row["clubs"] for row in rows)
                else None
            ),
            "clubSeasons": sum(row["clubs"] for row in rows),
        }
        low, high = WAGE_BANDS[group]
        wage = reading["wagesToIncome"]
        reading["wagesInside"] = wage is not None and low <= wage <= high
        if group != "top":
            loss = reading["operatingLossShare"]
            fees = reading["feesReceivedToIncome"]
            reading["operatingLossInside"] = loss is not None and loss >= 0.5
            reading["feesInside"] = fees is not None and fees >= 0.1
        result[group] = reading
    return result


def error(value, bounds):
    low, high = bounds
    return max(low - value, 0, value - high)


def era_summary(seasons, quotes=None):
    if quotes is None:
        quotes = seasons
    by_year = {}
    for year in sorted({season["year"] for season in seasons}):
        rows = [season for season in seasons if season["year"] == year]
        by_year[year] = bands_for(rows)
    bands = bands_for(seasons)
    countries = sorted({country for season in seasons for country in season["books"]})
    observed = all(season["distress"]["status"] == "observed" for season in seasons)
    entries = {
        country: {
            f"stage{stage}": sum(
                season["distress"]["byCountry"][country]["entries"][f"stage{stage}"]
                for season in seasons
            )
            for stage in (1, 2, 3)
        }
        for country in countries
    } if observed else None
    administration = {
        country: 10 * counts["stage3"] / sum(country in season["books"] for season in seasons)
        for country, counts in entries.items()
    } if entries is not None else None
    return {
        "books": bands,
        "byCountry": {country: bands_for(seasons, country) for country in countries},
        "byYear": by_year,
        "wageBandError": mean(
            error(read["wagesToIncome"], WAGE_BANDS[group])
            for group, read in bands.items()
        ),
        "distressEntries": entries,
        "stage3PerCountryDecade": administration,
        "stage3Inside": {
            country: 0.5 <= rate <= 3
            for country, rate in administration.items()
        } if administration is not None else None,
        "pointsDeducted": {
            country: sum(
                season["distress"]["byCountry"][country]["pointsDeducted"]
                for season in seasons
            )
            for country in countries
        } if observed else None,
        "transferValues": {
            year: {
                "worlds": len(values),
                "players": sum(row["players"] for row in values),
                "dearestToRecord": mean(row["dearestToRecord"] for row in values),
                "meanToPublishedFee": sampled_median(row.get("meanToPublishedFee") for row in values),
            }
            for year in sorted({season["year"] for season in quotes})
            if (values := [
                row["transferValues"] for row in quotes
                if row["year"] == year and "transferValues" in row
            ])
        },
    }


def read_era(root, candidate, era):
    seasons = []
    quotes = []
    receipts = []
    count = 9 if era == 1995 else 5
    for seed in range(3):
        path = root / candidate / f"{era}-{seed}.json"
        raw = path.read_bytes()
        data = json.loads(raw)
        (run,) = data["runs"]
        if run["seed"] != f"market-{seed}" or [s["year"] for s in run["seasons"]] != list(
            range(era, era + count)
        ):
            raise ValueError(path)
        seasons.extend(run["seasons"][:5])
        quotes.extend(run["seasons"])
        receipts.append({
            "command": data["meta"]["command"],
            "seconds": data["meta"]["seconds"],
            "source": data["meta"]["source"],
            "identity": data["meta"]["identity"]["sha256"],
            "environment": data["meta"]["environment"],
            "output": path.name,
            "sha256": hashlib.sha256(raw).hexdigest(),
        })
    return {**era_summary(seasons, quotes), "receipts": receipts}


def main(root):
    shapes = json.loads((root / "wage-shape.json").read_text())
    result = {}
    for candidate, shape in shapes.items():
        eras = {era: read_era(root, candidate, era) for era in (1951, 1995)}
        result[candidate] = {
            "shape": shape,
            "meanWageBandError": mean(row["wageBandError"] for row in eras.values()),
            "eras": eras,
        }
    chosen = min(
        result,
        key=lambda candidate: (
            result[candidate]["meanWageBandError"],
            result[candidate]["shape"]["tunables"]["MARKET_CONFIG"]["wage"],
        ),
    )
    return {"wageBands": WAGE_BANDS, "selected": chosen, "candidates": result}


if __name__ == "__main__":
    print(json.dumps(main(Path(sys.argv[1])), indent=2))
