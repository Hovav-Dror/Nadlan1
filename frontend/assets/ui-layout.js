(function () {
  "use strict";

  // Move the original controls so the application keeps its event handlers and IDs.
  function disclosure(label, className) {
    var details = document.createElement("details");
    details.className = "ui-disclosure " + (className || "");
    var summary = document.createElement("summary");
    summary.textContent = label;
    details.appendChild(summary);
    return details;
  }

  // Keep the original workflow guides, chart controls and filter sections visible.
  // Only uncommon source values and unavailable attributes need disclosure.
  function isCommonRoom(value) {
    var room = Number(value);
    return Number.isFinite(room) && room >= 1 && room <= 6 && Number.isInteger(room * 2);
  }

  function decorateRoomChips(target, select) {
    if (!target || !select) return;
    var options = Array.from(select.options).filter(function (option) { return option.value; });
    var buttons = Array.from(target.children).filter(function (node) { return node.matches("button.filter-chip"); });
    if (buttons.length !== options.length) return;
    var extra = disclosure("ערכים נוספים", "ui-extra-rooms");
    var grid = document.createElement("div");
    grid.className = "filter-chip-group ui-extra-room-grid";
    var selected = 0;
    var total = 0;
    buttons.forEach(function (button, index) {
      var option = options[index];
      button.setAttribute("aria-pressed", String(option.selected));
      if (isCommonRoom(option.value)) return;
      total += 1;
      if (option.selected) selected += 1;
      var room = Number(option.value);
      if (!Number.isFinite(room) || room < 1 || room > 20 || !Number.isInteger(room * 2)) {
        button.classList.add("ui-suspect-value");
        button.title = "ערך לא שגרתי כפי שדווח במקור; מומלץ לבדוק את פרטי העסקה";
      }
      grid.appendChild(button);
    });
    if (!total) return;
    extra.querySelector("summary").textContent = "ערכים נוספים (" + total + "; נבחרו " + selected + ")";
    var note = document.createElement("p");
    note.className = "helper-text";
    note.textContent = "כולל נכסים עם יותר מ־6 חדרים וערכי מקור לא שגרתיים. סגירת הרשימה אינה משנה את הסינון.";
    extra.appendChild(note);
    extra.appendChild(grid);
    extra.open = target.dataset.extraRoomsOpen === "true";
    extra.addEventListener("toggle", function () { target.dataset.extraRoomsOpen = String(extra.open); });
    target.appendChild(extra);
  }

  function refreshAvailability() {
    document.querySelectorAll('select[id$="roof-select"], select[id$="new-project-select"]').forEach(function (select) {
      if (!select.disabled || select.value !== "both" || select.closest(".ui-unavailable-filters")) return;
      var field = select.closest(".segmented-field") || select.closest("label");
      if (!field) return;
      var container = field.closest(".filter-cluster") || field.parentElement;
      var unavailable = container.querySelector(":scope > .ui-unavailable-filters");
      if (!unavailable) {
        unavailable = disclosure("מאפיינים שאינם זמינים במקור הנתונים", "ui-unavailable-filters");
        var note = document.createElement("p");
        note.className = "helper-text";
        note.textContent = "סיווג דירת גג ופרויקט חדש אינו זמין בנתונים הפעילים. מאפיינים אלה אינם מסננים עסקאות.";
        unavailable.appendChild(note);
        container.appendChild(unavailable);
      }
      unavailable.appendChild(field);
      var heading = container.querySelector(":scope > .filter-section-heading");
      if (heading && !container.querySelector(":scope > .segmented-field")) heading.hidden = true;
    });
  }

  function init() {
    refreshAvailability();
    document.querySelectorAll(".table-wrap").forEach(function (table) {
      table.tabIndex = 0;
      if (!table.getAttribute("aria-label")) table.setAttribute("aria-label", "טבלת תוצאות — אפשר לגלול אופקית");
    });
  }

  window.NadlanLayout = { decorateRoomChips: decorateRoomChips, refreshAvailability: refreshAvailability, isCommonRoom: isCommonRoom };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
