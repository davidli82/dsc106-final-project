"""Create the prototype CSV from the CMIP6 source CSV linked under Data and methods."""

import argparse
import csv
from itertools import product
from math import isfinite
from pathlib import Path


PATHWAYS = {"ssp126": "SSP1-2.6", "ssp245": "SSP2-4.5", "ssp585": "SSP5-8.5"}
DECADES = tuple(f"{year}-{year + 9}" for year in range(2021, 2100, 10))
COMPARISONS = tuple(product(PATHWAYS, DECADES))


def prepare(source, destination):
    values = {}
    with source.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            pathway, period = row["exp"], row["period"]
            if (pathway, period) not in COMPARISONS:
                continue
            if row["varn"] != "tas" or row["postprocess"] != "global_mean":
                continue
            value = row["mean"].strip()
            if not value or not isfinite(float(value)):
                continue
            key = (row["model"], pathway, period)
            if key in values:
                raise ValueError(f"More than one simulation value for {key}")
            values[key] = value

    models = sorted({model for model, _, _ in values})
    matched = [
        model for model in models
        if all((model, pathway, period) in values for pathway, period in COMPARISONS)
    ]
    if len(matched) != 40:
        raise ValueError(f"Expected 40 matched models, found {len(matched)}")

    with destination.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(("model", "pathway", "period", "warming_c"))
        for pathway, period in COMPARISONS:
            for model in matched:
                writer.writerow((model, PATHWAYS[pathway], period, values[model, pathway, period]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("warming.csv"))
    args = parser.parse_args()
    prepare(args.source, args.output)
