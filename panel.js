// Panel rendering — requires D3 loaded globally

const MARGIN  = { top: 8, right: 16, bottom: 28, left: 48 };
const LINE_H  = 180;
const STRIP_H = 16;

const DIR_ARROW = { northbound: "⬆️", southbound: "⬇️", eastbound: "➡️", westbound: "⬅️" };
const DIR_LABEL = { northbound: "North", southbound: "South", eastbound: "East", westbound: "West" };
const DIRECTIONS = ["northbound", "southbound", "eastbound", "westbound"];

const fmt     = v   => v != null ? Math.round(v).toLocaleString() : "—";
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

// --- Info icon tooltip ---

let _infoTip = null;
function getInfoTip() {
  if (!_infoTip) {
    _infoTip = document.createElement("div");
    _infoTip.className = "panel-info-tip";
    document.body.appendChild(_infoTip);
  }
  return _infoTip;
}

function makeInfoIcon(text) {
  const span = document.createElement("span");
  span.className = "info-icon";
  span.textContent = "i";
  span.addEventListener("mouseenter", e => {
    const tip = getInfoTip();
    tip.textContent = text;
    tip.style.left = `${e.clientX + 12}px`;
    tip.style.top  = `${e.clientY - 8}px`;
    tip.classList.add("visible");
  });
  span.addEventListener("mouseleave", () => getInfoTip().classList.remove("visible"));
  return span;
}

function makeSectionHeader(title, infoText) {
  const div = document.createElement("div");
  div.className = "panel-section-header";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = title;
  div.appendChild(titleSpan);
  if (infoText) div.appendChild(makeInfoIcon(infoText));
  return div;
}

// --- Date helpers ---

function fullDateRange(dates, volumes) {
  const byDate = new Map(dates.map((d, i) => [d, volumes[i]]));
  const min = new Date(dates[0]);
  const max = new Date(dates[dates.length - 1]);
  const all = [];
  for (const d = new Date(min); d <= max; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    all.push({ date: new Date(d), volume: byDate.get(key) ?? null });
  }
  return all;
}

// --- Chart ---

function renderChart(container, allDates) {
  const W = container.clientWidth - 32;
  const m = MARGIN;
  const plotW = W - m.left - m.right;

  const svg = d3.select(container).append("svg")
    .attr("width", W).attr("height", LINE_H);

  const x = d3.scaleTime()
    .domain(d3.extent(allDates, d => d.date))
    .range([m.left, W - m.right]);

  const maxVol = d3.max(allDates, d => d.volume) || 1;
  const y = d3.scaleLinear()
    .domain([0, maxVol]).nice()
    .range([LINE_H - m.bottom, m.top]);

  svg.append("g")
    .attr("transform", `translate(0,${LINE_H - m.bottom})`)
    .call(d3.axisBottom(x).ticks(4).tickSizeOuter(0))
    .call(g => g.select(".domain").attr("stroke", "#ddd"))
    .call(g => g.selectAll(".tick line").attr("stroke", "#ddd"));

  svg.append("g")
    .attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0)
      .tickFormat(d => d >= 1000 ? `${d / 1000}k` : d))
    .call(g => g.select(".domain").remove())
    .call(g => g.selectAll(".tick line").attr("stroke", "#eee"));

  // Gap bridges (dashed grey)
  for (let i = 0; i < allDates.length; i++) {
    if (allDates[i].volume !== null && allDates[i + 1]?.volume === null) {
      let j = i + 1;
      while (j < allDates.length && allDates[j].volume === null) j++;
      if (j < allDates.length) {
        svg.append("line")
          .attr("x1", x(allDates[i].date)).attr("y1", y(allDates[i].volume))
          .attr("x2", x(allDates[j].date)).attr("y2", y(allDates[j].volume))
          .attr("stroke", "#ccc").attr("stroke-width", 1)
          .attr("stroke-dasharray", "3,3");
      }
    }
  }

  svg.append("path")
    .datum(allDates)
    .attr("fill", "none")
    .attr("stroke", "#4a90d9")
    .attr("stroke-width", 1.5)
    .attr("d", d3.line()
      .defined(d => d.volume !== null)
      .x(d => x(d.date))
      .y(d => y(d.volume))
    );

  // --- Hover interaction ---
  const bisect = d3.bisector(d => d.date).left;

  const hairline = svg.append("line")
    .attr("y1", m.top).attr("y2", LINE_H - m.bottom)
    .attr("stroke", "#aaa").attr("stroke-width", 1)
    .style("display", "none").style("pointer-events", "none");

  const dot = svg.append("circle")
    .attr("r", 3.5)
    .attr("fill", "#4a90d9").attr("stroke", "#fff").attr("stroke-width", 1.5)
    .style("display", "none").style("pointer-events", "none");

  const labelG = svg.append("g").style("display", "none").style("pointer-events", "none");
  const labelBg  = labelG.append("rect").attr("rx", 4).attr("fill", "#fff")
    .attr("stroke", "#ddd").attr("stroke-width", 1);
  const labelDate = labelG.append("text").attr("font-size", "10px").attr("fill", "#888");
  const labelVal  = labelG.append("text").attr("font-size", "13px").attr("font-weight", "600").attr("fill", "#1a1a2e");

  svg.append("rect")
    .attr("x", m.left).attr("y", m.top)
    .attr("width", plotW).attr("height", LINE_H - m.top - m.bottom)
    .attr("fill", "none").style("pointer-events", "all")
    .on("mousemove", event => {
      const xDate = x.invert(d3.pointer(event)[0]);
      const i = bisect(allDates, xDate);
      const d0 = allDates[i - 1], d1 = allDates[i];
      const d = !d1 ? d0 : !d0 ? d1 : (xDate - d0.date < d1.date - xDate ? d0 : d1);
      if (!d) return;

      const cx = x(d.date);
      hairline.attr("x1", cx).attr("x2", cx).style("display", null);

      if (d.volume != null) {
        dot.attr("cx", cx).attr("cy", y(d.volume)).style("display", null);
      } else {
        dot.style("display", "none");
      }

      const pad = 6, lineH = 15;
      labelDate.text(fmtDate(d.date.toISOString().slice(0, 10)));
      labelVal.text(d.volume != null ? fmt(d.volume) : "No data");

      const lw = Math.max(labelDate.node().getComputedTextLength(),
                          labelVal.node().getComputedTextLength()) + pad * 2;
      const lh = lineH * 2 + pad * 2;
      const lx = cx + 10 + lw > W - m.right ? cx - 10 - lw : cx + 10;
      const ly = m.top + 6;

      labelBg.attr("x", lx).attr("y", ly).attr("width", lw).attr("height", lh);
      labelDate.attr("x", lx + pad).attr("y", ly + pad + 10);
      labelVal.attr("x", lx + pad).attr("y", ly + pad + 10 + lineH);
      labelG.style("display", null);
    })
    .on("mouseleave", () => {
      hairline.style("display", "none");
      dot.style("display", "none");
      labelG.style("display", "none");
    });

  return { W, m, plotW };
}

// --- Coverage strip (HTML, so the header can carry an info icon) ---

function renderCoverage(container, allDates) {
  const missing      = allDates.filter(d => d.volume === null).length;
  const coverageRate = 1 - missing / allDates.length;
  const missRate     = (missing / allDates.length * 100).toFixed(1);

  const section = document.createElement("div");
  section.className = "panel-section";

  const header = makeSectionHeader("Completeness", "Shows the percentage of days for which data is available. Counters may sometimes be inactive or have technical issues, leading to missing data.");
  const badge = document.createElement("span");
  badge.className = "miss-badge";
  badge.style.color = coverageRate > 0.8 ? "#27ae60" : coverageRate > 0.5 ? "#f0a500" : "#e74c3c";
  badge.textContent = `${Math.round(100-missRate)}% complete`;
  header.appendChild(badge);
  section.appendChild(header);

  const fillColor = d3.scaleLinear()
    .domain([0, 0.5, 1])
    .range(["#e74c3c", "#f0a500", "#27ae60"])
    (coverageRate);

  const track = document.createElement("div");
  track.className = "coverage-bar-track";
  const fill = document.createElement("div");
  fill.className = "coverage-bar-fill";
  fill.style.width = `${coverageRate * 100}%`;
  fill.style.background = fillColor;
  track.appendChild(fill);
  section.appendChild(track);

  container.appendChild(section);
}

// --- Directional stats ---

function renderDirectionalStats(container, row) {
  const activeDirs = DIRECTIONS.filter(d => row[`avg_${d}`] != null);
  if (!activeDirs.length) return;

  const section = document.createElement("div");
  section.className = "panel-section";
  section.appendChild(makeSectionHeader("By direction", "Each bike counter location has separate readings for each direction."));

  activeDirs.forEach(dir => {
    const avg      = row[`avg_${dir}`];
    const peak     = row[`peak_${dir}`];
    const peakDate = row[`peak_date_${dir}`];

    const card = document.createElement("div");
    card.className = "dir-card";
    card.innerHTML = `
      <div class="dir-name">${DIR_ARROW[dir]} ${DIR_LABEL[dir]}</div>
      <div class="dir-stats">
        <div class="dir-stat">
          <span class="dir-value">${fmt(avg)}</span>
          <span class="dir-label">avg / day</span>
        </div>
        <div class="dir-stat">
          <span class="dir-value">${fmt(peak)} <span class="dir-date">${fmtDate(peakDate)}</span></span>
          <span class="dir-label">peak</span>
        </div>
      </div>`;
    section.appendChild(card);
  });

  container.appendChild(section);
}

// --- Main entry point ---

function renderPanel(container, row, daily) {
  container.innerHTML = "";

  const title = document.createElement("h2");
  title.className   = "panel-title";
  title.textContent = row.location_name;
  container.appendChild(title);

  if (!daily) return;

  const allDates = fullDateRange(daily.dates, daily.volumes);

  // Daily ridership chart
  const chartSection = document.createElement("div");
  chartSection.className = "panel-section";
  chartSection.appendChild(makeSectionHeader("Daily ridership", "If data is missing for certain days, the chart will show a dotted line for those days."));
  container.appendChild(chartSection);
  const { W, m, plotW } = renderChart(chartSection, allDates);

  // Coverage strip
  renderCoverage(container, allDates);

  // Total stats
  const avgVals = DIRECTIONS.map(d => row[`avg_${d}`]).filter(v => v != null);
  const totalAvg = avgVals.length ? avgVals.reduce((a, b) => a + b, 0) : null;

  const totalSection = document.createElement("div");
  totalSection.className = "panel-section";
  totalSection.appendChild(Object.assign(document.createElement("div"), {
    className: "panel-section-header",
    textContent: "Total",
  }));

  const totalCard = document.createElement("div");
  totalCard.className = "dir-card";
  totalCard.innerHTML = `
    <div class="dir-stats">
      <div class="dir-stat">
        <span class="dir-value">${fmt(totalAvg)}</span>
        <span class="dir-label">avg / day</span>
      </div>
      <div class="dir-stat">
        <span class="dir-value">${fmt(row.peak_combined)} <span class="dir-date">${fmtDate(row.peak_combined_date)}</span></span>
        <span class="dir-label">peak</span>
      </div>
    </div>`;
  totalSection.appendChild(totalCard);
  container.appendChild(totalSection);

  renderDirectionalStats(container, row);
}
