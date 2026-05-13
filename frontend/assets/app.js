(function () {
  "use strict";

  var state = {
    meta: null,
    streets: [],
    gushes: [],
    filterOptions: null,
    filterOptionsSignature: "",
    cityFilterOptions: null,
    cityFilterOptionsSignature: "",
    gushFilterOptions: null,
    gushFilterOptionsSignature: "",
    latestPayloads: {},
    latestAnalysisRows: [],
    latestGushPerformance: null,
    selectedPointId: null,
    tableStates: {},
    roomsSelectionInitialized: false,
    filterOptionsTimer: null,
    filterOptionsRequestId: 0,
    compareGushSearchTimer: null,
    compareGushSearchRequestId: 0,
    compareStreetSearchTimer: null,
    autoAnalysisTimer: null,
    autoCompareTimer: null,
    autoCityTimer: null,
    autoGushTimer: null,
    cityFilterOptionsTimer: null,
    gushFilterOptionsTimer: null,
    analysisRequestId: 0,
    compareRequestId: 0,
    cityRequestId: 0,
    gushRequestId: 0,
    cityFilterOptionsRequestId: 0,
    gushFilterOptionsRequestId: 0,
    cityInitialRunDone: false
  };

  var AUTO_ANALYSIS_POINT_LIMIT = 1500;
  var AUTO_ANALYSIS_SERVER_ROW_LIMIT = 6000;
  var ANALYSIS_FACET_LIMIT = 12;

  var pickerConfig = {
    streets: {
      selectId: "street-select",
      searchId: "street-picker-search",
      resultsId: "street-picker-results",
      selectedId: "street-selected",
      emptyText: "Start typing to find streets.",
      oppositeSelectId: "gush-select"
    },
    gushes: {
      selectId: "gush-select",
      searchId: "gush-picker-search",
      resultsId: "gush-picker-results",
      selectedId: "gush-selected",
      emptyText: "Start typing to find Gush areas.",
      oppositeSelectId: "street-select"
    }
  };

  var endpoints = {
    status: "api/status",
    meta: "api/meta",
    filterOptions: "api/filter-options",
    analysis: "api/analysis/deals",
    compareSummary: "api/compare/summary",
    citySummary: "api/city-comparison/summary",
    gushSummary: "api/gush-performance/summary",
    downloads: {
      analysis: "api/download/analysis",
      "compare-raw": "api/download/compare-raw",
      "compare-summary": "api/download/compare-summary",
      "city-comparison-raw": "api/download/city-comparison-raw",
      "city-comparison-summary": "api/download/city-comparison-summary",
      "gush-performance-raw": "api/download/gush-performance-raw",
      "gush-performance-summary": "api/download/gush-performance-summary"
    }
  };

  var labels = {
    raw_deals: "Raw deals",
    selected_deals: "Selected deals",
    filtered_deals: "Filtered deals",
    outlier_deals: "After outliers",
    summary_points: "Summary points",
    unique_gushes: "Gush areas",
    unique_years: "Years",
    unique_cities: "Cities",
    plotted_cities: "Plotted cities",
    city_rows: "City rows",
    location_rows: "Location rows",
    pre_outlier_rows: "Before outliers",
    filtered_rows: "Filtered rows",
    outlier_rows: "After outliers",
    returned_rows: "Returned rows",
    qualified_gushes: "Qualified Gushes",
    selected_gushes: "Selected Gushes",
    qualified_summary_points: "Qualified points"
  };

  document.addEventListener("DOMContentLoaded", function () {
    document.body.dataset.compareHasSelection = "false";
    bindTabs();
    bindControls();
    activateTab(initialTabFromHash(), false);
    window.addEventListener("hashchange", function () {
      activateTab(initialTabFromHash(), false);
    });
    setNotice("analysis-state", "Choose a city and search for streets or Gush areas. Metadata loads automatically.", "ok");
    setNotice("compare-state", "Select streets or Gush areas. Compare updates automatically when the selection is small enough.", "ok");
    setNotice("city-state", "Select cities and click update. No city summary is loaded automatically.", "ok");
    setNotice("gush-state", "Choose one city and update performance.", "ok");
    setNotice("download-state", "Downloads use the filter panel for the workflow you export.", "ok");
    refreshStatus();
    loadMeta();
  });

  function initialTabFromHash() {
    var tab = String(window.location.hash || "").replace(/^#/, "");
    return validTab(tab) ? tab : "analysis";
  }

  function validTab(tab) {
    return Boolean(tab && document.querySelector('.tab[data-tab="' + cssEscape(tab) + '"]') && byId("panel-" + tab));
  }

  function activateTab(tab, updateHash) {
    if (!validTab(tab)) tab = "analysis";
    document.body.dataset.activeTab = tab;
    document.querySelectorAll(".tab").forEach(function (item) {
      item.classList.toggle("is-active", item.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("is-active", panel.id === "panel-" + tab);
    });
    if (updateHash && window.location.hash !== "#" + tab) {
      window.history.pushState(null, "", "#" + tab);
    }
        updateSelectionSummary();
        updateCompareSelectionState();
        if (tab === "compare") scheduleCompareAutoUpdate("tab");
        if (tab === "city") {
          scheduleCityFilterOptions();
          if (state.cityFilterOptions && state.cityFilterOptionsSignature === currentCityFilterOptionsSignature()) {
            runInitialCityComparison();
          } else {
            setNotice("city-state", "Loading city-specific filters before drawing the plot...", "loading");
          }
        }
    if (tab === "gush") {
      if (!state.gushFilterOptions || state.gushFilterOptionsSignature !== currentGushFilterOptionsSignature()) {
        scheduleGushFilterOptions();
      }
      scheduleGushAutoUpdate("tab");
    }
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        activateTab(button.dataset.tab, true);
      });
    });
  }

  function bindControls() {
    byId("refresh-meta").addEventListener("click", loadMeta);
    byId("random-city").addEventListener("click", chooseRandomCity);
    byId("city-select").addEventListener("change", function () {
      clearSelect(byId("street-select"));
      clearSelect(byId("gush-select"));
      state.streets = [];
      state.gushes = [];
      state.filterOptions = null;
      state.filterOptionsSignature = "";
      state.roomsSelectionInitialized = false;
      byId("street-search-results").innerHTML = "";
      renderLocationPickers();
      updateSelectionSummary();
      updateCompareSelectionState();
      loadLocationMetadata();
    });
    byId("run-analysis").addEventListener("click", runAnalysis);
    byId("auto-update-analysis").addEventListener("change", function () {
      scheduleAnalysisAutoUpdate("auto-toggle");
    });
    byId("run-compare").addEventListener("click", runCompare);
    byId("load-compare-raw").addEventListener("click", runCompareRawPreview);
    byId("auto-update-compare").addEventListener("change", function () {
      scheduleCompareAutoUpdate("auto-toggle");
    });
    byId("run-city").addEventListener("click", runCityComparison);
    byId("auto-update-city").addEventListener("change", function () {
      scheduleCityAutoUpdate("auto-toggle");
    });
    byId("city-comparison-search").addEventListener("input", renderCityComparisonPicker);
    document.querySelectorAll("[data-city-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyCityPreset(button.dataset.cityPreset);
      });
    });
    byId("run-gush").addEventListener("click", runGushPerformance);
    byId("gush-city-select").addEventListener("change", function () {
      renderGushCityReadout();
      state.gushFilterOptions = null;
      state.gushFilterOptionsSignature = "";
      state.latestGushPerformance = null;
      scheduleGushFilterOptions();
    });
    byId("auto-update-gush").addEventListener("change", function () {
      scheduleGushAutoUpdate("auto-toggle");
    });
    byId("use-tel-aviv-performance").addEventListener("click", useTelAvivPerformanceDefault);
    byId("select-gush-performance-all").addEventListener("click", function () {
      selectGushPerformanceRows("all");
    });
    byId("select-gush-performance-top").addEventListener("click", function () {
      selectGushPerformanceRows("top");
    });
    byId("select-gush-performance-bottom").addEventListener("click", function () {
      selectGushPerformanceRows("bottom");
    });
    byId("add-gush-streets").addEventListener("click", addStreetsFromSelectedGushes);
    byId("select-street-gushes").addEventListener("click", selectGushesFromSelectedStreets);
    byId("smart-reset-rooms").addEventListener("click", applySmartRoomSelection);
    byId("clear-rooms").addEventListener("click", clearRoomSelection);
    byId("smart-reset-gush-rooms").addEventListener("click", applyGushSmartRoomSelection);
    byId("clear-gush-rooms").addEventListener("click", clearGushRoomSelection);
    byId("reset-filters").addEventListener("click", resetFilterRanges);
    byId("run-street-search").addEventListener("click", runStreetSearch);
    byId("street-search").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        runStreetSearch();
      }
    });
    if (byId("run-compare-street-search")) byId("run-compare-street-search").addEventListener("click", runCompareStreetSearch);
    if (byId("compare-street-search")) {
      byId("compare-street-search").addEventListener("input", scheduleCompareStreetSearch);
      byId("compare-street-search").addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          runCompareStreetSearch();
        }
      });
    }
    if (byId("compare-gush-search")) byId("compare-gush-search").addEventListener("input", scheduleCompareGushSearch);
    ["street-select", "gush-select", "rooms-select", "apartment-type-select"].forEach(function (id) {
      byId(id).addEventListener("change", updateSelectionSummary);
      byId(id).addEventListener("change", function () {
        if (id === "rooms-select") state.roomsSelectionInitialized = true;
        if (id === "rooms-select" || id === "apartment-type-select") scheduleAnalysisAutoUpdate(id);
        if (id === "street-select" || id === "gush-select") scheduleCompareAutoUpdate(id);
      });
    });
    byId("rooms-select").addEventListener("change", renderRoomChips);
    byId("apartment-type-select").addEventListener("change", renderApartmentTypeChips);
    byId("apartment-type-search").addEventListener("input", renderApartmentTypeChips);
    if (byId("compare-clear-rooms")) byId("compare-clear-rooms").addEventListener("click", clearCompareRoomSelection);
    if (byId("compare-rooms-select")) byId("compare-rooms-select").addEventListener("change", renderCompareRoomChips);
    if (byId("compare-apartment-type-select")) byId("compare-apartment-type-select").addEventListener("change", renderCompareApartmentTypeChips);
    if (byId("compare-apartment-type-search")) byId("compare-apartment-type-search").addEventListener("input", renderCompareApartmentTypeChips);
    byId("gush-rooms-select").addEventListener("change", renderGushRoomChips);
    byId("gush-apartment-type-select").addEventListener("change", renderGushApartmentTypeChips);
    byId("gush-apartment-type-search").addEventListener("input", renderGushApartmentTypeChips);
    [
      "filter-year-min", "filter-year-max", "filter-price-min", "filter-price-max",
      "filter-price-m2-min", "filter-price-m2-max", "filter-area-min", "filter-area-max",
      "filter-floor-min", "filter-floor-max", "filter-building-floors-min", "filter-building-floors-max",
      "filter-built-year-min", "filter-built-year-max", "filter-building-age-min", "filter-building-age-max",
      "roof-select", "new-project-select", "remove-price-outliers", "remove-area-outliers"
    ].forEach(function (id) {
      byId(id).addEventListener("change", updateSelectionSummary);
      byId(id).addEventListener("input", updateSelectionSummary);
      byId(id).addEventListener("change", function () { scheduleAnalysisAutoUpdate(id); });
      byId(id).addEventListener("input", function () { scheduleAnalysisAutoUpdate(id); });
    });
    [
      "compare-y-variable", "compare-statistic", "compare-color-palette", "compare-shape-palette", "compare-reverse-colors",
      "compare-remove-price-outliers", "compare-show-sp500", "compare-show-city-overlay",
      "compare-filter-year-min", "compare-filter-year-max", "compare-filter-price-min", "compare-filter-price-max",
      "compare-filter-price-m2-min", "compare-filter-price-m2-max", "compare-filter-area-min", "compare-filter-area-max",
      "compare-filter-floor-min", "compare-filter-floor-max", "compare-filter-building-floors-min", "compare-filter-building-floors-max",
      "compare-filter-built-year-min", "compare-filter-built-year-max", "compare-filter-building-age-min", "compare-filter-building-age-max",
      "compare-rooms-select", "compare-apartment-type-select", "compare-roof-select", "compare-new-project-select"
    ].forEach(function (id) {
      byId(id).addEventListener("change", updateSelectionSummary);
      byId(id).addEventListener("input", updateSelectionSummary);
      byId(id).addEventListener("change", function () { scheduleCompareAutoUpdate(id); });
      byId(id).addEventListener("input", function () { scheduleCompareAutoUpdate(id); });
    });
    [
      "city-y-variable", "city-statistic", "city-chart-mode", "city-min-deals", "city-remove-price-outliers", "city-show-sp500",
      "city-show-points", "city-point-size-min", "city-point-size-max", "city-color-palette", "city-reverse-colors",
      "city-filter-year-min", "city-filter-year-max", "city-filter-price-min", "city-filter-price-max",
      "city-filter-price-m2-min", "city-filter-price-m2-max", "city-filter-area-min", "city-filter-area-max",
      "city-filter-floor-min", "city-filter-floor-max", "city-filter-building-floors-min", "city-filter-building-floors-max",
      "city-filter-built-year-min", "city-filter-built-year-max", "city-filter-building-age-min", "city-filter-building-age-max",
      "city-rooms-select", "city-apartment-type-select", "city-roof-select", "city-new-project-select"
    ].forEach(function (id) {
      byId(id).addEventListener("change", function () { scheduleCityAutoUpdate(id); });
      byId(id).addEventListener("input", function () { scheduleCityAutoUpdate(id); });
    });
    [
      "gush-y-variable", "gush-statistic", "gush-top-count", "gush-typical-count", "gush-bottom-count", "gush-min-deals",
      "gush-remove-price-outliers", "gush-show-sp500", "gush-show-city-overlay",
      "gush-filter-year-min", "gush-filter-year-max", "gush-filter-price-min", "gush-filter-price-max",
      "gush-filter-price-m2-min", "gush-filter-price-m2-max", "gush-filter-area-min", "gush-filter-area-max",
      "gush-filter-floor-min", "gush-filter-floor-max", "gush-filter-building-floors-min", "gush-filter-building-floors-max",
      "gush-filter-built-year-min", "gush-filter-built-year-max", "gush-filter-building-age-min", "gush-filter-building-age-max",
      "gush-rooms-select", "gush-apartment-type-select", "gush-roof-select", "gush-new-project-select"
    ].forEach(function (id) {
      byId(id).addEventListener("change", function () { scheduleGushAutoUpdate(id); });
      byId(id).addEventListener("input", function () { scheduleGushAutoUpdate(id); });
    });
    [
      "row-limit", "analysis-color-var", "analysis-shape-var", "analysis-size-var",
      "analysis-facet-var", "analysis-color-palette", "analysis-shape-palette", "analysis-price-type",
      "show-sp500", "show-city-overlay"
    ].forEach(function (id) {
      byId(id).addEventListener("change", function () { scheduleAnalysisAutoUpdate(id); });
      byId(id).addEventListener("input", function () { scheduleAnalysisAutoUpdate(id); });
    });
    document.querySelectorAll(".segmented-control").forEach(function (control) {
      control.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-value]");
        if (!button) return;
        byId(control.dataset.select).value = button.dataset.value;
        syncSegmentedControls();
        updateSelectionSummary();
        scheduleAutoUpdateForControl(control.dataset.select);
      });
    });
    Object.keys(pickerConfig).forEach(function (key) {
      var config = pickerConfig[key];
      byId(config.searchId).addEventListener("input", function () {
        if (key === "gushes" && document.body.dataset.activeTab === "compare") {
          scheduleCompareGushSearch();
          return;
        }
        renderPicker(key);
      });
    });
    document.querySelectorAll("[data-download]").forEach(function (button) {
      button.addEventListener("click", function () {
        downloadCsv(button.dataset.download);
      });
    });
  }

  async function refreshStatus() {
    try {
      var status = await getJson(endpoints.status);
      byId("app-status").textContent = status.status === "ok" ? "" : "Status: " + status.status;
    } catch (error) {
      byId("app-status").textContent = "Status unavailable: " + error.message;
    }
  }

  async function loadMeta() {
    setNotice("metadata-state", "Loading application metadata...", "loading");
    try {
      var response = await getJson(endpoints.meta);
      state.meta = response.data;
      populateMetaControls(response.data);
      renderMetaSummary(response.data);
      setNotice("metadata-state", warningText(response) || "Metadata loaded.", warningText(response) ? "warning" : "ok");
      if (byId("city-select").value && !state.streets.length) {
        await loadLocationMetadata();
      }
    } catch (error) {
      setNotice("metadata-state", error.message, "error");
    }
  }

  function populateMetaControls(meta) {
    var cityOptions = (meta.cities || []).map(function (city) {
      return { value: city.id, label: city.name };
    });
    setOptions(byId("city-select"), cityOptions, false);
    setOptions(byId("city-comparison-select"), cityOptions, true);
    setOptions(byId("gush-city-select"), cityOptions, false);

    var defaultCityIds = (meta.cities || []).slice(0, 20).map(function (city) { return city.id; });
    setSelectedValues(byId("city-comparison-select"), defaultCityIds);
    renderCityComparisonPicker();
    scheduleCityFilterOptions();

    var apartmentTypes = (meta.apartment_types || []).map(function (value) {
      return { value: value, label: value };
    });
    setOptions(byId("apartment-type-select"), apartmentTypes, true);
    ["compare", "city", "gush"].forEach(function (scope) {
      setOptions(byId(scope + "-apartment-type-select"), apartmentTypes, true);
    });
    setSelectedValues(byId("apartment-type-select"), []);
    renderApartmentTypeChips();
    renderGushApartmentTypeChips();

    if (cityOptions.length && !byId("city-select").value) {
      byId("city-select").value = cityOptions[0].value;
    }
    setDefaultGushCity();
    renderGushCityReadout();
    scheduleGushFilterOptions();
    updateSelectionSummary();
  }

  function setDefaultGushCity() {
    var select = byId("gush-city-select");
    if (!select || select.value) return;
    var telAviv = cityOptionByNames(["תל אביב -יפו", "תל אביב-יפו", "Tel Aviv-Yafo", "tel_aviv_yafo"], select);
    select.value = telAviv ? telAviv.value : (select.options[1] && select.options[1].value || "");
  }

  function renderGushCityReadout() {
    var target = byId("gush-city-current");
    var select = byId("gush-city-select");
    if (!target || !select) return;
    var selected = select.selectedOptions && select.selectedOptions[0];
    target.textContent = selected && selected.value ? selected.textContent : "";
  }

  async function loadLocationMetadata() {
    var city = byId("city-select").value;
    if (!city) {
      setNotice("metadata-state", "Choose a city first.", "warning");
      return;
    }
    setNotice("metadata-state", "Loading streets and Gush areas...", "loading");
    try {
      var results = await Promise.all([
        getJson("api/cities/" + encodeURIComponent(city) + "/streets"),
        getJson("api/cities/" + encodeURIComponent(city) + "/gushes")
      ]);
      state.streets = results[0].data.streets || [];
      state.gushes = results[1].data.gushes || [];
      setOptions(byId("street-select"), state.streets.map(function (street) {
        return { value: street, label: street, searchText: street };
      }), true);
      setOptions(byId("gush-select"), state.gushes.map(function (gush) {
        var details = [gush.label, "(" + gush.id + ")"];
        if (gush.representative_street) details.push("- " + gush.representative_street);
        if (gush.deals) details.push("· " + formatNumber(gush.deals) + " deals");
        return {
          value: gush.id,
          label: details.join(" "),
          searchText: [gush.id, gush.label, gush.representative_street, gush.city].filter(Boolean).join(" ")
        };
      }), true);
      setNotice("metadata-state", "Loaded " + state.streets.length + " streets and " + state.gushes.length + " Gush areas.", "ok");
      setNotice("analysis-state", "City metadata loaded. Search streets or Gush areas, then update analysis.", "ok");
      renderMetaSummary(state.meta);
      renderLocationPickers();
      updateSelectionSummary();
      updateCompareSelectionState();
      scheduleFilterOptions();
      scheduleCompareAutoUpdate("metadata");
      scheduleGushAutoUpdate("metadata");
    } catch (error) {
      setNotice("metadata-state", error.message, "error");
    }
  }

  async function loadFilterOptions() {
    var city = byId("city-select").value;
    if (!city && !activeGushSelection().length) {
      setNotice("metadata-state", "Choose a city or selected Gush area first.", "warning");
      return;
    }
    var requestId = ++state.filterOptionsRequestId;
    var payload = filterOptionsPayload();
    var selectionSignature = filterOptionsSignature(payload);
    setNotice("metadata-state", "Loading dynamic filter ranges...", "loading");
    try {
      var response = await postJson(endpoints.filterOptions, payload);
      if (requestId !== state.filterOptionsRequestId || selectionSignature !== currentFilterOptionsSignature()) {
        return;
      }
      state.filterOptions = response.data;
      applyFilterDefaults(response.data);
      state.filterOptionsSignature = selectionSignature;
      renderFilterSummary(response.data);
      setNotice("metadata-state", warningText(response) || "Filter options loaded.", warningText(response) ? "warning" : "ok");
      updateSelectionSummary();
      scheduleAnalysisAutoUpdate("filter-options");
      scheduleCompareAutoUpdate("filter-options");
      scheduleGushAutoUpdate("filter-options");
    } catch (error) {
      setNotice("metadata-state", error.message, "error");
    }
  }

  async function loadCityFilterOptions() {
    var cities = selectedValues(byId("city-comparison-select"));
    if (!cities.length) return;
    var requestId = ++state.cityFilterOptionsRequestId;
    var payload = { cities: cities };
    var signature = JSON.stringify(cities.map(String).sort());
    try {
      var response = await postJson(endpoints.filterOptions, payload);
      if (requestId !== state.cityFilterOptionsRequestId || signature !== currentCityFilterOptionsSignature()) {
        return;
      }
      state.cityFilterOptions = response.data;
      state.cityFilterOptionsSignature = signature;
      applyScopedFilterDefaults("city", response.data);
      renderCityComparisonPicker();
      renderCityFilterSummary();
      updateSelectionSummary();
      if (document.body.dataset.activeTab === "city" && !state.cityInitialRunDone) {
        runInitialCityComparison();
      } else {
        scheduleCityAutoUpdate("city-filter-options");
      }
    } catch (error) {
      setNotice("city-state", error.message, "error");
    }
  }

  async function loadGushFilterOptions() {
    var city = byId("gush-city-select").value;
    if (!city) return;
    var requestId = ++state.gushFilterOptionsRequestId;
    var payload = { city: city };
    var signature = currentGushFilterOptionsSignature();
    try {
      var response = await postJson(endpoints.filterOptions, payload);
      if (requestId !== state.gushFilterOptionsRequestId || signature !== currentGushFilterOptionsSignature()) {
        return;
      }
      state.gushFilterOptions = response.data;
      state.gushFilterOptionsSignature = signature;
      applyScopedFilterDefaults("gush", response.data);
      renderGushRoomChips();
      renderGushApartmentTypeChips();
      scheduleGushAutoUpdate("gush-filter-options");
    } catch (error) {
      setNotice("gush-state", error.message, "error");
    }
  }

  async function chooseRandomCity() {
    var cities = randomCityCandidates();
    if (!cities.length) return;
    setBusy("random-city", true);
    try {
      for (var index = 0; index < cities.length; index += 1) {
        var city = cities[index];
        byId("city-select").value = city.value;
        resetCitySelectionState();
        await loadLocationMetadata();

        var gush = randomRunnableGush(state.gushes);
        if (gush) {
          setSelectedValues(byId("street-select"), []);
          setSelectedValues(byId("gush-select"), [gush.id]);
          renderLocationPickers();
          updateSelectionSummary();
          scheduleFilterOptions();
          scheduleAnalysisAutoUpdate("random");
          scheduleCompareAutoUpdate("random");
          scheduleGushAutoUpdate("random");
          setNotice(
            "analysis-state",
            "Random runnable case: " + city.label + " / " + gush.label + " (" + gush.id + ").",
            "ok"
          );
          return;
        }
      }

      var fallback = cities[0];
      byId("city-select").value = fallback.value;
      resetCitySelectionState();
      await loadLocationMetadata();
      setNotice("analysis-state", "Random city selected. Pick a smaller Gush if auto update pauses.", "warning");
    } finally {
      setBusy("random-city", false);
    }
  }

  function randomCityCandidates() {
    var cities = state.meta && state.meta.cities && state.meta.cities.length
      ? state.meta.cities.map(function (city) {
          return { value: city.id, label: city.name };
        })
      : Array.from(byId("city-select").options || [])
          .filter(function (option) { return option.value; })
          .map(function (option) { return { value: option.value, label: option.textContent }; });
    return shuffleCopy(cities);
  }

  function randomRunnableGush(gushes) {
    var rowLimit = intValue("row-limit", 2000);
    if (rowLimit < 1) rowLimit = 2000;
    var pointBudget = Math.min(rowLimit, AUTO_ANALYSIS_POINT_LIMIT);
    var eligible = (gushes || []).filter(function (gush) {
      var deals = Number(gush.deals || 0);
      return Number.isFinite(deals) && deals > 0 && deals <= pointBudget;
    });
    if (!eligible.length) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  async function useTelAvivPerformanceDefault() {
    var citySelect = byId("gush-city-select");
    var telAviv = cityOptionByNames(["תל אביב -יפו", "תל אביב-יפו", "Tel Aviv-Yafo", "tel_aviv_yafo"], citySelect);
    if (!telAviv) {
      setNotice("gush-state", "Tel Aviv is not available in the loaded city list.", "warning");
      return;
    }
    citySelect.value = telAviv.value;
    renderGushCityReadout();
    byId("gush-y-variable").value = "price_per_m2";
    byId("gush-top-count").value = "5";
    byId("gush-typical-count").value = "0";
    byId("gush-bottom-count").value = "5";
    byId("gush-min-deals").value = "5";
    await loadGushFilterOptions();
    setNotice("gush-state", "Tel Aviv performance defaults loaded.", "ok");
    scheduleGushAutoUpdate("tel-aviv-default");
  }

  function cityOptionByNames(names, select) {
    select = select || byId("city-select");
    var wanted = new Set((names || []).map(normalizeSearch));
    return Array.from(select.options || []).find(function (option) {
      return wanted.has(normalizeSearch(option.textContent)) || wanted.has(normalizeSearch(option.value));
    });
  }

  async function selectGushPerformanceRows(group) {
    var data = state.latestGushPerformance;
    var rows = data && data.performance_table || [];
    if (group && group !== "all") {
      rows = rows.filter(function (row) { return String(row.performance_group) === group; });
    }
    var gushIds = rows.map(function (row) { return row.gush; }).filter(function (value) {
      return value !== null && value !== undefined && value !== "";
    });
    if (!gushIds.length) {
      setNotice("gush-state", "Run City Performance first, then choose which ranked Gushes to use.", "warning");
      return;
    }
    var performanceCity = byId("gush-city-select").value;
    if (performanceCity && byId("city-select").value !== performanceCity) {
      byId("city-select").value = performanceCity;
      resetCitySelectionState();
      await loadLocationMetadata();
    }
    setSelectedValues(byId("street-select"), []);
    setSelectedValues(byId("gush-select"), gushIds);
    renderLocationPickers();
    updateSelectionSummary();
    updateCompareSelectionState();
    scheduleFilterOptions();
    scheduleAnalysisAutoUpdate("gush-performance-selection");
    scheduleCompareAutoUpdate("gush-performance-selection");
    setNotice("gush-state", "Selected " + gushIds.length + " ranked Gush areas in the shared picker.", "ok");
  }

  function resetCitySelectionState() {
    clearSelect(byId("street-select"));
    clearSelect(byId("gush-select"));
    state.streets = [];
    state.gushes = [];
    state.filterOptions = null;
    state.filterOptionsSignature = "";
    state.latestGushPerformance = null;
    state.roomsSelectionInitialized = false;
    byId("street-search-results").innerHTML = "";
    renderLocationPickers();
    updateSelectionSummary();
    updateCompareSelectionState();
  }

  function shuffleCopy(values) {
    var shuffled = values.slice();
    for (var index = shuffled.length - 1; index > 0; index -= 1) {
      var swapIndex = Math.floor(Math.random() * (index + 1));
      var current = shuffled[index];
      shuffled[index] = shuffled[swapIndex];
      shuffled[swapIndex] = current;
    }
    return shuffled;
  }

  async function addStreetsFromSelectedGushes() {
    var city = byId("city-select").value;
    var gushes = selectedValues(byId("gush-select"));
    if (!city || !gushes.length) {
      setNotice("analysis-state", "Select one or more Gush areas first.", "warning");
      return;
    }
    setBusy("add-gush-streets", true);
    try {
      var response = await postJson("api/cities/" + encodeURIComponent(city) + "/selection", { gushes: gushes });
      setSelectedValues(byId("gush-select"), []);
      setSelectedValues(byId("street-select"), response.data.streets || []);
      renderLocationPickers();
      updateSelectionSummary();
      updateCompareSelectionState();
      scheduleFilterOptions();
      scheduleAnalysisAutoUpdate("gush-streets");
      scheduleCompareAutoUpdate("gush-streets");
      setNotice("analysis-state", "Using " + (response.data.streets || []).length + " streets from the selected Gush areas.", "ok");
    } catch (error) {
      setNotice("analysis-state", error.message, "error");
    } finally {
      setBusy("add-gush-streets", false);
    }
  }

  async function selectGushesFromSelectedStreets() {
    var city = byId("city-select").value;
    var streets = selectedValues(byId("street-select"));
    if (!city || !streets.length) {
      setNotice("analysis-state", "Select one or more streets first.", "warning");
      return;
    }
    setBusy("select-street-gushes", true);
    try {
      var response = await postJson("api/cities/" + encodeURIComponent(city) + "/selection", { streets: streets });
      setSelectedValues(byId("street-select"), []);
      setSelectedValues(byId("gush-select"), (response.data.gushes || []).map(function (gush) { return gush.id; }));
      enforceCompareGushLimit();
      renderLocationPickers();
      updateSelectionSummary();
      updateCompareSelectionState();
      scheduleFilterOptions();
      scheduleAnalysisAutoUpdate("street-gushes");
      scheduleCompareAutoUpdate("street-gushes");
      setNotice("analysis-state", "Using " + (response.data.gushes || []).length + " whole Gush areas from the selected streets.", "ok");
    } catch (error) {
      setNotice("analysis-state", error.message, "error");
    } finally {
      setBusy("select-street-gushes", false);
    }
  }

  async function runStreetSearch() {
    var query = byId("street-search").value.trim();
    var city = byId("city-select").value;
    var isCompare = document.body.dataset.activeTab === "compare";
    var target = byId("street-search-results");
    if (!query) {
      target.innerHTML = "";
      return;
    }
    target.innerHTML = '<div class="mini-notice">Searching...</div>';
    try {
      var url = "api/street-search?q=" + encodeURIComponent(query) + "&limit=8";
      if (city && !isCompare) url += "&city=" + encodeURIComponent(city);
      var response = await getJson(url);
      renderStreetSearchResults(response.data.results || []);
    } catch (error) {
      target.innerHTML = '<div class="mini-notice error">' + escapeHtml(error.message) + "</div>";
    }
  }

  function scheduleCompareStreetSearch() {
    if (state.compareStreetSearchTimer) window.clearTimeout(state.compareStreetSearchTimer);
    state.compareStreetSearchTimer = window.setTimeout(runCompareStreetSearch, 300);
  }

  async function runCompareStreetSearch() {
    var input = byId("compare-street-search");
    var target = byId("compare-street-results");
    if (!input || !target) return;
    var query = input.value.trim();
    if (!query) {
      target.innerHTML = '<div class="mini-notice">Type any street name to search across all cities.</div>';
      return;
    }
    target.innerHTML = '<div class="mini-notice">Searching streets across all cities...</div>';
    try {
      var response = await getJson("api/street-search?q=" + encodeURIComponent(query) + "&limit=12");
      renderCompareStreetSearchResults(response.data.results || []);
    } catch (error) {
      target.innerHTML = '<div class="mini-notice error">' + escapeHtml(error.message) + "</div>";
    }
  }

  function renderCompareStreetSearchResults(results) {
    var target = byId("compare-street-results");
    if (!target) return;
    if (!results.length) {
      target.innerHTML = '<div class="mini-notice">No matching streets.</div>';
      return;
    }
    target.innerHTML = results.map(function (result, index) {
      var gushes = result.gushes || [];
      var gushText = gushes.map(function (gush) { return gush.label + " (" + gush.id + ")"; }).join(", ");
      var detailText = [result.city, gushText].filter(Boolean).join(" · ");
      return '<button class="search-result" type="button" data-index="' + index + '">' +
        '<strong class="' + textDirectionClass(result.street) + '">' + escapeHtml(result.street) + "</strong>" +
        '<span class="' + textDirectionClass(detailText) + '">' + escapeHtml(detailText) + "</span>" +
        "</button>";
    }).join("");
    target.querySelectorAll(".search-result").forEach(function (button) {
      button.addEventListener("click", function () {
        addCompareGushSearchResult(results[Number(button.dataset.index)]);
        renderCompareGushPicker();
        updateSelectionSummary();
        updateCompareSelectionState();
        scheduleFilterOptions();
        scheduleCompareAutoUpdate("compare-street-search");
        setNotice("compare-state", "Added matching Gush areas from street search.", "ok");
      });
    });
  }

  function renderStreetSearchResults(results) {
    var target = byId("street-search-results");
    if (!results.length) {
      target.innerHTML = '<div class="mini-notice">No matching streets.</div>';
      return;
    }
    target.innerHTML = results.map(function (result, index) {
      var gushes = result.gushes || [];
      var gushText = gushes.map(function (gush) { return gush.label + " (" + gush.id + ")"; }).join(", ");
      var detailText = (document.body.dataset.activeTab === "compare" && result.city ? result.city + " · " : "") + (gushText || result.city);
      return '<button class="search-result" type="button" data-index="' + index + '">' +
        '<strong class="' + textDirectionClass(result.street) + '">' + escapeHtml(result.street) + "</strong>" +
        '<span class="' + textDirectionClass(detailText) + '">' + escapeHtml(detailText) + "</span>" +
        "</button>";
    }).join("");
    target.querySelectorAll(".search-result").forEach(function (button) {
      button.addEventListener("click", function () {
        var result = results[Number(button.dataset.index)];
        if (document.body.dataset.activeTab === "compare") {
          addCompareGushSearchResult(result);
        } else {
          setSelectedValues(byId("gush-select"), []);
          selectAdditionalValues(byId("street-select"), [result.street]);
        }
        renderLocationPickers();
        updateSelectionSummary();
        updateCompareSelectionState();
        scheduleFilterOptions();
        scheduleAnalysisAutoUpdate("street-search");
        scheduleCompareAutoUpdate("street-search");
        if (document.body.dataset.activeTab === "compare") {
          setNotice("compare-state", "Added the street's Gush areas. Compare controls are ready.", "ok");
        } else {
          setNotice("analysis-state", "Using selected street. Choose \"Use whole Gush\" to broaden it.", "ok");
        }
      });
    });
  }

  function addCompareGushSearchResult(result) {
    var select = byId("gush-select");
    (result.gushes || []).forEach(function (gush) {
      ensureSelectOption(select, {
        value: gush.id,
        label: result.city + " - " + gush.label + " (" + gush.id + ")",
        searchText: [result.city, result.street, gush.id, gush.label].filter(Boolean).join(" ")
      });
    });
    setSelectedValues(byId("street-select"), []);
    selectAdditionalValues(select, (result.gushes || []).map(function (gush) { return gush.id; }));
    enforceCompareGushLimit();
    renderCompareGushPicker();
  }

  async function runAnalysis(options) {
    options = options || {};
    var payload = buildAnalysisPayload();
    if (!payload.city && !payload.gushes.length) {
      setNotice("analysis-state", "Choose a city or Gush area first.", "warning");
      return;
    }
    var requestId = ++state.analysisRequestId;
    state.latestPayloads.analysis = payload;
    setNotice("analysis-state", options.auto ? "Auto-updating analysis..." : "Loading analysis deals...", "loading");
    setAnalysisBusy(true);
    try {
      var response = await postJson(endpoints.analysis, payload);
      if (requestId !== state.analysisRequestId) return;
      var data = response.data || {};
      state.latestAnalysisRows = data.table_rows || [];
      state.selectedPointId = null;
      renderAnalysisChart(data);
      renderSelectedDeal(null);
      renderMetrics("analysis-counts", data.counts);
      renderTable("analysis-table", data.table_rows || [], analysisColumns(), {
        selectable: true,
        sortable: true,
        filterable: true,
        resetState: true
      });
      setNotice("analysis-state", warningText(response) || emptyText(data.table_rows, "Analysis updated.", "No matching transactions."), warningText(response) ? "warning" : "ok");
    } catch (error) {
      if (requestId !== state.analysisRequestId) return;
      setNotice("analysis-state", error.message, "error");
    } finally {
      if (requestId === state.analysisRequestId) setAnalysisBusy(false);
    }
  }

  async function runCompare(options) {
    options = options || {};
    var payload = buildComparePayload();
    if (!payload.gushes.length && !payload.streets.length) {
      setNotice("compare-state", "Select Gush areas or streets before updating compare.", "warning");
      return;
    }
    var requestId = ++state.compareRequestId;
    state.latestPayloads["compare-summary"] = payload;
    state.latestPayloads["compare-raw"] = payload;
    setNotice("compare-state", options.auto ? "Auto-updating Gush comparison..." : "Loading Gush comparison...", "loading");
    setBusy("run-compare", true);
    try {
      var response = await postJson(endpoints.compareSummary, payload);
      if (requestId !== state.compareRequestId) return;
      var data = response.data || {};
      renderCompareContext(data, payload);
      renderSeriesChart("compare-chart", data.series || [], data.overlays || {}, "Compare Areas", compareYAxisLabel(data), compareSeriesChartOptions());
      renderMetrics("compare-counts", data.counts);
      renderTable("compare-table", data.table || [], summaryColumns(), {
        sortable: true,
        filterable: true
      });
      byId("compare-raw-table").innerHTML = "";
      setNotice("compare-state", warningText(response) || emptyText(data.table, "Compare summary updated.", "No matching summary rows."), warningText(response) ? "warning" : "ok");
    } catch (error) {
      if (requestId !== state.compareRequestId) return;
      setNotice("compare-state", error.message, "error");
    } finally {
      if (requestId === state.compareRequestId) setBusy("run-compare", false);
    }
  }

  async function runCompareRawPreview() {
    var payload = state.latestPayloads["compare-raw"] || buildComparePayload();
    if (!payload.gushes.length && !payload.streets.length) {
      setNotice("compare-state", "Select Gush areas or streets before loading raw deals.", "warning");
      return;
    }
    setBusy("load-compare-raw", true);
    setNotice("compare-state", "Loading raw deals preview...", "loading");
    try {
      var response = await postJson("api/compare/raw", payload);
      var data = response.data || {};
      renderTable("compare-raw-table", data.rows || [], compareRawColumns(), {
        sortable: true,
        filterable: true,
        resetState: true
      });
      setNotice("compare-state", warningText(response) || emptyText(data.rows, "Raw deals preview loaded.", "No matching raw deals."), warningText(response) ? "warning" : "ok");
    } catch (error) {
      setNotice("compare-state", error.message, "error");
    } finally {
      setBusy("load-compare-raw", false);
    }
  }

  async function runCityComparison(options) {
    options = options || {};
    var payload = buildCityPayload();
    if (!payload.cities.length) {
      setNotice("city-state", "Select at least one city.", "warning");
      return;
    }
    var requestId = ++state.cityRequestId;
    state.latestPayloads["city-comparison-summary"] = payload;
    state.latestPayloads["city-comparison-raw"] = payload;
    setNotice("city-state", options.auto ? "Auto-updating city comparison..." : "Loading city comparison...", "loading");
    setBusy("run-city", true);
    try {
      var response = await postJson(endpoints.citySummary, payload);
      if (requestId !== state.cityRequestId) return;
      var data = response.data || {};
      var chartMode = byId("city-chart-mode").value;
      var transformed = transformSeriesForMode(data.series || [], data.overlays || {}, chartMode);
      renderSeriesChart("city-chart", transformed.series, transformed.overlays, "City Comparison", cityChartYAxisLabel(data.y_variable, chartMode), citySeriesChartOptions());
      renderMetrics("city-counts", data.counts);
      renderCityInsights(data.city_stats);
      renderCityFilterSummary(data);
      renderTable("city-table", data.table || [], citySummaryColumns(), {
        sortable: true,
        filterable: true,
        resetState: true
      });
      setNotice("city-state", warningText(response) || emptyText(data.table, "City comparison updated.", "No matching city rows."), warningText(response) ? "warning" : "ok");
    } catch (error) {
      if (requestId !== state.cityRequestId) return;
      setNotice("city-state", error.message, "error");
    } finally {
      if (requestId === state.cityRequestId) setBusy("run-city", false);
    }
  }

  async function runGushPerformance(options) {
    options = options || {};
    var payload = buildGushPayload();
    if (!payload.city) {
      setNotice("gush-state", "Choose one city first.", "warning");
      return;
    }
    var requestId = ++state.gushRequestId;
    state.latestPayloads["gush-performance-summary"] = payload;
    state.latestPayloads["gush-performance-raw"] = payload;
    setNotice("gush-state", options.auto ? "Auto-updating Gush performance..." : "Loading Gush performance...", "loading");
    setBusy("run-gush", true);
    try {
      var response = await postJson(endpoints.gushSummary, payload);
      if (requestId !== state.gushRequestId) return;
      var data = response.data || {};
      state.latestGushPerformance = data;
      renderSeriesChart("gush-chart", data.series || [], data.overlays || {}, "Gush Performance", yLabel(data.y_variable));
      renderMetrics("gush-counts", data.counts);
      renderGushPerformanceSummary(data);
      renderTable("gush-table", data.performance_table || [], performanceColumns(data.y_variable));
      setNotice("gush-state", warningText(response) || emptyText(data.performance_table, "Gush performance updated.", "No qualified Gush performance rows."), warningText(response) ? "warning" : "ok");
    } catch (error) {
      if (requestId !== state.gushRequestId) return;
      setNotice("gush-state", error.message, "error");
    } finally {
      if (requestId === state.gushRequestId) setBusy("run-gush", false);
    }
  }

  async function downloadCsv(kind) {
    var endpoint = endpoints.downloads[kind];
    if (!endpoint) return;
    var payload = state.latestPayloads[kind] || payloadForDownload(kind);
    setNotice("download-state", "Preparing " + kind + " CSV...", "loading");
    try {
      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }
      var blob = await response.blob();
      var filename = filenameFromDisposition(response.headers.get("Content-Disposition")) || kind + ".csv";
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("download-state", filename + " downloaded. Rows: " + (response.headers.get("X-Row-Count") || "unknown"), "ok");
    } catch (error) {
      setNotice("download-state", error.message, "error");
    }
  }

  function buildAnalysisPayload() {
    var gushes = activeGushSelection();
    var priceType = byId("analysis-price-type").value;
    var payload = {
      city: byId("city-select").value,
      streets: gushes.length ? [] : activeStreetSelection(),
      gushes: gushes,
      filters: buildFilters("analysis"),
      y_variable: yVariableForPriceType(priceType),
      price_type: priceType,
      show_sp500: byId("show-sp500").checked,
      show_city_comparison: byId("show-city-overlay").checked,
      remove_price_outliers: byId("remove-price-outliers").checked,
      remove_area_outliers: byId("remove-area-outliers").checked,
      limit: intValue("row-limit", 2000),
      sample_seed: 1
    };
    addOptionalPayloadValue(payload, "color_var", "analysis-color-var");
    addOptionalPayloadValue(payload, "shape_var", "analysis-shape-var");
    addOptionalPayloadValue(payload, "size_var", "analysis-size-var");
    addOptionalPayloadValue(payload, "facet_var", "analysis-facet-var");
    return payload;
  }

  function buildComparePayload() {
    var gushes = activeGushSelection();
    var streets = gushes.length ? [] : activeStreetSelection();
    return {
      city: streets.length ? byId("city-select").value : "",
      streets: streets,
      gushes: gushes,
      filters: buildFilters("compare"),
      y_variable: byId("compare-y-variable").value,
      statistic: byId("compare-statistic").value,
      show_sp500: byId("compare-show-sp500").checked,
      show_city_comparison: byId("compare-show-city-overlay").checked,
      remove_price_outliers: byId("compare-remove-price-outliers").checked
    };
  }

  function buildCityPayload() {
    return {
      cities: selectedValues(byId("city-comparison-select")),
      filters: buildFilters("city"),
      y_variable: byId("city-y-variable").value,
      statistic: byId("city-statistic").value,
      show_sp500: byId("city-show-sp500").checked,
      remove_price_outliers: byId("city-remove-price-outliers").checked,
      min_deals_per_year: intValue("city-min-deals", 10),
      exclude_2027: true
    };
  }

  function buildGushPayload() {
    return {
      city: byId("gush-city-select").value,
      filters: buildFilters("gush"),
      yvar: byId("gush-y-variable").value,
      statistic: byId("gush-statistic").value,
      top_count: intValue("gush-top-count", 5),
      typical_count: intValue("gush-typical-count", 0),
      bottom_count: intValue("gush-bottom-count", 5),
      min_deals_per_gush: intValue("gush-min-deals", 5),
      show_city: byId("gush-show-city-overlay").checked,
      show_sp500: byId("gush-show-sp500").checked,
      remove_price_outliers: byId("gush-remove-price-outliers").checked
    };
  }

  function buildFilters(scope) {
    scope = scope || "analysis";
    var filters = {};
    addRange(filters, "deal_year_range", filterControlId(scope, "filter-year-min"), filterControlId(scope, "filter-year-max"));
    addRange(filters, "price_range", filterControlId(scope, "filter-price-min"), filterControlId(scope, "filter-price-max"));
    addRange(filters, "price_per_m2_range", filterControlId(scope, "filter-price-m2-min"), filterControlId(scope, "filter-price-m2-max"));
    addRange(filters, "area_range", filterControlId(scope, "filter-area-min"), filterControlId(scope, "filter-area-max"));
    addRange(filters, "floor_range", filterControlId(scope, "filter-floor-min"), filterControlId(scope, "filter-floor-max"));
    addRange(filters, "building_floors_range", filterControlId(scope, "filter-building-floors-min"), filterControlId(scope, "filter-building-floors-max"));
    addRange(filters, "built_year_range", filterControlId(scope, "filter-built-year-min"), filterControlId(scope, "filter-built-year-max"));
    addRange(filters, "building_age_range", filterControlId(scope, "filter-building-age-min"), filterControlId(scope, "filter-building-age-max"));
    var rooms = selectedValues(byId(filterControlId(scope, "rooms-select"))).map(Number).filter(Number.isFinite);
    if (rooms.length) filters.rooms = rooms;
    addOptionalFilter(filters, "roof_select", filterControlId(scope, "roof-select"), "both");
    addOptionalFilter(filters, "new_project_select", filterControlId(scope, "new-project-select"), "both");
    var apartmentTypes = selectedValues(byId(filterControlId(scope, "apartment-type-select")));
    if (apartmentTypes.length) filters.apartment_types = apartmentTypes;
    return filters;
  }

  function payloadForDownload(kind) {
    if (kind === "analysis") return buildAnalysisPayload();
    if (kind.indexOf("compare-") === 0) return buildComparePayload();
    if (kind.indexOf("city-comparison-") === 0) return buildCityPayload();
    if (kind.indexOf("gush-performance-") === 0) return buildGushPayload();
    return {};
  }

  function yVariableForPriceType(priceType) {
    var variableByLabel = {
      "Price": "price_millions",
      "Price / m²": "price_per_m2",
      "Price / Room": "price_per_room"
    };
    return variableByLabel[priceType] || "price_millions";
  }

  function renderAnalysisChart(data) {
    var points = data.points || [];
    if (!points.length) {
      renderAnalysisChartGuide(data);
      return;
    }
    var chartSpec = analysisChartSpec(points, data);
    Plotly.react("analysis-chart", chartSpec.traces, chartSpec.layout).then(function () {
      var chart = byId("analysis-chart");
      if (chart.removeAllListeners) chart.removeAllListeners("plotly_click");
      chart.on("plotly_click", function (event) {
        var point = event.points && event.points[0];
        if (point && point.customdata) selectDeal(point.customdata);
      });
      markSelectedDealOnChart(state.selectedPointId);
    });
  }

  function renderAnalysisChartGuide(data) {
    var chart = byId("analysis-chart");
    if (window.Plotly && chart.classList.contains("js-plotly-plot")) {
      Plotly.purge(chart);
    }
    chart.className = "chart chart-guide";
    var hasAttemptedAnalysis = data && Object.prototype.hasOwnProperty.call(data, "table_rows");
    var title = hasAttemptedAnalysis ? "No Matching Transactions" : "Getting Started";
    var intro = hasAttemptedAnalysis ?
      "Broaden the current selection or loosen filters, then update analysis again." :
      "Use the plot space as your checklist until the scatter plot is ready.";
    chart.innerHTML = '<div class="chart-guide-content">' +
      '<h3>' + escapeHtml(title) + "</h3>" +
      '<p>' + escapeHtml(intro) + "</p>" +
      "<ol>" +
      "<li><strong>Select a city</strong> or use Random to load a runnable example.</li>" +
      "<li><strong>Choose properties</strong> by searching streets, selecting Gush areas, or expanding selected Gush areas into streets.</li>" +
      "<li><strong>Adjust filters</strong> for year, price, area, rooms, floor, project status, and outliers.</li>" +
      "<li><strong>Update analysis</strong> to draw the transaction-level scatter plot and table.</li>" +
      "</ol>" +
      '<div class="chart-guide-tips"><strong>Tips</strong><ul>' +
      "<li>Use street search when you do not know which Gush area contains a street.</li>" +
      "<li>Smart reset chooses common room counts for the current selection.</li>" +
      "<li>After the plot appears, click a point to inspect its transaction details.</li>" +
      "</ul></div>" +
      "</div>";
  }

  function analysisChartSpec(points, data) {
    var facetValues = limitedCategories(points.map(function (point) { return categoryValue(point.facet); }), ANALYSIS_FACET_LIMIT);
    var facets = facetValues.length ? facetValues : ["All"];
    var traces = [];
    var colorVar = byId("analysis-color-var").value;
    var colors = colorPalette(byId("analysis-color-palette").value, colorVar);
    var symbolPalette = shapeSymbols(byId("analysis-shape-palette").value);
    var colorValues = limitedCategories(points.map(function (point) { return categoryValue(point.color); }), colors.length);
    var shapeValues = limitedCategories(points.map(function (point) { return categoryValue(point.shape); }), symbolPalette.length);
    var colorByValue = mapByValue(colorValues, colors);
    var symbolByValue = mapByValue(shapeValues, symbolPalette);
    var sizes = scaledSizes(points);

    facets.forEach(function (facet, facetIndex) {
      var facetPoints = facet === "All" ? points : points.filter(function (point) {
        return categoryValue(point.facet) === facet;
      });
      var groups = groupPoints(facetPoints);
      orderedGroupKeys(groups, colorValues, shapeValues).forEach(function (key) {
        var group = groups[key];
        var first = group[0] || {};
        var colorValue = categoryValue(first.color);
        var shapeValue = categoryValue(first.shape);
        var axisIndex = facetIndex + 1;
        traces.push({
          name: traceName(colorValue, shapeValue, colorValues.length, shapeValues.length),
          type: "scatter",
          mode: "markers",
          x: group.map(function (row) { return row.date; }),
          y: group.map(function (row) { return row.y; }),
          text: group.map(function (row) { return row.tooltip; }),
          customdata: group.map(function (row) { return row.id; }),
          hovertemplate: "%{text}<extra></extra>",
          marker: {
            color: colorByValue[colorValue] || colors[0],
            size: group.map(function (row) { return sizes[row.id] || 8; }),
            symbol: symbolByValue[shapeValue] || symbolPalette[0],
            opacity: 0.78,
            line: { width: 0.5, color: "#fff" }
          },
          selected: {
            marker: {
              opacity: 1,
              size: 18,
              line: { width: 4, color: "#d02f2f" }
            }
          },
          unselected: {
            marker: { opacity: 0.28 }
          },
          xaxis: axisName("x", axisIndex),
          yaxis: axisName("y", axisIndex),
          showlegend: facetIndex === 0
        });
      });
    });

    var layout = chartLayout("Analysis Deals", yLabel(data.summary && data.summary.price_type));
    if (facets.length > 1) {
      addOverlayTraces(traces, data.overlays || {}, { facets: facets });
      applyFacetLayout(layout, facets, {
        facetLabel: selectedOptionText("analysis-facet-var"),
        xAxisTitle: "Date",
        xRange: dateAxisRange(points),
        yAxis: numericAxisSpec(points.map(function (point) { return point.y; }))
      });
    } else {
      addOverlayTraces(traces, data.overlays || {});
    }
    return { traces: traces, layout: layout };
  }

  function renderSeriesChart(targetId, series, overlays, title, yAxisTitle, options) {
    options = options || {};
    if (!seriesHasPoints(series)) {
      renderSeriesChartGuide(targetId, title, true);
      return;
    }
    var chart = byId(targetId);
    chart.className = "chart";
    if (!chart.classList.contains("js-plotly-plot")) chart.innerHTML = "";
    var colors = options.colors || colorPalette("default", "series");
    if (options.reverseColors) colors = colors.slice().reverse();
    var symbols = options.symbols || [];
    var traces = (series || []).map(function (item, index) {
      var color = item.color || colors[index % colors.length];
      var symbol = symbols.length ? symbols[index % symbols.length] : undefined;
      return {
        name: item.label,
        type: "scatter",
        mode: options.showMarkers === false ? "lines" : "lines+markers",
        x: (item.points || []).map(function (point) { return point.date || point.year; }),
        y: (item.points || []).map(function (point) { return point.y; }),
        text: (item.points || []).map(function (point) {
          return point.tooltip || item.label + "<br>Year: " + valueOrDash(point.year) + "<br>Deals: " + valueOrDash(point.n_deals) + "<br>Value: " + valueOrDash(point.y);
        }),
        hovertemplate: "%{text}<extra></extra>",
        line: { color: color },
        marker: {
          size: cityPointSizes(item.points || [], options.pointSizeRange),
          color: color,
          symbol: symbol
        }
      };
    });
    addOverlayTraces(traces, overlays || {});
    Plotly.react(targetId, traces, chartLayout(title, yAxisTitle));
  }

  function seriesHasPoints(series) {
    return (series || []).some(function (item) {
      return Array.isArray(item.points) && item.points.length;
    });
  }

  function renderSeriesChartGuide(targetId, title, hasAttemptedUpdate) {
    var chart = byId(targetId);
    if (window.Plotly && chart.classList.contains("js-plotly-plot")) {
      Plotly.purge(chart);
    }
    chart.className = "chart chart-guide";
    var copy = seriesGuideCopy(targetId);
    var heading = hasAttemptedUpdate ? "No Matching Summary Rows" : "Getting Started";
    var intro = hasAttemptedUpdate ? copy.emptyIntro : copy.intro;
    chart.innerHTML = '<div class="chart-guide-content">' +
      '<h3>' + escapeHtml(heading) + "</h3>" +
      '<p>' + escapeHtml(intro) + "</p>" +
      "<ol>" + copy.steps.map(function (step) { return "<li>" + step + "</li>"; }).join("") + "</ol>" +
      '<div class="chart-guide-tips"><strong>Tips</strong><ul>' +
      copy.tips.map(function (tip) { return "<li>" + tip + "</li>"; }).join("") +
      "</ul></div>" +
      "</div>";
  }

  function seriesGuideCopy(targetId) {
    var guides = {
      "compare-chart": {
        intro: "Use the plot space as your area-comparison checklist until the yearly lines are ready.",
        emptyIntro: "Broaden the selected areas or loosen filters, then update compare again.",
        steps: [
          "<strong>Search a street across all cities</strong> or pick known Gush areas.",
          "<strong>Add the matching Gush areas</strong> directly from the search results.",
          "<strong>Pick a Y value</strong> such as price, price per m², price per room, or deal count.",
          "<strong>Update compare</strong> to draw yearly lines and fill the summary table."
        ],
        tips: [
          "Use Gush areas for neighborhood-block comparisons and streets for focused checks.",
          "Turn on city-wide to see the selected city as a reference line.",
          "Use Summary CSV for grouped trends and Raw CSV for the underlying deals."
        ]
      },
      "city-chart": {
        intro: "Use the plot space as your city-comparison checklist until the yearly lines are ready.",
        emptyIntro: "Select more cities or loosen filters, then update cities again.",
        steps: [
          "<strong>Select cities</strong> from the city list.",
          "<strong>Choose a Y value</strong> for the comparison.",
          "<strong>Adjust filters</strong> only if you want a narrower city-level slice.",
          "<strong>Update cities</strong> to draw city trend lines and generate the table."
        ],
        tips: [
          "Deal count is useful for market activity, not just price movement.",
          "Keep filters broad when comparing cities with different housing mixes.",
          "Use Raw CSV when you need to audit which transactions entered the summary."
        ]
      },
      "gush-chart": {
        intro: "Use the plot space as your city-performance checklist until qualified Gush lines are ready.",
        emptyIntro: "Lower minimum deals, adjust group sizes, or loosen filters, then update performance again.",
        steps: [
          "<strong>Select one city</strong> in the shared control panel.",
          "<strong>Set group sizes</strong> for top, typical, and bottom performers.",
          "<strong>Choose minimum deals</strong> so thinly traded Gush areas do not dominate.",
          "<strong>Update performance</strong> to draw qualified Gush trend lines and rankings."
        ],
        tips: [
          "Raise minimum deals for steadier comparisons in large cities.",
          "Use city-wide as a reference line when judging standout Gush areas.",
          "The table shows which Gush areas qualified for each performance group."
        ]
      }
    };
    return guides[targetId] || {
      intro: "Use the plot space as your checklist until the chart is ready.",
      emptyIntro: "Loosen the current selections and filters, then update again.",
      steps: ["<strong>Choose inputs</strong> for this workflow.", "<strong>Update</strong> to draw the chart."],
      tips: ["Use the table below the chart to inspect summarized rows."]
    };
  }

  function addOverlayTraces(traces, overlays, options) {
    options = options || {};
    var facets = options.facets || null;
    if (Array.isArray(overlays.sp500) && overlays.sp500.length) {
      addOverlayTrace(traces, {
        _rows: overlays.sp500,
        name: "S&P 500",
        type: "scatter",
        mode: "lines",
        x: overlays.sp500.map(function (row) { return row.date || row.year; }),
        y: overlays.sp500.map(function (row) { return row.y; }),
        text: overlays.sp500.map(function (row) { return row.tooltip || "S&P 500"; }),
        hovertemplate: "%{text}<extra></extra>",
        line: { color: "#222", dash: "dot" }
      }, facets);
    }
    ["city", "city_wide", "city_comparison", "selected"].forEach(function (key) {
      if (Array.isArray(overlays[key]) && overlays[key].length) {
        addOverlayTrace(traces, {
          _rows: overlays[key],
          name: key === "city_comparison" ? "City-wide" : key.replace("_", " "),
          type: "scatter",
          mode: "lines",
          x: overlays[key].map(function (row) { return row.date || row.year; }),
          y: overlays[key].map(function (row) { return row.y; }),
          text: overlays[key].map(function (row) { return row.tooltip || key; }),
          hovertemplate: "%{text}<extra></extra>",
          line: { color: "#7b4d87", dash: "dash" }
        }, facets);
      }
    });
  }

  function addOverlayTrace(traces, trace, facets) {
    if (!facets || facets.length <= 1) {
      delete trace._rows;
      traces.push(trace);
      return;
    }
    facets.forEach(function (facet, index) {
      var rows = (trace._rows || []).filter(function (row) {
        return row.facet === undefined || row.facet === null || categoryValue(row.facet) === facet;
      });
      var traceForFacet = Object.assign({}, trace, {
        xaxis: axisName("x", index + 1),
        yaxis: axisName("y", index + 1),
        showlegend: index === 0,
        name: index === 0 ? trace.name : trace.name + " (" + facet + ")"
      });
      delete traceForFacet._rows;
      if (rows.length && trace._rows) {
        traceForFacet.x = rows.map(function (row) { return row.date || row.year; });
        traceForFacet.y = rows.map(function (row) { return row.y; });
        traceForFacet.text = rows.map(function (row) { return row.tooltip || trace.name; });
      }
      traces.push(traceForFacet);
    });
  }

  function chartLayout(title, yAxisTitle) {
    return {
      title: { text: title },
      margin: { t: 46, r: 24, b: 48, l: 62 },
      xaxis: { title: "Year / date", automargin: true },
      yaxis: { title: yAxisTitle || "Value", automargin: true },
      legend: { orientation: "h" },
      hoverlabel: { align: "left" },
      hovermode: "closest"
    };
  }

  function addOptionalPayloadValue(payload, key, selectId) {
    var value = byId(selectId).value;
    if (value) payload[key] = value;
  }

  function shapeSymbols(palette) {
    if (palette === "open") return ["circle-open", "square-open", "diamond-open", "cross-open", "triangle-up-open", "x-open"];
    if (palette === "solid") return ["circle", "square", "diamond", "cross", "triangle-up", "x"];
    if (palette === "mixed") return ["circle", "circle-open", "square", "square-open", "diamond", "diamond-open", "triangle-up", "triangle-up-open"];
    return ["circle", "square", "diamond", "cross", "triangle-up", "x", "star", "hexagon"];
  }

  function colorPalette(palette, colorVar) {
    var palettes = {
      default: ["#186c72", "#b04a4a", "#3478b9", "#8a6f2a", "#7a4f9d", "#208557", "#c06624", "#5f6b73"],
      okabe: ["#e69f00", "#56b4e9", "#009e73", "#f0e442", "#0072b2", "#d55e00", "#cc79a7", "#999999"],
      bold: ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#f0e442", "#56b4e9", "#e69f00", "#000000"],
      soft: ["#6f9db2", "#d58f7d", "#8bbf9f", "#c6a15b", "#9c89b8", "#d6a2b8", "#8f9a6c", "#7e8d94"],
      contrast: ["#004488", "#ddaa33", "#bb5566", "#000000", "#33bbc5", "#994455", "#228833", "#eeeeee"],
      earth: ["#2f6f5e", "#9f6b43", "#6f7f3f", "#b27a2f", "#536878", "#8f4f39", "#7d6f55", "#3f3f3f"],
      category20: ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf", "#aec7e8", "#ffbb78", "#98df8a", "#ff9896", "#c5b0d5", "#c49c94", "#f7b6d3", "#c7c7c7", "#dbdb8d", "#9edae5"],
      grey: ["#222222", "#444444", "#666666", "#888888", "#aaaaaa", "#c4c4c4", "#d8d8d8", "#eeeeee"]
    };
    var colors = palettes[palette] || palettes.default;
    return colorVar ? colors : ["#4a4a4a"].concat(colors);
  }

  function categoryValue(value) {
    return value === null || value === undefined || value === "" ? "All" : String(value);
  }

  function limitedCategories(values, limit) {
    var seen = [];
    values.forEach(function (value) {
      var category = categoryValue(value);
      if (category !== "All" && seen.indexOf(category) === -1) seen.push(category);
    });
    return seen.sort(compareCategoryValues).slice(0, limit);
  }

  function compareCategoryValues(a, b) {
    var aLeading = leadingNumber(a);
    var bLeading = leadingNumber(b);
    if (aLeading !== null && bLeading !== null && aLeading !== bLeading) return aLeading - bLeading;
    var aNumber = Number(a);
    var bNumber = Number(b);
    var aIsNumber = Number.isFinite(aNumber);
    var bIsNumber = Number.isFinite(bNumber);
    if (aIsNumber && bIsNumber && aNumber !== bNumber) return aNumber - bNumber;
    if (aIsNumber !== bIsNumber) return aIsNumber ? -1 : 1;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function leadingNumber(value) {
    var match = String(value).trim().match(/^-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function mapByValue(values, palette) {
    var result = {};
    values.forEach(function (value, index) {
      result[value] = palette[index % palette.length];
    });
    result.All = palette[0];
    return result;
  }

  function scaledSizes(points) {
    var numeric = points.map(function (point) {
      return { id: point.id, value: Number(point.size) };
    }).filter(function (item) {
      return Number.isFinite(item.value);
    });
    if (!numeric.length) return {};
    var min = Math.min.apply(null, numeric.map(function (item) { return item.value; }));
    var max = Math.max.apply(null, numeric.map(function (item) { return item.value; }));
    var result = {};
    numeric.forEach(function (item) {
      result[item.id] = max === min ? 9 : 6 + ((item.value - min) / (max - min)) * 12;
    });
    return result;
  }

  function groupPoints(points) {
    return points.reduce(function (groups, point) {
      var key = categoryValue(point.color) + "||" + categoryValue(point.shape);
      if (!groups[key]) groups[key] = [];
      groups[key].push(point);
      return groups;
    }, {});
  }

  function orderedGroupKeys(groups, colorValues, shapeValues) {
    var colorOrder = categoryOrder(colorValues);
    var shapeOrder = categoryOrder(shapeValues);
    return Object.keys(groups).sort(function (a, b) {
      var aParts = a.split("||");
      var bParts = b.split("||");
      var colorComparison = compareWithOrder(aParts[0], bParts[0], colorOrder);
      if (colorComparison !== 0) return colorComparison;
      return compareWithOrder(aParts[1], bParts[1], shapeOrder);
    });
  }

  function categoryOrder(values) {
    return values.reduce(function (order, value, index) {
      order[value] = index;
      return order;
    }, { All: -1 });
  }

  function compareWithOrder(a, b, order) {
    var aIndex = Object.prototype.hasOwnProperty.call(order, a) ? order[a] : null;
    var bIndex = Object.prototype.hasOwnProperty.call(order, b) ? order[b] : null;
    if (aIndex !== null && bIndex !== null && aIndex !== bIndex) return aIndex - bIndex;
    if (aIndex !== null || bIndex !== null) return aIndex !== null ? -1 : 1;
    return compareCategoryValues(a, b);
  }

  function traceName(colorValue, shapeValue, hasColor, hasShape) {
    var parts = [];
    if (hasColor) parts.push(colorValue);
    if (hasShape && shapeValue !== colorValue) parts.push(shapeValue);
    return parts.length ? parts.join(" / ") : "Deals";
  }

  function axisName(prefix, index) {
    return index === 1 ? prefix : prefix + index;
  }

  function layoutAxisName(prefix, index) {
    return index === 1 ? prefix : prefix + index;
  }

  function dateAxisRange(points) {
    var dates = points.map(function (point) {
      var value = point.date ? new Date(point.date) : null;
      return value && Number.isFinite(value.getTime()) ? value : null;
    }).filter(Boolean);
    if (!dates.length) return null;
    var years = dates.map(function (date) { return date.getFullYear(); });
    var minYear = Math.min.apply(null, years);
    var maxYear = Math.max.apply(null, years);
    return [String(minYear) + "-01-01", String(maxYear + 1) + "-01-01"];
  }

  function numericAxisSpec(values) {
    var numeric = values.map(Number).filter(Number.isFinite);
    if (!numeric.length) return null;
    var maxValue = Math.max.apply(null, numeric);
    var minValue = Math.min.apply(null, numeric);
    var lower = minValue < 0 ? niceFloor(minValue) : 0;
    var upper = niceCeil(maxValue);
    var dtick = niceTick(Math.max(upper - lower, upper || 1), 8);
    return { range: [lower, Math.max(upper, lower + dtick)], dtick: dtick };
  }

  function niceTick(span, targetTicks) {
    var raw = Math.abs(span || 1) / Math.max(targetTicks || 6, 1);
    var magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    var normalized = raw / magnitude;
    var steps = [1, 2, 2.5, 5, 10];
    var step = steps.find(function (candidate) { return normalized <= candidate; }) || 10;
    return step * magnitude;
  }

  function niceCeil(value) {
    var tick = niceTick(Math.abs(value || 1), 8);
    return Math.ceil(value / tick) * tick;
  }

  function niceFloor(value) {
    var tick = niceTick(Math.abs(value || 1), 8);
    return Math.floor(value / tick) * tick;
  }

  function applyFacetLayout(layout, facets, options) {
    options = options || {};
    var columns = Math.min(3, facets.length);
    var rows = Math.ceil(facets.length / columns);
    var xAxisTitle = options.xAxisTitle || (layout.xaxis && layout.xaxis.title) || "Date";
    var yAxisTitle = (layout.yaxis && layout.yaxis.title) || "Value";
    var horizontalGap = columns > 1 ? 0.026 : 0;
    var verticalGap = rows > 1 ? 0.085 : 0;
    var columnWidth = (1 - horizontalGap * (columns - 1)) / columns;
    var rowHeight = (1 - verticalGap * (rows - 1)) / rows;
    var stripHeight = Math.min(0.108, Math.max(0.082, 0.25 / rows));
    var stripGap = Math.min(0.018, rowHeight * 0.09);
    var facetLabel = options.facetLabel ? options.facetLabel.toLowerCase() : "facet";
    delete layout.grid;
    layout.height = Math.max(450, rows * 255 + 165);
    layout.margin.t = 98;
    layout.margin.b = 88;
    layout.margin.l = Math.max(layout.margin.l || 0, 78);
    layout.shapes = (layout.shapes || []).concat(facets.map(function (_, index) {
      var column = index % columns;
      var row = Math.floor(index / columns);
      var x0 = column * (columnWidth + horizontalGap);
      var x1 = x0 + columnWidth;
      var yTop = 1 - row * (rowHeight + verticalGap);
      return {
        type: "rect",
        xref: "paper",
        yref: "paper",
        x0: x0,
        x1: x1,
        y0: yTop - stripHeight,
        y1: yTop,
        line: { width: 0 },
        fillcolor: "#000",
        layer: "above"
      };
    }));
    layout.annotations = facets.map(function (facet, index) {
      var column = index % columns;
      var row = Math.floor(index / columns);
      var x0 = column * (columnWidth + horizontalGap);
      var x1 = x0 + columnWidth;
      var yTop = 1 - row * (rowHeight + verticalGap);
      return {
        text: "<b>" + escapeHtml(facetLabel + ": " + facet) + "</b>",
        x: (x0 + x1) / 2,
        y: yTop - (stripHeight / 2),
        xref: "paper",
        yref: "paper",
        showarrow: false,
        yanchor: "middle",
        font: { size: 14, color: "#fff" }
      };
    }).concat([
      {
        text: escapeHtml(xAxisTitle || "Date"),
        x: 0.5,
        y: -0.105,
        xref: "paper",
        yref: "paper",
        showarrow: false,
        font: { size: 13, color: "#26383c" }
      },
      {
        text: escapeHtml(yAxisTitle || "Value"),
        x: -0.052,
        y: 0.5,
        xref: "paper",
        yref: "paper",
        textangle: -90,
        showarrow: false,
        font: { size: 13, color: "#26383c" }
      }
    ]);
    facets.forEach(function (_, index) {
      var axisIndex = index + 1;
      var column = index % columns;
      var row = Math.floor(index / columns);
      var isBottomRow = row === rows - 1;
      var isFirstColumn = column === 0;
      var x0 = column * (columnWidth + horizontalGap);
      var x1 = x0 + columnWidth;
      var yTop = 1 - row * (rowHeight + verticalGap);
      var yBottom = yTop - rowHeight;
      var xAxisKey = layoutAxisName("xaxis", axisIndex);
      var yAxisKey = layoutAxisName("yaxis", axisIndex);
      var xAxisUpdate = {
        title: "",
        domain: [x0, x1],
        automargin: true,
        tick0: "2000-01-01",
        dtick: "M60",
        tickformat: "%Y",
        showticklabels: isBottomRow
      };
      if (options.xRange) xAxisUpdate.range = options.xRange;
      var yAxisUpdate = {
        title: "",
        domain: [yBottom, Math.max(yBottom + 0.05, yTop - stripHeight - stripGap)],
        automargin: true,
        tick0: 0,
        showticklabels: isFirstColumn
      };
      if (options.yAxis) {
        yAxisUpdate.range = options.yAxis.range;
        yAxisUpdate.dtick = options.yAxis.dtick;
      }
      layout[xAxisKey] = Object.assign({}, layout[xAxisKey] || {}, xAxisUpdate);
      layout[yAxisKey] = Object.assign({}, layout[yAxisKey] || {}, yAxisUpdate);
    });
  }

  function renderTable(targetId, rows, columns, options) {
    var target = byId(targetId);
    options = options || {};
    var shouldResetState = options.resetState;
    options = Object.assign({}, options, { resetState: false });
    if (!rows || !rows.length) {
      target.innerHTML = '<div class="notice">No rows to display.</div>';
      return;
    }
    if (shouldResetState || !state.tableStates[targetId]) {
      state.tableStates[targetId] = { sortKey: "", sortDirection: "asc", filters: {}, globalFilter: "" };
    }
    var tableState = state.tableStates[targetId];
    var processedRows = tableRowsForDisplay(rows, columns, tableState, options);
    var visibleRows = processedRows.slice(0, 500);
    var html = "";
    if (options.filterable) {
      html += '<div class="table-controls">' +
        '<label>Filter all columns<input class="table-global-filter" value="' + escapeHtml(tableState.globalFilter || "") + '" placeholder="Search rows"></label>' +
        '<button class="secondary compact-button table-clear-filters" type="button">Clear filters</button>' +
        "</div>";
    }
    html += "<table><thead><tr>" + columns.map(function (column) {
      var sorted = tableState.sortKey === column.key;
      var sortLabel = sorted ? (tableState.sortDirection === "asc" ? " ▲" : " ▼") : "";
      if (!options.sortable) return "<th>" + escapeHtml(column.label) + "</th>";
      return '<th><button class="table-sort" type="button" data-key="' + escapeHtml(column.key) + '">' +
        escapeHtml(column.label + sortLabel) +
        "</button></th>";
    }).join("") + "</tr>";
    if (options.filterable) {
      html += '<tr class="column-filter-row">' + columns.map(function (column) {
        if (column.filter === "range") {
          var rangeFilter = rangeFilterValue(tableState.filters[column.key]);
          return '<th><span class="table-range-filter">' +
            '<input class="table-column-filter" data-filter-kind="min" data-key="' + escapeHtml(column.key) + '" value="' +
            escapeHtml(rangeFilter.min) + '" placeholder="Min">' +
            '<input class="table-column-filter" data-filter-kind="max" data-key="' + escapeHtml(column.key) + '" value="' +
            escapeHtml(rangeFilter.max) + '" placeholder="Max">' +
            "</span></th>";
        }
        return '<th><input class="table-column-filter" data-key="' + escapeHtml(column.key) + '" value="' +
          escapeHtml(tableState.filters[column.key] || "") + '" placeholder="Filter"></th>';
      }).join("") + "</tr>";
    }
    html += "</thead><tbody>" + visibleRows.map(function (row) {
      return '<tr data-row-id="' + escapeHtml(row.id || "") + '">' + columns.map(function (column) {
        var value = row[column.key];
        return '<td class="' + textDirectionClass(value) + '">' + escapeHtml(valueOrDash(value)) + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
    if (processedRows.length > visibleRows.length || processedRows.length !== rows.length) {
      html += '<div class="notice">Showing ' + visibleRows.length + " of " + processedRows.length +
        " matching rows" + (processedRows.length !== rows.length ? " from " + rows.length + " total" : "") + ".</div>";
    }
    target.innerHTML = html;
    bindTableControls(target, targetId, rows, columns, options);
    if (options && options.selectable) {
      target.querySelectorAll("tbody tr").forEach(function (rowEl) {
        rowEl.addEventListener("click", function () {
          target.querySelectorAll("tr").forEach(function (item) { item.classList.remove("is-selected"); });
          rowEl.classList.add("is-selected");
          selectDeal(rowEl.dataset.rowId);
        });
      });
    }
  }

  function selectDeal(rowId, markerTarget) {
    state.selectedPointId = rowId;
    document.querySelectorAll('#analysis-table tbody tr').forEach(function (rowEl) {
      rowEl.classList.toggle("is-selected", rowEl.dataset.rowId === rowId);
    });
    var row = state.latestAnalysisRows.find(function (item) { return item.id === rowId; });
    renderSelectedDeal(row || null);
    markSelectedDealOnChart(rowId, markerTarget);
  }

  function tableRowsForDisplay(rows, columns, tableState, options) {
    var result = rows.slice();
    if (options.filterable) {
      result = result.filter(function (row) {
        var globalFilter = normalizeSearch(tableState.globalFilter || "");
        var matchesGlobal = !globalFilter || columns.some(function (column) {
          return normalizeSearch(valueOrDash(row[column.key])).indexOf(globalFilter) !== -1;
        });
        if (!matchesGlobal) return false;
        return columns.every(function (column) {
          return matchesColumnFilter(row[column.key], tableState.filters && tableState.filters[column.key], column);
        });
      });
    }
    if (options.sortable && tableState.sortKey) {
      result.sort(function (left, right) {
        var comparison = compareTableValues(left[tableState.sortKey], right[tableState.sortKey]);
        return tableState.sortDirection === "desc" ? -comparison : comparison;
      });
    }
    return result;
  }

  function bindTableControls(target, targetId, rows, columns, options) {
    var tableState = state.tableStates[targetId];
    target.querySelectorAll(".table-sort").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.dataset.key;
        if (tableState.sortKey === key) {
          tableState.sortDirection = tableState.sortDirection === "asc" ? "desc" : "asc";
        } else {
          tableState.sortKey = key;
          tableState.sortDirection = "asc";
        }
        renderTable(targetId, rows, columns, options);
      });
    });
    var globalFilter = target.querySelector(".table-global-filter");
    if (globalFilter) {
      globalFilter.addEventListener("input", function () {
        tableState.globalFilter = globalFilter.value;
        renderTable(targetId, rows, columns, options);
        focusTableFilter(targetId, "global", "");
      });
    }
    target.querySelectorAll(".table-column-filter").forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.dataset.filterKind) {
          var current = rangeFilterValue(tableState.filters[input.dataset.key]);
          current[input.dataset.filterKind] = input.value;
          tableState.filters[input.dataset.key] = current;
        } else {
          tableState.filters[input.dataset.key] = input.value;
        }
        renderTable(targetId, rows, columns, options);
        focusTableFilter(targetId, "column", input.dataset.key, input.dataset.filterKind || "");
      });
    });
    var clearButton = target.querySelector(".table-clear-filters");
    if (clearButton) {
      clearButton.addEventListener("click", function () {
        tableState.filters = {};
        tableState.globalFilter = "";
        renderTable(targetId, rows, columns, options);
      });
    }
  }

  function focusTableFilter(targetId, type, key, filterKind) {
    window.setTimeout(function () {
      var selector = type === "global" ? ".table-global-filter" : '.table-column-filter[data-key="' + cssEscape(key) + '"]';
      if (filterKind) selector += '[data-filter-kind="' + cssEscape(filterKind) + '"]';
      var input = byId(targetId).querySelector(selector);
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 0);
  }

  function compareTableValues(left, right) {
    var leftNumber = parseComparableNumber(left);
    var rightNumber = parseComparableNumber(right);
    if (leftNumber !== null || rightNumber !== null) {
      if (leftNumber === null) return 1;
      if (rightNumber === null) return -1;
      return leftNumber - rightNumber;
    }
    return String(valueOrDash(left)).localeCompare(String(valueOrDash(right)), undefined, { numeric: true, sensitivity: "base" });
  }

  function rangeFilterValue(value) {
    if (value && typeof value === "object") {
      return { min: value.min || "", max: value.max || "" };
    }
    return { min: "", max: "" };
  }

  function matchesColumnFilter(value, filterValue, column) {
    if (column.filter !== "range") {
      var textFilter = normalizeSearch(filterValue || "");
      return !textFilter || normalizeSearch(valueOrDash(value)).indexOf(textFilter) !== -1;
    }
    var range = rangeFilterValue(filterValue);
    var min = parseFilterBoundary(range.min, column);
    var max = parseFilterBoundary(range.max, column);
    var comparable = comparableValue(value, column);
    if (comparable === null) return min === null && max === null;
    if (min !== null && comparable < min) return false;
    if (max !== null && comparable > max) return false;
    return true;
  }

  function parseFilterBoundary(value, column) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    return column.type === "date" ? parseDateBoundary(value) : parseComparableNumber(value);
  }

  function comparableValue(value, column) {
    if (column.type === "date") return parseDateBoundary(value);
    return parseComparableNumber(value);
  }

  function parseDateBoundary(value) {
    var parsed = Date.parse(String(value || "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseComparableNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    var text = String(value).replace(/,/g, "").trim();
    if (!text) return null;
    var number = Number(text);
    if (Number.isFinite(number)) return number;
    var date = Date.parse(text);
    return Number.isFinite(date) ? date : null;
  }

  function markSelectedDealOnChart(rowId) {
    var chart = byId("analysis-chart");
    if (!chart || !chart.data) return;
    var updates = [];
    var traceIndexes = [];
    (chart.data || []).forEach(function (trace, traceIndex) {
      if (!trace.customdata) return;
      var selectedIndexes = [];
      (trace.customdata || []).forEach(function (id, pointIndex) {
        if (String(id) === String(rowId)) selectedIndexes.push(pointIndex);
      });
      updates.push(rowId ? selectedIndexes : null);
      traceIndexes.push(traceIndex);
    });
    if (traceIndexes.length) Plotly.restyle(chart, { selectedpoints: updates }, traceIndexes);
  }

  function renderSelectedDeal(row) {
    var target = byId("selected-deal");
    if (!target) return;
    if (!row) {
      target.innerHTML = "";
      return;
    }
    var fields = [
      ["Date", row.date],
      ["Street", row.street],
      ["Gush", row.gush],
      ["Price", row.price_millions],
      ["Area", row.area],
      ["Rooms", row.rooms],
      ["Type", row.apartment_type],
      ["Address", row.address]
    ];
    target.innerHTML = '<div class="deal-card"><h3>Selected deal</h3><dl>' + fields.map(function (field) {
      return "<div><dt>" + escapeHtml(field[0]) + "</dt><dd class='" + textDirectionClass(field[1]) + "'>" + escapeHtml(valueOrDash(field[1])) + "</dd></div>";
    }).join("") + "</dl></div>";
  }

  function renderMetrics(targetId, counts) {
    var target = byId(targetId);
    if (!counts || !Object.keys(counts).length) {
      target.innerHTML = "";
      return;
    }
    target.innerHTML = Object.keys(counts).map(function (key) {
      return '<div class="metric"><span>' + escapeHtml(labels[key] || key) + '</span><strong>' + escapeHtml(formatNumber(counts[key])) + "</strong></div>";
    }).join("");
  }

  function renderCompareContext(data, payload) {
    var target = byId("compare-context");
    if (!target) return;
    if (!data || !data.counts) {
      target.innerHTML = "";
      return;
    }
    var filters = buildCompareFilterSummary(data, payload || {});
    var counts = data.counts || {};
    target.innerHTML = '<div class="active-filter-box"><strong>Active filters</strong><span>' +
      escapeHtml(filters.join(" • ")) + "</span></div>" +
      '<div class="data-summary-box"><strong>Data summary</strong><span>' +
      escapeHtml(valueOrDash(counts.summary_points) + " aggregated points from " + formatNumber(counts.outlier_deals || counts.filtered_deals || 0) + " individual deals") +
      "</span><span>" +
      escapeHtml("Each point = " + (data.statistic || byId("compare-statistic").value) + " of deals in same year and Gush") +
      "</span><span>" +
      escapeHtml("Covering " + valueOrDash(counts.unique_gushes) + " Gush areas across " + valueOrDash(counts.unique_years) + " years") +
      "</span></div>";
  }

  function buildCompareFilterSummary(data, payload) {
    var selection = data.selection || {};
    var gushes = selection.gushes || [];
    var gushText = gushes.length > 3
      ? gushes.slice(0, 3).map(function (gush) { return gush.label || gush.id; }).join(", ") + " (+" + (gushes.length - 3) + " more)"
      : (gushes.map(function (gush) { return gush.label || gush.id; }).join(", ") || "None");
    var cities = (selection.cities || []).map(function (city) { return city.name || city.id; });
    var parts = [
      "Gush: " + gushText,
      "City: " + (cities.join(", ") || "All matched cities"),
      "Y: " + selectedOptionText("compare-y-variable"),
      "Statistic: " + selectedOptionText("compare-statistic")
    ];
    addRangeSummary(parts, "Years", "compare-filter-year-min", "compare-filter-year-max");
    addRangeSummary(parts, "Price", "compare-filter-price-min", "compare-filter-price-max", " M₪");
    addRangeSummary(parts, "Price / m²", "compare-filter-price-m2-min", "compare-filter-price-m2-max", " k₪");
    addRangeSummary(parts, "Area", "compare-filter-area-min", "compare-filter-area-max", " m²");
    addRangeSummary(parts, "Floor", "compare-filter-floor-min", "compare-filter-floor-max");
    var rooms = selectedValues(byId("compare-rooms-select"));
    if (rooms.length) parts.push("Rooms: " + rooms.join(", "));
    var roof = byId("compare-roof-select").value;
    if (roof !== "both") parts.push("Roof: " + (roof === "yes" ? "Yes" : "No"));
    var project = byId("compare-new-project-select").value;
    if (project !== "both") parts.push("New project: " + (project === "yes" ? "Yes" : "No"));
    if (payload.remove_price_outliers) parts.push("Outliers removed");
    return parts;
  }

  function compareYAxisLabel(data) {
    var stat = data && data.statistic ? data.statistic : byId("compare-statistic").value;
    return (stat === "mean" ? "Mean " : "Median ") + yLabel(data && data.y_variable || byId("compare-y-variable").value);
  }

  function compareSeriesChartOptions() {
    return {
      colors: colorPalette(byId("compare-color-palette").value, "series"),
      reverseColors: byId("compare-reverse-colors").checked,
      symbols: shapeSymbols(byId("compare-shape-palette").value),
      pointSizeRange: [5, 16]
    };
  }

  function renderGushPerformanceSummary(data) {
    var filterTarget = byId("gush-filter-summary");
    var infoTarget = byId("gush-performance-info");
    if (!filterTarget || !infoTarget) return;
    if (!data || !data.selection) {
      filterTarget.innerHTML = "";
      infoTarget.innerHTML = "";
      return;
    }
    var selection = data.selection || {};
    var thresholds = data.changes && data.changes.thresholds || {};
    var filters = buildGushFilterSummary();
    filterTarget.innerHTML = '<strong>Active filters</strong><span>' + filters.map(escapeHtml).join(" • ") + "</span>";
    var qualified = data.counts && data.counts.qualified_gushes || 0;
    var selected = data.counts && data.counts.selected_gushes || 0;
    var selectedCopy = selected + " selected Gush areas from " + qualified + " qualifying areas";
    var groupsCopy = "Showing top " + valueOrDash(selection.top_count) + ", typical " + valueOrDash(selection.typical_count) + ", and bottom " + valueOrDash(selection.bottom_count) + " performers";
    var basisCopy = "Each point = " + selectedOptionText("gush-statistic").toLowerCase() + "; ranked by annualized trimmed mean YoY change; median deals per year " + (thresholds.min_deals_comparison || ">=") + " " + valueOrDash(thresholds.min_deals_per_gush);
    infoTarget.innerHTML = '<strong>Performance analysis</strong><span>' + escapeHtml(selectedCopy) + "</span><span>" + escapeHtml(groupsCopy) + "</span><span>" + escapeHtml(basisCopy) + "</span>";
  }

  function buildGushFilterSummary() {
    var citySelect = byId("gush-city-select");
    var city = citySelect && citySelect.selectedOptions[0] ? citySelect.selectedOptions[0].textContent : valueOrDash(byId("gush-city-select").value);
    var parts = ["City: " + city.replace(/\s+\([0-9,]+\)$/, "")];
    addRangeSummary(parts, "Years", "gush-filter-year-min", "gush-filter-year-max");
    addRangeSummary(parts, "Price", "gush-filter-price-min", "gush-filter-price-max", " M₪");
    addRangeSummary(parts, "Area", "gush-filter-area-min", "gush-filter-area-max", " m²");
    addRangeSummary(parts, "Floor", "gush-filter-floor-min", "gush-filter-floor-max");
    var rooms = selectedValues(byId("gush-rooms-select"));
    if (rooms.length) parts.push("Rooms: " + rooms.join(", "));
    var roof = byId("gush-roof-select").value;
    if (roof !== "both") parts.push("Roof: " + (roof === "yes" ? "Yes" : "No"));
    var project = byId("gush-new-project-select").value;
    if (project !== "both") parts.push("New project: " + (project === "yes" ? "Yes" : "No"));
    return parts;
  }

  function addRangeSummary(parts, label, minId, maxId, suffix) {
    var min = byId(minId).value;
    var max = byId(maxId).value;
    if (min || max) parts.push(label + ": " + valueOrDash(min) + "-" + valueOrDash(max) + (suffix || ""));
  }

  function renderCityInsights(cityStats) {
    var target = byId("city-insights");
    if (!target) return;
    if (!cityStats) {
      target.innerHTML = '<div class="mini-notice">Run city comparison to see rankings.</div>';
      return;
    }
    var cards = (cityStats.cards || []).map(function (card) {
      return '<div class="metric"><span>' + escapeHtml(card.label) + '</span><strong class="' + textDirectionClass(card.value) + '">' +
        escapeHtml(valueOrDash(card.value)) + '</strong>' +
        (card.detail !== undefined && card.detail !== null ? '<small>' + escapeHtml(valueOrDash(card.detail)) + '</small>' : "") +
        "</div>";
    }).join("");
    var ranking = (cityStats.ranking || []).slice(0, 8).map(function (row, index) {
      return '<tr><td>' + (index + 1) + '</td><td class="' + textDirectionClass(row.city) + '">' + escapeHtml(valueOrDash(row.city)) +
        '</td><td>' + escapeHtml(valueOrDash(row.pct_change)) + '%</td><td>' + escapeHtml(valueOrDash(row.last_value)) + '</td><td>' +
        escapeHtml(valueOrDash(row.avg_deals_per_year)) + "</td></tr>";
    }).join("");
    target.innerHTML = '<div class="city-insight-cards">' + (cards || '<div class="mini-notice">No comparable city stats yet.</div>') + "</div>" +
      '<div class="city-ranking"><h4>Change ranking</h4><table><thead><tr><th>#</th><th>City</th><th>Change</th><th>Latest</th><th>Deals / yr</th></tr></thead><tbody>' +
      (ranking || '<tr><td colspan="5">No ranking rows.</td></tr>') + "</tbody></table></div>";
  }

  function renderCityFilterSummary(data) {
    var filterTarget = byId("city-filter-summary");
    var infoTarget = byId("city-data-info");
    if (!filterTarget || !infoTarget) return;
    var filters = buildCityFilterSummary();
    filterTarget.innerHTML = '<strong>Active filters</strong><span>' + filters.map(escapeHtml).join(" • ") + "</span>";
    if (!data || !data.counts) {
      infoTarget.innerHTML = "";
      return;
    }
    var stats = data.city_stats || {};
    var yearRange = stats.year_range ? stats.year_range.min + "-" + stats.year_range.max : valueOrDash(data.counts.unique_years) + " years";
    infoTarget.innerHTML = '<strong>City comparison data</strong><span>' +
      escapeHtml(valueOrDash(data.counts.summary_points) + " aggregated points from " + formatNumber(data.counts.outlier_deals || data.counts.filtered_deals || 0) + " deals") +
      "</span><span>" + escapeHtml("Covering " + valueOrDash(data.counts.plotted_cities || data.counts.unique_cities) + " cities across " + yearRange) +
      "</span><span>" + escapeHtml("Each point = " + selectedOptionText("city-statistic").toLowerCase() + " of deals in same year and city") + "</span>";
  }

  function buildCityFilterSummary() {
    var cities = selectedCityLabels();
    var cityText = cities.length > 3 ? cities.slice(0, 3).join(", ") + " (+" + (cities.length - 3) + " more)" : (cities.join(", ") || "None");
    var parts = ["Cities: " + cityText, "Y: " + selectedOptionText("city-y-variable"), "Statistic: " + selectedOptionText("city-statistic")];
    addRangeSummary(parts, "Years", "city-filter-year-min", "city-filter-year-max");
    addRangeSummary(parts, "Price", "city-filter-price-min", "city-filter-price-max", " M₪");
    addRangeSummary(parts, "Price / m²", "city-filter-price-m2-min", "city-filter-price-m2-max", " k₪");
    addRangeSummary(parts, "Area", "city-filter-area-min", "city-filter-area-max", " m²");
    addRangeSummary(parts, "Floor", "city-filter-floor-min", "city-filter-floor-max");
    var rooms = selectedValues(byId("city-rooms-select"));
    if (rooms.length) parts.push("Rooms: " + rooms.join(", "));
    var roof = byId("city-roof-select").value;
    if (roof !== "both") parts.push("Roof: " + (roof === "yes" ? "Yes" : "No"));
    var project = byId("city-new-project-select").value;
    if (project !== "both") parts.push("New project: " + (project === "yes" ? "Yes" : "No"));
    if (byId("city-remove-price-outliers").checked) parts.push("Outliers removed");
    return parts;
  }

  function selectedCityLabels() {
    return selectedValues(byId("city-comparison-select")).map(function (value) {
      var option = optionForValue(byId("city-comparison-select"), value);
      return option ? option.textContent : value;
    });
  }

  function citySeriesChartOptions() {
    var minSize = numberValue("city-point-size-min");
    var maxSize = numberValue("city-point-size-max");
    if (minSize === null) minSize = 3;
    if (maxSize === null) maxSize = 10;
    if (maxSize < minSize) {
      var swap = minSize;
      minSize = maxSize;
      maxSize = swap;
    }
    return {
      colors: colorPalette(byId("city-color-palette").value, "city"),
      reverseColors: byId("city-reverse-colors").checked,
      showMarkers: byId("city-show-points").checked,
      pointSizeRange: [minSize, maxSize]
    };
  }

  function cityPointSizes(points, range) {
    range = range || [6, 6];
    var values = (points || []).map(function (point) { return Number(point.n_deals); });
    var numeric = values.filter(Number.isFinite);
    if (!numeric.length) return range[0];
    var min = Math.min.apply(null, numeric);
    var max = Math.max.apply(null, numeric);
    return values.map(function (value) {
      if (!Number.isFinite(value) || max === min) return (range[0] + range[1]) / 2;
      return range[0] + ((value - min) / (max - min)) * (range[1] - range[0]);
    });
  }

  function transformSeriesForMode(series, overlays, mode) {
    if (mode === "absolute") return { series: series, overlays: overlays };
    var transformedSeries = (series || []).map(function (item) {
      return Object.assign({}, item, {
        points: transformPointsForMode(item.points || [], mode)
      });
    });
    var transformedOverlays = {};
    Object.keys(overlays || {}).forEach(function (key) {
      transformedOverlays[key] = transformPointsForMode(overlays[key] || [], mode);
    });
    return { series: transformedSeries, overlays: transformedOverlays };
  }

  function transformPointsForMode(points, mode) {
    var ordered = (points || []).slice().sort(function (left, right) {
      return Number(left.year || left.deal_year || 0) - Number(right.year || right.deal_year || 0);
    });
    var basePoint = ordered.find(function (point) { return Number.isFinite(Number(point.y)) && Number(point.y) !== 0; });
    if (!basePoint) return ordered;
    var base = Number(basePoint.y);
    return ordered.map(function (point) {
      var y = Number(point.y);
      var transformedY = Number.isFinite(y) ? (mode === "indexed" ? (y / base) * 100 : ((y / base) - 1) * 100) : null;
      return Object.assign({}, point, {
        raw_y: point.y,
        y: transformedY === null ? null : Math.round(transformedY * 1000) / 1000
      });
    });
  }

  function cityChartYAxisLabel(yVariable, mode) {
    if (mode === "indexed") return "Index (first year = 100)";
    if (mode === "change") return "Change from first year (%)";
    return yLabel(yVariable);
  }

  function renderMetaSummary(meta) {
    var target = byId("metadata-summary");
    if (!meta) {
      target.innerHTML = "";
      return;
    }
    var cards = [
      ["Cities", meta.data_summary && meta.data_summary.city_count],
      ["Rows", meta.data_summary && meta.data_summary.total_city_rows],
      ["Apartment types", (meta.apartment_types || []).length],
      ["Loaded streets", state.streets.length],
      ["Loaded Gush areas", state.gushes.length],
      ["Generated", meta.data_summary && meta.data_summary.generated_at]
    ];
    target.innerHTML = cards.map(infoCard).join("");
    byId("global-summary").innerHTML = cards.slice(0, 2).map(function (card) {
      return '<div class="metric-pill"><strong>' + escapeHtml(formatNumber(card[1])) + '</strong> ' + escapeHtml(card[0]) + "</div>";
    }).join("");
  }

  function renderFilterSummary(data) {
    var target = byId("filter-summary");
    if (!data) {
      target.innerHTML = "";
      return;
    }
    var ranges = data.ranges || {};
    var cards = [
      ["Before outlier removal", data.counts && data.counts.before_outlier_removal],
      ["After outlier removal", data.counts && data.counts.after_outlier_removal],
      ["Year range", rangeText(ranges.deal_year)],
      ["Price range", rangeText(ranges.price_millions)],
      ["Price / m² range", rangeText(ranges.price_per_m2)],
      ["Area range", rangeText(ranges.area)],
      ["Floor range", rangeText(ranges.floor)],
      ["Building floors", rangeText(ranges.build_floors)],
      ["Available apartment types", data.apartment_types && data.apartment_types.available && data.apartment_types.available.length]
    ];
    target.innerHTML = cards.map(infoCard).join("");
  }

  function applyFilterDefaults(data) {
    var ranges = data.ranges || {};
    applyScopedFilterDefaults("analysis", data);
    ["compare", "gush"].forEach(function (scope) {
      setRangeInputs(scope + "-filter-year", ranges.deal_year);
      setRangeInputs(scope + "-filter-price", ranges.price_millions);
      setRangeInputs(scope + "-filter-price-m2", ranges.price_per_m2);
      setRangeInputs(scope + "-filter-area", ranges.area);
      setRangeInputs(scope + "-filter-floor", ranges.floor);
      setRangeInputs(scope + "-filter-building-floors", ranges.build_floors);
      setRangeInputs(scope + "-filter-built-year", ranges.build_year);
      setRangeInputs(scope + "-filter-building-age", ranges.building_age);
    });
    var selectedRooms = selectedValues(byId("rooms-select"));
    var smartRooms = data.rooms && data.rooms.smart_selected || [];
    var roomChoices = data.rooms && data.rooms.choices || [];
    var nextSelectedRooms = smartRoomSelectionForOptions(selectedRooms, roomChoices, smartRooms);
    var roomOptions = (data.rooms && data.rooms.choices || []).map(function (value) {
      return { value: value, label: value };
    });
    setOptions(byId("rooms-select"), roomOptions, true);
    ["compare", "gush"].forEach(function (scope) {
      var select = byId(scope + "-rooms-select");
      var selected = selectedValues(select);
      setOptions(select, roomOptions, true);
      setSelectedValues(select, selected);
    });
    setSelectedValues(byId("rooms-select"), nextSelectedRooms);
    state.roomsSelectionInitialized = true;
    renderRoomChips();
    renderCompareRoomChips();
    renderGushRoomChips();
    syncSegmentedControls();
    if (data.apartment_types && data.apartment_types.available && data.apartment_types.available.length) {
      var availableApartmentOptions = data.apartment_types.available.map(function (value) {
        return { value: value, label: value };
      });
      var selectedApartmentTypes = selectedValues(byId("apartment-type-select"));
      setOptions(byId("apartment-type-select"), availableApartmentOptions, true);
      setSelectedValues(byId("apartment-type-select"), selectedApartmentTypes);
      ["compare", "gush"].forEach(function (scope) {
        var select = byId(scope + "-apartment-type-select");
        var selected = selectedValues(select);
        setOptions(select, availableApartmentOptions, true);
        setSelectedValues(select, selected);
      });
      renderApartmentTypeChips();
      renderCompareApartmentTypeChips();
      renderGushApartmentTypeChips();
    }
  }

  function applyScopedFilterDefaults(scope, data) {
    var ranges = data && data.ranges || {};
    setRangeInputs(filterControlPrefix(scope, "filter-year"), ranges.deal_year);
    setRangeInputs(filterControlPrefix(scope, "filter-price"), ranges.price_millions);
    setRangeInputs(filterControlPrefix(scope, "filter-price-m2"), ranges.price_per_m2);
    setRangeInputs(filterControlPrefix(scope, "filter-area"), ranges.area);
    setRangeInputs(filterControlPrefix(scope, "filter-floor"), ranges.floor);
    setRangeInputs(filterControlPrefix(scope, "filter-building-floors"), ranges.build_floors);
    setRangeInputs(filterControlPrefix(scope, "filter-built-year"), ranges.build_year);
    setRangeInputs(filterControlPrefix(scope, "filter-building-age"), ranges.building_age);
    var roomOptions = (data.rooms && data.rooms.choices || []).map(function (value) {
      return { value: value, label: value };
    });
    var roomsSelect = byId(filterControlId(scope, "rooms-select"));
    if (roomsSelect) {
      setOptions(roomsSelect, roomOptions, true);
      setSelectedValues(roomsSelect, data.rooms && data.rooms.smart_selected || []);
    }
    var aptSelect = byId(filterControlId(scope, "apartment-type-select"));
    if (aptSelect && data.apartment_types && data.apartment_types.available) {
      var current = selectedValues(aptSelect);
      var defaults = state.meta && state.meta.default_filters && state.meta.default_filters.apartment_types || [];
      if (!current.length && (scope === "city" || scope === "gush")) current = defaults;
      setOptions(aptSelect, data.apartment_types.available.map(function (value) {
        return { value: value, label: value };
      }), true);
      setSelectedValues(aptSelect, current.filter(function (value) {
        return data.apartment_types.available.map(String).indexOf(String(value)) !== -1;
      }));
    }
  }

  function applySmartRoomSelection() {
    var smartRooms = state.filterOptions && state.filterOptions.rooms && state.filterOptions.rooms.smart_selected;
    if (!smartRooms || !smartRooms.length) {
      setNotice("metadata-state", "No smart room selection is available for the current filters.", "warning");
      return;
    }
    setSelectedValues(byId("rooms-select"), smartRooms);
    state.roomsSelectionInitialized = true;
    renderRoomChips();
    updateSelectionSummary();
    scheduleAnalysisAutoUpdate("rooms");
    setNotice("metadata-state", "Applied smart room selection: " + smartRooms.join(", ") + ".", "ok");
  }

  function smartRoomSelectionForOptions(currentSelected, roomChoices, smartRooms) {
    var choices = (roomChoices || []).map(String);
    var selected = (currentSelected || []).map(String);
    var smart = (smartRooms || []).map(String);
    if (!state.roomsSelectionInitialized) {
      return smart.length ? smart : choices;
    }

    var choiceSet = new Set(choices);
    var selectedSet = new Set(selected);
    var nextSelected = selected.filter(function (value) {
      return choiceSet.has(value);
    });
    choices.forEach(function (value) {
      if (!selectedSet.has(value)) nextSelected.push(value);
    });

    if (!nextSelected.length) {
      return smart.length ? smart : choices;
    }
    return nextSelected;
  }

  function clearRoomSelection() {
    setSelectedValues(byId("rooms-select"), []);
    state.roomsSelectionInitialized = true;
    renderRoomChips();
    updateSelectionSummary();
    scheduleAnalysisAutoUpdate("rooms");
    setNotice("metadata-state", "Room filter cleared.", "ok");
  }

  function applyGushSmartRoomSelection() {
    var smartRooms = state.filterOptions && state.filterOptions.rooms && state.filterOptions.rooms.smart_selected;
    if (!smartRooms || !smartRooms.length) {
      setNotice("gush-state", "No smart room selection is available for the current city.", "warning");
      return;
    }
    setSelectedValues(byId("gush-rooms-select"), smartRooms);
    renderGushRoomChips();
    scheduleGushAutoUpdate("rooms");
    setNotice("gush-state", "Applied smart room selection: " + smartRooms.join(", ") + ".", "ok");
  }

  function clearGushRoomSelection() {
    setSelectedValues(byId("gush-rooms-select"), []);
    renderGushRoomChips();
    scheduleGushAutoUpdate("rooms");
    setNotice("gush-state", "Room filter cleared for City Performance.", "ok");
  }

  function clearCompareRoomSelection() {
    setSelectedValues(byId("compare-rooms-select"), []);
    renderCompareRoomChips();
    updateSelectionSummary();
    scheduleCompareAutoUpdate("rooms");
    setNotice("compare-state", "Room filter cleared for Compare Areas.", "ok");
  }

  function resetFilterRanges() {
    if (state.filterOptions) {
      applyFilterDefaults(state.filterOptions);
    }
    byId("roof-select").value = "both";
    byId("new-project-select").value = "both";
    syncSegmentedControls();
    updateSelectionSummary();
    scheduleAnalysisAutoUpdate("reset-filters");
    setNotice("metadata-state", "Filter ranges reset to the current selection.", "ok");
  }

  function analysisColumns() {
    return [
      ["date", "Date", "date"], ["city", "City"], ["street", "Street"], ["gush", "Gush", "number"],
      ["price_millions", "Price", "number"], ["price_per_m2", "Price / m²", "number"], ["price_per_room", "Price / Room", "number"],
      ["area", "Area", "number"], ["rooms", "Rooms", "number"], ["floor", "Floor", "number"], ["apartment_type", "Type"],
      ["address", "Address"]
    ].map(function (item) { return { key: item[0], label: item[1], type: item[2] || "text", filter: item[2] ? "range" : "text" }; });
  }

  function summaryColumns(extra) {
    var keys = (extra || []).concat(["series_label", "deal_year", "n_deals", "price_millions", "price_per_m2", "price_per_room", "y"]);
    var labelByKey = {
      city_label: "City",
      gush_label: "Gush",
      series_label: "Series",
      deal_year: "Year",
      n_deals: "Deals",
      price_millions: "Price",
      price_per_m2: "Price / m²",
      price_per_room: "Price / Room",
      y: "Selected value"
    };
    return keys.map(function (key) { return { key: key, label: labelByKey[key] || key }; });
  }

  function compareRawColumns() {
    return [
      ["date", "Date", "date"], ["city", "City"], ["street", "Street"], ["Gush", "Gush", "number"],
      ["price_millions", "Price", "number"], ["price_per_m2", "Price / m²", "number"], ["price_per_room", "Price / Room", "number"],
      ["area", "Area", "number"], ["rooms", "Rooms", "number"], ["floor", "Floor", "number"], ["apt type", "Type"],
      ["FULLADRESS", "Address"], ["New_Project", "Project"], ["build_year", "Built year", "number"], ["building age", "Building age", "number"]
    ].map(function (item) { return { key: item[0], label: item[1], type: item[2] || "text", filter: item[2] ? "range" : "text" }; });
  }

  function performanceColumns(yVariable) {
    var selectedLabel = yLabel(yVariable);
    return [
      { key: "performance_group", label: "Group" },
      { key: "rank", label: "Rank", type: "number", filter: "range" },
      { key: "position_in_group", label: "Group #", type: "number", filter: "range" },
      { key: "gush_label", label: "Gush" },
      { key: "price_change", label: "Change %", type: "number", filter: "range" },
      { key: "yearly_slope", label: "Annual YoY %", type: "number", filter: "range" },
      { key: "first_y", label: "First " + selectedLabel, type: "number", filter: "range" },
      { key: "last_y", label: "Last " + selectedLabel, type: "number", filter: "range" },
      { key: "first_year", label: "First year", type: "number", filter: "range" },
      { key: "last_year", label: "Last year", type: "number", filter: "range" },
      { key: "years_span", label: "Years", type: "number", filter: "range" },
      { key: "median_deals_per_year", label: "Median deals/year", type: "number", filter: "range" }
    ];
  }

  function citySummaryColumns() {
    return [
      { key: "city_label", label: "City" },
      { key: "deal_year", label: "Year", type: "number", filter: "range" },
      { key: "n_deals", label: "Deals", type: "number", filter: "range" },
      { key: "price_millions", label: "Price", type: "number", filter: "range" },
      { key: "price_per_m2", label: "Price / m²", type: "number", filter: "range" },
      { key: "price_per_room", label: "Price / Room", type: "number", filter: "range" },
      { key: "y", label: "Selected value", type: "number", filter: "range" }
    ];
  }

  async function getJson(url) {
    var response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(await responseMessage(response));
    return response.json();
  }

  async function postJson(url, payload) {
    var response = await fetch(url, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    return response.json();
  }

  async function responseMessage(response) {
    var text = await response.text();
    try {
      var parsed = JSON.parse(text);
      if (parsed.warnings && parsed.warnings.length) return parsed.warnings.join(" ");
    } catch (error) {
      return text || response.statusText;
    }
    return response.statusText;
  }

  function setOptions(select, options, multiple) {
    select.innerHTML = "";
    if (!multiple) {
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Choose...";
      select.appendChild(blank);
    }
    options.forEach(function (option) {
      var el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      if (option.searchText) el.dataset.searchText = option.searchText;
      if (hasHebrew(option.label)) el.className = "rtl-text";
      select.appendChild(el);
    });
  }

  function ensureSelectOption(select, option) {
    var existing = optionForValue(select, option.value);
    if (existing) {
      if (option.label) existing.textContent = option.label;
      if (option.searchText) existing.dataset.searchText = option.searchText;
      return existing;
    }
    var el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label || option.value;
    if (option.searchText) el.dataset.searchText = option.searchText;
    if (hasHebrew(el.textContent)) el.className = "rtl-text";
    select.appendChild(el);
    return el;
  }

  function renderCityComparisonPicker() {
    var select = byId("city-comparison-select");
    var search = byId("city-comparison-search");
    var results = byId("city-comparison-results");
    var selectedTarget = byId("city-comparison-selected");
    if (!select || !search || !results || !selectedTarget) return;

    var options = Array.from(select.options || []);
    var selected = new Set(selectedValues(select).map(String));
    var query = normalizeSearch(search.value);
    var visible = query
      ? options.filter(function (option) {
          return selected.has(String(option.value)) || normalizeSearch(optionSearchText(option)).indexOf(query) !== -1;
        }).slice(0, 30)
      : options.slice(0, 12);

    selectedTarget.innerHTML = "";
    var selectedList = Array.from(selected);
    if (selectedList.length > 8) {
      var summary = document.createElement("div");
      summary.className = "city-selection-summary";
      var selectedLabels = selectedList.map(function (value) {
        var option = optionForValue(select, value);
        return option ? option.textContent : value;
      });
      summary.innerHTML = '<strong>' + escapeHtml(formatNumber(selectedList.length) + " cities selected") + "</strong>" +
        '<button class="secondary compact-button" type="button">Clear</button>' +
        '<span class="' + textDirectionClass(selectedLabels.join(", ")) + '">' +
        escapeHtml(selectedLabels.slice(0, 6).join(", ") + (selectedLabels.length > 6 ? " +" + (selectedLabels.length - 6) + " more" : "")) +
        "</span>";
      summary.querySelector("button").addEventListener("click", function () {
        setSelectedValues(select, []);
        renderCityComparisonPicker();
        scheduleCityFilterOptions();
        scheduleCityAutoUpdate("city-clear");
      });
      selectedTarget.appendChild(summary);
    } else {
      selectedList.forEach(function (value) {
      var option = optionForValue(select, value);
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "selection-chip";
      chip.textContent = (option ? option.textContent : value) + " ×";
      chip.addEventListener("click", function () {
        setOptionSelected(select, value, false);
        renderCityComparisonPicker();
        scheduleCityFilterOptions();
        scheduleCityAutoUpdate("city-chip");
      });
      selectedTarget.appendChild(chip);
      });
    }

    results.innerHTML = "";
    if (!visible.length) {
      results.innerHTML = '<div class="mini-notice">No matching cities.</div>';
      return;
    }
    visible.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "picker-option city-picker-option";
      button.classList.toggle("is-selected", selected.has(String(option.value)));
      button.innerHTML = '<span class="' + textDirectionClass(option.textContent) + '">' + escapeHtml(option.textContent) + '</span><small>' +
        escapeHtml(formatNumber(cityRowsForOption(option)) + " rows") + "</small>";
      button.addEventListener("click", function () {
        setOptionSelected(select, option.value, !selected.has(String(option.value)));
        renderCityComparisonPicker();
        scheduleCityFilterOptions();
        scheduleCityAutoUpdate("city-picker");
      });
      results.appendChild(button);
    });
  }

  function applyCityPreset(preset) {
    var select = byId("city-comparison-select");
    var options = Array.from(select.options || []);
    var values = [];
    if (preset === "clear") {
      values = [];
    } else if (preset === "largest") {
      values = options
        .slice()
        .sort(function (left, right) { return cityRowsForOption(right) - cityRowsForOption(left); })
        .slice(0, 8)
        .map(function (option) { return option.value; });
    } else if (preset === "central") {
      var centralNames = ["תל אביב -יפו", "רמת גן", "גבעתיים", "בני ברק", "פתח תקווה", "חולון", "בת ים", "ראשון לציון", "הרצליה", "רעננה", "כפר סבא"];
      var centralSet = new Set(centralNames.map(normalizeSearch));
      values = options.filter(function (option) {
        return centralSet.has(normalizeSearch(option.textContent));
      }).slice(0, 10).map(function (option) { return option.value; });
    }
    setSelectedValues(select, values);
    renderCityComparisonPicker();
    scheduleCityFilterOptions();
    scheduleCityAutoUpdate("city-preset");
    setNotice("city-state", values.length ? "City preset applied. Update cities to refresh the chart." : "City selection cleared.", values.length ? "ok" : "warning");
  }

  function cityRowsForOption(option) {
    if (!state.meta || !state.meta.cities) return 0;
    var city = state.meta.cities.find(function (item) {
      return String(item.id) === String(option.value);
    });
    return Number(city && city.rows) || 0;
  }

  function optionSearchText(option) {
    return [option.textContent, option.dataset && option.dataset.searchText].filter(Boolean).join(" ");
  }

  function renderLocationPickers() {
    renderPicker("streets");
    renderPicker("gushes");
    renderCompareGushPicker();
  }

  function scheduleCompareGushSearch() {
    if (state.compareGushSearchTimer) window.clearTimeout(state.compareGushSearchTimer);
    state.compareGushSearchTimer = window.setTimeout(runCompareGushSearch, 250);
  }

  async function runCompareGushSearch() {
    var search = byId("compare-gush-search") || byId("gush-picker-search");
    var results = byId("compare-gush-results") || byId("gush-picker-results");
    if (!search || !results) return;
    var query = search.value.trim();
    if (query.length < 2) {
      renderCompareGushPicker();
      return;
    }
    var requestId = ++state.compareGushSearchRequestId;
    results.innerHTML = '<div class="mini-notice">Searching Gush areas across all cities...</div>';
    try {
      var response = await getJson("api/gush-search?q=" + encodeURIComponent(query) + "&limit=30");
      if (requestId !== state.compareGushSearchRequestId) return;
      mergeCompareGushOptions(response.data.results || []);
      renderCompareGushPicker();
    } catch (error) {
      results.innerHTML = '<div class="mini-notice error">' + escapeHtml(error.message) + "</div>";
    }
  }

  function mergeCompareGushOptions(gushes) {
    var select = byId("gush-select");
    (gushes || []).forEach(function (gush) {
      var details = [gush.city, "-", gush.label, "(" + gush.id + ")"].filter(Boolean);
      if (gush.representative_street) details.push("- " + gush.representative_street);
      if (gush.deals) details.push("· " + formatNumber(gush.deals) + " deals");
      ensureSelectOption(select, {
        value: gush.id,
        label: details.join(" "),
        searchText: [gush.id, gush.label, gush.city, gush.representative_street].filter(Boolean).join(" ")
      });
    });
  }

  function renderPicker(key) {
    var config = pickerConfig[key];
    var select = byId(config.selectId);
    var search = byId(config.searchId);
    var results = byId(config.resultsId);
    var selectedTarget = byId(config.selectedId);
    if (!select || !search || !results || !selectedTarget) return;

    var options = Array.from(select.options || []).filter(function (option) { return option.value; });
    var selected = new Set(selectedValues(select).map(String));
    var query = normalizeSearch(search.value);
    var visible = query ? options.filter(function (option) {
      return selected.has(String(option.value)) || normalizeSearch(optionSearchText(option)).indexOf(query) !== -1;
    }).slice(0, 24) : [];

    selectedTarget.innerHTML = "";
    Array.from(selected).forEach(function (value) {
      var option = optionForValue(select, value);
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "selection-chip";
      chip.textContent = (option ? option.textContent : value) + " ×";
      chip.addEventListener("click", function () {
        setOptionSelected(select, value, false);
        renderLocationPickers();
        updateSelectionSummary();
        updateCompareSelectionState();
        scheduleFilterOptions();
        scheduleAnalysisAutoUpdate("location-chip");
        scheduleCompareAutoUpdate("location-chip");
      });
      selectedTarget.appendChild(chip);
    });

    results.innerHTML = "";
    if (!options.length) {
      results.innerHTML = '<div class="mini-notice">' + escapeHtml(config.emptyText) + "</div>";
      return;
    }
    if (!query) {
      results.innerHTML = '<div class="mini-notice">' +
        (key === "gushes" && document.body.dataset.activeTab === "compare"
          ? "Search Gush number, city, label, or street across all cities. Selected items stay pinned above."
          : "Search to narrow the list. Selected items stay pinned above.") +
        "</div>";
      return;
    }
    if (!visible.length) {
      results.innerHTML = '<div class="mini-notice">No matches.</div>';
      return;
    }
    visible.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "picker-option";
      button.classList.toggle("is-selected", selected.has(String(option.value)));
      button.textContent = option.textContent;
      if (hasHebrew(option.textContent)) button.classList.add("rtl-text");
      button.addEventListener("click", function () {
        togglePickerValue(key, option.value);
      });
      results.appendChild(button);
    });
  }

  function renderCompareGushPicker() {
    var select = byId("gush-select");
    var search = byId("compare-gush-search");
    var results = byId("compare-gush-results");
    var selectedTarget = byId("compare-gush-selected");
    if (!select || !search || !results || !selectedTarget) return;

    var options = Array.from(select.options || []).filter(function (option) { return option.value; });
    var selected = new Set(selectedValues(select).map(String));
    var query = normalizeSearch(search.value);
    var visible = query ? options.filter(function (option) {
      return selected.has(String(option.value)) || normalizeSearch(optionSearchText(option)).indexOf(query) !== -1;
    }).slice(0, 30) : [];

    selectedTarget.innerHTML = "";
    Array.from(selected).forEach(function (value) {
      var option = optionForValue(select, value);
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "selection-chip";
      chip.textContent = (option ? option.textContent : value) + " ×";
      if (option && hasHebrew(option.textContent)) chip.classList.add("rtl-text");
      chip.addEventListener("click", function () {
        setOptionSelected(select, value, false);
        renderLocationPickers();
        updateSelectionSummary();
        updateCompareSelectionState();
        scheduleFilterOptions();
        scheduleCompareAutoUpdate("compare-gush-chip");
      });
      selectedTarget.appendChild(chip);
    });

    if (!query) {
      results.innerHTML = '<div class="mini-notice">Search by Gush number, city, description, or street. Selected areas stay pinned above.</div>';
      return;
    }
    if (!visible.length) {
      results.innerHTML = '<div class="mini-notice">No matches yet. Keep typing to search all cities.</div>';
      return;
    }

    results.innerHTML = "";
    visible.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "picker-option compare-gush-option";
      button.classList.toggle("is-selected", selected.has(String(option.value)));
      button.innerHTML = '<strong class="' + textDirectionClass(option.textContent) + '">' + escapeHtml(option.textContent) + "</strong>";
      button.addEventListener("click", function () {
        setSelectedValues(byId("street-select"), []);
        setOptionSelected(select, option.value, !option.selected);
        enforceCompareGushLimit();
        renderLocationPickers();
        updateSelectionSummary();
        updateCompareSelectionState();
        scheduleFilterOptions();
        scheduleCompareAutoUpdate("compare-gush-picker");
      });
      results.appendChild(button);
    });
  }

  function togglePickerValue(key, value) {
    var config = pickerConfig[key];
    var select = byId(config.selectId);
    var option = optionForValue(select, value);
    if (!option) return;
    if (!option.selected) {
      setSelectedValues(byId(config.oppositeSelectId), []);
      option.selected = true;
    } else {
      option.selected = false;
    }
    enforceCompareGushLimit();
    renderLocationPickers();
    updateSelectionSummary();
    updateCompareSelectionState();
    scheduleFilterOptions();
    scheduleAnalysisAutoUpdate("location");
    scheduleCompareAutoUpdate("location");
  }

  function scheduleFilterOptions() {
    if (state.filterOptionsTimer) window.clearTimeout(state.filterOptionsTimer);
    if (!byId("city-select").value && !activeGushSelection().length) return;
    state.filterOptionsTimer = window.setTimeout(loadFilterOptions, 450);
  }

  function scheduleCityFilterOptions() {
    if (state.cityFilterOptionsTimer) window.clearTimeout(state.cityFilterOptionsTimer);
    if (!selectedValues(byId("city-comparison-select")).length) return;
    state.cityFilterOptionsTimer = window.setTimeout(loadCityFilterOptions, 450);
  }

  function scheduleGushFilterOptions() {
    if (state.gushFilterOptionsTimer) window.clearTimeout(state.gushFilterOptionsTimer);
    if (!byId("gush-city-select").value) return;
    state.gushFilterOptionsTimer = window.setTimeout(loadGushFilterOptions, 450);
  }

  function scheduleAnalysisAutoUpdate(reason) {
    if (state.autoAnalysisTimer) window.clearTimeout(state.autoAnalysisTimer);
    if (!byId("auto-update-analysis").checked) return;
    state.autoAnalysisTimer = window.setTimeout(function () {
      runAnalysisAutoUpdate(reason);
    }, 750);
  }

  function runAnalysisAutoUpdate(reason) {
    var decision = autoAnalysisDecision();
    if (decision.status === "run") {
      runAnalysis({ auto: true });
      return;
    }
    if (decision.status === "skip-size") {
      setNotice("analysis-state", decision.message, "warning");
    }
  }

  function autoAnalysisDecision() {
    if (!byId("auto-update-analysis").checked) return { status: "off" };
    if (!byId("city-select").value && !activeGushSelection().length) return { status: "missing-selection" };
    if (!state.filterOptions || state.filterOptionsSignature !== currentFilterOptionsSignature()) {
      return { status: "waiting" };
    }
    var counts = state.filterOptions.counts || {};
    var estimate = Number(counts.after_outlier_removal || counts.before_outlier_removal || 0);
    if (!Number.isFinite(estimate) || estimate <= 0) return { status: "run" };
    var rowLimit = intValue("row-limit", 2000);
    if (rowLimit < 1) rowLimit = 2000;
    var renderedPoints = Math.min(rowLimit, estimate);
    if (estimate > AUTO_ANALYSIS_SERVER_ROW_LIMIT) {
      return {
        status: "skip-size",
        message: "Auto update paused for " + formatNumber(estimate) + " estimated matching deals. Click Update analysis to run it."
      };
    }
    if (renderedPoints > AUTO_ANALYSIS_POINT_LIMIT) {
      return {
        status: "skip-size",
        message: "Auto update paused because this would render about " + formatNumber(renderedPoints) + " points. Lower the row limit or click Update analysis."
      };
    }
    return { status: "run" };
  }

  function scheduleCompareAutoUpdate(reason) {
    if (state.autoCompareTimer) window.clearTimeout(state.autoCompareTimer);
    if (!byId("auto-update-compare").checked) return;
    if (document.body.dataset.activeTab !== "compare") return;
    state.autoCompareTimer = window.setTimeout(function () {
      runCompareAutoUpdate(reason);
    }, 650);
  }

  function runInitialCityComparison() {
    if (state.cityInitialRunDone) {
      scheduleCityAutoUpdate("tab");
      return;
    }
    if (!selectedValues(byId("city-comparison-select")).length) return;
    state.cityInitialRunDone = true;
    window.setTimeout(function () {
      if (document.body.dataset.activeTab !== "city") return;
      runCityComparison({ auto: true });
    }, 150);
  }

  function scheduleCityAutoUpdate(reason) {
    if (state.autoCityTimer) window.clearTimeout(state.autoCityTimer);
    if (!byId("auto-update-city").checked) return;
    if (document.body.dataset.activeTab !== "city") return;
    if (!selectedValues(byId("city-comparison-select")).length) return;
    state.autoCityTimer = window.setTimeout(function () {
      var decision = autoCityDecision();
      if (decision.status === "run") {
        runCityComparison({ auto: true });
      } else if (decision.status === "skip-size") {
        setNotice("city-state", decision.message, "warning");
      }
    }, 650);
  }

  function scheduleGushAutoUpdate(reason) {
    if (state.autoGushTimer) window.clearTimeout(state.autoGushTimer);
    if (!byId("auto-update-gush").checked) return;
    if (document.body.dataset.activeTab !== "gush") return;
    if (!byId("gush-city-select").value) return;
    state.autoGushTimer = window.setTimeout(function () {
      var decision = autoGushDecision();
      if (decision.status === "run") {
        runGushPerformance({ auto: true });
      } else if (decision.status === "skip-size") {
        setNotice("gush-state", decision.message, "warning");
      }
    }, 650);
  }

  function autoGushDecision() {
    if (!state.gushFilterOptions || state.gushFilterOptionsSignature !== currentGushFilterOptionsSignature()) {
      scheduleGushFilterOptions();
      return { status: "waiting" };
    }
    return { status: "run" };
  }

  function autoCityDecision() {
    if (!state.cityFilterOptions || state.cityFilterOptionsSignature !== currentCityFilterOptionsSignature()) {
      return { status: "waiting" };
    }
    var counts = state.cityFilterOptions.counts || {};
    var estimate = Number(counts.after_outlier_removal || counts.before_outlier_removal || 0);
    if (!Number.isFinite(estimate) || estimate <= 0 || estimate < 500) return { status: "run" };
    return {
      status: "skip-size",
      message: "Auto update paused for " + formatNumber(estimate) + " city-level deals. Click Update cities to run it."
    };
  }

  function runCompareAutoUpdate(reason) {
    var decision = autoCompareDecision();
    if (decision.status === "run") {
      runCompare({ auto: true });
      return;
    }
    if (decision.status === "skip-size") {
      setNotice("compare-state", decision.message, "warning");
    }
  }

  function autoCompareDecision() {
    var gushes = activeGushSelection();
    var streets = activeStreetSelection();
    if (!gushes.length && !streets.length) return { status: "missing-selection" };
    if (gushes.length > 15) {
      return { status: "skip-size", message: "Auto update paused because Compare Areas supports up to 15 selected Gush areas." };
    }
    return { status: "run" };
  }

  function updateCompareSelectionState() {
    var hasSelection = activeGushSelection().length > 0 || activeStreetSelection().length > 0;
    document.body.dataset.compareHasSelection = hasSelection ? "true" : "false";
    if (document.body.dataset.activeTab === "compare" && !hasSelection) {
      setNotice("compare-state", "Search by street name across all cities, or pick up to 15 Gush areas.", "ok");
    }
  }

  function enforceCompareGushLimit() {
    var select = byId("gush-select");
    var selected = selectedValues(select);
    if (selected.length <= 15) return;
    setSelectedValues(select, selected.slice(0, 15));
    setNotice("compare-state", "Compare Areas supports up to 15 Gush areas. Keeping the first 15 selected.", "warning");
  }

  function filterOptionsSignature(payload) {
    return JSON.stringify({
      city: payload.city || "",
      streets: (payload.streets || []).map(String).sort(),
      gushes: (payload.gushes || []).map(String).sort()
    });
  }

  function currentFilterOptionsSignature() {
    return filterOptionsSignature(filterOptionsPayload());
  }

  function currentCityFilterOptionsSignature() {
    return JSON.stringify(selectedValues(byId("city-comparison-select")).map(String).sort());
  }

  function currentGushFilterOptionsSignature() {
    return JSON.stringify({ city: byId("gush-city-select").value || "" });
  }

  function filterOptionsPayload() {
    var gushes = activeGushSelection();
    return {
      city: document.body.dataset.activeTab === "compare" && gushes.length ? "" : byId("city-select").value,
      streets: activeStreetSelection(),
      gushes: gushes
    };
  }

  function activeStreetSelection() {
    return selectedValues(byId("street-select"));
  }

  function activeGushSelection() {
    return selectedValues(byId("gush-select"));
  }

  function optionForValue(select, value) {
    return Array.from(select.options || []).find(function (option) {
      return String(option.value) === String(value);
    });
  }

  function setOptionSelected(select, value, selected) {
    var option = optionForValue(select, value);
    if (option) option.selected = selected;
  }

  function clearSelect(select) {
    select.innerHTML = "";
  }

  function selectedValues(select) {
    return Array.from(select.selectedOptions || []).map(function (option) { return option.value; }).filter(Boolean);
  }

  function setSelectedValues(select, values) {
    var normalized = new Set((values || []).map(String));
    Array.from(select.options || []).forEach(function (option) {
      option.selected = normalized.has(String(option.value));
    });
  }

  function renderRoomChips() {
    renderScopedRoomChips({
      targetId: "rooms-chip-group",
      selectId: "rooms-select",
      onChange: function () {
        updateSelectionSummary();
        scheduleAnalysisAutoUpdate("rooms");
      }
    });
  }

  function renderCompareRoomChips() {
    renderScopedRoomChips({
      targetId: "compare-rooms-chip-group",
      selectId: "compare-rooms-select",
      onChange: function () {
        updateSelectionSummary();
        scheduleCompareAutoUpdate("rooms");
      }
    });
  }

  function renderGushRoomChips() {
    renderScopedRoomChips({
      targetId: "gush-rooms-chip-group",
      selectId: "gush-rooms-select",
      onChange: function () {
        scheduleGushAutoUpdate("rooms");
      }
    });
  }

  function renderScopedRoomChips(config) {
    var target = byId(config.targetId);
    var select = byId(config.selectId);
    if (!target || !select) return;
    var selected = new Set(selectedValues(select).map(String));
    var options = Array.from(select.options || []).filter(function (option) { return option.value; });
    if (!options.length) {
      target.innerHTML = '<div class="mini-notice">Room options load with the selected area.</div>';
      return;
    }
    target.innerHTML = "";
    options.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "filter-chip";
      button.classList.toggle("is-selected", selected.has(String(option.value)));
      button.textContent = option.textContent;
      button.addEventListener("click", function () {
        option.selected = !option.selected;
        renderScopedRoomChips(config);
        if (config.onChange) config.onChange();
      });
      target.appendChild(button);
    });
  }

  function renderApartmentTypeChips() {
    renderScopedApartmentTypeChips({
      targetId: "apartment-type-chip-group",
      selectId: "apartment-type-select",
      searchId: "apartment-type-search",
      onChange: function () {
        updateSelectionSummary();
        scheduleAnalysisAutoUpdate("apartment-types");
      }
    });
  }

  function renderCompareApartmentTypeChips() {
    renderScopedApartmentTypeChips({
      targetId: "compare-apartment-type-chip-group",
      selectId: "compare-apartment-type-select",
      searchId: "compare-apartment-type-search",
      onChange: function () {
        updateSelectionSummary();
        scheduleCompareAutoUpdate("apartment-types");
      }
    });
  }

  function renderGushApartmentTypeChips() {
    renderScopedApartmentTypeChips({
      targetId: "gush-apartment-type-chip-group",
      selectId: "gush-apartment-type-select",
      searchId: "gush-apartment-type-search",
      onChange: function () {
        scheduleGushAutoUpdate("apartment-types");
      }
    });
  }

  function renderScopedApartmentTypeChips(config) {
    var target = byId(config.targetId);
    var select = byId(config.selectId);
    var search = byId(config.searchId);
    if (!target || !select || !search) return;

    var selected = new Set(selectedValues(select).map(String));
    var query = normalizeSearch(search.value);
    var options = Array.from(select.options || []).filter(function (option) {
      return option.value && (selected.has(String(option.value)) || !query || normalizeSearch(option.textContent).indexOf(query) !== -1);
    });
    var visible = options.slice(0, query ? 24 : 12);

    target.innerHTML = "";
    if (!visible.length) {
      target.innerHTML = '<div class="mini-notice">No matching apartment types.</div>';
      return;
    }
    visible.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "filter-chip";
      button.classList.toggle("is-selected", selected.has(String(option.value)));
      button.textContent = option.textContent;
      if (hasHebrew(option.textContent)) button.classList.add("rtl-text");
      button.addEventListener("click", function () {
        option.selected = !option.selected;
        renderScopedApartmentTypeChips(config);
        if (config.onChange) config.onChange();
      });
      target.appendChild(button);
    });
  }

  function syncSegmentedControls() {
    document.querySelectorAll(".segmented-control").forEach(function (control) {
      var select = byId(control.dataset.select);
      Array.from(control.querySelectorAll("button[data-value]")).forEach(function (button) {
        button.classList.toggle("is-selected", select && String(select.value) === String(button.dataset.value));
      });
    });
  }

  function scheduleAutoUpdateForControl(controlId) {
    if (controlId.indexOf("compare-") === 0) {
      scheduleCompareAutoUpdate(controlId);
    } else if (controlId.indexOf("city-") === 0) {
      scheduleCityAutoUpdate(controlId);
    } else if (controlId.indexOf("gush-") === 0) {
      scheduleGushAutoUpdate(controlId);
    } else {
      scheduleAnalysisAutoUpdate(controlId);
    }
  }

  function selectAdditionalValues(select, values) {
    var normalized = new Set(selectedValues(select).map(String));
    (values || []).forEach(function (value) { normalized.add(String(value)); });
    setSelectedValues(select, Array.from(normalized));
  }

  function addRange(filters, key, minId, maxId) {
    var min = numberValue(minId);
    var max = numberValue(maxId);
    if (min !== null || max !== null) filters[key] = [min, max];
  }

  function addOptionalFilter(filters, key, selectId, emptyValue) {
    var value = byId(selectId).value;
    if (value && value !== emptyValue) filters[key] = value;
  }

  function filterControlId(scope, baseId) {
    return scope === "analysis" ? baseId : scope + "-" + baseId;
  }

  function setRangeInputs(prefix, range) {
    if (!range) return;
    byId(prefix + "-min").value = valueOrEmpty(range.min);
    byId(prefix + "-max").value = valueOrEmpty(range.max);
  }

  function numberValue(id) {
    var value = byId(id).value.trim();
    if (!value) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function intValue(id, fallback) {
    var number = parseInt(byId(id).value, 10);
    return Number.isFinite(number) ? number : fallback;
  }

  function setNotice(id, message, kind) {
    var target = byId(id);
    if (!target) return;
    target.innerHTML = message ? '<div class="notice ' + (kind || "") + '">' + escapeHtml(message) + "</div>" : "";
  }

  function setBusy(id, busy) {
    var button = byId(id);
    if (button) button.disabled = busy;
  }

  function setAnalysisBusy(busy) {
    setBusy("run-analysis", busy);
    setBusy("run-analysis-side", busy);
  }

  function updateSelectionSummary() {
    var target = byId("selection-summary");
    if (!target) return;
    var citySelect = byId("city-select");
    var city = citySelect && citySelect.selectedOptions[0] ? citySelect.selectedOptions[0].textContent : "No city";
    var pieces = [
      ["City", city.replace(/\s+\([0-9,]+\)$/, "")],
      ["Streets", selectedValues(byId("street-select")).length],
      ["Gush areas", selectedValues(byId("gush-select")).length]
    ];
    if (document.body.dataset.activeTab === "analysis") {
      pieces = pieces.concat([
        ["Rooms", selectedValues(byId("rooms-select")).length || "All"],
        ["Status", statusFilterText()],
        ["Custom ranges", customRangeFilterCount()]
      ]);
    } else if (document.body.dataset.activeTab === "compare") {
      pieces = pieces.concat([
        ["Y value", selectedOptionText("compare-y-variable")],
        ["Rooms", selectedValues(byId("compare-rooms-select")).length || "All"],
        ["Custom ranges", customRangeFilterCount("compare")]
      ]);
    } else if (document.body.dataset.activeTab === "city") {
      pieces = [
        ["Cities", selectedValues(byId("city-comparison-select")).length],
        ["Y value", selectedOptionText("city-y-variable")],
        ["Statistic", selectedOptionText("city-statistic")],
        ["Rooms", selectedValues(byId("city-rooms-select")).length || "All"],
        ["Custom ranges", customRangeFilterCount("city")]
      ];
    }
    target.innerHTML = pieces.map(function (piece) {
      return '<div><span>' + escapeHtml(piece[0]) + '</span><strong>' + escapeHtml(piece[1]) + "</strong></div>";
    }).join("");
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function statusFilterText() {
    var labels = [];
    if (byId("roof-select").value !== "both") labels.push("roof " + byId("roof-select").value);
    if (byId("new-project-select").value !== "both") labels.push("project " + byId("new-project-select").value);
    return labels.length ? labels.join(", ") : "Both";
  }

  function customRangeFilterCount(scope) {
    scope = scope || "analysis";
    var defaults = state.filterOptions && state.filterOptions.ranges || {};
    var rangeMap = [
      [filterControlPrefix(scope, "filter-year"), defaults.deal_year],
      [filterControlPrefix(scope, "filter-price"), defaults.price_millions],
      [filterControlPrefix(scope, "filter-price-m2"), defaults.price_per_m2],
      [filterControlPrefix(scope, "filter-area"), defaults.area],
      [filterControlPrefix(scope, "filter-floor"), defaults.floor],
      [filterControlPrefix(scope, "filter-building-floors"), defaults.build_floors],
      [filterControlPrefix(scope, "filter-built-year"), defaults.build_year],
      [filterControlPrefix(scope, "filter-building-age"), defaults.building_age]
    ];
    return rangeMap.reduce(function (count, item) {
      var prefix = item[0];
      var range = item[1] || {};
      var min = numberValue(prefix + "-min");
      var max = numberValue(prefix + "-max");
      var hasValue = min !== null || max !== null;
      var matchesDefault = String(valueOrEmpty(range.min)) === byId(prefix + "-min").value.trim() &&
        String(valueOrEmpty(range.max)) === byId(prefix + "-max").value.trim();
      return count + (hasValue && !matchesDefault ? 1 : 0);
    }, 0);
  }

  function filterControlPrefix(scope, basePrefix) {
    return scope === "analysis" ? basePrefix : scope + "-" + basePrefix;
  }

  function warningText(response) {
    var warnings = [];
    if (response && response.warnings) warnings = warnings.concat(response.warnings);
    if (response && response.data && response.data.warnings) warnings = warnings.concat(response.data.warnings);
    warnings = Array.from(new Set(warnings.filter(Boolean)));
    return warnings.length ? warnings.join(" ") : "";
  }

  function emptyText(rows, okText, emptyMessage) {
    return rows && rows.length ? okText : emptyMessage;
  }

  function infoCard(card) {
    return '<div class="info-card"><span>' + escapeHtml(card[0]) + '</span><strong>' + escapeHtml(formatNumber(card[1])) + "</strong></div>";
  }

  function rangeText(range) {
    if (!range || range.min === null || range.max === null) return "Unavailable";
    return formatNumber(range.min) + " - " + formatNumber(range.max);
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number") return new Intl.NumberFormat().format(Math.round(value * 100) / 100);
    return String(value);
  }

  function valueOrDash(value) {
    return value === null || value === undefined || value === "" ? "-" : value;
  }

  function valueOrEmpty(value) {
    return value === null || value === undefined ? "" : value;
  }

  function selectedOptionText(selectId) {
    var select = byId(selectId);
    if (!select || !select.selectedOptions || !select.selectedOptions.length) return "";
    return select.selectedOptions[0].textContent.trim();
  }

  function yLabel(value) {
    var map = {
      "Price": "Price (Million Shekels)",
      "Price / m²": "Price / m²",
      "Price / Room": "Price / Room",
      price_millions: "Price (Million Shekels)",
      price_per_m2: "Price / m²",
      price_per_room: "Price / Room",
      n_deals: "Deals"
    };
    return map[value] || "Value";
  }

  function filenameFromDisposition(header) {
    if (!header) return "";
    var match = /filename="?([^"]+)"?/i.exec(header);
    return match ? match[1] : "";
  }

  function textDirectionClass(value) {
    return hasHebrew(value) ? "rtl-text" : "ltr-text";
  }

  function hasHebrew(value) {
    return /[\u0590-\u05ff]/.test(String(value || ""));
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
