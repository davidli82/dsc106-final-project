const pathways = [
  { id: "SSP1-2.6", className: "low", dash: null },
  { id: "SSP2-4.5", className: "middle", dash: "7 4" },
  { id: "SSP5-8.5", className: "high", dash: "2 4" },
];
const chart = document.querySelector("#chart");
const decade = document.querySelector("#decade");
const thresholdOptions = document.querySelector(".threshold");
const formatPeriod = (period) => period.replace("-", "–");

function summarize(rows) {
  const decades = [...new Set(rows.map((row) => row.period))].sort();
  const byPathway = d3.group(rows, (row) => row.pathway, (row) => row.period);
  const series = pathways.map((pathway) => ({
    ...pathway,
    values: decades.map((period) => {
      const models = byPathway.get(pathway.id)?.get(period) ?? [];
      const temperatures = models.map((row) => row.warming);
      if (models.length !== 40 || new Set(models.map((row) => row.model)).size !== 40) {
        throw new Error(`Expected 40 distinct models for ${pathway.id}, ${period}`);
      }
      return { period, temperatures, median: d3.median(temperatures) };
    }),
  }));
  if (decades.length !== 8) {
    throw new Error("Expected eight decades of model data");
  }
  return { decades, series };
}

function drawChart(width, decades, series, selected, threshold) {
  const compact = width < 540;
  const height = compact ? 255 : 285;
  const left = 28;
  const right = width - 84;
  const top = 16;
  const bottom = height - 47;
  const x = d3.scalePoint(decades, [left + 8, right]);
  const y = d3.scaleLinear([0, 6], [bottom, top]);
  const selectedX = x(selected);
  const bandLeft = Math.max(left, selectedX - x.step() * 0.3);
  const bandRight = Math.min(right, selectedX + x.step() * 0.3);
  const svg = d3.select(chart).selectAll("svg").data([null]).join("svg");
  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
    .attr("aria-labelledby", "chart-title chart-description");
  svg.selectAll("*").remove();
  svg.append("title").attr("id", "chart-title").text("Median warming across three climate pathways");
  svg.append("desc").attr("id", "chart-description")
    .text(`The pathways separate over eight decades. The shaded column marks ${formatPeriod(selected)}, and the dashed horizontal line marks ${threshold}°C.`);

  svg.append("rect").attr("class", "selected-band")
    .attr("x", bandLeft).attr("y", top)
    .attr("width", bandRight - bandLeft).attr("height", bottom - top);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${left},0)`)
    .call(d3.axisLeft(y).tickValues(d3.range(0, 7)).tickSize(left - right).tickFormat(""))
    .call((group) => group.select(".domain").remove());
  svg.append("g").attr("class", "axis").attr("transform", `translate(${left},0)`)
    .call(d3.axisLeft(y).tickValues(d3.range(0, 7)).tickFormat(d3.format("d")).tickSize(0).tickPadding(7))
    .call((group) => group.select(".domain").remove());

  const ticks = compact ? [decades[0], decades[3], decades.at(-1)] : decades;
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${bottom})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickFormat((period) => period.slice(-4))
      .tickSize(5).tickPadding(7));
  svg.append("text").attr("x", (left + right) / 2).attr("y", height - 6)
    .attr("text-anchor", "middle").text("End year of decade");
  svg.append("line").attr("class", "selected-line")
    .attr("x1", selectedX).attr("x2", selectedX).attr("y1", top).attr("y2", bottom);
  svg.append("line").attr("class", "threshold-line")
    .attr("x1", left).attr("x2", right).attr("y1", y(threshold)).attr("y2", y(threshold));

  const line = d3.line().x((point) => x(point.period)).y((point) => y(point.median));
  const paths = svg.selectAll(".pathway").data(series).join("g").attr("class", "pathway")
    .style("color", (pathway) => `var(--${pathway.className})`);
  paths.append("path").attr("fill", "none").attr("stroke", "currentColor")
    .attr("stroke-width", 2.7).attr("stroke-linecap", "round")
    .attr("stroke-dasharray", (pathway) => pathway.dash)
    .attr("d", (pathway) => line(pathway.values));
  paths.append("circle").attr("cx", selectedX)
    .attr("cy", (pathway) => y(pathway.values.find((point) => point.period === selected).median))
    .attr("r", 4).attr("fill", "currentColor").attr("stroke", "white").attr("stroke-width", 1);
  paths.append("text").attr("class", "direct-label").attr("x", right + 8)
    .attr("y", (pathway) => y(pathway.values.at(-1).median)).attr("dy", ".32em")
    .style("fill", "currentColor").text((pathway) => pathway.id);
}

function updateResults(series, periodIndex, threshold) {
  const formatMedian = d3.format(".1f");
  const results = series.map((pathway) => {
    const { temperatures, median } = pathway.values[periodIndex];
    return {
      ...pathway,
      median: formatMedian(median),
      count: temperatures.filter((value) => value >= threshold).length,
      total: temperatures.length,
    };
  });
  const cards = d3.select("#results").selectAll(".result-card")
    .data(results, (result) => result.id).join(
      (enter) => {
        const card = enter.append("div").attr("class", (result) => `result-card ${result.className}`);
        card.append("h4").text((result) => result.id);
        const count = card.append("p").attr("class", "result-count");
        count.append("span").attr("class", "result-value");
        count.append("span").attr("class", "result-total");
        card.append("p").attr("class", "result-median");
        return card;
      },
    );
  cards.select(".result-value").text((result) => result.count);
  cards.select(".result-total").text((result) => ` of ${result.total}`);
  cards.select(".result-median").text((result) => `${result.median}°C median`);
  return results;
}

async function start() {
  const status = document.querySelector("#load-status");
  const explorer = document.querySelector("#explorer");
  try {
    const rows = await d3.csv("./warming.csv", (row) => ({
      model: row.model,
      pathway: row.pathway,
      period: row.period,
      warming: row.warming_c.trim() === "" ? NaN : Number(row.warming_c),
    }));
    if (rows.some((row) => !Number.isFinite(row.warming))) {
      throw new Error("Missing or invalid warming value");
    }
    const { decades, series } = summarize(rows);
    const periodLabel = document.querySelector("#period-label");
    const thresholdLabel = document.querySelector("#threshold-label");
    const summary = document.querySelector("#summary");
    let selectedPeriod;
    let threshold;

    function renderChart() {
      const width = chart.clientWidth;
      if (width > 0) drawChart(width, decades, series, selectedPeriod, threshold);
    }

    function update() {
      const index = decade.valueAsNumber;
      selectedPeriod = decades[index];
      threshold = Number(thresholdOptions.querySelector("input:checked").value);
      const label = formatPeriod(selectedPeriod);
      periodLabel.value = label;
      decade.setAttribute("aria-valuetext", label);
      thresholdLabel.textContent = `${threshold}°C`;
      const results = updateResults(series, index, threshold);
      const counts = results.map((result) => `${result.id}, ${result.count} of ${result.total}`);
      summary.textContent = `${label}. Models averaging at least ${threshold}°C. ${counts.join(". ")}.`;
      renderChart();
    }

    explorer.hidden = false;
    update();
    status.hidden = true;
    decade.addEventListener("input", update);
    thresholdOptions.addEventListener("change", update);
    new ResizeObserver(renderChart).observe(chart);
  } catch (error) {
    explorer.hidden = true;
    status.textContent = "The interactive chart could not load. Refresh the page to retry.";
    console.error(error);
  }
}

start();
