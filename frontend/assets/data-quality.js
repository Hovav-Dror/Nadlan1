(function (root) {
  "use strict";

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (character) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[character];
    });
  }

  function count(value) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "לא ידוע";
    return Number(value).toLocaleString("he-IL");
  }

  function countAndPercent(value, total) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "לא ידוע";
    var result = count(value);
    if (Number(total) > 0) result += " (" + (Number(value) / Number(total) * 100).toLocaleString("he-IL", {maximumFractionDigits: 1}) + "%)";
    return result;
  }

  function dateText(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + "." + match[2] + "." + match[1] : "לא ידוע";
  }

  function table(headers, rows, caption) {
    return '<div class="table-wrap"><table><caption>' + escapeHtml(caption) + '</caption><thead><tr>' +
      headers.map(function (header) { return '<th scope="col">' + escapeHtml(header) + '</th>'; }).join("") +
      '</tr></thead><tbody>' + rows.map(function (row) {
        return '<tr>' + row.map(function (cell, index) {
          return (index ? '<td>' : '<th scope="row">') + escapeHtml(cell) + (index ? '</td>' : '</th>');
        }).join("") + '</tr>';
      }).join("") + '</tbody></table></div>';
  }

  function normalizeQuery(value) {
    return String(value || "").normalize("NFKC").replace(/[\u0591-\u05C7]/g, "").replace(/[\s\-־–—"'׳״]+/g, "").toLowerCase();
  }

  function render(meta) {
    var target = document.getElementById("pilot-coverage");
    if (!target || !meta) return;
    var oldSearch = document.getElementById("coverage-city-search");
    var query = oldSearch ? oldSearch.value : "";
    var detailsWasOpen = Boolean(target.querySelector("details[open]"));
    var source = meta.source || {};
    var summary = meta.data_summary || {};
    var cities = (meta.cities || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name, "he"); });
    target.hidden = false;
    target.innerHTML = '<section class="coverage-panel"><h3>המאגר שטעון באתר</h3>' +
      '<dl class="coverage-dates"><div><dt>גרסת המקור</dt><dd>' + escapeHtml(source.version === undefined ? "לא ידוע" : source.version) +
      '</dd></div><div><dt>זיהוי גרסת המקור</dt><dd>' + dateText(source.detected_at) +
      '</dd></div><div><dt>הכנת נתוני האתר</dt><dd>' + dateText(summary.generated_at) + '</dd></div></dl>' +
      '<p>זהו צילום מצב מקומי. תאריכי איסוף המקור ועסקאותיו מפורטים לפי עיר; הכנת נתוני האתר היא עיבוד של צילום המצב ואינה איסוף עסקאות חדש.</p>' +
      '<p>הספירות והאחוזים מתייחסים לכל רשומות המגורים בפיילוט, לפני מסנני הניתוח ולפני איחוד דיווחים לצורכי תצוגה. הם אינם מספר הדירות או מספר המכירות הייחודיות. חוסרי כתובת וקומה נספרים לאחר ההשלמות והייחוס לפי מזהה.</p>' +
      '<label class="coverage-search">חיפוש עיר בטבלאות הכיסוי<input id="coverage-city-search" type="search" placeholder="הקלידו שם עיר" autocomplete="off" value="' + escapeHtml(query) + '"></label>' +
      '<p id="coverage-city-count" class="helper-text" aria-live="polite"></p><div id="coverage-city-table"></div>' +
      '<details class="coverage-detail"' + (detailsWasOpen ? ' open' : '') + '><summary>חלקי מכירה, בסיס התאמה וחוסרים נוספים</summary>' +
      '<p>כל אחוז מחושב מתוך כלל רשומות המגורים באותה עיר. ״התאמת עסקה״ ו״ייחוס לפי מזהה״ הם בסיסי השלמה שונים, ואינם אימות עצמאי של זהות הדירה. ייחוס לפי מזהה עשוי להשלים כתובת גם כשהקומה עדיין חסרה.</p><div id="coverage-detail-table"></div></details>' +
      '<p class="helper-text">העסקה האחרונה אינה מבטיחה כיסוי מלא עד אותו יום. השנה של העסקה האחרונה עשויה להיות חלקית או לכלול מעט דיווחים; יש לבדוק זאת לפני השוואת שנים וערים.</p></section>';

    function updateTables() {
      var search = document.getElementById("coverage-city-search");
      var normalized = normalizeQuery(search.value);
      var filtered = cities.filter(function (city) { return normalizeQuery(city.name).indexOf(normalized) !== -1; });
      document.getElementById("coverage-city-count").textContent = "מוצגות " + filtered.length + " מתוך " + cities.length + " ערים";
      var primaryRows = filtered.map(function (city) {
        var c = city.coverage || {}, total = c.rows;
        return [city.name, count(total), dateText(c.min_date), dateText(c.max_date), dateText(c.scraped_to),
          countAndPercent(c.missing_address, total), countAndPercent(c.missing_floor, total)];
      });
      document.getElementById("coverage-city-table").innerHTML = filtered.length ?
        table(["עיר", "רשומות מגורים", "עסקה ראשונה", "עסקה אחרונה", "איסוף מקור אחרון", "ללא כתובת", "ללא קומה"], primaryRows, "תקופת כיסוי וחוסרים לפי עיר") :
        '<p class="state">לא נמצאה עיר בשם זה במאגר הפעיל. נסו חלק אחר מהשם.</p>';
      var detailedRows = filtered.map(function (city) {
        var c = city.coverage || {}, total = c.rows;
        return [city.name, countAndPercent(c.whole_sales, total), countAndPercent(c.partial_sales, total),
          countAndPercent(c.unknown_share, total), countAndPercent(c.enriched_transactions, total),
          countAndPercent(c.reference_linked_transactions, total), countAndPercent(c.missing_rooms, total), countAndPercent(c.missing_area, total)];
      });
      document.getElementById("coverage-detail-table").innerHTML = filtered.length ?
        table(["עיר", "מכירה מלאה", "מכירה חלקית", "חלק לא ידוע", "התאמת עסקה מחמירה", "ייחוס לפי מזהה", "ללא חדרים", "ללא שטח"], detailedRows, "סוגי המכירות ואיכות השדות — ספירה ואחוז מכלל רשומות העיר") : "";
    }
    document.getElementById("coverage-city-search").addEventListener("input", updateTables);
    updateTables();
  }

  root.NadlanCoverage = {render: render, countAndPercent: countAndPercent, dateText: dateText, normalizeQuery: normalizeQuery};
})(window);
