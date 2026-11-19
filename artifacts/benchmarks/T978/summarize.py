"""Record the exact observed coverage and band misses from the final-source calibration."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
from statistics import mean
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "T977"))
from summarize import era_summary


def read(path):
    return json.loads(path.read_text())


def ratio(hits, n):
    return hits / n if n else None


def no_missing(values, count):
    assert len(values) == count, (len(values), count)
    return values


def levels(seasons):
    misses, reversals = [], []
    points = 0
    high = []
    by_tier = defaultdict(list)
    for seed, season in seasons:
        year = season["year"]
        if 1946 <= year <= 1948:
            continue
        if year >= 1935:
            high.append(season["lowerClubsAbove85"])
        for country, tiers in season["divisionLevels"].items():
            ordered = sorted(tiers.items())
            if any(a[1]["mean"] <= b[1]["mean"] for a, b in zip(ordered, ordered[1:])):
                reversals.append([seed, year, country, tiers])
            if year < 1935:
                continue
            for tier, value in ordered:
                target = 80 - 10 * int(tier[-1])
                observed = value["mean"]
                points += 1
                by_tier[tier].append(observed)
                if abs(observed - target) > 4:
                    misses.append([seed, year, country, tier, target, observed])
    return {
        "byTier": {
            tier: {"mean": mean(values), "min": min(values), "max": max(values), "cells": len(values)}
            for tier, values in sorted(by_tier.items())
        },
        "testedCells": points,
        "withinFour": points - len(misses),
        "misses": misses,
        "reversals": reversals,
        "lowerClubsAbove85PerOpening": mean(high) if high else None,
    }


def moves(seasons):
    divisions = defaultdict(Counter)
    seasons_by_year = defaultdict(Counter)
    for _, season in seasons:
        for country, tiers in season["upwardFunnel"].items():
            for tier, row in tiers.items():
                tracked = row["tracked"]
                moved = round((row["shareMovedUp"] or 0) * tracked)
                for tally in (divisions[f"{country}:{tier}"], seasons_by_year[season["year"]]):
                    tally.update({"tracked": tracked, "movedUp": moved})
                    for key in ("bids", "sellerRefused", "playerRefused", "buyerRefused", "completed"):
                        if row[key] is not None:
                            tally[key] += row[key]
    by_division = {
        group: {**counts, "shareMovedUp": ratio(counts["movedUp"], counts["tracked"])}
        for group, counts in sorted(divisions.items())
    }
    by_year = {}
    for year, counts in sorted(seasons_by_year.items()):
        share = ratio(counts["movedUp"], counts["tracked"])
        bounds = (0.20, 0.30) if year < 1990 else (0.40, 0.60)
        by_year[year] = {
            **counts,
            "share": share,
            "band": bounds,
            "inside": share is not None and bounds[0] <= share <= bounds[1],
        }
    tracked = sum(row["tracked"] for row in by_year.values())
    moved = sum(row["movedUp"] for row in by_year.values())
    return {"byDivision": by_division, "byYear": by_year, "share": ratio(moved, tracked)}


def renewals(seasons):
    keys = ["offered", "accepted", "refused", "releasedUnoffered"]
    assert all(season["renewals"]["status"] == "observed" for _, season in seasons)
    totals = {key: sum(season["renewals"][key] for _, season in seasons) for key in keys}
    return {
        "observed": True,
        **totals,
        "acceptedShare": ratio(totals["accepted"], totals["offered"]),
        "offeredMinusAnswers": totals["offered"] - totals["accepted"] - totals["refused"],
    }


def ages(runs):
    histogram = Counter()
    peak = {key: Counter() for key in ("through34", "through37")}
    loss = Counter()
    for run in runs:
        row = run["ageingCareers"]
        histogram.update({int(age): count for age, count in row["onsetAges"].items()})
        loss.update(row["twoYearLoss"])
        for key in peak:
            peak[key].update(row["nearPeak"][key])
    return {
        "onsets": dict(sorted(histogram.items())),
        "under27": ratio(sum(n for age, n in histogram.items() if age < 27), histogram.total()),
        "ages28through32": ratio(sum(histogram[age] for age in range(28, 33)), histogram.total()),
        "regulars": {
            key: {**counts, "shareStayed": ratio(counts["stayed"], counts["eligible"])}
            for key, counts in peak.items()
        },
        "twoYearLoss": {**loss, "share": ratio(loss["lostSix"], loss["observed"])},
    }


def champions(histories):
    worlds = {}
    for history in histories:
        count = defaultdict(Counter)
        for year in history["titles"]:
            for country, club in year["champions"].items():
                count[country][club] += 1
        worlds[history["seed"]] = {
            country: {
                "clubs": len(titles),
                "mostTitles": max(titles.values()),
                "inside": 4 <= len(titles) <= 9 and 7 <= max(titles.values()) <= 17,
                "titles": dict(titles),
            }
            for country, titles in sorted(count.items())
        }
    return worlds


def quotes(histories):
    years = defaultdict(list)
    for source in histories:
        for row in source:
            if row.get("values"):
                years[row["year"]].append(row["values"])
    result = {}
    for year, rows in sorted(years.items()):
        dearest = mean(row["dearestToRecord"] for row in rows)
        published = [row["meanToPublishedFee"] for row in rows if "meanToPublishedFee" in row]
        average = mean(published) if published else None
        result[year] = {
            "worlds": len(rows),
            "players": sum(row["players"] for row in rows),
            "dearestToRecord": dearest,
            "dearestInside": 0.5 <= dearest <= 1.0,
            "meanToPublishedFee": average,
            "meanInside": 0.6 <= average <= 1.4 if average is not None else None,
        }
    return result


def market_runs(root, name, seeds, start, length):
    data = read(root / f"{name}.json")
    runs = data["runs"]
    assert [run["seed"] for run in runs] == [f"market-{i}" for i in range(seeds)]
    for run in runs:
        assert run["start"] == start and len(run["seasons"]) == length, run["seed"]
        if start.startswith("lived:"):
            year = int(start.split(":")[1])
            assert [season["year"] for season in run["seasons"]] == list(range(year, year + length))
        else:
            assert [row["year"] for row in run["burnIn"]] == [1930, 1931]
            assert [row["year"] for row in run["seasons"]] == [
                *range(1932, 1939), *range(1946, 1976)
            ]
            assert run["finalYear"] == 1976
    seasons = [(run["seed"], season) for run in runs for season in run["seasons"]]
    return {
        "market": moves(seasons),
        "renewals": renewals(seasons),
        "books": era_summary([s for _, s in seasons]),
        "levels": levels(seasons),
        "ageingCareers": ages(runs),
        "meta": data["meta"],
    }


def main(root):
    built = no_missing([read(path) for path in sorted(root.glob("build-*.json"))], 4)
    continued = no_missing([read(path) for path in sorted(root.glob("history-*.json"))], 3)
    aggregate = no_missing([read(path) for path in sorted(root.glob("lived-parity-*.json"))], 3)
    curve = read(root / "aggregate-curve.json")
    assert not curve["partial"]
    all_receipts = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.glob("*.json"))
        if path.name != "results.json"
    }
    return {
        "fresh1930": market_runs(root, "fresh-1930", 3, "fresh:1930", 37),
        "lived1951": market_runs(root, "lived-1951", 4, "lived:1951", 5),
        "lived1995": market_runs(root, "lived-1995", 4, "lived:1995", 5),
        "champions": champions(continued),
        "values": quotes([
            *[[row for row in job["values"] if row["year"] < 1995] for job in built],
            *[job["transferQuotes"] for job in continued],
        ]),
        "aggregate": {
            "wholeSeasons": aggregate,
            "controlledOutcomeCurve": curve["outcomeCurve"],
            "controlledCore": [
                row for row in curve["conditions"] if row["family"] == "core"
            ],
            "controlledProvenance": curve["provenance"],
        },
        "sha256": all_receipts,
    }


if __name__ == "__main__":
    print(json.dumps(main(Path(sys.argv[1])), indent=2))
