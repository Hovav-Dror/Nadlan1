(function () {
  "use strict";

  var state = {
    analysisMode: "chart",
    restoringView: new URLSearchParams(window.location.search).has("view") || new URLSearchParams(window.location.search).has("deal_record"),
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
    compareRoomsSelectionInitialized: false,
    filterOptionsTimer: null,
    filterOptionsRequestId: 0,
    compareGushSearchTimer: null,
    compareGushSearchRequestId: 0,
    compareStreetSearchTimer: null,
    autoAnalysisTimer: null,
    autoCompareTimer: null,
    autoCityTimer: null,
    autoGushTimer: null,
    autoMapTimer: null,
    cityFilterOptionsTimer: null,
    gushFilterOptionsTimer: null,
    analysisRequestId: 0,
    compareRequestId: 0,
    cityRequestId: 0,
    gushRequestId: 0,
    mapRequestId: 0,
    cityFilterOptionsRequestId: 0,
    gushFilterOptionsRequestId: 0,
    cityHasRun: false,
    latestMapData: null,
    leafletMap: null,
    gushMapLayer: null,
    requestControllers: {}
  };

  var DEFAULT_ANALYSIS_ROW_LIMIT = 3000;
  var AUTO_ANALYSIS_POINT_LIMIT = 3000;
  var AUTO_ANALYSIS_SERVER_ROW_LIMIT = 6000;
  var ANALYSIS_FACET_LIMIT = 12;
  var TEL_AVIV_CITY_NAMES = ["תל אביב -יפו", "תל אביב-יפו", "תל אביב יפו", "Tel Aviv-Yafo", "tel_aviv_yafo"];

  var pickerConfig = {
    streets: {
      selectId: "street-select",
      searchId: "street-picker-search",
      resultsId: "street-picker-results",
      selectedId: "street-selected",
      emptyText: "התחילו להקליד כדי למצוא רחובות.",
      oppositeSelectId: "gush-select"
    },
    gushes: {
      selectId: "gush-select",
      searchId: "gush-picker-search",
      resultsId: "gush-picker-results",
      selectedId: "gush-selected",
      emptyText: "התחילו להקליד כדי למצוא גושים.",
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
    gushMap: "api/gush-map",
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
    raw_deals: "עסקאות מקור",
    selected_deals: "עסקאות שנבחרו",
    filtered_deals: "עסקאות אחרי סינון",
    outlier_deals: "אחרי חריגים",
    summary_points: "נקודות סיכום",
    unique_gushes: "גושים",
    unique_years: "שנים",
    unique_cities: "ערים",
    plotted_cities: "ערים בגרף",
    city_rows: "שורות עיר",
    location_rows: "שורות מיקום",
    pre_outlier_rows: "לפני חריגים",
    filtered_rows: "שורות מסוננות",
    outlier_rows: "אחרי חריגים",
    returned_rows: "שורות שהוחזרו",
    qualified_gushes: "גושים כשירים",
    selected_gushes: "גושים שנבחרו",
    qualified_summary_points: "נקודות כשירות",
    features: "מצולעים",
    gushes: "גושים",
    missing_gushes: "גושים חסרים"
  };

  var uiTranslations = {
    "Real Estate Analysis": "ניתוח נדל\"ן",
    "Analysis workflows": "תהליכי ניתוח",
    "Analysis Deals": "ניתוח עסקאות",
    "Compare Areas": "השוואת אזורים",
    "City Comparison": "השוואת ערים",
    "City Performance": "מגמות לפי גוש",
    "Gush Map": "מפת גושים",
    "Gush Performance": "מגמות מחירים לפי גוש",
    "Utilities": "כלים",
    "Data Health": "כיסוי ואיכות הנתונים",
    "Exports": "ייצוא",
    "About": "אודות",
    "Map controls": "פקדי מפה",
    "Controls": "פקדים",
    "Step 1": "שלב 1",
    "Step 2": "שלב 2",
    "Step 3": "שלב 3",
    "Step 4": "שלב 4",
    "Select City": "בחירת עיר",
    "Select Properties": "בחירת נכסים",
    "Analysis Filters": "מסנני ניתוח",
    "Selection Summary": "סיכום בחירה",
    "City": "עיר",
    "Cities": "ערים",
    "Streets": "רחובות",
    "Gush areas": "גושים",
    "Color by": "צבע לפי",
    "Selection": "בחירה",
    "Deal count": "מספר עסקאות",
    "Labels": "תוויות",
    "Street map": "מפת רחובות",
    "Update map": "עדכון מפה",
    "Show selection": "הצגת הבחירה",
    "City Gush polygons over a street map. Selected Gushes are highlighted; the rest stay visible as light context.": "מצולעי הגושים של העיר על גבי מפת רחובות. גושים שנבחרו מודגשים, והשאר נשארים כרקע בהיר.",
    "Picking nearby Gushes by location and checking that the selection matches the streets you care about.": "לבחירת גושים סמוכים לפי מיקום ולבדיקה שהבחירה תואמת לרחובות שמעניינים אתכם.",
    "Click a polygon to select it, use Show selection to return to your picks, or color by Deal count to spot active areas.": "לחצו על מצולע כדי לבחור אותו, השתמשו בהצגת הבחירה כדי לחזור לבחירה, או צבעו לפי מספר עסקאות כדי לזהות אזורים פעילים.",
    "Use the map to select Gushes visually, inspect where the current selection sits, and then reuse that selection in Analysis Deals or Compare Areas.": "השתמשו במפה כדי לבחור גושים ויזואלית, לבדוק איפה הבחירה הנוכחית נמצאת, ואז להשתמש באותה בחירה בניתוח עסקאות או בהשוואת אזורים.",
    "Pick a random city and Gush that can auto update": "בחירת עיר וגוש אקראיים שמתאימים לעדכון אוטומטי",
    "Pick random runnable analysis": "בחירת ניתוח אקראי שניתן להריץ",
    "Random": "אקראי",
    "Search streets": "חיפוש רחובות",
    "Search Gush number, label, or street": "חיפוש מספר גוש, תיאור או רחוב",
    "Use streets from selected Gush": "השתמש ברחובות מהגוש שנבחר",
    "Use whole Gush for selected streets": "השתמש בכל הגוש של הרחובות שנבחרו",
    "Find Gush by street": "איתור גוש לפי רחוב",
    "Find Gush by street name": "איתור גוש לפי שם רחוב",
    "Type a street name": "הקלידו שם רחוב",
    "Search": "חיפוש",
    "Transaction filters for the Analysis Deals tab.": "מסנני עסקאות לטאב ניתוח העסקאות.",
    "Market": "שוק",
    "Property": "נכס",
    "Status": "סטטוס",
    "Deal year min": "שנת עסקה מ-",
    "Deal year max": "שנת עסקה עד",
    "Price min (₪m)": "מחיר מ- (מ' ₪)",
    "Price max (₪m)": "מחיר עד (מ' ₪)",
    "Price / m² min (₪k)": "מחיר למ\"ר מ- (אלף ₪)",
    "Price / m² max (₪k)": "מחיר למ\"ר עד (אלף ₪)",
    "Price / m² from (₪k)": "מחיר למ\"ר מ- (אלף ₪)",
    "Price / m² to (₪k)": "מחיר למ\"ר עד (אלף ₪)",
    "Rooms": "חדרים",
    "Smart reset": "איפוס חכם",
    "Area min (m²)": "שטח מ- (מ\"ר)",
    "Area max (m²)": "שטח עד (מ\"ר)",
    "Floor min": "קומה מ-",
    "Floor max": "קומה עד",
    "Building floors min": "קומות בבניין מ-",
    "Building floors max": "קומות בבניין עד",
    "Built year min": "שנת בנייה מ-",
    "Built year max": "שנת בנייה עד",
    "Building age min": "גיל בניין מ-",
    "Building age max": "גיל בניין עד",
    "All rooms": "כל החדרים",
    "Reset ranges": "איפוס טווחים",
    "Top floor / roof": "קומה עליונה / גג",
    "New project": "פרויקט חדש",
    "Both": "גם",
    "Yes": "רק",
    "No": "לא",
    "Apartment types": "סוגי דירות",
    "Apartment type": "סוג דירה",
    "Search apartment types": "חיפוש סוגי דירות",
    "Price outliers": "חריגי מחיר",
    "Area outliers": "חריגי שטח",
    "Analysis Deals - Granular View": "ניתוח עסקאות - מבט מפורט",
    "What you see": "מה רואים",
    "Best for": "מתאים ל",
    "Use when": "מתי להשתמש",
    "Map shortcut": "קיצור דרך למפה",
    "Each point is one individual deal.": "כל נקודה היא עסקה בודדת.",
    "Detailed exploration, finding specific properties, and understanding price variation within an area.": "חקירה מפורטת, איתור נכסים ספציפיים והבנת שונות מחירים בתוך אזור.",
    "You want to see all deals, inspect individual transactions, or analyze price distribution in detail.": "כשרוצים לראות את כל העסקאות, לבדוק עסקאות בודדות או לנתח התפלגות מחירים בפירוט.",
    "Use Gush Map first to click polygons, then return here to analyze the selected deals.": "השתמשו קודם במפת הגושים כדי לבחור מצולעים, ואז חזרו לכאן לניתוח העסקאות שנבחרו.",
    "Transaction-level": "רמת עסקה",
    "Street or Gush": "רחוב או גוש",
    "Map selection": "בחירה מהמפה",
    "CSV export": "ייצוא CSV",
    "Transaction-level scatter and table for the selected city, streets, and Gush areas.": "גרף וטבלה ברמת עסקה לעיר, לרחובות ולגושים שנבחרו.",
    "Update analysis": "עדכון ניתוח",
    "Cancel": "ביטול",
    "Plot Controls": "פקדי גרף",
    "Color By": "צבע לפי",
    "Shape By": "צורה לפי",
    "Size By": "גודל לפי",
    "Facet By": "פיצול לפי",
    "Color Palette": "ערכת צבעים",
    "Shape Palette": "ערכת צורות",
    "Shape palette": "ערכת צורות",
    "Price Type": "סוג מחיר",
    "Row Limit": "מגבלת שורות",
    "None": "ללא",
    "Default": "ברירת מחדל",
    "Bold": "מודגש",
    "Soft": "רך",
    "High contrast": "ניגודיות גבוהה",
    "Earth": "אדמה",
    "Open": "פתוח",
    "Solid": "מלא",
    "Mixed": "מעורב",
    "Grey": "אפור",
    "Price": "מחיר",
    "Price / m²": "מחיר למ\"ר (אלפי ₪)",
    "Price / Room": "מחיר לחדר (מיליוני ₪)",
    "Year / date": "שנה / תאריך",
    "Date": "תאריך",
    "Value": "ערך",
    "Deals": "עסקאות",
    "Selected price": "מחיר נבחר",
    "Apartment type": "סוג דירה",
    "Street": "רחוב",
    "Gush": "גוש",
    "Deal year": "שנת עסקה",
    "Area": "שטח",
    "Floor": "קומה",
    "Build year": "שנת בנייה",
    "Building age": "גיל בניין",
    "Building floors": "קומות בבניין",
    "Roof": "גג",
    "Auto update": "עדכון אוטומטי",
    "Auto-update": "עדכון אוטומטי",
    "Auto-update for small datasets (<500 records)": "עדכון אוטומטי לנתונים קטנים (פחות מ-500 רשומות)",
    "Auto-update city chart": "עדכון גרף אוטומטי",
    "City-wide": "כל העיר",
    "Getting Started": "איך מתחילים",
    "No Matching Transactions": "לא נמצאו עסקאות מתאימות",
    "No Matching Summary Rows": "לא נמצאו שורות סיכום מתאימות",
    "Tips": "טיפים",
    "Loaded cities, streets, Gush labels, and the dynamic filter ranges behind the analysis workflow.": "ערים, רחובות, תיאורי גושים וטווחי הסינון הדינמיים שמאחורי הניתוח.",
    "Refresh metadata": "רענון מטא-דאטה",
    "Background, data notes, and a short guide carried over from the original Shiny app.": "רקע, הערות נתונים ומדריך קצר שהועברו מאפליקציית Shiny המקורית.",
    "Area comparison": "השוואת אזורים",
    "Yearly summary": "סיכום שנתי",
    "Raw + summary CSV": "CSV גולמי + סיכום",
    "Search streets or Gush descriptions across all cities, then compare up to 15 Gush areas.": "חפשו רחובות או תיאורי גושים בכל הערים והשוו עד 15 גושים.",
    "Use Gush Map to choose nearby polygons visually, then compare the selected Gushes here.": "השתמשו במפת הגושים כדי לבחור מצולעים סמוכים ויזואלית, ואז השוו כאן את הגושים שנבחרו.",
    "Update compare": "עדכון השוואה",
    "Summary CSV": "CSV סיכום",
    "Raw CSV": "CSV גולמי",
    "Compare area selection": "בחירת אזורים להשוואה",
    "Step 1: Select Areas": "שלב 1: בחירת אזורים",
    "Pick Gush blocks directly, or type a street name and add the matching Gush areas from the results.": "בחרו גושים ישירות, או הקלידו שם רחוב והוסיפו את הגושים המתאימים מהתוצאות.",
    "Pick blocks (Gush numbers)": "בחירת גושים",
    "Search Gush number, city, label, or street": "חיפוש מספר גוש, עיר, תיאור או רחוב",
    "Compare controls": "פקדי השוואה",
    "Filter the transactions used for each selected Gush before aggregation.": "סננו את העסקאות שנכנסות לכל גוש לפני האגרגציה.",
    "Filter the transactions used for each selected city before aggregation.": "סננו את העסקאות שנכנסות לכל עיר לפני האגרגציה.",
    "Y value": "ערך Y",
    "Statistic": "מדד",
    "Median": "חציון",
    "Mean": "ממוצע",
    "median": "חציון",
    "mean": "ממוצע",
    "Color palette": "ערכת צבעים",
    "Y-axis Variable": "משתנה ציר Y",
    "Reverse colors": "היפוך צבעים",
    "Year min": "שנה מ-",
    "Year max": "שנה עד",
    "Advanced filters": "מסננים מתקדמים",
    "Transaction filters": "מסנני עסקאות",
    "City-level": "רמת עיר",
    "Yearly trends": "מגמות שנתיות",
    "Drill-down map": "מפת המשך",
    "Broad filters": "מסננים רחבים",
    "City/year summaries. Run explicitly because broad city selections can be expensive.": "סיכומי עיר/שנה. עדכון אוטומטי זמין לבחירות קטנות; לבחירות רחבות לחצו על עדכון גרף.",
    "Step 1: Select Cities": "שלב 1: בחירת ערים",
    "Search, pin cities, or start from a preset group.": "חפשו, סמנו ערים או התחילו מקבוצת ברירת מחדל.",
    "Largest": "הגדולות",
    "Central": "מרכז",
    "Clear": "ניקוי",
    "Select Cities to Compare": "בחירת ערים להשוואה",
    "Search city name": "חיפוש שם עיר",
    "Step 2: Additional filters": "שלב 2: מסננים נוספים",
    "Remove outliers": "הסרת חריגים",
    "Update Analysis": "עדכון ניתוח",
    "Update Plot": "עדכון גרף",
    "Plot": "גרף",
    "Chart mode": "מצב גרף",
    "Absolute": "מוחלט",
    "Index to first year": "אינדקס לשנת בסיס משותפת",
    "Change from first year": "שינוי משנת בסיס משותפת",
    "Palette": "פלטה",
    "Reverse color order": "היפוך סדר צבעים",
    "Show points": "הצגת נקודות",
    "Point min": "נקודה מינ'",
    "Point max": "נקודה מקס'",
    "Smallest marker size for city/year points, scaled by deal count.": "גודל הסמן הקטן ביותר לנקודות עיר/שנה, מותאם לפי מספר עסקאות.",
    "Largest marker size for city/year points, scaled by deal count.": "גודל הסמן הגדול ביותר לנקודות עיר/שנה, מותאם לפי מספר עסקאות.",
    "Within-city": "בתוך העיר",
    "Top / typical / bottom": "גבוהים / טיפוסיים / נמוכים",
    "Map review": "בדיקה במפה",
    "Qualified Gushes": "גושים כשירים",
    "Step 1: Select City": "שלב 1: בחירת עיר",
    "Step 2: Performance Parameters": "הגדרות ההשוואה",
    "Step 3: Additional filters": "שלב 3: מסננים נוספים",
    "Deal ranges": "טווחי עסקאות",
    "Reset": "איפוס",
    "Deal years from": "שנות עסקה מ-",
    "Deal years to": "שנות עסקה עד",
    "Price from (₪m)": "מחיר מ- (מ' ₪)",
    "Price to (₪m)": "מחיר עד (מ' ₪)",
    "Area from (m²)": "שטח מ- (מ\"ר)",
    "Area to (m²)": "שטח עד (מ\"ר)",
    "Apartment mix": "תמהיל דירות",
    "Smart rooms": "חדרים חכמים",
    "Include unknown": "כולל לא ידוע",
    "Unknown": "לא ידוע",
    "Floors": "קומות",
    "Age": "גיל",
    "Rooms unknown": "חדרים",
    "Floor unknown": "קומה",
    "Building floors unknown": "קומות",
    "Built year unknown": "שנת בנייה",
    "Age unknown": "גיל",
    "Building attributes": "מאפייני בניין",
    "Floor from": "קומה מ-",
    "Floor to": "קומה עד",
    "Building floors from": "קומות בבניין מ-",
    "Building floors to": "קומות בבניין עד",
    "Built year from": "שנת בנייה מ-",
    "Built year to": "שנת בנייה עד",
    "Building age from": "גיל בניין מ-",
    "Building age to": "גיל בניין עד",
    "Top": "גבוהים",
    "Typical": "טיפוסיים",
    "Bottom": "נמוכים",
    "Min deals": "מינימום עסקאות",
    "Min deals / year": "מינימום עסקאות / שנה",
    "City comparison only": "ייחודי להשוואת ערים",
    "Remove price and area outliers": "הסרת חריגי מחיר ושטח",
    "Tel Aviv": "תל אביב",
    "City Performance ranks Gush areas inside this city.": "השוואת השינוי השנתי המחושב בגושים בתוך העיר הזו.",
    "Top, typical, and bottom Gush performers inside one city, matching the original Shiny ranking workflow.": "השוואת מגמות מחירים בגושים באותה עיר ובתקופה משותפת.",
    "City Performance is a directional screening workflow. Treat rankings as candidates to inspect, not as final investment conclusions.": "הדירוג מתאר שינוי במחירי עסקאות בגוש. הוא מושפע גם מתמהיל הדירות שנמכרו ומכמות הדיווחים.",
    "Each line is a selected street or Gush area summarized by year.": "כל קו הוא רחוב או גוש שנבחר, מסוכם לפי שנה.",
    "Comparing nearby areas, checking relative price levels, and spotting diverging trends.": "השוואת אזורים קרובים, בדיקת רמות מחיר יחסיות וזיהוי מגמות שמתפצלות.",
    "You want to discover the relevant Gush areas from a street name, or compare known blocks side by side.": "כשרוצים למצוא את הגושים הרלוונטיים לפי שם רחוב, או להשוות גושים מוכרים זה לצד זה.",
    "Each line is a selected city summarized by year.": "כל קו הוא עיר שנבחרה, מסוכמת לפי שנה.",
    "Broad market comparison, city-level trend checks, and ranking demand or price movement.": "השוואת שוק רחבה, בדיקת מגמות ברמת עיר והשוואת תנועת מחירים.",
    "You want a macro view before drilling into specific streets or Gush areas.": "כשרוצים מבט מאקרו לפני ירידה לרחובות או גושים ספציפיים.",
    "After choosing a city, open Gush Map to inspect its internal Gush layout before drilling into areas.": "אחרי בחירת עיר, פתחו את מפת הגושים כדי לבדוק את פריסת הגושים הפנימית לפני ירידה לאזורים.",
    "Top, typical, and bottom Gush areas inside one city, summarized by year.": "גושים גבוהים, טיפוסיים ונמוכים בתוך עיר אחת, מסוכמים לפי שנה.",
    "Finding standout neighborhoods, comparing internal city segments, and screening candidates.": "איתור שכונות בולטות, השוואת אזורים בתוך עיר וסינון מועמדים.",
    "You want the app to identify which Gush areas perform differently within a selected city.": "כשרוצים שהאפליקציה תזהה אילו גושים מתנהגים אחרת בתוך העיר שנבחרה.",
    "After ranking Gushes, send top or bottom groups to the shared selection and view their locations on Gush Map.": "אחרי דירוג הגושים, שלחו קבוצות גבוהות או נמוכות לבחירה המשותפת וצפו במיקומים שלהן במפת הגושים.",
    "Load raw deals preview": "טעינת תצוגה מקדימה של עסקאות גולמיות",
    "Median price (M₪)": "חציון מחיר (מ׳ ₪)",
    "Median price / m² (k₪)": "חציון מחיר למ\"ר (אלף ₪)",
    "Median price / room": "חציון מחיר לחדר",
    "Number of deals": "מספר עסקאות",
    "Use shown Gushes in Analysis": "השתמש בגושים המוצגים בניתוח",
    "Use top performers": "השתמש בביצועים הגבוהים",
    "Use bottom performers": "השתמש בביצועים הנמוכים",
    "Analysis deals CSV": "CSV עסקאות לניתוח",
    "Compare summary CSV": "CSV סיכום השוואה",
    "Compare raw CSV": "CSV גולמי להשוואה",
    "City comparison summary CSV": "CSV סיכום השוואת ערים",
    "City comparison raw CSV": "CSV גולמי להשוואת ערים",
    "City performance summary CSV": "CSV סיכום ביצועי עיר",
    "City performance raw CSV": "CSV גולמי לביצועי עיר"
  };

  document.addEventListener("DOMContentLoaded", function () {
    translateStaticDom();
    document.body.dataset.compareHasSelection = "false";
    bindTabs();
    bindControls();
    bindWorkspaceActions();
    activateTab(initialTabFromHash(), false);
    window.addEventListener("hashchange", function () {
      activateTab(initialTabFromHash(), false);
    });
    setNotice("analysis-state", "Choose a city and search for streets or Gush areas. Metadata loads automatically.", "ok");
    setNotice("compare-state", "Select streets or Gush areas. Compare updates automatically when the selection is small enough.", "ok");
    setNotice("city-state", "Select cities and click update. No city summary is loaded automatically.", "ok");
    setNotice("gush-state", "Choose one city and update performance.", "ok");
    setNotice("map-state", "Choose a city, then update the local Gush polygon map.", "ok");
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
    if(updateHash && document.body.dataset.activeTab && document.body.dataset.activeTab!==tab) rememberNavigation();
    document.body.dataset.activeTab = tab;
    renderPilotCoverage();
    if (byId("pilot-address-lookup")) byId("pilot-address-lookup").open = tab === "analysis" && state.analysisMode === "lookup";
    updateNavigationControls();
    renderActiveFilterChips();
    document.querySelectorAll(".tab").forEach(function (item) {
      var isActive = item.dataset.tab === tab;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", isActive ? "true" : "false");
      item.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      var isActive = panel.id === "panel-" + tab;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
    if (updateHash && window.location.hash !== "#" + tab) {
      pushNavigation(window.location.pathname + window.location.search + "#" + tab, true);
    }
        updateSelectionSummary();
        updateCompareSelectionState();
        if (tab === "compare") scheduleCompareAutoUpdate("tab");
        if (tab === "city") {
          scheduleCityFilterOptions();
          setNotice("city-state", state.cityHasRun ? "City filters are ready. Change filters or click Update Plot." : "Select cities. City Comparison updates automatically when the filtered dataset is small enough.", "ok");
        }
    if (tab === "gush") {
      if (!state.gushFilterOptions || state.gushFilterOptionsSignature !== currentGushFilterOptionsSignature()) {
        scheduleGushFilterOptions();
      }
      scheduleGushAutoUpdate("tab");
    }
    if (tab === "analysis") schedulePlotResize("analysis-chart");
    if (tab === "map") scheduleMapAutoUpdate("tab");
    if(updateHash)rememberNavigation();
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        activateTab(button.dataset.tab, true);
      });
    });
  }

  function bindControls() {
    byId("refresh-meta").addEventListener("click", refreshCoverageOnly);
    byId("random-city").addEventListener("click", chooseRandomCity);
    byId("city-select").addEventListener("change", function () {
      clearSelect(byId("street-select"));
      clearSelect(byId("gush-select"));
      state.streets = [];
      state.gushes = [];
      byId("analysis-address").value = "";
      byId("street-picker-search").value = "";
      byId("gush-picker-search").value = "";
      state.filterOptions = null;
      state.filterOptionsSignature = "";
      state.roomsSelectionInitialized = false;
      state.compareRoomsSelectionInitialized = false;
      byId("street-search-results").innerHTML = "";
      renderLocationPickers();
      updateSelectionSummary();
      updateCompareSelectionState();
      loadLocationMetadata();
      scheduleMapAutoUpdate("city");
    });
    byId("analysis-address").addEventListener("input", function () { updateSelectionSummary(); scheduleAnalysisAutoUpdate("address"); });
    byId("analysis-address").addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); runAnalysis(); }
    });
    byId("run-analysis").addEventListener("click", runAnalysis);
    byId("cancel-analysis").addEventListener("click", function () { cancelRequest("analysis"); });
    byId("auto-update-analysis").addEventListener("change", function () {
      scheduleAnalysisAutoUpdate("auto-toggle");
    });
    byId("run-compare").addEventListener("click", runCompare);
    byId("cancel-compare").addEventListener("click", function () { cancelRequest("compare"); });
    byId("load-compare-raw").addEventListener("click", runCompareRawPreview);
    byId("auto-update-compare").addEventListener("change", function () {
      scheduleCompareAutoUpdate("auto-toggle");
    });
    byId("run-city").addEventListener("click", runCityComparison);
    byId("cancel-city").addEventListener("click", function () { cancelRequest("city"); });
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
    byId("cancel-gush").addEventListener("click", function () { cancelRequest("gush"); });
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
    byId("run-map").addEventListener("click", runGushMap);
    byId("fit-map-selection").addEventListener("click", fitMapToSelection);
    byId("map-color-mode").addEventListener("change", function () {
      renderGushMap(state.latestMapData, { fitSelection: false });
    });
    byId("map-show-labels").addEventListener("change", function () {
      renderGushMap(state.latestMapData, { fitSelection: false });
    });
    byId("add-gush-streets").addEventListener("click", addStreetsFromSelectedGushes);
    byId("select-street-gushes").addEventListener("click", selectGushesFromSelectedStreets);
    byId("smart-reset-rooms").addEventListener("click", applySmartRoomSelection);
    byId("clear-rooms").addEventListener("click", clearRoomSelection);
    byId("smart-reset-gush-rooms").addEventListener("click", applyGushSmartRoomSelection);
    byId("clear-gush-rooms").addEventListener("click", clearGushRoomSelection);
    byId("reset-gush-filters").addEventListener("click", resetGushFilterRanges);
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
        if (id === "street-select" || id === "gush-select") scheduleMapAutoUpdate(id);
      });
    });
    byId("rooms-select").addEventListener("change", renderRoomChips);
    byId("apartment-type-select").addEventListener("change", renderApartmentTypeChips);
    byId("apartment-type-search").addEventListener("input", renderApartmentTypeChips);
    if (byId("compare-smart-reset-rooms")) byId("compare-smart-reset-rooms").addEventListener("click", applyCompareSmartRoomSelection);
    if (byId("compare-clear-rooms")) byId("compare-clear-rooms").addEventListener("click", clearCompareRoomSelection);
    if (byId("reset-compare-filters")) byId("reset-compare-filters").addEventListener("click", resetCompareFilterRanges);
    if (byId("compare-rooms-select")) byId("compare-rooms-select").addEventListener("change", renderCompareRoomChips);
    if (byId("compare-apartment-type-select")) byId("compare-apartment-type-select").addEventListener("change", renderCompareApartmentTypeChips);
    if (byId("compare-apartment-type-search")) byId("compare-apartment-type-search").addEventListener("input", renderCompareApartmentTypeChips);
    if (byId("city-smart-reset-rooms")) byId("city-smart-reset-rooms").addEventListener("click", applyCitySmartRoomSelection);
    if (byId("city-clear-rooms")) byId("city-clear-rooms").addEventListener("click", clearCityRoomSelection);
    if (byId("reset-city-filters")) byId("reset-city-filters").addEventListener("click", resetCityFilterRanges);
    if (byId("city-rooms-select")) byId("city-rooms-select").addEventListener("change", renderCityRoomChips);
    if (byId("city-apartment-type-select")) byId("city-apartment-type-select").addEventListener("change", renderCityApartmentTypeChips);
    if (byId("city-apartment-type-search")) byId("city-apartment-type-search").addEventListener("input", renderCityApartmentTypeChips);
    byId("gush-rooms-select").addEventListener("change", renderGushRoomChips);
    byId("gush-apartment-type-select").addEventListener("change", renderGushApartmentTypeChips);
    byId("gush-apartment-type-search").addEventListener("input", renderGushApartmentTypeChips);
    [
      "filter-year-min", "filter-year-max", "filter-price-min", "filter-price-max",
      "filter-price-m2-min", "filter-price-m2-max", "filter-area-min", "filter-area-max",
      "filter-floor-min", "filter-floor-max", "filter-building-floors-min", "filter-building-floors-max",
      "filter-built-year-min", "filter-built-year-max", "filter-building-age-min", "filter-building-age-max",
      "include-unknown-rooms", "include-unknown-floor", "include-unknown-building-floors",
      "include-unknown-built-year", "include-unknown-building-age",
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
      "compare-include-unknown-rooms", "compare-include-unknown-floor", "compare-include-unknown-building-floors",
      "compare-include-unknown-built-year", "compare-include-unknown-building-age",
      "compare-rooms-select", "compare-apartment-type-select", "compare-roof-select", "compare-new-project-select"
    ].forEach(function (id) {
      byId(id).addEventListener("change", updateSelectionSummary);
      byId(id).addEventListener("input", updateSelectionSummary);
      byId(id).addEventListener("change", function () {
        if (id === "compare-rooms-select") state.compareRoomsSelectionInitialized = true;
        scheduleCompareAutoUpdate(id);
      });
      byId(id).addEventListener("input", function () { scheduleCompareAutoUpdate(id); });
    });
    [
      "city-y-variable", "city-statistic", "city-chart-mode", "city-min-deals", "city-remove-price-outliers", "city-show-sp500",
      "city-show-points", "city-point-size-min", "city-point-size-max", "city-color-palette", "city-reverse-colors",
      "city-filter-year-min", "city-filter-year-max", "city-filter-price-min", "city-filter-price-max",
      "city-filter-price-m2-min", "city-filter-price-m2-max", "city-filter-area-min", "city-filter-area-max",
      "city-filter-floor-min", "city-filter-floor-max", "city-filter-building-floors-min", "city-filter-building-floors-max",
      "city-filter-built-year-min", "city-filter-built-year-max", "city-filter-building-age-min", "city-filter-building-age-max",
      "city-include-unknown-rooms", "city-include-unknown-floor", "city-include-unknown-building-floors",
      "city-include-unknown-built-year", "city-include-unknown-building-age",
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
      "gush-include-unknown-rooms", "gush-include-unknown-floor", "gush-include-unknown-building-floors",
      "gush-include-unknown-built-year", "gush-include-unknown-building-age",
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
        if (key === "gushes") {
          scheduleCompareGushSearch();
          return;
        }
        renderPicker(key);
      });
    });
    document.querySelectorAll("[data-download]").forEach(function (button) {
      button.addEventListener("click", function () {
        previewExport(button.dataset.download);
      });
    });
    bindNumericGuardrails();
  }

  function bindNumericGuardrails() {
    var currentYear = Math.max(2027, new Date().getFullYear() + 1);
    document.querySelectorAll('input[inputmode="numeric"], input[inputmode="decimal"]').forEach(function (input) {
      if (input.id.indexOf("year") !== -1 && !input.min) {
        input.min = "1998";
        input.max = String(currentYear);
        input.step = "1";
      }
      input.addEventListener("change", function () { clampInputValue(input); });
      input.addEventListener("blur", function () { clampInputValue(input); });
    });
  }

  function clampInputValue(input) {
    if (!input || input.value === "") return;
    var value = Number(input.value);
    if (!Number.isFinite(value)) return;
    if (input.min !== "") value = Math.max(Number(input.min), value);
    if (input.max !== "") value = Math.min(Number(input.max), value);
    if (String(value) !== input.value) input.value = value;
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
      var linkedCity = new URLSearchParams(window.location.search).get("deal_city");
      if (linkedCity) {
        var cityRecord = (state.meta.cities || []).find(function (city) { return city.id === linkedCity || city.name === linkedCity; });
        if (cityRecord) byId("city-select").value = cityRecord.id;
      }
      renderMetaSummary(response.data);
      setupPilotControls();
      renderPilotCoverage();
      setNotice("metadata-state", warningText(response) || "Metadata loaded.", warningText(response) ? "warning" : "ok");
      if (byId("city-select").value && !state.streets.length) {
        await loadLocationMetadata();
      }
      await restoreSharedView();
      await openLinkedDeal();
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
    var defaultApartmentTypes = meta.default_filters && meta.default_filters.apartment_types || [];
    setSelectedValues(byId("apartment-type-select"), defaultApartmentTypes);
    ["compare", "city", "gush"].forEach(function (scope) {
      setSelectedValues(byId(scope + "-apartment-type-select"), defaultApartmentTypes);
    });
    renderApartmentTypeChips();
    renderCompareApartmentTypeChips();
    renderGushApartmentTypeChips();

    if (cityOptions.length && !byId("city-select").value) {
      var defaultAnalysisCity = cityOptionByNames(TEL_AVIV_CITY_NAMES, byId("city-select"));
      byId("city-select").value = defaultAnalysisCity ? defaultAnalysisCity.value : cityOptions[0].value;
    }
    setDefaultGushCity();
    renderGushCityReadout();
    scheduleGushFilterOptions();
    updateSelectionSummary();
  }

  function setDefaultGushCity() {
    var select = byId("gush-city-select");
    if (!select || select.value) return;
    var telAviv = cityOptionByNames(TEL_AVIV_CITY_NAMES, select);
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
    var requestId = state.locationRequestId = (state.locationRequestId || 0) + 1;
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
      if (requestId !== state.locationRequestId || city !== byId("city-select").value) return;
      state.streets = results[0].data.streets || [];
      state.gushes = results[1].data.gushes || [];
      setOptions(byId("street-select"), state.streets.map(function (street) {
        return { value: street, label: street, searchText: street };
      }), true);
      setOptions(byId("gush-select"), state.gushes.map(function (gush) {
        var details = [gush.label, "(" + gush.id + ")"];
        if (gush.representative_street) details.push("- " + gush.representative_street);
        if (gush.deals) details.push("· " + formatNumber(gush.deals) + " עסקאות");
        return {
          value: gush.id,
          label: details.join(" "),
          searchText: [gush.id, gush.label, gush.representative_street, gush.city].filter(Boolean).join(" ")
        };
      }), true);
      setNotice("metadata-state", "Loaded " + state.streets.length + " streets and " + state.gushes.length + " Gush areas.", "ok");
      setNotice("analysis-state", "City metadata loaded. Search streets or Gush areas, then update analysis.", "ok");
      renderMetaSummary(state.meta);
      renderPilotCoverage();
      renderLocationPickers();
      updateSelectionSummary();
      updateCompareSelectionState();
      scheduleFilterOptions();
      scheduleCompareAutoUpdate("metadata");
      scheduleGushAutoUpdate("metadata");
      scheduleMapAutoUpdate("metadata");
    } catch (error) {
      if (requestId !== state.locationRequestId || city !== byId("city-select").value) return;
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
      renderCityRoomChips();
      renderCityApartmentTypeChips();
      renderCityComparisonPicker();
      renderCityFilterSummary();
      updateSelectionSummary();
      scheduleCityAutoUpdate("city-filter-options");
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
    var rowLimit = intValue("row-limit", DEFAULT_ANALYSIS_ROW_LIMIT);
    if (rowLimit < 1) rowLimit = DEFAULT_ANALYSIS_ROW_LIMIT;
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
    var telAviv = cityOptionByNames(TEL_AVIV_CITY_NAMES, citySelect);
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
    setNotice("gush-state", "Selected " + gushIds.length + " ranked Gush areas and switched them into the Analysis/Compare shared picker.", "ok");
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
    state.compareRoomsSelectionInitialized = false;
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
    target.innerHTML = '<div class="mini-notice">מחפש...</div>';
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
      target.innerHTML = '<div class="mini-notice">הקלידו שם רחוב כדי לחפש בכל הערים.</div>';
      return;
    }
    target.innerHTML = '<div class="mini-notice">מחפש רחובות בכל הערים...</div>';
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
      target.innerHTML = '<div class="mini-notice">לא נמצאו רחובות מתאימים.</div>';
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
      target.innerHTML = '<div class="mini-notice">לא נמצאו רחובות מתאימים.</div>';
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
    if (state.restoringView) return;
    var payload = buildAnalysisPayload();
    if(state.analysisMode!=="chart" && !state.restoringNavigation)pushNavigation(cleanAnalysisUrl());
    state.analysisMode = "chart";
    document.body.dataset.analysisMode="chart";
    byId("pilot-address-lookup").open=false;
    if (!payload.city && !payload.gushes.length) {
      setNotice("analysis-state", "Choose a city or Gush area first.", "warning");
      return;
    }
    var requestId = ++state.analysisRequestId;
    var controller = startRequest("analysis");
    state.latestPayloads.analysis = payload;
    var analysisUrl = new URL(window.location.href);
    analysisUrl.searchParams.delete("deal_city");
    analysisUrl.searchParams.delete("deal_record");
    window.history.replaceState(window.history.state, "", analysisUrl.pathname + analysisUrl.search + analysisUrl.hash);
    setNotice("analysis-state", options.auto ? "Auto-updating analysis..." : "Loading analysis deals...", "loading");
    setAnalysisBusy(true);
    try {
      var response = await postJson(endpoints.analysis, payload, { signal: controller.signal });
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
      persistSharedView();
      rememberNavigation();
      setNotice("analysis-state", warningText(response) || emptyText(data.table_rows, "Analysis updated.", "No matching transactions."), warningText(response) ? "warning" : "ok");
    } catch (error) {
      if (requestId !== state.analysisRequestId) return;
      if (error.name === "AbortError") {
        setNotice("analysis-state", "Analysis request canceled.", "warning");
        return;
      }
      setNotice("analysis-state", error.message, "error");
    } finally {
      if (requestId === state.analysisRequestId) finishRequest("analysis");
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
    var controller = startRequest("compare");
    state.latestPayloads["compare-summary"] = payload;
    state.latestPayloads["compare-raw"] = payload;
    setNotice("compare-state", options.auto ? "Auto-updating Gush comparison..." : "Loading Gush comparison...", "loading");
    setBusy("run-compare", true);
    try {
      var response = await postJson(endpoints.compareSummary, payload, { signal: controller.signal });
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
      if (error.name === "AbortError") {
        setNotice("compare-state", "Compare request canceled.", "warning");
        return;
      }
      setNotice("compare-state", error.message, "error");
    } finally {
      if (requestId === state.compareRequestId) finishRequest("compare");
    }
  }

  async function runCompareRawPreview() {
    var payload = buildComparePayload();
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
    var controller = startRequest("city");
    state.cityHasRun = true;
    state.latestPayloads["city-comparison-summary"] = payload;
    state.latestPayloads["city-comparison-raw"] = payload;
    setNotice("city-state", options.auto ? "Auto-updating city comparison..." : "Loading city comparison...", "loading");
    setBusy("run-city", true);
    try {
      var response = await postJson(endpoints.citySummary, payload, { signal: controller.signal });
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
      if (chartMode !== "absolute" && !seriesHasPoints(transformed.series)) setNotice("city-state", "אין שנת בסיס משותפת עם ערך חיובי לכל הערים. צמצמו ערים או עברו לתצוגה מוחלטת.", "warning");
    } catch (error) {
      if (requestId !== state.cityRequestId) return;
      if (error.name === "AbortError") {
        setNotice("city-state", "City comparison request canceled.", "warning");
        return;
      }
      setNotice("city-state", error.message, "error");
    } finally {
      if (requestId === state.cityRequestId) finishRequest("city");
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
    var controller = startRequest("gush");
    state.latestPayloads["gush-performance-summary"] = payload;
    state.latestPayloads["gush-performance-raw"] = payload;
    setNotice("gush-state", options.auto ? "Auto-updating Gush performance..." : "Loading Gush performance...", "loading");
    setBusy("run-gush", true);
    try {
      var response = await postJson(endpoints.gushSummary, payload, { signal: controller.signal });
      if (requestId !== state.gushRequestId) return;
      var data = response.data || {};
      state.latestGushPerformance = data;
      renderSeriesChart("gush-chart", data.series || [], data.overlays || {}, "Gush Performance", yLabel(data.y_variable), performanceSeriesChartOptions());
      renderMetrics("gush-counts", data.counts);
      renderGushPerformanceSummary(data);
      renderTable("gush-table", data.performance_table || [], performanceColumns(data.y_variable));
      setNotice("gush-state", warningText(response) || emptyText(data.performance_table, "Gush performance updated.", "No qualified Gush performance rows."), warningText(response) ? "warning" : "ok");
    } catch (error) {
      if (requestId !== state.gushRequestId) return;
      if (error.name === "AbortError") {
        setNotice("gush-state", "City Performance request canceled.", "warning");
        return;
      }
      setNotice("gush-state", error.message, "error");
    } finally {
      if (requestId === state.gushRequestId) finishRequest("gush");
    }
  }

  async function runGushMap(options) {
    options = options || {};
    var payload = buildMapPayload();
    if (!payload.city && !payload.gushes.length) {
      setNotice("map-state", "Choose a city or selected Gush area before loading the map.", "warning");
      return;
    }
    var requestId = ++state.mapRequestId;
    setBusy("run-map", true);
    setNotice("map-state", options.auto ? "Auto-updating map..." : "Loading cached Gush polygons...", "loading");
    try {
      var response = await postJson(endpoints.gushMap, payload);
      if (requestId !== state.mapRequestId) return;
      var data = response.data || {};
      state.latestMapData = data;
      renderGushMap(data, {
        fitSelection: options.fitSelection !== false,
        fitAll: options.fitSelection !== false
      });
      renderMetrics("map-counts", data.counts);
      renderMapSourceNote(data.source);
      renderMissingGushes(data);
      setNotice("map-state", warningText(response) || "Map updated. Click a polygon to add or remove a Gush.", warningText(response) ? "warning" : "ok");
    } catch (error) {
      if (requestId !== state.mapRequestId) return;
      state.latestMapData = null;
      renderGushMap(null);
      setNotice("map-state", error.message, "error");
    } finally {
      if (requestId === state.mapRequestId) setBusy("run-map", false);
    }
  }

  async function downloadCsv(kind, reviewedPayload) {
    var endpoint = endpoints.downloads[kind];
    if (!endpoint) return;
    var payload = reviewedPayload || payloadForDownload(kind);
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
      state.lastExport = {kind:kind, filters:payload, rows:Number(response.headers.get("X-Row-Count")), source:state.meta && state.meta.source, exported_at:new Date().toISOString()};
      if (byId("export-metadata")) byId("export-metadata").hidden = false;
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
      limit: intValue("row-limit", DEFAULT_ANALYSIS_ROW_LIMIT, 1, 5000),
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
      filters: comparisonPeriodFilters(buildFilters("city"), "city"),
      y_variable: byId("city-y-variable").value,
      statistic: byId("city-statistic").value,
      show_sp500: byId("city-show-sp500").checked,
      remove_price_outliers: byId("city-remove-price-outliers").checked,
      min_deals_per_year: intValue("city-min-deals", 10, 1, 1000),
      exclude_2027: true
    };
  }

  function buildGushPayload() {
    return {
      city: byId("gush-city-select").value,
      filters: buildFilters("gush"),
      include_partial_year: checkboxValue("gush-include-partial-year", false),
      yvar: byId("gush-y-variable").value,
      statistic: byId("gush-statistic").value,
      top_count: intValue("gush-top-count", 5, 0, 25),
      typical_count: intValue("gush-typical-count", 0, 0, 25),
      bottom_count: intValue("gush-bottom-count", 5, 0, 25),
      min_deals_per_gush: intValue("gush-min-deals", 5, 1, 1000),
      show_city: byId("gush-show-city-overlay").checked,
      show_sp500: byId("gush-show-sp500").checked,
      remove_price_outliers: byId("gush-remove-price-outliers").checked
    };
  }

  function buildMapPayload() {
    return {
      city: byId("city-select").value,
      gushes: activeGushSelection()
    };
  }

  function pilotActive() {
    return Boolean(state.meta && state.meta.source && state.meta.source.pilot);
  }

  function cleanAnalysisUrl() {
    var url=new URL(window.location.href);
    url.searchParams.delete("deal_city");url.searchParams.delete("deal_record");url.hash="analysis";
    return url.pathname+url.search+url.hash;
  }

  function rememberNavigation() {
    var previous=window.history.state || {};
    var entry=previous.nadlan || {};
    window.history.replaceState(Object.assign({},previous,{nadlan:{index:entry.index || 0,
      parentTab:entry.parentTab,parentMode:entry.parentMode,parentDeal:entry.parentDeal,
      view:captureView(),deal:document.body.dataset.activeTab==="analysis" && new URLSearchParams(location.search).has("deal_record"),scrollY:window.scrollY}}),"",location.href);
  }

  function pushNavigation(url, remembered) {
    if(state.restoringNavigation)return;
    if(!remembered)rememberNavigation();
    var entry=(window.history.state || {}).nadlan || {};
    window.history.pushState({nadlan:{index:(entry.index || 0)+1, parentTab:entry.view && entry.view.tab, parentMode:entry.view && entry.view.mode, parentDeal:entry.deal}},"",url);
    updateNavigationControls();
  }

  function updateNavigationControls() {
    var back=byId("navigation-back");
    if(back)back.disabled=!((window.history.state || {}).nadlan || {}).index;
  }

  function showMainView(push) {
    if(push!==false)pushNavigation(cleanAnalysisUrl());
    state.analysisMode="chart";document.body.dataset.analysisMode="chart";
    renderSelectedDeal(null);activateTab("analysis",false);
    byId("pilot-address-lookup").open=false;
    persistSharedView();rememberNavigation();updateNavigationControls();
    if(push!==false)byId("analysis-search-entry").scrollIntoView({block:"start"});
  }

  function closeSelectedDeal() {
    var entry=(window.history.state || {}).nadlan || {};
    if(entry.index && entry.parentTab==="analysis" && entry.parentMode===state.analysisMode && !entry.parentDeal){
      window.history.back();return;
    }
    var chartOrigin=state.analysisMode==="chart" && state.latestAnalysisRows.length;
    renderSelectedDeal(null);state.selectedPointId=null;markSelectedDealOnChart(null);
    document.querySelectorAll('#analysis-table tr.is-selected').forEach(function(row){row.classList.remove("is-selected");});
    window.history.replaceState(window.history.state,"",cleanAnalysisUrl());
    if(chartOrigin){
      document.body.dataset.analysisMode="chart";
      byId("analysis-chart").scrollIntoView({block:"start"});
    } else if(state.analysisMode==="lookup" && state.lookupData){
      document.body.dataset.analysisMode="lookup";
      byId("pilot-address-lookup").open=true;
      byId("lookup-results-stage").scrollIntoView({block:"start"});
    } else showMainView(false);
    persistSharedView();rememberNavigation();updateNavigationControls();
  }

  function bindWorkspaceActions() {
    document.body.dataset.analysisMode=state.analysisMode;
    byId("navigation-back").addEventListener("click",function(){window.history.back();});
    byId("navigation-home").addEventListener("click",function(){showMainView(true);});
    var area=document.createElement("section");area.id="analysis-area-selection";area.setAttribute("aria-label","בחירת אזור לניתוח");
    area.innerHTML='<div id="analysis-search-entry" class="address-search-alternative"><button id="open-address-search" type="button" hidden><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="6"></circle><path d="m15 15 6 6"></path></svg>חיפוש לפי כתובת</button><span>מצאו עסקאות לפי רחוב ומספר בית</span></div>';
    area.querySelector("#open-address-search").addEventListener("click",function(){
      var city=byId("city-select").value;
      if(city && city!==byId("address-lookup-city").value){
        byId("address-lookup-city").value=city;byId("address-lookup-query").value="";byId("address-lookup-floor").value="";
      }
      byId("pilot-address-lookup").open=true;
      byId("pilot-address-lookup").scrollIntoView({block:"start"});
      byId("address-lookup-query").focus({preventScroll:true});
    });
    var rail=document.querySelector(".control-panel");
    var sections=Array.from(rail.children).slice(0,2);rail.prepend(area);
    var alternative=area.querySelector(".address-search-alternative");
    rail.insertBefore(alternative,area);
    sections.forEach(function(section){area.appendChild(section);});
    byId("street-picker-search").placeholder="הקלידו שם רחוב";
    byId("gush-picker-search").placeholder="הקלידו מספר גוש או שם רחוב";

    window.addEventListener("resize",function(){
      window.clearTimeout(state.chartTicksTimer);
      state.chartTicksTimer=window.setTimeout(function(){Object.keys(state.seriesAxisPoints || {}).forEach(function(id){
        var chart=byId(id);if(!chart || !chart.classList.contains("js-plotly-plot") || !chart.getBoundingClientRect().width)return;
        var axis=analysisDateAxis(state.seriesAxisPoints[id],Math.max(3,Math.min(8,Math.floor(chart.getBoundingClientRect().width/85))));
        Plotly.relayout(chart,{"xaxis.tickmode":axis.tickmode,"xaxis.tickvals":axis.tickvals,"xaxis.ticktext":axis.ticktext});
      });},150);
    });
    var lookupStage=document.createElement("section");lookupStage.id="lookup-results-stage";lookupStage.hidden=true;
    ["address-lookup-state","lookup-actions","address-lookup-results"].forEach(function(id){lookupStage.appendChild(byId(id));});
    byId("panel-analysis").prepend(lookupStage);
    byId("share-view").addEventListener("click", shareCurrentView);
    byId("lookup-analyze-address").addEventListener("click", function () { openLookupContext("building"); });
    byId("lookup-analyze-street").addEventListener("click", function () { openLookupContext("street"); });
    byId("lookup-map").addEventListener("click", function () { openLookupContext("map"); });
    byId("selected-deal").addEventListener("click", function (event) {
      var button = event.target.closest("[data-deal-action]");
      if (!button || !state.selectedDeal) return;
      if (button.dataset.dealAction === "back") {
        closeSelectedDeal();
      } else if (button.dataset.dealAction === "building") {
        byId("address-lookup-city").value = cityIdForName(state.selectedDeal.city);
        byId("address-lookup-query").value = state.selectedDeal.address || state.selectedDeal.street || "";
        byId("address-lookup-floor").value = "";
        byId("address-lookup-from").value = 1900;
        byId("address-lookup-to").value = snapshotYear();
        runAddressLookup();
      } else openDealMap(state.selectedDeal);
    });
    document.addEventListener("click", function (event) {
      var hashLink=event.target.closest('a[href^="#"]');
      if(hashLink && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && validTab(hashLink.hash.slice(1))){
        event.preventDefault();activateTab(hashLink.hash.slice(1),true);return;
      }
      var link = event.target.closest('a[href*="deal_record="]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      pushNavigation(url.pathname + url.search + url.hash);
      openLinkedDeal();
    });
    window.addEventListener("popstate", async function (event) {
      var entry=event.state && event.state.nadlan;
      if(entry && entry.view) {
        await restoreSharedView(entry.view);
        if(entry.deal)await openLinkedDeal();
        window.scrollTo(0,entry.scrollY || 0);
      } else if(initialTabFromHash()==="analysis" && new URLSearchParams(location.search).has("deal_record"))await openLinkedDeal();
      else if(new URLSearchParams(location.search).has("view"))await restoreSharedView();
      else activateTab(initialTabFromHash(),false);
      updateNavigationControls();
    });
    ["city", "gush"].forEach(function (scope) {
      byId(scope + "-include-partial-year").addEventListener("change", function () {
        if (scope === "city") runCityComparison(); else runGushPerformance();
      });
    });
    byId("map-open-analysis").addEventListener("click", function () { activateTab("analysis", true); runAnalysis(); });
    byId("map-open-compare").addEventListener("click", function () { activateTab("compare", true); runCompare(); });
    document.addEventListener("change", function () { renderActiveFilterChips(); persistSharedView(); });
    document.addEventListener("click", function (event) { if (event.target.closest(".filter-chip")) renderActiveFilterChips(); });
    document.querySelectorAll('.tab').forEach(function (button) {
      button.addEventListener("keydown", function (event) {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) < 0) return;
        event.preventDefault();
        var tabs = Array.from(document.querySelectorAll('.tab'));
        var index = tabs.indexOf(button);
        index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowLeft" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[index].focus(); activateTab(tabs[index].dataset.tab, true);
      });
    });
  }

  async function refreshCoverageOnly() {
    setNotice("metadata-state", "קורא את פרטי המאגר המקומי…", "loading");
    try {
      var response = await getJson(endpoints.meta);
      state.meta = response.data; renderMetaSummary(state.meta); renderPilotCoverage();
      setNotice("metadata-state", "פרטי המאגר המקומי רועננו. לא הורדו עסקאות חדשות.", "ok");
    } catch (error) { setNotice("metadata-state", error.message, "error"); }
  }

  function lookupPayload() {
    return {city:byId("address-lookup-city").value, address:byId("address-lookup-query").value.trim(),
      floor:byId("address-lookup-floor").value, year_from:byId("address-lookup-from").value, year_to:byId("address-lookup-to").value};
  }

  function validateAddressLookup() {
    return Array.from(byId("address-lookup-form").querySelectorAll("input,select")).every(function(input){
      if(input.checkValidity())return true;
      var details=input.closest("details");
      if(details)details.open=true;
      input.reportValidity();return false;
    });
  }

  async function runAddressLookup() {
    if (!validateAddressLookup()) return;
    var request = lookupPayload();
    if(!state.restoringNavigation)pushNavigation(cleanAnalysisUrl());
    state.analysisMode="lookup";
    var requestId = state.lookupRequestId = (state.lookupRequestId || 0) + 1;
    activateTab("analysis", false);
    byId("pilot-address-lookup").open = true;
    byId("lookup-actions").hidden = true;
    byId("lookup-results-stage").hidden=false;
    document.body.dataset.analysisMode="lookup";
    byId("address-lookup-results").innerHTML = "";
    setBusy("run-address-lookup", true);
    setNotice("address-lookup-state", pilotActive() ? "מחפש עסקאות בשני המקורות…" : "מחפש עסקאות במאגר הפעיל…", "loading");
    try {
      var response = await postJson("api/address-lookup", request);
      if (requestId !== state.lookupRequestId) return;
      state.lookupData = response.data; state.lookupRequest = request; state.analysisMode = "lookup";
      renderSelectedDeal(null);
      document.body.dataset.analysisMode="lookup";
      renderLookupResults(response.data);
      persistSharedView();
      rememberNavigation();
      renderPilotCoverage();
      byId("lookup-results-stage").scrollIntoView({block:"start"});
    } catch (error) {
      if (requestId === state.lookupRequestId) setNotice("address-lookup-state", error.message, "error");
    } finally { if (requestId === state.lookupRequestId) setBusy("run-address-lookup", false); }
  }

  function renderLookupResults(data) {
    var rows = (data.rows || []).slice().reverse();
    byId("lookup-actions").hidden = !rows.length;
    setNotice("address-lookup-state", rows.length ? "נמצאו " + formatNumber(data.counts.records) + " רשומות ב־" + data.counts.distinct_dates + " תאריכים. דיווחים מקבילים שתואמו מוצגים יחד." :
      "לא נמצאה התאמה. נסו להסיר את הקומה או להרחיב את השנים. כתובת חסרה במקור יכולה למנוע איתור; אין בכך הוכחה שלא היו עסקאות.", rows.length ? "ok" : "warning");
    byId("address-lookup-results").innerHTML = rows.map(function (row) {
      var price = row.price_ils == null ? "מחיר לא ידוע" : formatNumber(row.price_ils) + " ₪";
      var share = row.sale_portion == null ? "חלק לא ידוע" : formatNumber(row.sale_portion * 100) + "% מהנכס";
      var details = [["מקור", row.source], ["גוש / חלקה / תת־חלקה", row.gush_code], ["בסיס קישור", row.link],
        ["שנת בנייה", row.build_year], ["סתירות ומגבלות", row.conflicts]];
      if (row.legacy_area !== null) details.push(["דיווח מקביל — שטח / חדרים / שנת בנייה", [row.legacy_area,row.legacy_rooms,row.legacy_build_year].map(valueOrDash).join(" / ")]);
      return '<article class="address-result"><header><time dir="ltr">' + escapeHtml(formatDealDate(row.date)) + '</time><strong dir="ltr">' + escapeHtml(price) + '</strong></header>' +
        '<h3>' + escapeHtml(row.reference_address || "כתובת ייחוס חסרה") + '</h3><p class="history-facts">' +
        escapeHtml([valueOrDash(row.area) + " מ״ר",valueOrDash(row.rooms) + " חדרים","קומת ייחוס: " + valueOrDash(row.reference_floor),share].join(" · ")) + '</p>' +
        '<a href="' + escapeHtml(dealUrl(row.city,row.source_id)) + '">פרטי העסקה והיסטוריית הנכס</a>' +
        '<details><summary>מקור, התאמה והבדלים בין דיווחים</summary><dl>' + details.map(function (field) {
          return '<dt>' + escapeHtml(field[0]) + '</dt><dd>' + escapeHtml(valueOrDash(field[1])) + '</dd>';
        }).join("") + '</dl></details></article>';
    }).join("");
  }

  function cityIdForName(value) {
    var city = (state.meta && state.meta.cities || []).find(function (item) { return item.id === value || item.name === value; });
    return city ? city.id : value;
  }

  function cityNameForId(value) {
    var city = (state.meta && state.meta.cities || []).find(function (item) { return item.id === value || item.name === value; });
    return city ? city.name : value;
  }

  function roomSelectionText(id) {
    var input=byId(id), values=selectedValues(input);
    return !values.length || values.length===input.options.length ? "כל מספרי החדרים" : values.length<=6 ? values.join(", ") : values.length+" ערכים נבחרו";
  }

  async function setAnalysisLocation(city) {
    state.restoringView = true;
    try {
      byId("city-select").value = cityIdForName(city);
      setSelectedValues(byId("street-select"), []); setSelectedValues(byId("gush-select"), []);
      state.filterOptions = null; state.roomsSelectionInitialized = false;
      await loadLocationMetadata(); await loadFilterOptions();
    } finally { state.restoringView = false; }
  }

  async function openLookupContext(mode) {
    if (!state.lookupRequest || !state.lookupData) return;
    pushNavigation(mode === "map" ? "#map" : cleanAnalysisUrl());
    state.analysisMode="chart";
    await setAnalysisLocation(state.lookupRequest.city);
    var rows = state.lookupData.rows || [];
    var gushes = Array.from(new Set(rows.map(function (row) { return String(row.gush_code || "").split("-")[0]; }).filter(Boolean)));
    byId("analysis-address").value = mode === "building" ? state.lookupRequest.address : "";
    if (mode === "street") {
      var query = state.lookupRequest.address.replace(/\d+[\u05d0-\u05ea]?/g, " ").trim();
      var matching = state.streets.filter(function (street) { return matchesSearch(street, query); });
      if (!matching.length) { setNotice("address-lookup-state", "לא זוהה רחוב יחיד לניתוח. אפשר לבחור רחוב ברשימת האזורים.", "warning"); return; }
      setSelectedValues(byId("street-select"), matching);
    } else if (mode === "map") setSelectedValues(byId("gush-select"), gushes);
    renderLocationPickers(); updateSelectionSummary();
    activateTab(mode === "map" ? "map" : "analysis", false);
    if (mode === "map") {await runGushMap();rememberNavigation();}
    else {
      await runAnalysis();
      setNotice("analysis-state", "הניתוח משתמש במסננים המוצגים ובכתובות הזמינות במאגר. החיפוש בראש העמוד שומר גם רשומות ייחוס ומכירות חלקיות.", "ok");
      byId("analysis-chart").scrollIntoView({block:"start"});
    }
  }

  async function openDealMap(row) {
    var gush = String(row.gush_code || "").split("-")[0];
    if (!gush) { setNotice("analysis-state", "אין מספר גוש ברשומה זו.", "warning"); return; }
    pushNavigation("#map");
    await setAnalysisLocation(row.city);
    ensureSelectOption(byId("gush-select"), {value:gush, label:"גוש " + gush});
    setSelectedValues(byId("gush-select"), [gush]); renderLocationPickers();
    activateTab("map", false); await runGushMap();rememberNavigation();
  }

  function renderMissingGushes(data) {
    var target = byId("map-missing-list");
    var missing = data.missing_gushes || [];
    if (!missing.length) { target.innerHTML = ""; return; }
    var selected = new Set(activeGushSelection().map(String));
    target.innerHTML = '<details><summary>' + missing.length + ' גושים ללא מצולע — בחירה מרשימה</summary><p>ניתן לנתח את העסקאות בגושים האלה גם כשהגבול אינו זמין במפה.</p><div class="selected-chips">' + missing.map(function (gush) {
      return '<button type="button" class="filter-chip" data-missing-gush="' + escapeHtml(gush) + '" aria-pressed="' + selected.has(gush) + '">' + escapeHtml(gush) + (selected.has(gush) ? " ✓" : "") + '</button>';
    }).join("") + '</div></details>';
    target.querySelectorAll('[data-missing-gush]').forEach(function (button) {
      button.addEventListener("click", function () { toggleMapGushSelection({gush:button.dataset.missingGush,city:byId("city-select").value}); });
    });
  }

  function snapshotYear(scope) {
    var cities = state.meta && state.meta.cities || [];
    var ids = (scope || document.body.dataset.activeTab) === "city" ? selectedValues(byId("city-comparison-select")) : [byId("city-select").value];
    var years = cities.filter(function (city) { return ids.indexOf(city.id) >= 0 || ids.indexOf(city.name) >= 0; }).map(function (city) {
      return Number(String(city.coverage && city.coverage.scraped_to || "").slice(0,4));
    }).filter(function (year) { return year > 1900; });
    var date = state.meta && (state.meta.source && state.meta.source.detected_at || state.meta.data_summary && state.meta.data_summary.generated_at);
    return years.length ? Math.min.apply(null, years) : date ? Number(String(date).slice(0,4)) : new Date().getFullYear();
  }

  function comparisonPeriodFilters(filters, scope) {
    if (!checkboxValue(scope + "-include-partial-year", false)) {
      var range = filters.deal_year_range || [null, null];
      filters.deal_year_range = [range[0], range[1] == null ? snapshotYear(scope) - 1 : Math.min(range[1], snapshotYear(scope) - 1)];
    }
    return filters;
  }

  function formatTimestamp(value) {
    if (!value) return "—";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("he-IL", {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  }

  function tableDisplayValue(row, column) {
    var value = pilotTableValue(row, column.key);
    if (value == null || value === "") return "—";
    if (column.type === "date") return formatDealDate(value);
    if (column.key === "performance_group") return {top:"עלייה גבוהה",typical:"אמצע הדירוג",bottom:"עלייה נמוכה"}[value] || value;
    if (column.type === "number" && !/year|gush|^Gush$|^GUSH$|rank|position/.test(column.key)) return formatNumber(value);
    return value;
  }

  function renderActiveFilterChips() {
    if (!state.meta) return;
    var scope = document.body.dataset.activeTab;
    if (["analysis","compare","city","gush"].indexOf(scope) < 0) return;
    var panel = byId("panel-" + scope);
    var target = byId(scope + "-removable-filters");
    if (!target) { target = document.createElement("div"); target.id=scope+"-removable-filters";target.className="active-filter-chips";panel.prepend(target); }
    var chips = [];
    function add(label, action) { chips.push({label:label,action:action}); }
    var ranges = [["year","שנים"],["price","מחיר"],["price-m2","מחיר למ״ר"],["area","שטח"],["floor","קומה"],["building-floors","קומות בבניין"],["built-year","שנת בנייה"],["building-age","גיל בניין"]];
    ranges.forEach(function (item) {
      var min=byId(filterControlId(scope,"filter-"+item[0]+"-min")), max=byId(filterControlId(scope,"filter-"+item[0]+"-max"));
      if (!min || !max || (!min.value && !max.value)) return;
      add(item[1]+": "+(min.value || "ללא מינימום")+"–"+(max.value || "ללא מקסימום"),function () {min.value="";max.value="";});
    });
    ["sale-portion-select","data-completeness-select","location-basis-select","rooms-select","apartment-type-select"].forEach(function (name) {
      var input=byId(filterControlId(scope,name)); if(!input)return;
      var selected=Array.from(input.selectedOptions); if(input.multiple && (!selected.length || selected.length===input.options.length))return;
      if (!input.multiple && ["all","both",""].indexOf(input.value)>=0)return;
      add(selected.length>4 ? selected.length+" ערכים נבחרו ב"+(name==="rooms-select"?"חדרים":"סוג נכס") : selected.map(function(o){return o.textContent;}).join(", "),function(){
        if(input.multiple)Array.from(input.options).forEach(function(o){o.selected=true;});else input.value="all";
      });
    });
    ["rooms","floor","building-floors","built-year","building-age"].forEach(function(name){
      var input=byId(filterControlId(scope,"include-unknown-"+name));
      if(input && !input.checked)add("ללא ערך חסר ב"+{rooms:"חדרים",floor:"קומה","building-floors":"קומות","built-year":"שנת בנייה","building-age":"גיל"}[name],function(){input.checked=true;});
    });
    if((scope==="city" || scope==="gush") && !checkboxValue(scope+"-include-partial-year",false))add("ללא שנת האיסוף החלקית",function(){byId(scope+"-include-partial-year").checked=true;});
    if(scope==="analysis" && byId("analysis-address").value)add("כתובת: "+byId("analysis-address").value,function(){byId("analysis-address").value="";});
    target.innerHTML='<span>מסננים פעילים</span>'+chips.map(function(chip,i){return '<button class="filter-chip-remove secondary" type="button" data-filter-remove="'+i+'" aria-label="'+escapeHtml("הסרת מסנן "+chip.label)+'">'+escapeHtml(chip.label)+' ×</button>';}).join("");
    target.querySelectorAll('[data-filter-remove]').forEach(function(button){button.addEventListener("click",function(){
      chips[Number(button.dataset.filterRemove)].action();
      renderRoomChips();renderCompareRoomChips();renderCityRoomChips();renderGushRoomChips();renderActiveFilterChips();
      if(scope==="analysis")runAnalysis();else if(scope==="compare")runCompare();else if(scope==="city")runCityComparison();else runGushPerformance();
    });});
  }

  function exportName(kind) {
    return {analysis:"עסקאות בניתוח","compare-raw":"עסקאות בהשוואת אזורים","compare-summary":"סיכום השוואת אזורים","city-comparison-raw":"עסקאות בהשוואת ערים","city-comparison-summary":"סיכום השוואת ערים","gush-performance-raw":"עסקאות בגושים המדורגים","gush-performance-summary":"דירוג מגמות לפי גוש"}[kind] || kind;
  }

  function previewExport(kind) {
    var payload=payloadForDownload(kind);
    activateTab("downloads",true);
    var target=byId("export-preview");target.hidden=false;
    var scope=kind.indexOf("city-")===0?"city":kind.indexOf("gush-")===0?"gush":kind.indexOf("compare-")===0?"compare":"analysis";
    var filters=payload.filters || {};
    var labelsByKey={deal_year_range:"שנים",price_range:"מחיר במיליוני ₪",price_per_m2_range:"מחיר למ״ר באלפי ₪",area_range:"שטח במ״ר",floor_range:"קומה",building_floors_range:"קומות בבניין",built_year_range:"שנת בנייה",building_age_range:"גיל בניין",rooms:"חדרים",apartment_types:"סוג נכס",address:"כתובת",sale_portion:"חלק נמכר",data_completeness:"זמינות מידע",location_basis:"בסיס שיוך"};
    var values={full:"מכירה מלאה",partial:"מכירה חלקית",unknown:"חלק לא ידוע",all:"הכול",verified:"התאמה מחמירה",with_address:"יש כתובת",with_floor:"יש קומה",with_address_and_floor:"יש כתובת וקומה"};
    var details=Object.keys(filters).filter(function(k){return k!=="include_unknown";}).map(function(k){var v=filters[k];if(k==="rooms")return "חדרים: "+roomSelectionText(filterControlId(scope,"rooms-select"));return (labelsByKey[k]||k)+": "+(Array.isArray(v)?v.map(function(x){return x==null?"ללא הגבלה":x;}).join(" / "):(values[v]||v));});
    var unknownLabels={rooms:"חדרים",floor:"קומה",build_floors:"קומות בבניין",build_year:"שנת בנייה",building_age:"גיל בניין"};
    details.push("שדות חסרים שנכללים: "+Object.keys(filters.include_unknown || {}).filter(function(k){return filters.include_unknown[k];}).map(function(k){return unknownLabels[k]||k;}).join(", "));
    if(payload.min_deals_per_year)details.push("לפחות "+payload.min_deals_per_year+" עסקאות לכל עיר ושנה");
    if(payload.min_deals_per_gush)details.push("לפחות "+payload.min_deals_per_gush+" עסקאות בכל שנת קצה; שנת איסוף חלקית: "+(payload.include_partial_year?"כלולה":"לא כלולה"));
    if(payload.statistic)details.push("מדד: "+translateUiText(payload.statistic));
    details.push("משתנה: "+translateUiText(yLabel(payload.y_variable || payload.yvar || "price_millions")));
    var area=[cityNameForId(payload.city),(payload.cities||[]).map(cityNameForId).join(", "),(payload.streets||[]).join(", "),(payload.gushes||[]).join(", ")].filter(Boolean).join(" · ");
    target.innerHTML='<h3>'+escapeHtml(exportName(kind))+'</h3><p>'+escapeHtml(area)+'</p><p>'+escapeHtml(details.join(" · "))+'</p>'+
      '<p>הסרת חריגים: '+(payload.remove_price_outliers?"מחיר ":"")+(payload.remove_area_outliers?"שטח":"")+(!payload.remove_price_outliers&&!payload.remove_area_outliers?"ללא":"")+'</p>'+
      '<p>המסננים האלה נלקחו ממסך '+escapeHtml(translateUiText({analysis:"Analysis Deals",compare:"Compare Areas",city:"City Comparison",gush:"City Performance"}[scope]))+'. הקובץ כולל את כל השורות המתאימות; מספר השורות המדויק יוצג אחרי ההורדה.</p>'+
      '<button id="export-confirm" type="button">הורדת CSV</button> <button id="export-metadata" class="secondary" type="button" hidden>הורדת פרטי המקור והמסננים (JSON)</button>';
    byId("export-confirm").addEventListener("click",function(){downloadCsv(kind,payload);});
    byId("export-metadata").addEventListener("click",function(){downloadJson(state.lastExport,"nadlan_export_context.json");});
    target.scrollIntoView({block:"start"});
  }

  function downloadJson(value,filename) {
    var url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json;charset=utf-8"}));
    var link=document.createElement("a");link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
  }

  function captureView() {
    var controls={};
    document.querySelectorAll('input[id],select[id]').forEach(function(input){
      if(!input.closest('.control-panel,.tab-panel,#pilot-address-lookup') || input.closest('table') || /search|picker/.test(input.id) || input.id==='coverage-city-search')return;
      controls[input.id]=input.type==='checkbox'?input.checked:input.multiple?selectedValues(input):input.value;
    });
    return {version:1,tab:document.body.dataset.activeTab,mode:state.analysisMode || "chart",controls:controls,lookup:state.lookupRequest || null};
  }

  function persistSharedView() {
    if (state.restoringView) return;
    if(new URLSearchParams(window.location.search).has("view")){
      var url=new URL(window.location.href);url.searchParams.set("view",JSON.stringify(captureView()));
      window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
    }
    rememberNavigation();
  }

  async function shareCurrentView() {
    var url=new URL(window.location.href);
    url.searchParams.set("view",JSON.stringify(captureView()));
    window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
    try { await navigator.clipboard.writeText(url.href); byId("share-view-state").textContent="הקישור הועתק, כולל המסננים והבחירות."; }
    catch(error) { byId("share-view-state").innerHTML='<a href="'+escapeHtml(url.href)+'">הקישור מוכן — ניתן להעתיק משורת הכתובת</a>'; }
  }

  function readSharedView() {
    var raw=new URLSearchParams(window.location.search).get("view");
    if(!raw)return null;
    if(raw.length>60000)throw new Error("הקישור ארוך מדי לשחזור.");
    var saved=JSON.parse(raw);
    if(saved.version!==1 || !saved.controls || typeof saved.controls!=="object")throw new Error("גרסת קישור זו אינה נתמכת.");
    return saved;
  }

  async function restoreSharedView(providedView) {
    var saved;
    try { saved=providedView || readSharedView(); } catch(error){state.restoringView=false;setNotice("analysis-state","לא ניתן לשחזר את הקישור: "+error.message,"warning");return;}
    if(!saved){state.restoringView=false;return;}
    saved.tab=initialTabFromHash();
    state.restoringNavigation=true;
    renderSelectedDeal(null);
    state.analysisMode=saved.mode || "chart";
    document.body.dataset.analysisMode=state.analysisMode;
    state.restoringView=true;
    ["autoAnalysisTimer","autoCompareTimer","autoCityTimer","autoGushTimer","autoMapTimer","filterOptionsTimer","cityFilterOptionsTimer","gushFilterOptionsTimer"].forEach(function(k){window.clearTimeout(state[k]);});
    function apply(ids){Object.keys(saved.controls).forEach(function(id){
      if(ids && ids.indexOf(id)<0)return;
      var input=byId(id);if(!input || !input.matches('input,select') || !input.closest('.control-panel,.tab-panel,#pilot-address-lookup'))return;
      var value=saved.controls[id];
      if(input.type==='checkbox')input.checked=value===true;
      else if(input.multiple && Array.isArray(value)){
        if(id==='gush-select')value.filter(function(v){return /^\d+$/.test(String(v));}).forEach(function(v){ensureSelectOption(input,{value:String(v),label:"גוש "+v});});
        setSelectedValues(input,value.map(String));
      }else if(typeof value==='string')input.value=value;
    });}
    try {
      apply(["city-select","gush-city-select","city-comparison-select"]);
      await loadLocationMetadata();
      apply(["street-select","gush-select"]);
      await Promise.all([loadFilterOptions(),loadCityFilterOptions(),loadGushFilterOptions()]);
      apply();renderLocationPickers();renderCityComparisonPicker();renderRoomChips();renderCompareRoomChips();renderCityRoomChips();renderGushRoomChips();
      renderApartmentTypeChips();renderCompareApartmentTypeChips();renderCityApartmentTypeChips();renderGushApartmentTypeChips();
    } catch(error) {state.restoringNavigation=false;throw error;} finally {state.restoringView=false;}
    activateTab(validTab(saved.tab)?saved.tab:"analysis",false);renderActiveFilterChips();
    if(saved.mode==="home" && saved.tab==="analysis")showMainView(false);
    else if(saved.mode==="lookup" && saved.lookup && saved.lookup.address && saved.tab==="analysis")await runAddressLookup();
    else if(saved.tab==="analysis" && saved.mode==="chart") {
      var selectedUrl=location.href;
      await runAnalysis();
      window.history.replaceState(window.history.state,"",selectedUrl);
    }
    else if(saved.tab==="city")await runCityComparison();
    else if(saved.tab==="gush")await runGushPerformance();
    else if(saved.tab==="compare")await runCompare();
    else if(saved.tab==="map")await runGushMap();
    state.restoringNavigation=false;
    rememberNavigation();updateNavigationControls();
  }

  function setupAddressLookup() {
    var panel = byId("pilot-address-lookup");
    if (state.lookupBound) return;
    state.lookupBound = true;
    panel.hidden = false;
    byId("address-lookup-scope").textContent = pilotActive() ?
      "החיפוש בשני המקורות, כולל מכירות חלקיות, ללא מסנני הניתוח. כתובת וקומה שהושלמו לפי מזהה נכס מסומנות כפרטי ייחוס." :
      "החיפוש במאגר מידע לעם — התמנון, ללא מסנני הניתוח. נתוני רשות המסים החדשים אינם פעילים בגרסה זו.";
    byId("open-address-search").hidden=false;
    setOptions(byId("address-lookup-city"), state.meta.cities.map(function (city) { return {value:city.id, label:city.name}; }), false);
    byId("address-lookup-city").value = byId("city-select").value;
    // This is a search region, not an address submission form. Keep Enter support
    // without triggering a native form submission that can prompt address saving.
    byId("run-address-lookup").addEventListener("click", runAddressLookup);
    byId("address-lookup-form").addEventListener("keydown", function(event){
      if(event.key!=="Enter" || event.isComposing || !event.target.matches("input"))return;
      event.preventDefault();runAddressLookup();
    });
  }

  function setupPilotControls() {
    setupAddressLookup();
    if (!pilotActive()) return;
    if (!state.pilotDiscoveryDefaultsSet) {
      byId("remove-price-outliers").checked = false;
      byId("remove-area-outliers").checked = false;
      state.pilotDiscoveryDefaultsSet = true;
    }
    ["analysis", "compare", "city", "gush"].forEach(function (scope) {
      var id = filterControlId(scope, "sale-portion-select");
      if (byId(id)) return;
      var anchor = byId(filterControlId(scope, "new-project-select"));
      var box = document.createElement("div");
      box.className = "filter-cluster pilot-filters";
      box.innerHTML = '<label>חלק הנכס שנמכר<select id="' + id + '">' +
        '<option value="full">מכירה מלאה (100%)</option><option value="partial">מכירה חלקית</option>' +
        '<option value="unknown">חלק לא ידוע</option><option value="all">כל חלקי המכירה</option></select></label>' +
        '<label>זמינות מידע<select id="' + filterControlId(scope, "data-completeness-select") + '">' +
        '<option value="all">כל הרשומות</option><option value="with_address">יש כתובת</option>' +
        '<option value="with_floor">יש קומה</option><option value="with_address_and_floor">יש כתובת וקומה</option></select></label>' +
        '<label>בסיס שיוך כתובת וקומה<select id="' + filterControlId(scope, "location-basis-select") + '"><option value="all">כולל ייחוס לפי מזהה נכס</option><option value="verified">התאמת עסקה מחמירה בלבד</option></select></label>' +
        '<p class="helper-text">החיפוש והגרפים כוללים כתובות וקומות בייחוס לפי מזהה נכס. השיוך מסומן בטבלה ובנקודות ואינו אימות של אותה דירה. סינון רחוב מוציא רשומות שנותרו ללא רחוב.</p>' +
        '<p class="pilot-share-warning" hidden>המחירים הם סכומי המקור לחלק שנמכר; לא בוצע נרמול למחיר נכס שלם. נתוני חלק לא ידוע אינם מתאימים להשוואת מחירים.</p>';
      anchor.parentElement.insertAdjacentElement("beforebegin", box);
      var schedule = {analysis: scheduleAnalysisAutoUpdate, compare: scheduleCompareAutoUpdate,
                      city: scheduleCityAutoUpdate, gush: scheduleGushAutoUpdate}[scope];
      box.querySelectorAll("select").forEach(function (select) {
        select.addEventListener("change", function () {
          box.querySelector(".pilot-share-warning").hidden = byId(id).value === "full";
          schedule("pilot-filter");
        });
      });
      ["roof-select", "new-project-select"].forEach(function (name) {
        var select = byId(filterControlId(scope, name));
        select.disabled = true;
        select.title = "המידע אינו ידוע במקור הפיילוט";
        var control = document.querySelector('[data-select="' + select.id + '"]');
        if (control) control.querySelectorAll("button").forEach(function (button) { button.disabled = true; });
      });
    });
    ["city-select", "gush-city-select", "city-comparison-select"].forEach(function (id) {
      byId(id).addEventListener("change", renderPilotCoverage);
    });
    if (window.NadlanLayout) window.NadlanLayout.refreshAvailability();
    byId("dataset-about").textContent = "כרגע האתר כולל פיילוט של 20 ערים, המבוסס על גרסה " + state.meta.source.version +
      " של נתוני רשות המסים. בניתוח מוצגות כברירת מחדל עסקאות מגורים של נכס שלם. הנתונים הם עותק מקומי ואינם מתעדכנים אוטומטית.";
  }

  function renderPilotCoverage() {
    if (!pilotActive() || !byId("pilot-banner")) return;
    var cities = state.meta.cities || [];
    var tab = document.body.dataset.activeTab;
    var ids = tab === "city" ? selectedValues(byId("city-comparison-select")) :
      (tab === "gush" || tab === "analysis" ? [byId(tab === "gush" ? "gush-city-select" : "city-select").value] : []);
    if(tab==="analysis" && document.body.dataset.analysisMode==="lookup" && state.lookupRequest)ids=[cityIdForName(state.lookupRequest.city)];
    if(tab==="analysis" && document.body.dataset.analysisMode==="detail" && state.selectedDeal)ids=[cityIdForName(state.selectedDeal.city)];
    var selected = cities.filter(function (city) { return ids.indexOf(city.id) !== -1; });
    var source = state.meta.source;
    var brief = selected.length === 1 ? (function () {
      var city = selected[0], c = city.coverage || {};
      return city.name + ' · עסקאות עד ' + formatDealDate(c.max_date) + ' · ללא כתובת: ' + formatNumber(c.missing_address) +
        ' · ללא קומה: ' + formatNumber(c.missing_floor) + ' (מתוך ' + formatNumber(c.rows) + ' רשומות מגורים לפני סינון)';
    })() : (selected.length ? selected.length + ' ערים נבחרו; ' : '') + 'הכיסוי שונה בין הערים — הפירוט בלשונית כיסוי ואיכות הנתונים.';
    var banner = byId("pilot-banner");
    banner.hidden = false;
    banner.innerHTML = '<strong>' + escapeHtml("גרסאות לעם · גרסה " + source.version) + '</strong> · ' +
      escapeHtml(brief) + ' · <a href="#metadata">כיסוי ואיכות הנתונים</a> · <a href="#about">על המקורות וההתאמות</a>';
    if (window.NadlanCoverage) window.NadlanCoverage.render(state.meta);
  }

  function buildFilters(scope) {
    scope = scope || "analysis";
    var filters = {};
    if (scope === "analysis" && byId("analysis-address").value.trim()) filters.address = byId("analysis-address").value.trim();
    if (pilotActive()) {
      var shareControl = byId(filterControlId(scope, "sale-portion-select"));
      var completenessControl = byId(filterControlId(scope, "data-completeness-select"));
      filters.sale_portion = shareControl ? shareControl.value : "full";
      filters.data_completeness = completenessControl ? completenessControl.value : "all";
      var locationControl = byId(filterControlId(scope, "location-basis-select"));
      filters.location_basis = locationControl ? locationControl.value : "all";
    }
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
    filters.include_unknown = includeUnknownFilters(scope);
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
    var chart = byId("analysis-chart");
    if (!points.length) {
      if (byId("analysis-chart-summary")) byId("analysis-chart-summary").hidden = true;
      if (data && Object.prototype.hasOwnProperty.call(data, "table_rows")) {
        if (window.Plotly && chart.classList.contains("js-plotly-plot")) {
          Plotly.purge(chart);
        }
        chart.hidden = true;
        chart.className = "chart";
        chart.innerHTML = "";
        return;
      }
      renderAnalysisChartGuide();
      return;
    }
    chart.hidden = false;
    // Plotly.react reuses its DOM and class markers; clearing them breaks sizing on later renders.
    chart.classList.remove("chart-guide");
    chart.classList.add("chart");
    if (!chart.classList.contains("js-plotly-plot")) chart.innerHTML = "";
    var chartSpec = analysisChartSpec(points, data);
    var summary = byId("analysis-chart-summary");
    if (summary) {
      summary.hidden = false;
      summary.textContent = "גרף הניתוח · " + points.length + " עסקאות מוצגות · " +
        formatDealDate(data.summary && data.summary.date_min) + " – " + formatDealDate(data.summary && data.summary.date_max) +
        " · לפי המסננים הפעילים";
    }
    Plotly.react("analysis-chart", chartSpec.traces, chartSpec.layout, {responsive: true, displaylogo: false}).then(function () {
      if (chart.removeAllListeners) chart.removeAllListeners("plotly_click");
      chart.on("plotly_click", function (event) {
        var point = event.points && event.points[0];
        if (point && point.customdata) selectDeal(point.customdata);
      });
      markSelectedDealOnChart(state.selectedPointId);
      schedulePlotResize("analysis-chart");
    });
  }

  function schedulePlotResize(targetId) {
    window.setTimeout(function () {
      var chart = byId(targetId);
      if (window.Plotly && chart && chart.classList.contains("js-plotly-plot") && chart.getBoundingClientRect().width && chart.getBoundingClientRect().height) {
        Plotly.Plots.resize(chart);
      }
    }, 80);
  }

  function renderAnalysisChartGuide(data) {
    var chart = byId("analysis-chart");
    if (window.Plotly && chart.classList.contains("js-plotly-plot")) {
      Plotly.purge(chart);
    }
    chart.hidden = false;
    chart.className = "chart chart-guide";
    var hasAttemptedAnalysis = data && Object.prototype.hasOwnProperty.call(data, "table_rows");
    var title = hasAttemptedAnalysis ? "לא נמצאו עסקאות מתאימות" : "איך מתחילים";
    var intro = hasAttemptedAnalysis ?
      "הרחיבו את הבחירה או שחררו מסננים, ואז עדכנו את הניתוח שוב." :
      "השתמשו באזור הגרף כרשימת בדיקה עד שהפיזור מוכן.";
    chart.innerHTML = '<div class="chart-guide-content">' +
      '<h3>' + escapeHtml(title) + "</h3>" +
      '<p>' + escapeHtml(intro) + "</p>" +
      "<ol>" +
      '<li><strong>בחרו עיר</strong> או השתמשו בכפתור "אקראי"</li>' +
      '<li><strong>בחרו נכסים</strong> בעזרת חיפוש רחובות, בחירת גושים, הרחבת גושים לרחובות, או בחירה ויזואלית בטאב "מפת גושים".</li>' +
      "<li><strong>כוונו מסננים</strong> לפי שנה, מחיר, שטח, חדרים, קומה, סטטוס פרויקט וחריגים.</li>" +
      '<li>לחצו על הכפתור <strong>"עדכון ניתוח"</strong> כדי לצייר גרף פיזור והפקת טבלה של העסקאות.</li>' +
      "</ol>" +
      '<div class="chart-guide-tips"><strong>טיפים</strong><ul>' +
      "<li>השתמשו בחיפוש רחוב כשלא ידוע איזה גוש מכיל אותו.</li>" +
      '<li>בטאב "מפת גושים" אפשר לראות את מיקום הגושים על מפת רחובות ולבחור אותם בלחיצה.</li>' +
      "<li>איפוס חכם בוחר מספרי חדרים נפוצים לבחירה הנוכחית.</li>" +
      "<li>אחרי שהגרף מופיע, לחצו על נקודה כדי לבדוק את פרטי העסקה.</li>" +
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
            marker: { opacity: 0.58 }
          },
          xaxis: axisName("x", axisIndex),
          yaxis: axisName("y", axisIndex),
          showlegend: facetIndex === 0 && (colorValues.length > 0 || shapeValues.length > 0)
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
    var axis = analysisDateAxis(points, facets.length > 1 ? 4 : 10);
    facets.forEach(function (_, index) {
      var key = layoutAxisName("xaxis", index + 1);
      layout[key] = Object.assign({}, layout[key] || {}, axis);
    });
    layout.font = {family: '"Noto Sans Hebrew", "Segoe UI", Arial, sans-serif', size: 13, color: "#34494e"};
    layout.paper_bgcolor = "#fff";
    layout.plot_bgcolor = "#fff";
    return { traces: traces, layout: layout };
  }

  function analysisDateAxis(points, maxTicks) {
    var dates = Array.from(new Set(points.map(function (point) { return String(point.date || "").slice(0, 10); })
      .filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)); }))).sort();
    if (!dates.length) return {type: "date", tickformat: "%Y"};
    var years = Array.from(new Set(dates.map(function (date) { return date.slice(0, 4); })));
    var candidates = years.length === 1 ? dates : years.map(function (year) {
      return dates.find(function (date) { return date.slice(0, 4) === year; });
    });
    var step = Math.max(1, Math.ceil((candidates.length - 1) / (Math.max(2, maxTicks || 10) - 1)));
    var ticks = candidates.filter(function (_, index) { return index % step === 0 || index === candidates.length - 1; });
    var start = Date.parse(dates[0]);
    var end = Date.parse(dates[dates.length - 1]);
    var padding = Math.max(45 * 86400000, (end - start) * .055);
    return {type: "date", tickmode: "array", tickvals: ticks,
      ticktext: ticks.map(function (date) { return years.length === 1 ? formatDealDate(date) : date.slice(0,4); }),
      range: [new Date(start - padding).toISOString(), new Date(end + padding).toISOString()],
      tickangle: years.length === 1 && ticks.length > 3 ? -30 : 0,
      automargin: true, gridcolor: "#e8efee", zeroline: false};
  }

  function formatDealDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    return match ? match[3] + "." + match[2] + "." + match[1] : "לא ידוע";
  }

  function renderSeriesChart(targetId, series, overlays, title, yAxisTitle, options) {
    options = options || {};
    if (!seriesHasPoints(series)) {
      if (byId(targetId+"-coverage-note")) byId(targetId+"-coverage-note").textContent="";
      renderSeriesChartGuide(targetId, title, true);
      return;
    }
    var chart = byId(targetId);
    chart.classList.remove("chart-guide");
    chart.classList.add("chart");
    if (!chart.classList.contains("js-plotly-plot")) chart.innerHTML = "";
    var colors = options.colors || colorPalette("default", "series");
    if (options.reverseColors) colors = colors.slice().reverse();
    var symbols = options.symbols || [];
    var lowCount = 0, partialCount = 0;
    var traces = (series || []).map(function (item, index) {
      var group = item.performance_group || "";
      var color = options.groupColors && options.groupColors[group] || item.color || colors[index % colors.length];
      var symbol = options.groupSymbols && options.groupSymbols[group] || (symbols.length ? symbols[index % symbols.length] : "circle");
      var city = (state.meta && state.meta.cities || []).find(function(c){return c.id === item.city || c.name === item.city || c.name === item.label;});
      var cutoff = city && city.coverage && city.coverage.scraped_to || state.meta && state.meta.source && state.meta.source.detected_at;
      var partialYear = cutoff ? Number(String(cutoff).slice(0,4)) : snapshotYear();
      var ordered = (item.points || []).slice().sort(function(a,b){return Number(a.year)-Number(b.year);});
      var points = [];
      ordered.forEach(function(point,i){
        if (i && Number(point.year)-Number(ordered[i-1].year)>1) points.push({year:Number(ordered[i-1].year)+1,date:(Number(ordered[i-1].year)+1)+"-01-01",y:null,gap:true});
        points.push(point);
      });
      var flags=points.map(function(point){
        var low=point.low_sample || (point.n_deals != null && Number(point.n_deals)<10);
        var partial=Number(point.year)>=partialYear;
        if(!point.gap && low)lowCount++;
        if(!point.gap && partial)partialCount++;
        return {low:low,partial:partial};
      });
      return {
        name: item.label, type: "scatter", connectgaps:false,
        mode: options.showMarkers === false ? "lines" : "lines+markers",
        x: points.map(function(point){return point.date || point.year;}),
        y: points.map(function(point){return point.y;}),
        text: points.map(function(point,i){return escapeHtml(item.label)+"<br>שנה: "+valueOrDash(point.year)+
          "<br>עסקאות: "+formatNumber(point.n_deals)+"<br>ערך: "+formatNumber(point.y)+
          (point.base_year ? "<br>שנת בסיס משותפת: "+point.base_year : "")+
          (flags[i].low?"<br>מעט עסקאות — בדקו את התמהיל":"")+(flags[i].partial?"<br>שנת איסוף חלקית":"");}),
        hovertemplate: "%{text}<extra></extra>",
        line: {color:color,dash:options.groupDashes && options.groupDashes[group] || "solid"},
        marker: {size:cityPointSizes(points,options.pointSizeRange),color:color,
          opacity:flags.map(function(flag){return flag.low?.55:1;}),
          symbol:flags.map(function(flag){return flag.partial?"diamond-open":flag.low?"circle-open":symbol;})}
      };
    });
    var note=byId(targetId+"-coverage-note");
    if(!note){note=document.createElement("p");note.id=targetId+"-coverage-note";note.className="coverage-note";chart.before(note);}
    note.textContent="כל נקודה מסכמת עסקאות שונות באותה שנה; שינוי בתמהיל עשוי להשפיע על המחיר. גודל הנקודה יחסי למספר העסקאות בתוך כל סדרה."+
      (lowCount?" עיגול חלול מסמן מעט עסקאות; המספר המדויק מוצג בריחוף.":"")+
      (partialCount?" מעוין חלול מסמן שנת איסוף חלקית.":"")+" שנים ללא נתונים נשארות כרווח בקו.";
    addOverlayTraces(traces, overlays || {});
    var layout=chartLayout(title,yAxisTitle);
    var axisPoints=[].concat.apply([],series.map(function(item){return item.points || [];}));
    (state.seriesAxisPoints || (state.seriesAxisPoints={}))[targetId]=axisPoints;
    layout.xaxis=Object.assign(layout.xaxis,analysisDateAxis(axisPoints,Math.max(3,Math.min(8,Math.floor(chart.getBoundingClientRect().width/85)))));
    layout.margin.b=90;layout.legend={orientation:"h",y:-.25};
    Plotly.react(targetId, traces, layout, {responsive:true,displaylogo:false});
  }

  function renderGushMap(data, options) {
    options = options || {};
    var chart = byId("gush-map-chart");
    if (!data || !data.geojson || !(data.geojson.features || []).length) {
      destroyLeafletMap();
      chart.className = "chart map-chart chart-guide";
      chart.innerHTML = '<div class="chart-guide-content"><h3>מפת גושים</h3><ol>' +
        "<li><strong>בחרו עיר</strong> בפאנל הבחירה.</li>" +
        "<li><strong>עדכנו מפה</strong> כדי לטעון את מצולעי הגושים מהמטמון המקומי.</li>" +
        "<li><strong>לחצו על גוש</strong> כדי להוסיף או להסיר אותו מהבחירה המשותפת.</li>" +
        "</ol></div>";
      return;
    }
    if (!window.L) {
      destroyLeafletMap();
      chart.className = "chart map-chart chart-guide";
      chart.innerHTML = '<div class="chart-guide-content"><h3>מפת גושים</h3><p>ספריית המפה לא נטענה. בדקו חיבור רשת ואז רעננו את העמוד.</p></div>';
      return;
    }

    var geojson = data.geojson;
    var features = geojson.features || [];
    var selectedFeatures = features.filter(function (feature) {
      return feature.properties && feature.properties.selected;
    });
    var mode = byId("map-color-mode").value;

    chart.className = "chart map-chart leaflet-map";
    if (!state.leafletMap) {
      chart.innerHTML = "";
      state.leafletMap = L.map(chart, {
        zoomControl: true,
        scrollWheelZoom: true,
        preferCanvas: true
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(state.leafletMap);
    }
    if (state.gushMapLayer) {
      state.gushMapLayer.remove();
      state.gushMapLayer = null;
    }

    var maxDeals = Math.max.apply(null, features.map(function (feature) {
      return Number((feature.properties || {}).deals || 0);
    }).concat([1]));
    state.gushMapLayer = L.geoJSON(geojson, {
      style: function (feature) {
        return mapFeatureStyle(feature, mode, maxDeals);
      },
      onEachFeature: function (feature, layer) {
        var properties = feature.properties || {};
        if (byId("map-show-labels").checked) {
          layer.bindTooltip(String(properties.gush || ""), {
            permanent: true,
            direction: "center",
            className: "gush-map-label"
          });
          layer.bindPopup(mapHoverText(feature), { className: "gush-map-tooltip" });
        } else {
          layer.bindTooltip(mapHoverText(feature), {
            direction: "top",
            sticky: true,
            className: "gush-map-tooltip"
          });
        }
        layer.on("click", function (event) {
          if (event && event.originalEvent) L.DomEvent.stop(event.originalEvent);
          toggleMapGushSelection(mapCustomData(feature));
        });
        layer.on("mouseover", function () {
          layer.setStyle({ weight: properties.selected ? 3.8 : 2.4, fillOpacity: properties.selected ? 0.72 : 0.3 });
        });
        layer.on("mouseout", function () {
          layer.setStyle(mapFeatureStyle(feature, mode, maxDeals));
        });
      }
    }).addTo(state.leafletMap);

    window.setTimeout(function () {
      state.leafletMap.invalidateSize();
      if (!options.fitSelection && !options.fitAll) return;
      var targetLayer = options.fitSelection && selectedFeatures.length
        ? L.geoJSON({ type: "FeatureCollection", features: selectedFeatures })
        : state.gushMapLayer;
      var bounds = targetLayer.getBounds();
      if (bounds && bounds.isValid()) {
        state.leafletMap.fitBounds(bounds, { padding: [28, 28], maxZoom: selectedFeatures.length ? 16 : 14 });
      }
      if (targetLayer !== state.gushMapLayer) targetLayer.remove();
    }, 0);
  }

  function destroyLeafletMap() {
    if (state.leafletMap) {
      state.leafletMap.remove();
      state.leafletMap = null;
      state.gushMapLayer = null;
    }
  }

  function mapFeatureStyle(feature, mode, maxDeals) {
    var properties = feature.properties || {};
    var selected = Boolean(properties.selected);
    var fill = selected ? "#b04a4a" : "#cfd9d6";
    if (mode === "deals" && !selected) {
      fill = mapDealColor(Number(properties.deals || 0), maxDeals);
    }
    return {
      color: selected ? "#8f2e2e" : "#5f777b",
      weight: selected ? 2.8 : 1.35,
      opacity: selected ? 0.98 : 0.82,
      fillColor: fill,
      fillOpacity: selected ? 0.62 : 0.14
    };
  }

  function mapDealColor(value, maxDeals) {
    var ratio = Math.max(0, Math.min(1, Number(value || 0) / Math.max(maxDeals || 1, 1)));
    if (ratio > 0.75) return "#0d4d54";
    if (ratio > 0.5) return "#277989";
    if (ratio > 0.25) return "#6aa6b1";
    if (ratio > 0.05) return "#b9d4d7";
    return "#e8eeeb";
  }

  function mapHoverText(feature) {
    var properties = feature.properties || {};
    return [
      "<b>" + escapeHtml(properties.label || ("גוש " + valueOrDash(properties.gush))) + "</b>",
      "עיר: " + escapeHtml(valueOrDash(properties.city)),
      "גוש: " + escapeHtml(valueOrDash(properties.gush)),
      "עסקאות: " + escapeHtml(valueOrDash(properties.deals)),
      properties.representative_street ? "רחוב מייצג: " + escapeHtml(properties.representative_street) : "",
      properties.STATUS_TEX ? "סטטוס: " + escapeHtml(properties.STATUS_TEX) : "",
      properties.selected ? "<b>נבחר</b>" : "לחצו לבחירה"
    ].filter(Boolean).join("<br>");
  }

  function mapCustomData(feature) {
    var properties = feature.properties || {};
    return {
      gush: properties.gush,
      label: properties.label,
      city: properties.city,
      selected: Boolean(properties.selected)
    };
  }

  function toggleMapGushSelection(custom) {
    var select = byId("gush-select");
    var value = String(custom.gush);
    var option = optionForValue(select, value);
    if (!option) {
      ensureSelectOption(select, {
        value: value,
        label: custom.label || ("גוש " + value),
        searchText: [custom.city, custom.label, value].filter(Boolean).join(" ")
      });
    }
    var selected = new Set(selectedValues(select).map(String));
    if (selected.has(value)) {
      selected.delete(value);
      setNotice("map-state", "Gush removed from selection.", "ok");
    } else {
      selected.add(value);
      setNotice("map-state", "Gush added to selection.", "ok");
    }
    setSelectedValues(select, Array.from(selected));
    renderLocationPickers();
    updateSelectionSummary();
    updateCompareSelectionState();
    scheduleFilterOptions();
    scheduleAnalysisAutoUpdate("map-selection");
    scheduleCompareAutoUpdate("map-selection");
    runGushMap({ auto: true, fitSelection: false, reason: "map-selection" });
  }

  function fitMapToSelection() {
    if (!state.latestMapData) {
      runGushMap();
      return;
    }
    renderGushMap(state.latestMapData, { fitSelection: true });
  }

  function renderMapSourceNote(source) {
    var target = byId("map-source-note");
    if (!target) return;
    if (!source) {
      target.innerHTML = "";
      return;
    }
    var parts = [];
    if (source.name) parts.push(source.name);
    if (source.fetched_at) parts.push("איסוף שכבת המפה: " + formatDealDate(source.fetched_at.slice(0, 10)));
    if (source.disclaimer) parts.push("גבולות הגושים הם מידע עזר; הכיסוי והתאריך של שכבת המפה נפרדים מנתוני העסקאות.");
    target.textContent = parts.join(" · ");
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
        intro: "השתמשו באזור הגרף כרשימת בדיקה להשוואת אזורים עד שהקווים השנתיים מוכנים.",
        emptyIntro: "הרחיבו את האזורים שנבחרו או שחררו מסננים, ואז עדכנו את ההשוואה שוב.",
        steps: [
          '<strong>חפשו רחוב בכל הערים</strong>, בחרו גושים מוכרים, או השתמשו בטאב "מפת גושים" לבחירה ויזואלית.',
          "<strong>הוסיפו את הגושים המתאימים</strong> מתוצאות החיפוש או מהמצולעים שבחרתם במפה.",
          "<strong>בחרו ערך Y</strong> כמו מחיר, מחיר למ\"ר, מחיר לחדר או מספר עסקאות.",
          "<strong>עדכנו השוואה</strong> כדי לצייר קווים שנתיים ולמלא את טבלת הסיכום."
        ],
        tips: [
          "השתמשו בגושים להשוואת אזורי שכונה וברחובות לבדיקות ממוקדות.",
          "מפת גושים עוזרת לבחור אזורים סמוכים ולוודא שההשוואה היא בין אזורים הגיוניים גיאוגרפית.",
          "הפעילו כל העיר כדי לראות את העיר שנבחרה כקו ייחוס.",
          "CSV סיכום מתאים למגמות מקובצות, ו-CSV גולמי לעסקאות שמאחורי הסיכום."
        ]
      },
      "city-chart": {
        intro: "השתמשו באזור הגרף כרשימת בדיקה להשוואת ערים עד שהקווים השנתיים מוכנים.",
        emptyIntro: "בחרו יותר ערים או שחררו מסננים, ואז עדכנו ערים שוב.",
        steps: [
          "<strong>בחרו ערים</strong> מרשימת הערים.",
          "<strong>בחרו ערך Y</strong> להשוואה.",
          "<strong>כוונו מסננים</strong> רק אם רוצים חתך עירוני צר יותר.",
          "<strong>עדכנו ערים</strong> כדי לצייר קווי מגמה וליצור את הטבלה."
        ],
        tips: [
          "מספר העסקאות שימושי לפעילות שוק, לא רק לתנועת מחיר.",
          "השאירו מסננים רחבים כשמשווים ערים עם תמהילי דיור שונים.",
          "השתמשו ב-CSV גולמי כשצריך לבדוק אילו עסקאות נכנסו לסיכום."
        ]
      },
      "gush-chart": {
        intro: "השתמשו באזור הגרף כרשימת בדיקה לביצועי עיר עד שקווי הגושים הכשירים מוכנים.",
        emptyIntro: "הורידו מינימום עסקאות, התאימו גדלי קבוצות או שחררו מסננים, ואז עדכנו שוב.",
        steps: [
          "<strong>בחרו עיר אחת</strong> בפאנל ביצועי העיר.",
          "<strong>הגדירו גדלי קבוצות</strong> לביצועים גבוהים, טיפוסיים ונמוכים.",
          "<strong>בחרו מינימום עסקאות</strong> כדי שגושים דלי עסקאות לא ישתלטו.",
          "<strong>עדכנו ביצועים</strong> כדי לצייר קווי מגמה ודירוגים של גושים כשירים."
        ],
        tips: [
          "העלו מינימום עסקאות להשוואות יציבות יותר בערים גדולות.",
          "השתמשו בכל העיר כקו ייחוס כשבודקים גושים חריגים.",
          "הטבלה מראה אילו גושים נכנסו לכל קבוצת ביצועים."
        ]
      }
    };
    return guides[targetId] || {
      intro: "השתמשו באזור הגרף כרשימת בדיקה עד שהגרף מוכן.",
      emptyIntro: "שחררו את הבחירות והמסננים הנוכחיים, ואז עדכנו שוב.",
      steps: ["<strong>בחרו קלטים</strong> לתהליך הזה.", "<strong>עדכנו</strong> כדי לצייר את הגרף."],
      tips: ["השתמשו בטבלה שמתחת לגרף כדי לבדוק שורות מסוכמות."]
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
      title: { text: translateUiText(title) },
      margin: { t: 46, r: 24, b: 48, l: 62 },
      xaxis: { title: translateUiText("Year / date"), automargin: true },
      yaxis: { title: yAxisTitle || translateUiText("Value"), automargin: true },
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
        xanchor: "center",
        yanchor: "middle",
        align: "center",
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

  function pilotTableValue(row, key) {
    var value = row[key];
    if (!pilotActive()) return value;
    if (key === "location_basis") return ({strict_transaction: "התאמת עסקה מחמירה", property_reference: "ייחוס לפי מזהה — לא אומת לעסקה", unmatched: "ללא שיוך", legacy_record: "כתובת וקומה בדיווח מידע לעם — התמנון"})[value] || "ללא שיוך";
    if (key === "legacy_match") return value === "strict_transaction" ? "התאמת עסקה מאומתת" : "ללא התאמה מאומתת";
    if (key === "quality_flags") {
      if (row.location_basis === "legacy_record") return "לפי הרשומה הישנה; חלק המכירה אינו ידוע";
      var labels = { missing_address: "כתובת", missing_floor: "קומה", missing_area: "שטח", missing_rooms: "חדרים", location_reference: "כתובת/קומה בייחוס לפי מזהה" };
      return value ? String(value).split(";").map(function (flag) { return labels[flag] || flag; }).join(", ") : "ללא חוסרים בשדות שנבדקו";
    }
    if ((value === null || value === undefined || value === "") && ["floor", "address", "FULLADRESS", "street", "roof", "New_Project", "sale_portion"].indexOf(key) >= 0) return "לא ידוע";
    return value;
  }

  function renderTable(targetId, rows, columns, options) {
    var target = byId(targetId);
    options = options || {};
    var shouldResetState = options.resetState;
    options = Object.assign({}, options, { resetState: false });
    if (!rows || !rows.length) {
      target.innerHTML = '<div class="notice">' + escapeHtml(translateUiText("No rows to display.")) + "</div>";
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
        '<label>' + escapeHtml("סינון השורות שנטענו בלבד") + '<input type="search" autocomplete="off" class="table-global-filter" value="' + escapeHtml(tableState.globalFilter || "") + '" placeholder="' + escapeHtml(translateUiText("Search rows")) + '"></label>' +
        '<button class="secondary compact-button table-clear-filters" type="button">' + escapeHtml(translateUiText("Clear filters")) + "</button>" +
        "</div>";
    }
    html += "<table><thead><tr>" + columns.map(function (column) {
      var sorted = tableState.sortKey === column.key;
      var sortLabel = sorted ? (tableState.sortDirection === "asc" ? " ▲" : " ▼") : "";
      if (!options.sortable) return "<th>" + escapeHtml(translateUiText(column.label)) + "</th>";
      return '<th><button class="table-sort" type="button" data-key="' + escapeHtml(column.key) + '">' +
        escapeHtml(translateUiText(column.label) + sortLabel) +
        "</button></th>";
    }).join("") + "</tr>";
    if (options.filterable) {
      html += '<tr class="column-filter-row">' + columns.map(function (column) {
        if (column.filter === "range") {
          var rangeFilter = rangeFilterValue(tableState.filters[column.key]);
          return '<th><span class="table-range-filter">' +
            '<input autocomplete="off" class="table-column-filter" data-filter-kind="min" data-key="' + escapeHtml(column.key) + '" value="' +
            escapeHtml(rangeFilter.min) + '" placeholder="' + escapeHtml(translateUiText("Min")) + '">' +
            '<input autocomplete="off" class="table-column-filter" data-filter-kind="max" data-key="' + escapeHtml(column.key) + '" value="' +
            escapeHtml(rangeFilter.max) + '" placeholder="' + escapeHtml(translateUiText("Max")) + '">' +
            "</span></th>";
        }
        return '<th><input autocomplete="off" class="table-column-filter" data-key="' + escapeHtml(column.key) + '" value="' +
          escapeHtml(tableState.filters[column.key] || "") + '" placeholder="' + escapeHtml(translateUiText("Filter")) + '"></th>';
      }).join("") + "</tr>";
    }
    html += "</thead><tbody>" + visibleRows.map(function (row) {
      return '<tr data-row-id="' + escapeHtml(row.id || "") + '">' + columns.map(function (column) {
        var value = tableDisplayValue(row, column);
        return '<td dir="auto" class="' + textDirectionClass(value) + '">' + escapeHtml(valueOrDash(value)) + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
    if (processedRows.length > visibleRows.length || processedRows.length !== rows.length) {
      html += '<div class="notice">' + escapeHtml("מציג " + visibleRows.length + " מתוך " + processedRows.length +
        " שורות תואמות" + (processedRows.length !== rows.length ? " מתוך " + rows.length + " בסך הכל" : "") + ".") + "</div>";
    }
    target.innerHTML = html;
    bindTableControls(target, targetId, rows, columns, options);
    if (options && options.selectable) {
      target.querySelectorAll("tbody tr").forEach(function (rowEl) {
        rowEl.tabIndex=0;rowEl.setAttribute("role","button");rowEl.setAttribute("aria-label","פתיחת פרטי העסקה");
        rowEl.addEventListener("keydown",function(event){if(event.key==="Enter" || event.key===" "){event.preventDefault();rowEl.click();}});
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
    if(row && row.record_id)pushNavigation(dealUrl(row.city,row.record_id));
    state.analysisMode="chart";
    renderSelectedDeal(row || null);
    if(row)byId("selected-deal").scrollIntoView({block:"nearest"});
    markSelectedDealOnChart(rowId, markerTarget);
    rememberNavigation();
  }

  function tableRowsForDisplay(rows, columns, tableState, options) {
    var result = rows.slice();
    if (options.filterable) {
      result = result.filter(function (row) {
        var globalFilter = normalizeSearch(tableState.globalFilter || "");
        var matchesGlobal = !globalFilter || columns.some(function (column) {
          return matchesSearch(valueOrDash(pilotTableValue(row, column.key)), globalFilter);
        });
        if (!matchesGlobal) return false;
        return columns.every(function (column) {
          return matchesColumnFilter(pilotTableValue(row, column.key), tableState.filters && tableState.filters[column.key], column);
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
      return !textFilter || matchesSearch(valueOrDash(value), textFilter);
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

  function renderSelectedDeal(row, skipHistory) {
    var target = byId("selected-deal");
    state.selectedDeal = row;
    if(row)document.body.dataset.analysisMode=state.analysisMode === "chart" && state.latestAnalysisRows.length ? "chart" : "detail";
    updateNavigationControls();
    if (byId("property-history-chart") && window.Plotly) Plotly.purge(byId("property-history-chart"));
    state.dealRequestId = (state.dealRequestId || 0) + 1;
    if (!target) return;
    if (!row) {
      target.innerHTML = "";
      return;
    }
    var suspect = [];
    if(row.rooms != null && (row.rooms < 1 || row.rooms > 20 || !Number.isInteger(Number(row.rooms)*2)))suspect.push("מספר חדרים לא שגרתי");
    if(row.area != null && (row.area <= 0 || row.area > 1000))suspect.push("שטח לא שגרתי לנכס מגורים");
    if(row.build_year != null && (row.build_year < 1800 || row.build_year > snapshotYear()+10))suspect.push("שנת בנייה לא שגרתית");
    var amount = row.price_ils === null || row.price_ils === undefined ? row.price_millions * 1000000 : row.price_ils;
    var fields = [["שטח (מ״ר)", row.area], ["חדרים", row.rooms], ["קומה", row.floor],
      ["סוג נכס", row.apartment_type], ["חלק נמכר", row.sale_portion === null || row.sale_portion === undefined ? "לא ידוע" : (row.sale_portion * 100) + "%"],
      ["מקור", row.source_label || (row.source_id ? "גרסאות לעם" : "מידע לעם — התמנון")]];
    var metadata = [["גוש / חלקה / תת־חלקה", row.gush_code],
      ["בסיס שיוך כתובת וקומה", pilotTableValue(row, "location_basis")],
      ["חוסרים והערות", pilotTableValue(row, "quality_flags")], ["מזהה רשומת מקור", row.source_id || row.record_id]];
    function fieldMarkup(field) {
      return '<div class="deal-field"><dt>' + escapeHtml(field[0]) + '</dt><dd dir="auto">' + escapeHtml(valueOrDash(field[1])) + '</dd></div>';
    }
    target.innerHTML = '<div class="deal-card"><header class="deal-card-heading"><div><span class="deal-eyebrow">עסקה שנבחרה</span>' +
      '<h3>' + escapeHtml(row.address || row.street || "כתובת לא ידועה") + '</h3><time dir="ltr">' + escapeHtml(formatDealDate(row.date)) + '</time></div>' +
      '<strong class="deal-price" dir="ltr">' + escapeHtml(formatNumber(amount)) + ' ₪</strong></header>' +
      '<div class="deal-navigation"><button data-deal-action="back" class="secondary" type="button">' + (state.analysisMode === "chart" && state.latestAnalysisRows.length ? 'סגירת פרטי העסקה וחזרה לגרף' : (state.analysisMode === 'lookup' && state.lookupData ? 'חזרה לתוצאות החיפוש' : 'לתצוגה הראשית')) + '</button><button data-deal-action="building" class="secondary" type="button">כל העסקאות בבניין</button><button data-deal-action="map" class="secondary" type="button">הגוש במפה</button></div>' +
      '<dl class="deal-stats">' + fields.map(fieldMarkup).join("") + '</dl>' +
      (suspect.length ? '<p class="deal-location-note">' + escapeHtml(suspect.join(" · ") + ". הערכים נשמרו כפי שדווחו במקור.") + '</p>' : '') +
      (row.location_basis === "property_reference" ? '<p class="deal-location-note">הכתובת והקומה משויכות לפי מזהה נכס; לא אומתו לעסקה זו.</p>' : '') +
      '<details class="deal-metadata"><summary>זיהוי הנכס, מקור ואיכות הנתונים</summary><dl>' + metadata.map(fieldMarkup).join("") +
      '</dl></details><section id="deal-history" aria-live="polite"></section></div>';
    if (row.record_id && !skipHistory) loadDealHistory(row.city, row.record_id, state.dealRequestId);
  }

  function dealUrl(city, record) {
    var url = new URL(window.location.href);
    url.searchParams.set("deal_city", city);
    url.searchParams.set("deal_record", record);
    url.hash = "analysis";
    return url.pathname + url.search + url.hash;
  }

  function groupHistoryDates(rows) {
    var groups = {};
    rows.forEach(function (row) { var date = row.date || ""; (groups[date] || (groups[date] = [])).push(row); });
    return Object.keys(groups).sort().reverse().map(function (date) { return {date: date, rows: groups[date]}; });
  }

  function historyPresentationRows(rows) {
    var current = rows.filter(function (row) { return !String(row.record_id || "").startsWith("legacy:"); });
    var reference = rows.filter(function (row) { return String(row.record_id || "").startsWith("legacy:"); });
    var attached = new Map();
    var collapsed = new Set();
    function matches(a, b) {
      return a.date && a.date === b.date &&
        a.price_ils !== null && b.price_ils !== null && Math.abs(a.price_ils - b.price_ils) <= 1000;
    }
    // Presentation only: keep both source records accessible, and never combine partial or ambiguous sales.
    current.forEach(function (row) {
      if (row.sale_portion !== 1) return;
      var alternatives = reference.filter(function (other) { return matches(row, other); });
      if (alternatives.length !== 1) return;
      var other = alternatives[0];
      if (current.filter(function (candidate) { return matches(candidate, other); }).length !== 1) return;
      attached.set(row.record_id, [other]);
      collapsed.add(other.record_id);
    });
    return rows.filter(function (row) { return !collapsed.has(row.record_id); }).map(function (row) {
      return Object.assign({}, row, {alternate_records: attached.get(row.record_id) || []});
    });
  }

  function renderDealHistory(data) {
    var target = byId("deal-history");
    if (!target) return;
    var rows = [data.deal].concat(data.related || []);
    var visibleRows = historyPresentationRows(rows);
    var groups = groupHistoryDates(visibleRows);
    var plotted = new Set(state.latestAnalysisRows.map(function (row) { return row.record_id; }));
    var outside = state.latestAnalysisRows.length && rows.some(function (row) {
      return row.source_label !== "מידע לעם — התמנון" && !plotted.has(row.record_id);
    });
    target.innerHTML = '<div class="history-heading"><h4>היסטוריית הנכס לפי תאריך</h4><span>' +
      escapeHtml(data.distinct_dates + " תאריכי עסקה") + '</span></div>' +
      '<p class="history-scope">לפי אותו גוש/חלקה/תת־חלקה, ללא מסנני הניתוח. זהות הדירה לאורך השנים אינה מאומתת.</p>' +
      (outside ? '<p class="history-outside">בהיסטוריה יש רשומות שאינן בגרף הניתוח הנוכחי. גרף הנכס שלהלן מציג את כולן.</p>' : '') +
      '<div class="history-dates">' + groups.map(function (group) {
        return '<article class="history-date"><header><time dir="ltr">' + escapeHtml(formatDealDate(group.date)) + '</time>' +
          (group.rows.length > 1 ? '<span class="history-badge">' + group.rows.length + ' רשומות באותו יום</span>' : '') + '</header>' +
          group.rows.map(function (row) {
            var selected = row.record_id === data.deal.record_id || row.alternate_records.some(function (other) { return other.record_id === data.deal.record_id; });
            var price = row.price_ils === null ? "מחיר לא ידוע" : formatNumber(row.price_ils) + " ₪";
            return '<div class="history-record' + (selected ? ' is-current' : '') + '">' +
              '<a href="' + escapeHtml(dealUrl(row.city, row.record_id)) + '" aria-label="' + escapeHtml(formatDealDate(row.date) + ' · ' + price + ' · ' + row.source_label) + '"><bdi>' + escapeHtml(price) + '</bdi></a>' +
              '<span class="history-source">' + escapeHtml(row.source_label + (selected ? " · נבחרה" : "")) + '</span>' +
              '<span class="history-facts">' + escapeHtml([valueOrDash(row.area) + " מ״ר", valueOrDash(row.rooms) + " חדרים",
                row.sale_portion === null ? "חלק לא ידוע" : (row.sale_portion * 100) + "% מהנכס"].join(" · ")) + '</span>' +
              (row.alternate_records.length ? '<details class="history-comparison"><summary>השוואת דיווחים</summary><p>תאריך ומחיר תואמים בשני המקורות. מוצג דיווח גרסאות לעם; נתוני הנכס לא מוזגו.</p>' +
                [row].concat(row.alternate_records).map(function (sourceRow) {
                  return '<div class="source-comparison-row"><strong>' + escapeHtml(sourceRow.source_label) + '</strong><span>' +
                    escapeHtml([valueOrDash(sourceRow.area) + " מ״ר", valueOrDash(sourceRow.rooms) + " חדרים", "שנת בנייה: " + valueOrDash(sourceRow.build_year)].join(" · ")) +
                    '</span><a href="' + escapeHtml(dealUrl(sourceRow.city, sourceRow.record_id)) + '">פתיחת דיווח המקור</a></div>';
                }).join("") + '</details>' : '') + '</div>';
          }).join("") + '</article>';
      }).join("") + '</div>' +
      '<details id="history-chart-disclosure" class="history-chart-disclosure"' + (!state.latestAnalysisRows.length || outside ? ' open' : '') +
      '><summary>גרף הנכס — כל התאריכים, ללא מסנני הניתוח</summary><div id="property-history-chart" class="property-history-chart"></div></details>' +
      '<div class="history-footer"><a href="' + escapeHtml(dealUrl(data.deal.city, data.deal.record_id)) + '">קישור קבוע לעסקה</a>' +
      '<details><summary>כיצד לקרוא את ההיסטוריה</summary><p>' + escapeHtml((data.warnings || []).join(" ")) + '</p></details></div>';
    var disclosure = byId("history-chart-disclosure");
    var rendered = false;
    function draw() {
      if (!disclosure.open || rendered) return;
      rendered = true;
      var plottedRows = visibleRows.filter(function (row) { return row.date && row.price_ils !== null; });
      if (!plottedRows.length) { byId("property-history-chart").textContent = "אין תאריכים ומחירים תקינים להצגה."; return; }
      var traces = ["גרסאות לעם", "מידע לעם — התמנון"].map(function (source, index) {
        var selected = plottedRows.filter(function (row) { return row.source_label === source; });
        return {type: "scatter", mode: "markers", name: source,
          x: selected.map(function (row) { return row.date; }), y: selected.map(function (row) { return row.price_ils / 1000000; }),
          customdata: selected.map(function (row) { return dealUrl(row.city, row.record_id); }),
          text: selected.map(function (row) { return escapeHtml(formatDealDate(row.date) + " · " + formatNumber(row.price_ils) + " ₪ · " +
            (row.sale_portion === null ? "חלק לא ידוע" : (row.sale_portion * 100) + "% מהנכס")); }),
          hovertemplate: "%{text}<extra>%{fullData.name}</extra>",
          marker: {size: index ? 18 : 11, symbol: index ? "diamond-open" : "circle", color: index ? "#ad793b" : "#186c72"}};
      }).filter(function (trace) { return trace.x.length; });
      var layout = {height: 300, margin: {t:20,r:30,b:60,l:70},
        xaxis: Object.assign({title: "תאריך העסקה"}, analysisDateAxis(plottedRows, 8)),
        yaxis: {title:"מחיר מדווח (מ׳ ₪)", automargin:true, gridcolor:"#e8efee"},
        legend:{orientation:"h",y:-.3}, font:{family:'"Segoe UI", Arial, sans-serif',size:13}, hovermode:"closest"};
      var chart = byId("property-history-chart");
      Plotly.newPlot(chart, traces, layout, {responsive:true,displaylogo:false}).then(function () {
        if (chart !== byId("property-history-chart")) return;
        chart.on("plotly_click", function (event) { var point = event.points && event.points[0]; if (point && point.customdata) window.location.href = point.customdata; });
      });
    }
    disclosure.addEventListener("toggle", draw);
    draw();
  }

  async function loadDealHistory(city, record, requestId) {
    var target = byId("deal-history");
    if (target) target.textContent = "טוען את היסטוריית המקורות...";
    try {
      var response = await getJson("api/deals/detail?city=" + encodeURIComponent(city) + "&record=" + encodeURIComponent(record));
      if (requestId !== state.dealRequestId) return;
      renderDealHistory(response.data);
    } catch (error) {
      if (requestId === state.dealRequestId && byId("deal-history")) byId("deal-history").textContent = error.message;
    }
  }

  async function openLinkedDeal() {
    var params = new URLSearchParams(window.location.search);
    if (!params.get("deal_record") || initialTabFromHash() !== "analysis") return;
    var requestId = state.dealRequestId = (state.dealRequestId || 0) + 1;
    try {
      var response = await getJson("api/deals/detail?city=" + encodeURIComponent(params.get("deal_city") || "") + "&record=" + encodeURIComponent(params.get("deal_record")));
      if (requestId !== state.dealRequestId) return;
      activateTab("analysis", false);
      if (!state.latestAnalysisRows.length) byId("analysis-chart").hidden = true;
      // Render the linked record independently of the chart's active filters or sample.
      renderSelectedDeal(response.data.deal, true);
      renderDealHistory(response.data);
      byId("pilot-address-lookup").open=false;
      byId("selected-deal").scrollIntoView({block: "start"});
      rememberNavigation();
    } catch (error) {
      setNotice("analysis-state", error.message, "error");
    }
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
    target.innerHTML = '<div class="active-filter-box"><strong>מסננים פעילים</strong><span>' +
      escapeHtml(filters.join(" • ")) + "</span></div>" +
      '<div class="data-summary-box"><strong>סיכום נתונים</strong><span>' +
      escapeHtml(valueOrDash(counts.summary_points) + " נקודות מסוכמות מתוך " + formatNumber(counts.outlier_deals || counts.filtered_deals || 0) + " עסקאות בודדות") +
      "</span><span>" +
      escapeHtml("כל נקודה = " + translateUiText(data.statistic || byId("compare-statistic").value) + " של עסקאות באותה שנה וגוש") +
      "</span><span>" +
      escapeHtml("מכסה " + valueOrDash(counts.unique_gushes) + " גושים לאורך " + valueOrDash(counts.unique_years) + " שנים") +
      "</span></div>";
  }

  function buildCompareFilterSummary(data, payload) {
    var selection = data.selection || {};
    var gushes = selection.gushes || [];
    var gushText = gushes.length > 3
      ? gushes.slice(0, 3).map(function (gush) { return gush.label || gush.id; }).join(", ") + " (+" + (gushes.length - 3) + " נוספים)"
      : (gushes.map(function (gush) { return gush.label || gush.id; }).join(", ") || "ללא");
    var cities = (selection.cities || []).map(function (city) { return city.name || city.id; });
    var parts = [
      "גוש: " + gushText,
      "עיר: " + (cities.join(", ") || "כל הערים המתאימות"),
      "Y: " + selectedOptionText("compare-y-variable"),
      "מדד: " + selectedOptionText("compare-statistic")
    ];
    addRangeSummary(parts, "שנים", "compare-filter-year-min", "compare-filter-year-max");
    addRangeSummary(parts, "מחיר", "compare-filter-price-min", "compare-filter-price-max", " מ׳ ₪");
    addRangeSummary(parts, "מחיר למ\"ר", "compare-filter-price-m2-min", "compare-filter-price-m2-max", " אלף ₪");
    addRangeSummary(parts, "שטח", "compare-filter-area-min", "compare-filter-area-max", " מ\"ר");
    addRangeSummary(parts, "קומה", "compare-filter-floor-min", "compare-filter-floor-max");
    var rooms = selectedValues(byId("compare-rooms-select"));
    if (rooms.length) parts.push("חדרים: " + rooms.join(", "));
    var roof = byId("compare-roof-select").value;
    if (roof !== "both") parts.push("גג: " + (roof === "yes" ? "רק" : "לא"));
    var project = byId("compare-new-project-select").value;
    if (project !== "both") parts.push("פרויקט חדש: " + (project === "yes" ? "רק" : "לא"));
    if (payload.remove_price_outliers) parts.push("חריגים הוסרו");
    return parts;
  }

  function compareYAxisLabel(data) {
    var stat = data && data.statistic ? data.statistic : byId("compare-statistic").value;
    return (stat === "mean" ? "ממוצע " : "חציון ") + yLabel(data && data.y_variable || byId("compare-y-variable").value);
  }

  function compareSeriesChartOptions() {
    return {
      colors: colorPalette(byId("compare-color-palette").value, "series"),
      reverseColors: byId("compare-reverse-colors").checked,
      symbols: shapeSymbols(byId("compare-shape-palette").value),
      pointSizeRange: [5, 16]
    };
  }

  function performanceSeriesChartOptions() {
    return {
      groupColors: {
        top: "#005f73",
        typical: "#5f6770",
        bottom: "#b35c00"
      },
      groupDashes: {
        top: "solid",
        typical: "dot",
        bottom: "dash"
      },
      groupSymbols: {
        top: "triangle-up",
        typical: "circle-open",
        bottom: "triangle-down"
      },
      pointSizeRange: [6, 13]
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
    renderActiveFilterChips();
    filterTarget.innerHTML = '<strong>מסננים פעילים</strong><span>' + filters.map(escapeHtml).join(" • ") + "</span>";
    var qualified = data.counts && data.counts.qualified_gushes || 0;
    var selected = data.counts && data.counts.selected_gushes || 0;
    var selectedCopy = selected + " גושים נבחרו מתוך " + qualified + " גושים כשירים";
    var groupsCopy = "מציג " + valueOrDash(selection.top_count) + " גבוהים, " + valueOrDash(selection.typical_count) + " טיפוסיים ו-" + valueOrDash(selection.bottom_count) + " נמוכים";
    var period = data.comparison_period || {};
    var basisCopy = "תקופה משותפת: " + valueOrDash(period.first_year) + "–" + valueOrDash(period.last_year) +
      ". כל נקודה = " + selectedOptionText("gush-statistic") + "; לפחות " + valueOrDash(thresholds.min_deals_per_gush) + " עסקאות בכל אחת משתי שנות הקצה.";
    basisCopy += " הדירוג לפי שינוי שנתי מחושב (CAGR): היחס בין הערך האחרון לראשון בחזקת 1/מספר השנים, פחות 1. שינוי בתמהיל העסקאות עשוי להשפיע; זה אינו מדד תשואה לדירה.";
    infoTarget.innerHTML = '<strong>מגמות מחירים בתקופה משותפת</strong><span>' + escapeHtml(selectedCopy) + "</span><span>" + escapeHtml(groupsCopy) + "</span><span>" + escapeHtml(basisCopy) + "</span>";
  }

  function buildGushFilterSummary() {
    var citySelect = byId("gush-city-select");
    var city = citySelect && citySelect.selectedOptions[0] ? citySelect.selectedOptions[0].textContent : valueOrDash(byId("gush-city-select").value);
    var parts = ["עיר: " + city.replace(/\s+\([0-9,]+\)$/, "")];
    addRangeSummary(parts, "שנים", "gush-filter-year-min", "gush-filter-year-max");
    addRangeSummary(parts, "מחיר", "gush-filter-price-min", "gush-filter-price-max", " מ׳ ₪");
    addRangeSummary(parts, "מחיר למ\"ר", "gush-filter-price-m2-min", "gush-filter-price-m2-max", " אלף ₪");
    addRangeSummary(parts, "שטח", "gush-filter-area-min", "gush-filter-area-max", " מ\"ר");
    addRangeSummary(parts, "קומה", "gush-filter-floor-min", "gush-filter-floor-max");
    addRangeSummary(parts, "קומות בבניין", "gush-filter-building-floors-min", "gush-filter-building-floors-max");
    addRangeSummary(parts, "שנת בנייה", "gush-filter-built-year-min", "gush-filter-built-year-max");
    addRangeSummary(parts, "גיל בניין", "gush-filter-building-age-min", "gush-filter-building-age-max");
    var rooms = selectedValues(byId("gush-rooms-select"));
    if (rooms.length) parts.push("חדרים: " + rooms.join(", "));
    var apartmentTypes = selectedValues(byId("gush-apartment-type-select"));
    if (apartmentTypes.length) parts.push("סוג דירה: " + compactList(apartmentTypes, 4));
    var roof = byId("gush-roof-select").value;
    if (roof !== "both") parts.push("גג: " + (roof === "yes" ? "רק" : "לא"));
    var project = byId("gush-new-project-select").value;
    if (project !== "both") parts.push("פרויקט חדש: " + (project === "yes" ? "רק" : "לא"));
    if (byId("gush-remove-price-outliers").checked) parts.push("חריגי מחיר ושטח הוסרו");
    return parts;
  }

  function compactList(values, limit) {
    var list = (values || []).map(String);
    var max = limit || 3;
    if (list.length <= max) return list.join(", ");
    return list.slice(0, max).join(", ") + " (+" + (list.length - max) + " נוספים)";
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
      target.innerHTML = '<div class="mini-notice">הריצו השוואת ערים כדי לראות דירוגים.</div>';
      return;
    }
    var cards = (cityStats.cards || []).map(function (card) {
      return '<div class="metric"><span>' + escapeHtml(card.label === "Selected cities" ? "ערים שנבחרו" : card.label === "Plotted cities" ? "ערים בגרף" : card.label === "Strongest change" ? "השינוי הגבוה בתקופה" : String(card.label).startsWith("Highest latest ") ? "הערך הגבוה בסוף התקופה — " + yLabel(byId("city-y-variable").value) : translateUiText(card.label)) + '</span><strong class="' + textDirectionClass(card.value) + '">' +
        escapeHtml(valueOrDash(card.value)) + '</strong>' +
        (card.detail !== undefined && card.detail !== null ? '<small>' + escapeHtml(valueOrDash(card.detail)) + '</small>' : "") +
        "</div>";
    }).join("");
    var ranking = (cityStats.ranking || []).slice(0, 8).map(function (row, index) {
      return '<tr><td>' + (index + 1) + '</td><td class="' + textDirectionClass(row.city) + '">' + escapeHtml(valueOrDash(row.city)) +
        '</td><td>' + escapeHtml(formatNumber(row.pct_change)) + '%</td><td>' + escapeHtml(formatNumber(row.last_value)) + '</td><td>' +
        escapeHtml(formatNumber(row.avg_deals_per_year)) + "</td></tr>";
    }).join("");
    target.innerHTML = '<p class="coverage-note">' + escapeHtml(cityStats.note || "") + '</p><p>תקופה משותפת לדירוג: ' + escapeHtml(valueOrDash(cityStats.first_year)) + '–' + escapeHtml(valueOrDash(cityStats.last_year)) + '</p><div class="city-insight-cards">' + (cards || '<div class="mini-notice">עדיין אין סטטיסטיקות עיר להשוואה.</div>') + "</div>" +
      '<div class="city-ranking"><h4>דירוג שינוי</h4><table><thead><tr><th>#</th><th>עיר</th><th>שינוי</th><th>ערך בסוף התקופה</th><th>עסקאות / שנה</th></tr></thead><tbody>' +
      (ranking || '<tr><td colspan="5">אין שורות דירוג.</td></tr>') + "</tbody></table></div>";
  }

  function renderCityFilterSummary(data) {
    var filterTarget = byId("city-filter-summary");
    var infoTarget = byId("city-data-info");
    if (!filterTarget || !infoTarget) return;
    var filters = buildCityFilterSummary();
    filterTarget.innerHTML = '<strong>מסננים פעילים</strong><span>' + filters.map(escapeHtml).join(" • ") + "</span>";
    if (!data || !data.counts) {
      infoTarget.innerHTML = "";
      return;
    }
    var stats = data.city_stats || {};
    var yearRange = stats.year_range ? stats.year_range.min + "-" + stats.year_range.max : valueOrDash(data.counts.unique_years) + " שנים";
    infoTarget.innerHTML = '<strong>נתוני השוואת ערים</strong><span>' +
      escapeHtml(valueOrDash(data.counts.summary_points) + " נקודות מסוכמות מתוך " + formatNumber(data.counts.outlier_deals || data.counts.filtered_deals || 0) + " עסקאות") +
      "</span><span>" + escapeHtml("מכסה " + valueOrDash(data.counts.plotted_cities || data.counts.unique_cities) + " ערים לאורך " + yearRange) +
      "</span><span>" + escapeHtml("כל נקודה = " + selectedOptionText("city-statistic").toLowerCase() + " של עסקאות באותה שנה ועיר") + "</span>";
  }

  function buildCityFilterSummary() {
    var cities = selectedCityLabels();
    var cityText = cities.length > 3 ? cities.slice(0, 3).join(", ") + " (+" + (cities.length - 3) + " נוספות)" : (cities.join(", ") || "ללא");
    var parts = ["ערים: " + cityText, "Y: " + selectedOptionText("city-y-variable"), "מדד: " + selectedOptionText("city-statistic")];
    addRangeSummary(parts, "שנים", "city-filter-year-min", "city-filter-year-max");
    addRangeSummary(parts, "מחיר", "city-filter-price-min", "city-filter-price-max", " מ׳ ₪");
    addRangeSummary(parts, "מחיר למ\"ר", "city-filter-price-m2-min", "city-filter-price-m2-max", " אלף ₪");
    addRangeSummary(parts, "שטח", "city-filter-area-min", "city-filter-area-max", " מ\"ר");
    addRangeSummary(parts, "קומה", "city-filter-floor-min", "city-filter-floor-max");
    var rooms = selectedValues(byId("city-rooms-select"));
    if (rooms.length) parts.push("חדרים: " + rooms.join(", "));
    var roof = byId("city-roof-select").value;
    if (roof !== "both") parts.push("גג: " + (roof === "yes" ? "רק" : "לא"));
    var project = byId("city-new-project-select").value;
    if (project !== "both") parts.push("פרויקט חדש: " + (project === "yes" ? "רק" : "לא"));
    if (byId("city-remove-price-outliers").checked) parts.push("חריגים הוסרו");
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
    var commonYears = (series[0] && series[0].points || []).filter(function (p) { return p.y != null && Number(p.y) > 0; }).map(function (p) { return Number(p.year || p.deal_year); });
    (series || []).slice(1).forEach(function (item) { commonYears = commonYears.filter(function (year) { return (item.points || []).some(function (p) { return Number(p.year || p.deal_year) === year && p.y != null && Number(p.y) > 0; }); }); });
    var baseYear = Math.min.apply(null, commonYears);
    if (!Number.isFinite(baseYear)) return {series:[], overlays:{}};
    var transformedSeries = (series || []).map(function (item) {
      return Object.assign({}, item, {
        points: transformPointsForMode((item.points || []).filter(function (p) { return Number(p.year || p.deal_year) >= baseYear; }), mode)
      });
    });
    var transformedOverlays = {};
    Object.keys(overlays || {}).forEach(function (key) {
      var points = (overlays[key] || []).filter(function (p) { return Number(p.year || p.deal_year) >= baseYear; });
      transformedOverlays[key] = points.some(function(p){return Number(p.year || p.deal_year) === baseYear && p.y != null && Number(p.y)>0;}) ? transformPointsForMode(points, mode) : [];
    });
    return { series: transformedSeries, overlays: transformedOverlays };
  }

  function transformPointsForMode(points, mode) {
    var ordered = (points || []).slice().sort(function (left, right) {
      return Number(left.year || left.deal_year || 0) - Number(right.year || right.deal_year || 0);
    });
    var basePoint = ordered.find(function (point) { return point.y != null && Number.isFinite(Number(point.y)) && Number(point.y) !== 0; });
    if (!basePoint) return ordered;
    var base = Number(basePoint.y);
    return ordered.map(function (point) {
      var y = Number(point.y);
      var transformedY = point.y != null && Number.isFinite(y) ? (mode === "indexed" ? (y / base) * 100 : ((y / base) - 1) * 100) : null;
      return Object.assign({}, point, {
        raw_y: point.y,
        base_year: Number(basePoint.year || basePoint.deal_year),
        y: transformedY === null ? null : Math.round(transformedY * 1000) / 1000
      });
    });
  }

  function cityChartYAxisLabel(yVariable, mode) {
    if (mode === "indexed") return "אינדקס (שנת בסיס משותפת = 100)";
    if (mode === "change") return "שינוי משנת בסיס משותפת (%)";
    return yLabel(yVariable);
  }

  function renderMetaSummary(meta) {
    var target = byId("metadata-summary");
    if (!meta) {
      target.innerHTML = "";
      return;
    }
    var cards = [
      ["ערים", meta.data_summary && meta.data_summary.city_count],
      ["שורות", meta.data_summary && meta.data_summary.total_city_rows],
      ["סוגי דירות", (meta.apartment_types || []).length],
      ["רחובות שנטענו", state.streets.length],
      ["גושים שנטענו", state.gushes.length],
      ["הכנת נתוני האתר", formatTimestamp(meta.data_summary && meta.data_summary.generated_at)]
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
      ["לפני הסרת חריגים", data.counts && data.counts.before_outlier_removal],
      ["אחרי הסרת חריגים", data.counts && data.counts.after_outlier_removal],
      ["טווח שנים", ranges.deal_year ? ranges.deal_year.min + "–" + ranges.deal_year.max : "—"],
      ["טווח מחירים", rangeText(ranges.price_millions)],
      ["טווח מחיר למ\"ר", rangeText(ranges.price_per_m2)],
      ["טווח שטח", rangeText(ranges.area)],
      ["טווח קומות", rangeText(ranges.floor)],
      ["קומות בבניין", rangeText(ranges.build_floors)],
      ["סוגי דירות זמינים", data.apartment_types && data.apartment_types.available && data.apartment_types.available.length]
    ];
    target.innerHTML = cards.map(infoCard).join("");
  }

  function applyFilterDefaults(data) {
    var ranges = data.ranges || {};
    applyScopedFilterDefaults("analysis", data, { skipRooms: true });
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
    var roomChoices = data.rooms && data.rooms.choices || [];
    var smartRooms = pilotActive() ? roomChoices : (data.rooms && data.rooms.smart_selected || []);
    var nextSelectedRooms = smartRoomSelectionForOptions(selectedRooms, roomChoices, smartRooms);
    var roomOptions = (data.rooms && data.rooms.choices || []).map(function (value) {
      return { value: value, label: value };
    });
    setOptions(byId("rooms-select"), roomOptions, true);
    ["compare", "gush"].forEach(function (scope) {
      var select = byId(scope + "-rooms-select");
      var selected = selectedValues(select);
      setOptions(select, roomOptions, true);
      if (scope === "compare" && !state.compareRoomsSelectionInitialized) {
        setSelectedValues(select, smartRooms.length ? smartRooms : roomChoices);
      } else {
        setSelectedValues(select, selected.filter(function (value) {
          return roomChoices.map(String).indexOf(String(value)) !== -1;
        }));
      }
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

  function applyScopedFilterDefaults(scope, data, options) {
    options = options || {};
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
    if (roomsSelect && !options.skipRooms) {
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
    var smartRooms = state.gushFilterOptions && state.gushFilterOptions.rooms && state.gushFilterOptions.rooms.smart_selected;
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

  function resetGushFilterRanges() {
    var defaultApartmentTypes = state.meta && state.meta.default_filters && state.meta.default_filters.apartment_types || [];
    setSelectedValues(byId("gush-apartment-type-select"), defaultApartmentTypes);
    if (state.gushFilterOptions) {
      applyScopedFilterDefaults("gush", state.gushFilterOptions);
    }
    byId("gush-roof-select").value = "both";
    byId("gush-new-project-select").value = "both";
    resetIncludeUnknownFilters("gush");
    byId("gush-remove-price-outliers").checked = true;
    renderGushRoomChips();
    renderGushApartmentTypeChips();
    scheduleGushAutoUpdate("reset-filters");
    setNotice("gush-state", "City Performance filters reset to the selected city's available ranges.", "ok");
  }

  function clearCompareRoomSelection() {
    setSelectedValues(byId("compare-rooms-select"), []);
    state.compareRoomsSelectionInitialized = true;
    renderCompareRoomChips();
    updateSelectionSummary();
    scheduleCompareAutoUpdate("rooms");
    setNotice("compare-state", "Room filter cleared for Compare Areas.", "ok");
  }

  function applyCompareSmartRoomSelection() {
    var smartRooms = state.filterOptions && state.filterOptions.rooms && state.filterOptions.rooms.smart_selected;
    if (!smartRooms || !smartRooms.length) {
      setNotice("compare-state", "No smart room selection is available for the selected areas.", "warning");
      return;
    }
    setSelectedValues(byId("compare-rooms-select"), smartRooms);
    state.compareRoomsSelectionInitialized = true;
    renderCompareRoomChips();
    updateSelectionSummary();
    scheduleCompareAutoUpdate("rooms");
    setNotice("compare-state", "Smart room filter applied for Compare Areas.", "ok");
  }

  function resetCompareFilterRanges() {
    var defaultApartmentTypes = state.meta && state.meta.default_filters && state.meta.default_filters.apartment_types || [];
    setSelectedValues(byId("compare-apartment-type-select"), defaultApartmentTypes);
    if (state.filterOptions) {
      applyScopedFilterDefaults("compare", state.filterOptions);
    }
    state.compareRoomsSelectionInitialized = true;
    byId("compare-roof-select").value = "both";
    byId("compare-new-project-select").value = "both";
    resetIncludeUnknownFilters("compare");
    byId("compare-remove-price-outliers").checked = true;
    syncSegmentedControls();
    renderCompareRoomChips();
    renderCompareApartmentTypeChips();
    updateSelectionSummary();
    scheduleCompareAutoUpdate("reset-filters");
    setNotice("compare-state", "Compare filters reset to the selected areas' available ranges.", "ok");
  }

  function applyCitySmartRoomSelection() {
    var smartRooms = state.cityFilterOptions && state.cityFilterOptions.rooms && state.cityFilterOptions.rooms.smart_selected;
    if (!smartRooms || !smartRooms.length) {
      setNotice("city-state", "No smart room selection is available for the selected cities.", "warning");
      return;
    }
    setSelectedValues(byId("city-rooms-select"), smartRooms);
    renderCityRoomChips();
    updateSelectionSummary();
    scheduleCityAutoUpdate("rooms");
    setNotice("city-state", "Smart room filter applied for City Comparison.", "ok");
  }

  function clearCityRoomSelection() {
    setSelectedValues(byId("city-rooms-select"), []);
    renderCityRoomChips();
    updateSelectionSummary();
    scheduleCityAutoUpdate("rooms");
    setNotice("city-state", "Room filter cleared for City Comparison.", "ok");
  }

  function resetCityFilterRanges() {
    var defaultApartmentTypes = state.meta && state.meta.default_filters && state.meta.default_filters.apartment_types || [];
    setSelectedValues(byId("city-apartment-type-select"), defaultApartmentTypes);
    if (state.cityFilterOptions) {
      applyScopedFilterDefaults("city", state.cityFilterOptions);
    }
    byId("city-roof-select").value = "both";
    byId("city-new-project-select").value = "both";
    resetIncludeUnknownFilters("city");
    byId("city-remove-price-outliers").checked = true;
    syncSegmentedControls();
    renderCityRoomChips();
    renderCityApartmentTypeChips();
    renderCityFilterSummary();
    updateSelectionSummary();
    scheduleCityAutoUpdate("reset-filters");
    setNotice("city-state", "City Comparison filters reset to the selected cities' available ranges.", "ok");
  }

  function resetFilterRanges() {
    if (state.filterOptions) {
      applyFilterDefaults(state.filterOptions);
    }
    byId("roof-select").value = "both";
    byId("new-project-select").value = "both";
    resetIncludeUnknownFilters("analysis");
    syncSegmentedControls();
    updateSelectionSummary();
    scheduleAnalysisAutoUpdate("reset-filters");
    setNotice("metadata-state", "Filter ranges reset to the current selection.", "ok");
  }

  function analysisColumns() {
    return [
      ["date", "תאריך", "date"], ["city", "עיר"], ["street", "רחוב"], ["gush", "גוש", "number"],
      ["price_millions", "מחיר", "number"], ["price_per_m2", "מחיר למ\"ר", "number"], ["price_per_room", "מחיר לחדר", "number"],
      ["area", "שטח", "number"], ["rooms", "חדרים", "number"], ["floor", "קומה", "number"], ["apartment_type", "סוג"],
      ["address", "כתובת"], ["sale_portion", "חלק נמכר (1 = 100%)", "number"], ["quality_flags", "חוסרים והערות"], ["location_basis", "בסיס שיוך כתובת/קומה"]
    ].filter(function (item) { return pilotActive() || ["sale_portion", "quality_flags", "legacy_match", "location_basis"].indexOf(item[0]) === -1; }).map(function (item) { return { key: item[0], label: item[1], type: item[2] || "text", filter: item[2] ? "range" : "text" }; });
  }

  function summaryColumns(extra) {
    var keys = (extra || []).concat(["series_label", "deal_year", "n_deals", "price_millions", "price_per_m2", "price_per_room", "y"]);
    var labelByKey = {
      city_label: "עיר",
      gush_label: "גוש",
      series_label: "סדרה",
      deal_year: "שנה",
      n_deals: "עסקאות",
      price_millions: "מחיר",
      price_per_m2: "מחיר למ\"ר (אלפי ₪)",
      price_per_room: "מחיר לחדר (מיליוני ₪)",
      y: "ערך נבחר"
    };
    return keys.map(function (key) { return { key: key, label: labelByKey[key] || key }; });
  }

  function compareRawColumns() {
    return [
      ["date", "תאריך", "date"], ["city", "עיר"], ["street", "רחוב"], ["Gush", "גוש", "number"],
      ["price_millions", "מחיר", "number"], ["price_per_m2", "מחיר למ\"ר", "number"], ["price_per_room", "מחיר לחדר", "number"],
      ["area", "שטח", "number"], ["rooms", "חדרים", "number"], ["floor", "קומה", "number"], ["apt type", "סוג"],
      ["FULLADRESS", "כתובת"], ["location_basis", "בסיס שיוך כתובת/קומה"], ["sale_portion", "חלק נמכר (1 = 100%)", "number"], ["quality_flags", "חוסרים והערות"], ["New_Project", "פרויקט"], ["build_year", "שנת בנייה", "number"], ["building age", "גיל בניין", "number"]
    ].filter(function (item) { return pilotActive() || ["sale_portion", "quality_flags", "legacy_match", "location_basis"].indexOf(item[0]) === -1; }).map(function (item) { return { key: item[0], label: item[1], type: item[2] || "text", filter: item[2] ? "range" : "text" }; });
  }

  function performanceColumns(yVariable) {
    var selectedLabel = yLabel(yVariable);
    return [
      { key: "performance_group", label: "קבוצה" },
      { key: "rank", label: "דירוג", type: "number", filter: "range" },
      { key: "position_in_group", label: "מס' בקבוצה", type: "number", filter: "range" },
      { key: "gush_label", label: "גוש" },
      { key: "price_change", label: "שינוי %", type: "number", filter: "range" },
      { key: "yearly_slope", label: "שינוי שנתי מחושב (CAGR) %", type: "number", filter: "range" },
      { key: "first_y", label: "ערך ראשון - " + selectedLabel, type: "number", filter: "range" },
      { key: "last_y", label: "ערך אחרון - " + selectedLabel, type: "number", filter: "range" },
      { key: "first_year", label: "שנה ראשונה", type: "number", filter: "range" },
      { key: "last_year", label: "שנה אחרונה", type: "number", filter: "range" },
      { key: "years_span", label: "שנים", type: "number", filter: "range" },
      { key: "first_year_deals", label: "עסקאות בשנה הראשונה", type: "number", filter: "range" },
      { key: "last_year_deals", label: "עסקאות בשנה האחרונה", type: "number", filter: "range" },
      { key: "median_deals_per_year", label: "חציון עסקאות/שנה", type: "number", filter: "range" }
    ];
  }

  function citySummaryColumns() {
    return [
      { key: "city_label", label: "עיר" },
      { key: "deal_year", label: "שנה", type: "number", filter: "range" },
      { key: "n_deals", label: "עסקאות", type: "number", filter: "range" },
      { key: "price_millions", label: "מחיר", type: "number", filter: "range" },
      { key: "price_per_m2", label: "מחיר למ\"ר", type: "number", filter: "range" },
      { key: "price_per_room", label: "מחיר לחדר", type: "number", filter: "range" },
      { key: "y", label: "ערך נבחר", type: "number", filter: "range" }
    ];
  }

  async function getJson(url) {
    var response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(await responseMessage(response));
    return response.json();
  }

  async function postJson(url, payload, options) {
    options = options || {};
    var response = await fetch(url, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: options.signal
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
      var fallback = (text || response.statusText || "").replace(/\s+/g, " ").trim();
      return fallback.length > 240 ? fallback.slice(0, 240) + "..." : fallback;
    }
    return response.statusText;
  }

  function setOptions(select, options, multiple) {
    select.innerHTML = "";
    if (!multiple) {
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = translateUiText("Choose...");
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
          return selected.has(String(option.value)) || matchesSearch(optionSearchText(option), query);
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
      var previewLabels = selectedLabels.slice(0, 6).map(function (label) {
        return '<span class="city-selection-pill ' + textDirectionClass(label) + '">' + escapeHtml(label) + "</span>";
      }).join("");
      summary.innerHTML = '<div><strong>' + escapeHtml(formatNumber(selectedList.length) + " ערים נבחרו") + "</strong>" +
        '<span class="city-selection-hint">לחצו על עיר מסומנת כדי להסיר אותה</span></div>' +
        '<button class="secondary compact-button" type="button">ניקוי</button>' +
        '<div class="city-selection-preview">' + previewLabels +
        (selectedLabels.length > 6 ? '<span class="city-selection-pill">+' + escapeHtml(formatNumber(selectedLabels.length - 6)) + " נוספות</span>" : "") +
        "</div>";
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
      chip.innerHTML = chipMarkup(option ? option.textContent : value);
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
      results.innerHTML = '<div class="mini-notice">לא נמצאו ערים מתאימות.</div>';
      return;
    }
    visible.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "picker-option city-picker-option";
      button.classList.toggle("is-selected", selected.has(String(option.value)));
      button.innerHTML = '<span class="city-picker-check" aria-hidden="true"></span><span class="city-picker-label ' + textDirectionClass(option.textContent) + '">' +
        escapeHtml(option.textContent) + "</span>";
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
    setNotice("city-state", values.length ? "City preset applied. Auto-update will run when the filtered dataset is small enough." : "City selection cleared.", values.length ? "ok" : "warning");
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
    var isCompare = document.body.dataset.activeTab === "compare";
    var search = byId(isCompare ? "compare-gush-search" : "gush-picker-search");
    var results = byId(isCompare ? "compare-gush-results" : "gush-picker-results");
    if (!search || !results) return;
    var query = search.value.trim();
    if (query.length < 2) {
      renderLocationPickers();
      return;
    }
    var requestId = ++state.compareGushSearchRequestId;
    var citySelect = byId("city-select");
    var cityLabel = !isCompare && citySelect && citySelect.value ? selectedOptionText("city-select") : "";
    if (!isCompare && !cityLabel) {
      renderPicker("gushes");
      return;
    }
    var url = "api/gush-search?q=" + encodeURIComponent(query) + "&limit=100";
    if (cityLabel) url += "&city=" + encodeURIComponent(cityLabel);
    results.innerHTML = '<div class="mini-notice">' + (isCompare ? "מחפש גושים בכל הערים..." : "מחפש גושים לפי רחובות בעיר שנבחרה...") + "</div>";
    try {
      var response = await getJson(url);
      if (requestId !== state.compareGushSearchRequestId) return;
      mergeCompareGushOptions(response.data.results || []);
      renderLocationPickers();
    } catch (error) {
      results.innerHTML = '<div class="mini-notice error">' + escapeHtml(error.message) + "</div>";
    }
  }

  function mergeCompareGushOptions(gushes) {
    var select = byId("gush-select");
    (gushes || []).forEach(function (gush) {
      var details = [gush.city, "-", gush.label, "(" + gush.id + ")"].filter(Boolean);
      if (gush.representative_street) details.push("- " + gush.representative_street);
      if (gush.matched_street && gush.matched_street !== gush.representative_street) details.push("- נמצא ברחוב " + gush.matched_street);
      if (gush.deals) details.push("· " + formatNumber(gush.deals) + " עסקאות");
      ensureSelectOption(select, {
        value: gush.id,
        label: details.join(" "),
        searchText: [gush.id, gush.label, gush.city, gush.representative_street, gush.matched_street].filter(Boolean).join(" ")
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
      return selected.has(String(option.value)) || matchesSearch(optionSearchText(option), query);
    }).slice(0, 24) : [];

    selectedTarget.innerHTML = "";
    Array.from(selected).forEach(function (value) {
      var option = optionForValue(select, value);
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "selection-chip";
      chip.innerHTML = chipMarkup(option ? option.textContent : value);
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
    results.classList.toggle("picker-idle", !query);
    if (!options.length) {
      results.innerHTML = '<div class="mini-notice">' + escapeHtml(config.emptyText) + "</div>";
      return;
    }
    if (!query) {
      results.innerHTML = '<div class="mini-notice">' +
        (key === "gushes" && document.body.dataset.activeTab === "compare"
          ? "חפשו מספר גוש, עיר, תיאור או רחוב בכל הערים. פריטים שנבחרו נשארים מוצמדים למעלה."
          : (selected.size ? "אפשר להוסיף לבחירה בחיפוש נוסף." : "אפשר לבחור כמה " + (key === "gushes" ? "גושים" : "רחובות") + ".")) +
        "</div>";
      return;
    }
    if (!visible.length) {
      results.innerHTML = '<div class="mini-notice">לא נמצאו התאמות.</div>';
      return;
    }
    visible.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "picker-option";
      if (key === "gushes") button.classList.add("gush-picker-option");
      button.classList.toggle("is-selected", selected.has(String(option.value)));
      if (key === "gushes") {
        button.innerHTML = '<span class="gush-picker-result-label ' + textDirectionClass(option.textContent) + '">' + escapeHtml(option.textContent) + "</span>";
      } else {
        button.textContent = option.textContent;
      }
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
      return selected.has(String(option.value)) || matchesSearch(optionSearchText(option), query);
    }).slice(0, 30) : [];

    selectedTarget.innerHTML = "";
    Array.from(selected).forEach(function (value) {
      var option = optionForValue(select, value);
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "selection-chip";
      chip.innerHTML = chipMarkup(option ? option.textContent : value);
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
      results.innerHTML = '<div class="mini-notice">חפשו לפי מספר גוש, עיר, תיאור או רחוב. אזורים שנבחרו נשארים מוצמדים למעלה.</div>';
      return;
    }
    if (!visible.length) {
      results.innerHTML = '<div class="mini-notice">אין התאמות עדיין. המשיכו להקליד כדי לחפש בכל הערים.</div>';
      return;
    }

    results.innerHTML = "";
    visible.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "picker-option compare-gush-option";
      button.classList.toggle("is-selected", selected.has(String(option.value)));
      button.innerHTML = '<span class="compare-gush-result-label ' + textDirectionClass(option.textContent) + '">' + escapeHtml(option.textContent) + "</span>";
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

  function chipMarkup(label) {
    return '<span class="chip-remove" aria-hidden="true">×</span><span class="chip-label">' +
      escapeHtml(label) + "</span>";
  }

  function scheduleFilterOptions() {
    if (state.restoringView) return;
    if (state.filterOptionsTimer) window.clearTimeout(state.filterOptionsTimer);
    if (!byId("city-select").value && !activeGushSelection().length) return;
    state.filterOptionsTimer = window.setTimeout(loadFilterOptions, 450);
  }

  function scheduleCityFilterOptions() {
    if (state.restoringView) return;
    if (state.cityFilterOptionsTimer) window.clearTimeout(state.cityFilterOptionsTimer);
    if (!selectedValues(byId("city-comparison-select")).length) return;
    state.cityFilterOptionsTimer = window.setTimeout(loadCityFilterOptions, 450);
  }

  function scheduleGushFilterOptions() {
    if (state.restoringView) return;
    if (state.gushFilterOptionsTimer) window.clearTimeout(state.gushFilterOptionsTimer);
    if (!byId("gush-city-select").value) return;
    state.gushFilterOptionsTimer = window.setTimeout(loadGushFilterOptions, 450);
  }

  function scheduleAnalysisAutoUpdate(reason) {
    if (state.restoringView) return;
    if (state.autoAnalysisTimer) window.clearTimeout(state.autoAnalysisTimer);
    if (!byId("auto-update-analysis").checked) return;
    state.autoAnalysisTimer = window.setTimeout(function () {
      runAnalysisAutoUpdate(reason);
    }, 750);
  }

  function runAnalysisAutoUpdate(reason) {
    if (state.restoringView || state.analysisMode!=="chart") return;
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
    if (byId("analysis-address").value.trim().length >= 2) return { status: "run" };
    var counts = state.filterOptions.counts || {};
    var estimate = Number(counts.after_outlier_removal || counts.before_outlier_removal || 0);
    if (!Number.isFinite(estimate) || estimate <= 0) return { status: "run" };
    var rowLimit = intValue("row-limit", DEFAULT_ANALYSIS_ROW_LIMIT);
    if (rowLimit < 1) rowLimit = DEFAULT_ANALYSIS_ROW_LIMIT;
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
        message: "Auto update paused because this would render about " + formatNumber(renderedPoints) + " points, above the automatic limit of " + formatNumber(AUTO_ANALYSIS_POINT_LIMIT) + ". Lower the row limit or click Update analysis."
      };
    }
    return { status: "run" };
  }

  function scheduleCompareAutoUpdate(reason) {
    if (state.restoringView) return;
    if (state.autoCompareTimer) window.clearTimeout(state.autoCompareTimer);
    if (!byId("auto-update-compare").checked) return;
    if (document.body.dataset.activeTab !== "compare") return;
    state.autoCompareTimer = window.setTimeout(function () {
      runCompareAutoUpdate(reason);
    }, 650);
  }

  function scheduleCityAutoUpdate(reason) {
    if (state.restoringView) return;
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
    if (state.restoringView) return;
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

  function scheduleMapAutoUpdate(reason) {
    if (state.restoringView) return;
    if (state.autoMapTimer) window.clearTimeout(state.autoMapTimer);
    if (document.body.dataset.activeTab !== "map") return;
    if (!byId("city-select").value && !activeGushSelection().length) return;
    state.autoMapTimer = window.setTimeout(function () {
      runGushMap({ auto: true, reason: reason });
    }, 350);
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
      scheduleCityFilterOptions();
      return { status: "waiting" };
    }
    return { status: "run" };
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
        state.roomsSelectionInitialized = true;
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
        state.compareRoomsSelectionInitialized = true;
        updateSelectionSummary();
        scheduleCompareAutoUpdate("rooms");
      }
    });
  }

  function renderCityRoomChips() {
    renderScopedRoomChips({
      targetId: "city-rooms-chip-group",
      selectId: "city-rooms-select",
      onChange: function () {
        updateSelectionSummary();
        scheduleCityAutoUpdate("rooms");
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
      target.innerHTML = '<div class="mini-notice">אפשרויות חדרים נטענות לפי האזור שנבחר.</div>';
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
    if (window.NadlanLayout) window.NadlanLayout.decorateRoomChips(target, select);
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

  function renderCityApartmentTypeChips() {
    renderScopedApartmentTypeChips({
      targetId: "city-apartment-type-chip-group",
      selectId: "city-apartment-type-select",
      searchId: "city-apartment-type-search",
      onChange: function () {
        updateSelectionSummary();
        scheduleCityAutoUpdate("apartment-types");
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
      return option.value && (selected.has(String(option.value)) || !query || matchesSearch(option.textContent, query));
    });
    var visible = options.slice(0, query ? 24 : 12);

    target.innerHTML = "";
    if (!visible.length) {
      target.innerHTML = '<div class="mini-notice">לא נמצאו סוגי דירות מתאימים.</div>';
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
    // A displayed full range is not an explicit request to exclude missing area/price.
    if (["area_range", "price_range", "price_per_m2_range"].indexOf(key) !== -1) {
      if (byId(minId).value === byId(minId).dataset.defaultValue) min = null;
      if (byId(maxId).value === byId(maxId).dataset.defaultValue) max = null;
    }
    if (min !== null || max !== null) filters[key] = [min, max];
  }

  function addOptionalFilter(filters, key, selectId, emptyValue) {
    var value = byId(selectId).value;
    if (value && value !== emptyValue) filters[key] = value;
  }

  function includeUnknownFilters(scope) {
    return {
      rooms: checkboxValue(filterControlId(scope, "include-unknown-rooms"), true),
      floor: checkboxValue(filterControlId(scope, "include-unknown-floor"), true),
      build_floors: checkboxValue(filterControlId(scope, "include-unknown-building-floors"), true),
      build_year: checkboxValue(filterControlId(scope, "include-unknown-built-year"), true),
      building_age: checkboxValue(filterControlId(scope, "include-unknown-building-age"), true)
    };
  }

  function resetIncludeUnknownFilters(scope) {
    if (pilotActive()) {
      var share = byId(filterControlId(scope, "sale-portion-select"));
      var completeness = byId(filterControlId(scope, "data-completeness-select"));
      if (share) share.value = "full";
      if (completeness) completeness.value = "all";
      var location = byId(filterControlId(scope, "location-basis-select"));
      if (location) location.value = "all";
      var warning = share && share.closest(".pilot-filters").querySelector(".pilot-share-warning");
      if (warning) warning.hidden = true;
    }
    [
      "include-unknown-rooms",
      "include-unknown-floor",
      "include-unknown-building-floors",
      "include-unknown-built-year",
      "include-unknown-building-age"
    ].forEach(function (baseId) {
      var element = byId(filterControlId(scope, baseId));
      if (element) element.checked = true;
    });
  }

  function checkboxValue(id, fallback) {
    var element = byId(id);
    return element ? element.checked : fallback;
  }

  function filterControlId(scope, baseId) {
    return scope === "analysis" ? baseId : scope + "-" + baseId;
  }

  function setRangeInputs(prefix, range) {
    if (!range) return;
    var year = /filter-year$/.test(prefix);
    ["min","max"].forEach(function (side) {
      var input = byId(prefix + "-" + side);
      input.value = year ? valueOrEmpty(range[side]) : "";
      input.dataset.defaultValue = input.value;
      input.placeholder = year ? "ללא הגבלה" : (side === "min" ? "ללא מינימום" : "ללא מקסימום");
      input.title = "טווח המקור: " + valueOrDash(range.min) + "–" + valueOrDash(range.max) + ". השאירו ריק כדי לא להגביל.";
    });
  }

  function numberValue(id) {
    var value = byId(id).value.trim();
    if (!value) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function intValue(id, fallback, min, max) {
    var number = parseInt(byId(id).value, 10);
    if (!Number.isFinite(number)) number = fallback;
    if (Number.isFinite(min)) number = Math.max(min, number);
    if (Number.isFinite(max)) number = Math.min(max, number);
    byId(id).value = number;
    return number;
  }

  function setNotice(id, message, kind) {
    var target = byId(id);
    if (!target) return;
    target.setAttribute("aria-live", kind === "error" || kind === "warning" ? "assertive" : "polite");
    target.setAttribute("role", kind === "error" || kind === "warning" ? "alert" : "status");
    target.innerHTML = message ? '<div class="notice ' + (kind || "") + '">' + escapeHtml(translateUiText(message)) + "</div>" : "";
  }

  function setBusy(id, busy) {
    var button = byId(id);
    if (button) button.disabled = busy;
  }

  function startRequest(key) {
    cancelRequest(key, { silent: true });
    var controller = new AbortController();
    state.requestControllers[key] = controller;
    setRequestBusy(key, true);
    return controller;
  }

  function finishRequest(key) {
    delete state.requestControllers[key];
    setRequestBusy(key, false);
  }

  function cancelRequest(key, options) {
    options = options || {};
    var controller = state.requestControllers[key];
    if (controller) {
      controller.abort();
      delete state.requestControllers[key];
    }
    setRequestBusy(key, false);
    if (!options.silent) {
      var stateId = {
        analysis: "analysis-state",
        compare: "compare-state",
        city: "city-state",
        gush: "gush-state"
      }[key];
      if (stateId) setNotice(stateId, "Canceling current request...", "warning");
    }
  }

  function setRequestBusy(key, busy) {
    var runId = {
      analysis: "run-analysis",
      compare: "run-compare",
      city: "run-city",
      gush: "run-gush"
    }[key];
    var cancelId = "cancel-" + key;
    setBusy(runId, busy);
    var cancelButton = byId(cancelId);
    if (cancelButton) cancelButton.hidden = !busy;
  }

  function setAnalysisBusy(busy) {
    setRequestBusy("analysis", busy);
  }

  function updateSelectionSummary() {
    var target = byId("selection-summary");
    if (!target) return;
    var citySelect = byId("city-select");
    var city = citySelect && citySelect.selectedOptions[0] ? citySelect.selectedOptions[0].textContent : "אין עיר";
    var pieces = [
      ["עיר", city.replace(/\s+\([0-9,]+\)$/, "")],
      ["רחובות", selectedValues(byId("street-select")).length],
      ["גושים", selectedValues(byId("gush-select")).length]
    ];
    if (document.body.dataset.activeTab === "analysis") {
      pieces = pieces.concat([
        ["כתובת", byId("analysis-address").value.trim() || "הכל"],
        ["חדרים", roomSelectionText("rooms-select")],
        ["סטטוס", statusFilterText()],
        ["טווחים מותאמים", customRangeFilterCount()]
      ]);
    } else if (document.body.dataset.activeTab === "compare") {
      pieces = pieces.concat([
        ["ערך Y", selectedOptionText("compare-y-variable")],
        ["חדרים", roomSelectionText("compare-rooms-select")],
        ["טווחים מותאמים", customRangeFilterCount("compare")]
      ]);
    } else if (document.body.dataset.activeTab === "city") {
      pieces = [
        ["ערים", selectedValues(byId("city-comparison-select")).length],
        ["ערך Y", selectedOptionText("city-y-variable")],
        ["מדד", selectedOptionText("city-statistic")],
        ["חדרים", roomSelectionText("city-rooms-select")],
        ["טווחים מותאמים", customRangeFilterCount("city")]
      ];
    }
    target.innerHTML = pieces.map(function (piece) {
      return '<div><span>' + escapeHtml(piece[0]) + '</span><strong>' + escapeHtml(piece[1]) + "</strong></div>";
    }).join("");
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function translateStaticDom() {
    document.querySelectorAll("input[placeholder], [title], [aria-label], [data-empty-label]").forEach(function (element) {
      ["placeholder", "title", "aria-label", "data-empty-label"].forEach(function (attribute) {
        if (!element.hasAttribute(attribute)) return;
        element.setAttribute(attribute, translateUiText(element.getAttribute(attribute)));
      });
    });
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || ["SCRIPT", "STYLE"].indexOf(parent.tagName) !== -1) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      var leading = text.match(/^\s*/)[0];
      var trailing = text.match(/\s*$/)[0];
      node.nodeValue = leading + translateUiText(text.trim()) + trailing;
    });
  }

  function translateUiText(text) {
    var value = String(text === null || text === undefined ? "" : text);
    if (Object.prototype.hasOwnProperty.call(uiTranslations, value)) return uiTranslations[value];
    return translateUiFragments(value);
  }

  function translateUiFragments(value) {
    return value
      .replace(/^Choose\.\.\.$/, "בחרו...")
      .replace(/^Select a city$/, "בחרו עיר")
      .replace(/^ or use Random to load a runnable example\.$/, ' או השתמשו בכפתור "אקראי"')
      .replace(/^Choose properties$/, "בחרו נכסים")
      .replace(/^ by searching streets, selecting Gush areas, or expanding selected Gush areas into streets\.$/, " בעזרת חיפוש רחובות, בחירת גושים או הרחבת גושים לרחובות.")
      .replace(/^Adjust filters$/, "כוונו מסננים")
      .replace(/^ for year, price, area, rooms, floor, project status, and outliers\.$/, " לפי שנה, מחיר, שטח, חדרים, קומה, סטטוס פרויקט וחריגים.")
      .replace(/^Update analysis$/, 'לחצו על הכפתור "עדכון ניתוח"')
      .replace(/^ to draw the transaction-level scatter plot and table\.$/, " כדי לצייר גרף פיזור והפקת טבלה של העסקאות.")
      .replace(/^Use street search when you do not know which Gush area contains a street\.$/, "השתמשו בחיפוש רחוב כשלא ידוע איזה גוש מכיל אותו.")
      .replace(/^Smart reset chooses common room counts for the current selection\.$/, "איפוס חכם בוחר מספרי חדרים נפוצים לבחירה הנוכחית.")
      .replace(/^After the plot appears, click a point to inspect its transaction details\.$/, "אחרי שהגרף מופיע, לחצו על נקודה כדי לבדוק את פרטי העסקה.")
      .replace(/^Search a street across all cities$/, "חפשו רחוב בכל הערים")
      .replace(/^ or pick known Gush areas\.$/, " או בחרו גושים מוכרים.")
      .replace(/^Add matching Gush areas$/, "הוסיפו גושים מתאימים")
      .replace(/^ directly from the search results\.$/, " ישירות מתוצאות החיפוש.")
      .replace(/^Pick a Y value$/, "בחרו ערך Y")
      .replace(/^ such as price, price per m², price per room, or deal count\.$/, " כמו מחיר, מחיר למ\"ר, מחיר לחדר או מספר עסקאות.")
      .replace(/^Update compare$/, "עדכנו השוואה")
      .replace(/^ to draw yearly lines and fill the summary table\.$/, " כדי לצייר קווים שנתיים ולמלא את טבלת הסיכום.")
      .replace(/^Use Gush areas for neighborhood-block comparisons and streets for focused checks\.$/, "השתמשו בגושים להשוואת אזורי שכונה וברחובות לבדיקות ממוקדות.")
      .replace(/^Turn on city-wide to see the selected city as a reference line\.$/, "הפעילו כל העיר כדי לראות את העיר שנבחרה כקו ייחוס.")
      .replace(/^Use Summary CSV for grouped trends and Raw CSV for the underlying deals\.$/, "CSV סיכום מתאים למגמות מקובצות, ו-CSV גולמי לעסקאות שמאחורי הסיכום.")
      .replace(/^Select cities$/, "בחרו ערים")
      .replace(/^ from the city list\.$/, " מרשימת הערים.")
      .replace(/^Choose a Y value$/, "בחרו ערך Y")
      .replace(/^ for the comparison\.$/, " להשוואה.")
      .replace(/^ only if you want a narrower city-level slice\.$/, " רק אם רוצים חתך עירוני צר יותר.")
      .replace(/^Update cities$/, "עדכנו ערים")
      .replace(/^ to draw city trend lines and generate the table\.$/, " כדי לצייר קווי מגמה וליצור את הטבלה.")
      .replace(/^Deal count is useful for market activity, not just price movement\.$/, "מספר העסקאות שימושי לפעילות שוק, לא רק לתנועת מחיר.")
      .replace(/^Keep filters broad when comparing cities with different housing mixes\.$/, "השאירו מסננים רחבים כשמשווים ערים עם תמהילי דיור שונים.")
      .replace(/^Use Raw CSV when you need to audit which transactions entered the summary\.$/, "השתמשו ב-CSV גולמי כשצריך לבדוק אילו עסקאות נכנסו לסיכום.")
      .replace(/^Select one city$/, "בחרו עיר אחת")
      .replace(/^ in the City Performance rail\.$/, " בפאנל ביצועי העיר.")
      .replace(/^Set group sizes$/, "הגדירו גדלי קבוצות")
      .replace(/^ for top, typical, and bottom performers\.$/, " לביצועים גבוהים, טיפוסיים ונמוכים.")
      .replace(/^Choose minimum deals$/, "בחרו מינימום עסקאות")
      .replace(/^ so thinly traded Gush areas do not dominate\.$/, " כדי שגושים דלי עסקאות לא ישתלטו.")
      .replace(/^Update performance$/, "עדכנו ביצועים")
      .replace(/^ to draw qualified Gush trend lines and rankings\.$/, " כדי לצייר קווי מגמה ודירוגים של גושים כשירים.")
      .replace(/^Raise minimum deals for steadier comparisons in large cities\.$/, "העלו מינימום עסקאות להשוואות יציבות יותר בערים גדולות.")
      .replace(/^Use city-wide as a reference line when judging standout Gush areas\.$/, "השתמשו בכל העיר כקו ייחוס כשבודקים גושים חריגים.")
      .replace(/^The table shows which Gush areas qualified for each performance group\.$/, "הטבלה מראה אילו גושים נכנסו לכל קבוצת ביצועים.")
      .replace(/^Status: /, "סטטוס: ")
      .replace(/^Removed (\d+) price outlier deals\.$/, "הוסרו $1 עסקאות לפי מסנן חריגי המחיר.")
      .replace(/^(\d+) selected Gush polygons were not found in the local cache\.$/, "$1 גושים שנבחרו חסרים בשכבת המפה המקומית.")
      .replace(/^Choose a city, then update the local Gush polygon map\.$/, "בחרו עיר כדי להציג את מפת הגושים.")
      .replace(/^Removed (\d+) outlier deals\.$/, "הוסרו $1 עסקאות חריגות לפי המסננים.")
      .replace(/^Incomplete collection years were excluded: (.+)\.$/, "שנות איסוף חלקיות שלא נכללו: $1.")
      .replace(/^The comparison includes an incomplete collection year; its annual value may change as more transactions arrive\.$/, "ההשוואה כוללת שנת איסוף חלקית; ערכה עשוי להשתנות עם הגעת עסקאות נוספות.")
      .replace(/^No comparable Gushes passed the deal-count threshold in both common endpoint years\. Choose a shorter period or lower the minimum deal count\.$/, "אין גושים עם מספיק עסקאות בשתי שנות הקצה המשותפות. נסו תקופה קצרה יותר או סף עסקאות נמוך יותר.")
      .replace(/^Status unavailable: /, "הסטטוס לא זמין: ")
      .replace(/^Loading application metadata\.\.\.$/, "טוען מטא-דאטה של האפליקציה...")
      .replace(/^Metadata loaded\.$/, "המטא-דאטה נטען.")
      .replace(/^Choose a city first\.$/, "בחרו עיר קודם.")
      .replace(/^Loading streets and Gush areas\.\.\.$/, "טוען רחובות וגושים...")
      .replace(/^Loaded ([\d,]+) streets and ([\d,]+) Gush areas\.$/, "נטענו $1 רחובות ו-$2 גושים.")
      .replace(/^Returned a deterministic sample of ([\d,]+) deals from ([\d,]+) matching deals\.$/, "מוצג מדגם של $1 עסקאות מתוך $2 התאמות. ייצוא CSV כולל את כל ההתאמות; סינון הטבלה חל על המדגם בלבד.")
      .replace(/^City metadata loaded\. Search streets or Gush areas, then update analysis\.$/, "מטא-דאטה של העיר נטען. חפשו רחובות או גושים ואז עדכנו את הניתוח.")
      .replace(/^Loading dynamic filter ranges\.\.\.$/, "טוען טווחי סינון דינמיים...")
      .replace(/^Filter options loaded\.$/, "אפשרויות הסינון נטענו.")
      .replace(/^City filters are ready\. Change filters or click Update Plot\.$/, "מסנני הערים מוכנים. שנו מסננים או לחצו עדכון גרף.")
      .replace(/^Select cities\. City Comparison updates automatically when the filtered dataset is small enough\.$/, "בחרו ערים. השוואת ערים תתעדכן אוטומטית כשהנתונים המסוננים קטנים מספיק.")
      .replace(/^Random city selected\. Pick a smaller Gush if auto update pauses\.$/, "נבחרה עיר אקראית. בחרו גוש קטן יותר אם העדכון האוטומטי נעצר.")
      .replace(/^Tel Aviv is not available in the loaded city list\.$/, "תל אביב לא זמינה ברשימת הערים שנטענה.")
      .replace(/^Tel Aviv performance defaults loaded\.$/, "ברירות המחדל לביצועי תל אביב נטענו.")
      .replace(/^Run City Performance first, then choose which ranked Gushes to use\.$/, "הריצו קודם ביצועי עיר, ואז בחרו אילו גושים מדורגים להשתמש בהם.")
      .replace(/^Selected ([\d,]+) ranked Gush areas and switched them into the Analysis\/Compare shared picker\.$/, "נבחרו $1 גושים מדורגים והועברו לבורר המשותף של ניתוח/השוואה.")
      .replace(/^Using ([\d,]+) streets from the selected Gush areas\.$/, "משתמש ב-$1 רחובות מהגושים שנבחרו.")
      .replace(/^Using ([\d,]+) whole Gush areas from the selected streets\.$/, "משתמש ב-$1 גושים מלאים מהרחובות שנבחרו.")
      .replace(/^Added matching Gush areas from street search\.$/, "נוספו גושים מתאימים מחיפוש הרחוב.")
      .replace(/^Added the street's Gush areas\. Compare controls are ready\.$/, "נוספו הגושים של הרחוב. פקדי ההשוואה מוכנים.")
      .replace(/^Using selected street\. Choose "Use whole Gush" to broaden it\.$/, "משתמש ברחוב שנבחר. בחרו \"השתמש בכל הגוש\" כדי להרחיב.")
      .replace(/^Choose a city or Gush area first\.$/, "בחרו עיר או גוש קודם.")
      .replace(/^Auto-updating analysis\.\.\.$/, "מעדכן ניתוח אוטומטית...")
      .replace(/^Loading analysis deals\.\.\.$/, "טוען עסקאות לניתוח...")
      .replace(/^Select Gush areas or streets before updating compare\.$/, "בחרו גושים או רחובות לפני עדכון ההשוואה.")
      .replace(/^Auto-updating Gush comparison\.\.\.$/, "מעדכן השוואת גושים אוטומטית...")
      .replace(/^Loading Gush comparison\.\.\.$/, "טוען השוואת גושים...")
      .replace(/^Select Gush areas or streets before loading raw deals\.$/, "בחרו גושים או רחובות לפני טעינת עסקאות גולמיות.")
      .replace(/^Loading raw deals preview\.\.\.$/, "טוען תצוגה מקדימה של עסקאות גולמיות...")
      .replace(/^Select at least one city\.$/, "בחרו לפחות עיר אחת.")
      .replace(/^Auto-updating city comparison\.\.\.$/, "מעדכן השוואת ערים אוטומטית...")
      .replace(/^Loading city comparison\.\.\.$/, "טוען השוואת ערים...")
      .replace(/^Choose one city first\.$/, "בחרו עיר אחת קודם.")
      .replace(/^Auto-updating Gush performance\.\.\.$/, "מעדכן ביצועי גושים אוטומטית...")
      .replace(/^Loading Gush performance\.\.\.$/, "טוען ביצועי גושים...")
      .replace(/^Preparing (.+) CSV\.\.\.$/, "מכין CSV מסוג $1...")
      .replace(/^(.+) downloaded\. Rows: (.+)$/, "$1 ירד. שורות: $2")
      .replace(/^No smart room selection is available for the current filters\.$/, "אין בחירת חדרים חכמה למסננים הנוכחיים.")
      .replace(/^Applied smart room selection: (.+)\.$/, "הוחלה בחירת חדרים חכמה: $1.")
      .replace(/^No smart room selection is available for the current city\.$/, "אין בחירת חדרים חכמה לעיר הנוכחית.")
      .replace(/^Room filter cleared for City Performance\.$/, "מסנן החדרים נוקה לביצועי עיר.")
      .replace(/^City Performance filters reset to the selected city's available ranges\.$/, "מסנני ביצועי העיר אופסו לטווחים הזמינים בעיר שנבחרה.")
      .replace(/^Room filter cleared for Compare Areas\.$/, "מסנן החדרים נוקה להשוואת אזורים.")
      .replace(/^Smart room filter applied for Compare Areas\.$/, "מסנן חדרים חכם הופעל להשוואת אזורים.")
      .replace(/^Compare filters reset to the selected areas' available ranges\.$/, "מסנני ההשוואה אופסו לטווחים הזמינים באזורים שנבחרו.")
      .replace(/^No smart room selection is available for the selected cities\.$/, "אין בחירת חדרים חכמה לערים שנבחרו.")
      .replace(/^Smart room filter applied for City Comparison\.$/, "מסנן חדרים חכם הופעל להשוואת ערים.")
      .replace(/^Room filter cleared for City Comparison\.$/, "מסנן החדרים נוקה להשוואת ערים.")
      .replace(/^City Comparison filters reset to the selected cities' available ranges\.$/, "מסנני השוואת הערים אופסו לטווחים הזמינים בערים שנבחרו.")
      .replace(/^Filter ranges reset to the current selection\.$/, "טווחי הסינון אופסו לבחירה הנוכחית.")
      .replace(/^City preset applied\. Auto-update will run when the filtered dataset is small enough\.$/, "קבוצת ערים הוחלה. העדכון האוטומטי ירוץ כשהנתונים המסוננים קטנים מספיק.")
      .replace(/^City selection cleared\.$/, "בחירת הערים נוקתה.")
      .replace(/^Search by street name across all cities, or pick up to 15 Gush areas\.$/, "חפשו לפי שם רחוב בכל הערים, או בחרו עד 15 גושים.")
      .replace(/^Compare Areas supports up to 15 Gush areas\. Keeping the first 15 selected\.$/, "השוואת אזורים תומכת בעד 15 גושים. נשמרים 15 הראשונים שנבחרו.")
      .replace(/^Auto update paused for ([\d,]+) estimated matching deals\. Click Update analysis to run it\.$/, "העדכון האוטומטי נעצר עבור כ-$1 עסקאות מתאימות. לחצו עדכון ניתוח כדי להריץ.")
      .replace(/^Auto update paused because this would render about ([\d,]+) points, above the automatic limit of ([\d,]+)\. Lower the row limit or click Update analysis\.$/, "העדכון האוטומטי נעצר כי יוצגו בערך $1 נקודות, מעל מגבלת העדכון האוטומטי ($2). הקטינו את מגבלת השורות או לחצו עדכון ניתוח.")
      .replace(/^Auto update paused because this would render about ([\d,]+) points\. Lower the row limit or click Update analysis\.$/, "העדכון האוטומטי נעצר כי יוצגו בערך $1 נקודות. הקטינו את מגבלת השורות או לחצו עדכון ניתוח.")
      .replace(/^Auto update paused because Compare Areas supports up to 15 selected Gush areas\.$/, "העדכון האוטומטי נעצר כי השוואת אזורים תומכת בעד 15 גושים שנבחרו.")
      .replace(/^Choose a city or selected Gush area first\.$/, "בחרו עיר או גוש קודם.")
      .replace(/^Choose a city and search for streets or Gush areas\. Metadata loads automatically\.$/, "בחרו עיר וחפשו רחובות או גושים. המטא-דאטה נטען אוטומטית.")
      .replace(/^Select streets or Gush areas\. Compare updates automatically when the selection is small enough\.$/, "בחרו רחובות או גושים. ההשוואה מתעדכנת אוטומטית כשהבחירה קטנה מספיק.")
      .replace(/^Select cities and click update\. No city summary is loaded automatically\.$/, "בחרו ערים ולחצו עדכון. סיכום ערים לא נטען אוטומטית.")
      .replace(/^Choose one city and update performance\.$/, "בחרו עיר אחת ועדכנו ביצועים.")
      .replace(/^Downloads use the filter panel for the workflow you export\.$/, "ההורדות משתמשות במסננים של התהליך שמייצאים.")
      .replace(/^Select one or more Gush areas first\.$/, "בחרו גוש אחד או יותר קודם.")
      .replace(/^Select one or more streets first\.$/, "בחרו רחוב אחד או יותר קודם.")
      .replace(/^Searching\.\.\.$/, "מחפש...")
      .replace(/^Searching streets across all cities\.\.\.$/, "מחפש רחובות בכל הערים...")
      .replace(/^Searching Gush areas across all cities\.\.\.$/, "מחפש גושים בכל הערים...")
      .replace(/^No matching streets\.$/, "לא נמצאו רחובות מתאימים.")
      .replace(/^No matching cities\.$/, "לא נמצאו ערים מתאימות.")
      .replace(/^No matching apartment types\.$/, "לא נמצאו סוגי דירות מתאימים.")
      .replace(/^No matches\.$/, "לא נמצאו התאמות.")
      .replace(/^No matches yet\. Keep typing to search all cities\.$/, "אין התאמות עדיין. המשיכו להקליד כדי לחפש בכל הערים.")
      .replace(/^No rows to display\.$/, "אין שורות להצגה.")
      .replace(/^Filter all columns$/, "סינון כל העמודות")
      .replace(/^Search rows$/, "חיפוש שורות")
      .replace(/^Clear filters$/, "ניקוי מסננים")
      .replace(/^Min$/, "מינ'")
      .replace(/^Max$/, "מקס'")
      .replace(/^Filter$/, "סינון")
      .replace(/^Analysis updated\.$/, "הניתוח עודכן.")
      .replace(/^No matching transactions\.$/, "לא נמצאו עסקאות מתאימות.")
      .replace(/^Compare summary updated\.$/, "סיכום ההשוואה עודכן.")
      .replace(/^No matching summary rows\.$/, "לא נמצאו שורות סיכום מתאימות.")
      .replace(/^Raw deals preview loaded\.$/, "תצוגה מקדימה של עסקאות גולמיות נטענה.")
      .replace(/^No matching raw deals\.$/, "לא נמצאו עסקאות גולמיות מתאימות.")
      .replace(/^City comparison updated\.$/, "השוואת הערים עודכנה.")
      .replace(/^No matching city rows\.$/, "לא נמצאו שורות עיר מתאימות.")
      .replace(/^Gush performance updated\.$/, "ביצועי הגושים עודכנו.")
      .replace(/^No qualified Gush performance rows\.$/, "לא נמצאו שורות ביצועי גושים כשירות.")
      .replace(/^Canceling current request\.\.\.$/, "מבטל את הבקשה הנוכחית...")
      .replace(/^Analysis request canceled\.$/, "בקשת הניתוח בוטלה.")
      .replace(/^Compare request canceled\.$/, "בקשת ההשוואה בוטלה.")
      .replace(/^City comparison request canceled\.$/, "בקשת השוואת הערים בוטלה.")
      .replace(/^City Performance request canceled\.$/, "בקשת ביצועי העיר בוטלה.")
      .replace(/^Room options load with the selected area\.$/, "אפשרויות חדרים נטענות לפי האזור שנבחר.")
      .replace(/^Room filter cleared\.$/, "מסנן החדרים נוקה.")
      .replace(/^Outliers removed$/, "חריגים הוסרו")
      .replace(/^Unavailable$/, "לא זמין")
      .replace(/^All$/, "הכל")
      .replace(/^Both$/, "גם");
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function statusFilterText() {
    var labels = [];
    if (byId("roof-select").value !== "both") labels.push("גג: " + (byId("roof-select").value === "yes" ? "רק" : "לא"));
    if (byId("new-project-select").value !== "both") labels.push("פרויקט: " + (byId("new-project-select").value === "yes" ? "רק" : "לא"));
    return labels.length ? labels.join(", ") : "גם";
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
    return warnings.length ? warnings.map(translateUiText).join(" ") : "";
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
      "Price": "מחיר (מיליוני שקלים)",
      "Price / m²": "מחיר למ\"ר (אלפי ₪)",
      "Price / Room": "מחיר לחדר (מיליוני ₪)",
      price_millions: "מחיר (מיליוני שקלים)",
      price_per_m2: "מחיר למ\"ר (אלפי ₪)",
      price_per_room: "מחיר לחדר (מיליוני ₪)",
      n_deals: "עסקאות"
    };
    return map[value] || translateUiText("Value");
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
    return String(value || "").normalize("NFKC").toLocaleLowerCase()
      .replace(/[\u0591-\u05bd\u05bf-\u05c7]/g, "").replace(/['"׳״‘’“”]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function matchesSearch(value, query) {
    var normalized = normalizeSearch(value);
    var tokens = normalizeSearch(query).split(" ").filter(function (token) { return token && ["רחוב", "רח", "מספר"].indexOf(token) === -1; });
    return tokens.length > 0 && tokens.every(function (token) {
      if (/^\d+$/.test(token)) return new RegExp("(^|[^0-9])" + token + "($|[^0-9])").test(normalized);
      return normalized.indexOf(token) !== -1;
    });
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
