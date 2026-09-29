(function () {
  "use strict";

  function number(value) {
    return value == null ? "—" : new Intl.NumberFormat("he-IL", {maximumFractionDigits: 3}).format(value);
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char];
    });
  }

  function renderSummary(data, target, unit) {
    var insights = data.insights;
    target.hidden = !insights || !insights.matching_deals;
    if (target.hidden) { target.innerHTML = ""; return; }
    var cards = [
      ["עסקאות תואמות", number(insights.matching_deals), "אחרי סינון, לפני דגימת הגרף"],
      ["חציון · " + unit, number(insights.median), number(insights.valid_price_deals) + " עסקאות עם מדד מחיר תקין"],
      ["טווח 50% האמצעיים", number(insights.p25) + " – " + number(insights.p75), unit + " · רבעון תחתון עד עליון"],
      ["כיסוי מדד המחיר", number(100 * insights.valid_price_deals / insights.matching_deals) + "%", number(insights.missing_price_deals) + " ללא ערך תקין למדד"]
    ];
    target.innerHTML = cards.map(function (card) {
      return '<div class="insight-card"><span>' + escape(card[0]) + '</span><strong dir="auto">' + escape(card[1]) + '</strong><small>' + escape(card[2]) + '</small></div>';
    }).join("");
  }

  function description(mode, insights) {
    if (mode === "trend") return "חציון שנתי וטווח 50% האמצעיים. סימון חלול: פחות מ־" + (insights && insights.min_year_prices || 10) + " עסקאות עם מחיר תקין. פער בקו: אין מחירים זמינים. שינוי בתמהיל הנכסים עשוי לשנות את החציון; זו אינה תשואת דירה או רווח לאחר הוצאות.";
    if (mode === "volume") return "כל העסקאות אחרי סינון, כולל עסקאות ללא ערך למדד המחיר. אפס מציין שאין רשומות בבחירה; אין בכך הוכחה שלא היו עסקאות בשוק.";
    if (mode === "distribution") return "כמה עסקאות נמצאות בכל טווח מחיר? כל הערכים התקינים בכל השנים שנבחרו, ללא דגימה וללא התאמה לאינפלציה. כל עמודה כוללת את הגבול התחתון; האחרונה כוללת גם את העליון.";
    return "כל נקודה היא עסקה. לחצו עליה לפתיחת הפרטים וההיסטוריה. צבע, צורה, גודל, פיצול וקווי השוואה חלים על תצוגה זו.";
  }

  function chartSpec(data, mode, options) {
    var insights = data.insights;
    var unit = options.unit;
    var annual = insights.annual || [];
    var years = annual.map(function (row) { return row.year; });
    var partial = function (row) { return row.year >= options.partialYear; };
    var title = mode === "volume" ? "היקף העסקאות בבחירה" : mode === "distribution" ? "התפלגות המחירים בבחירה" : "מגמת המחירים בבחירה";
    var layout = {
      title: {text: title, font: {size: 18}},
      margin: {t: 55, r: 24, b: 85, l: 72},
      font: {family: '"Noto Sans Hebrew", "Segoe UI", Arial, sans-serif', size: 12, color: "#34494e"},
      paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      xaxis: {title: "שנת עסקה", type: "linear", tickformat: "d", automargin: true},
      yaxis: {title: mode === "volume" ? "עסקאות" : unit, automargin: true, gridcolor: "#edf1f1"},
      legend: {orientation: "h", y: -0.22}, hovermode: "closest", bargap: 0.12
    };
    // Keep endpoint years visible on narrow screens as well as wide charts.
    var ticks = years.filter(function (_, i) { return i === 0 || i === years.length - 1 || i % Math.max(1, Math.ceil(years.length / 6)) === 0; });
    layout.xaxis.tickmode = "array";
    layout.xaxis.tickvals = ticks;
    layout.xaxis.ticktext = ticks.map(function (year) { return String(year) + (year >= options.partialYear ? "*" : ""); });
    var traces;
    var table;
    var headers;
    if (mode === "distribution") {
      var bins = insights.distribution || [];
      traces = [{type: "bar", name: "עסקאות", x: bins.map(function (b) { return (b.low + b.high) / 2; }),
        width: bins.map(function (b) { return (b.high - b.low) * 0.94; }), y: bins.map(function (b) { return b.count; }),
        marker: {color: "#186c72"}, textposition: "none", text: bins.map(function (b) { return number(b.low) + " – " + number(b.high) + "<br>" + escape(unit); }),
        hovertemplate: "%{text}<br>%{y:,} עסקאות<extra></extra>"}];
      layout.xaxis = {title: unit, type: "linear", automargin: true};
      layout.yaxis.title = "עסקאות";
      layout.yaxis.rangemode = "tozero";
      headers = ["מ־ (" + unit + ")", "עד", "עסקאות"];
      table = bins.map(function (b) { return [number(b.low), number(b.high), number(b.count)]; });
    } else {
      var hover = annual.map(function (row) {
        return row.year + (partial(row) ? " · שנה חלקית / כיסוי לא מלא" : "") + "<br>" + number(row.deals) + " עסקאות" +
          "<br>" + number(row.valid_prices) + " עם מדד מחיר תקין" +
          (mode === "trend" ? "<br>חציון: " + number(row.median) + " · " + escape(unit) + "<br>50% האמצעיים: " + number(row.p25) + " – " + number(row.p75) : "");
      });
      if (mode === "volume") {
        traces = [{type: "bar", name: "עסקאות", x: years, y: annual.map(function (r) { return r.deals; }), text: hover, textposition: "none",
          marker: {color: annual.map(function (r) { return partial(r) ? "#b7791f" : "#186c72"; })}, hovertemplate: "%{text}<extra></extra>"}];
        layout.yaxis.rangemode = "tozero";
      } else {
        // Separate closed ribbons prevent Plotly from filling across missing years.
        var segments = [];
        var segment = [];
        annual.forEach(function (row) {
          if (row.median == null) {
            if (segment.length) segments.push(segment);
            segment = [];
          } else segment.push(row);
        });
        if (segment.length) segments.push(segment);
        traces = segments.map(function (rows, index) {
          var reverse = rows.slice().reverse();
          return {type: "scatter", mode: "lines", name: "50% האמצעיים", legendgroup: "spread", legendrank: 2,
            x: rows.map(function (r) { return r.year; }).concat(reverse.map(function (r) { return r.year; })),
            y: rows.map(function (r) { return r.p25; }).concat(reverse.map(function (r) { return r.p75; })),
            line: {width: 0}, fill: "toself", fillcolor: "rgba(24,108,114,0.14)", showlegend: index === 0, hoverinfo: "skip"};
        });
        traces.push(
          {type: "scatter", mode: "lines+markers", name: "חציון", legendrank: 1, x: years, y: annual.map(function (r) { return r.median; }), text: hover,
            line: {color: "#186c72", width: 3}, connectgaps: false,
            marker: {size: 9, symbol: annual.map(function (r) { return r.low_sample ? "circle-open" : "circle"; }),
              color: annual.map(function (r) { return partial(r) ? "#b7791f" : "#186c72"; }), line: {width: 2}},
            hovertemplate: "%{text}<extra></extra>"}
        );
      }
      headers = ["שנה", "עסקאות", "עם מדד מחיר", "חציון (" + unit + ")", "רבעון תחתון", "רבעון עליון"];
      table = annual.map(function (r) { return [String(r.year) + (partial(r) ? "*" : ""), number(r.deals), number(r.valid_prices), number(r.median), number(r.p25), number(r.p75)]; });
    }
    return {traces: traces, layout: layout, headers: headers, rows: table,
      partial: mode !== "distribution" && annual.some(partial),
      hasData: mode === "distribution" ? insights.valid_price_deals > 0 : annual.some(function (r) { return mode === "volume" ? r.deals > 0 : r.valid_prices > 0; })};
  }

  function renderTable(spec, target) {
    target.innerHTML = '<table><thead><tr>' + spec.headers.map(function (h) { return '<th scope="col">' + escape(h) + '</th>'; }).join("") +
      '</tr></thead><tbody>' + spec.rows.map(function (row) { return '<tr>' + row.map(function (v) { return '<td>' + escape(v) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table>';
  }

  window.NadlanInsights = {renderSummary: renderSummary, description: description, chartSpec: chartSpec, renderTable: renderTable};
})();
