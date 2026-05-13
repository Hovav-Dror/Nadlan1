#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(arrow)
  library(fst)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)

get_arg <- function(flag, default) {
  match_index <- match(flag, args)
  if (is.na(match_index) || match_index == length(args)) {
    return(default)
  }
  args[[match_index + 1]]
}

source_root <- normalizePath(
  get_arg("--source-root", "/Users/hovav/Documents/R projects/nadlan2"),
  mustWork = TRUE
)
output_root <- normalizePath(
  get_arg("--output-root", file.path(getwd(), "data")),
  mustWork = FALSE
)

required_city_columns <- c(
  "city",
  "street",
  "Gush",
  "GUSH",
  "FULLADRESS",
  "date",
  "deal year",
  "price_millions",
  "area",
  "rooms",
  "floor",
  "roof",
  "apt type",
  "New_Project",
  "build_year",
  "building age",
  "build_floors",
  "story"
)

city_slug_map <- c(
  "אשדוד" = "ashdod.parquet",
  "אשקלון" = "ashkelon.parquet",
  "באר שבע" = "beer_sheva.parquet",
  "בית שמש" = "beit_shemesh.parquet",
  "בני ברק" = "bnei_brak.parquet",
  "בת ים" = "bat_yam.parquet",
  "הרצלייה" = "herzliya.parquet",
  "חדרה" = "hadera.parquet",
  "חולון" = "holon.parquet",
  "חיפה" = "haifa.parquet",
  "ירושלים" = "jerusalem.parquet",
  "כפר סבא" = "kfar_saba.parquet",
  "מודיעין-מכבים-רעות" = "modiin_maccabim_reut.parquet",
  "נתניה" = "netanya.parquet",
  "פתח תקווה" = "petah_tikva.parquet",
  "ראשון לציון" = "rishon_lezion.parquet",
  "רחובות" = "rehovot.parquet",
  "רמת גן" = "ramat_gan.parquet",
  "רעננה" = "raanana.parquet",
  "תל אביב -יפו" = "tel_aviv_yafo.parquet"
)

city_dir <- file.path(output_root, "cities")
metadata_dir <- file.path(output_root, "metadata")
dir.create(city_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(metadata_dir, recursive = TRUE, showWarnings = FALSE)

write_json_utf8 <- function(value, path) {
  json <- toJSON(value, auto_unbox = TRUE, pretty = TRUE, dataframe = "rows")
  writeLines(json, path, useBytes = TRUE)
}

validate_city_roundtrip <- function(original, converted, required_columns) {
  roundtrip <- read_parquet(converted)
  missing_columns <- setdiff(required_columns, names(roundtrip))
  extra_columns <- setdiff(names(roundtrip), required_columns)
  date_class <- paste(class(roundtrip[["date"]]), collapse = ",")

  sample_text_ok <- TRUE
  if (nrow(original) > 0) {
    text_columns <- intersect(c("city", "street", "FULLADRESS", "story", "apt type"), names(original))
    sample_index <- min(10, nrow(original))
    for (column in text_columns) {
      sample_text_ok <- identical(
        as.character(original[[column]][[sample_index]]),
        as.character(roundtrip[[column]][[sample_index]])
      )
      if (!sample_text_ok) {
        break
      }
    }
  }

  list(
    row_count_original = nrow(original),
    row_count_converted = nrow(roundtrip),
    columns_match = identical(names(roundtrip), required_columns),
    missing_columns = missing_columns,
    extra_columns = extra_columns,
    date_class = date_class,
    date_parse_ok = inherits(roundtrip[["date"]], "Date"),
    hebrew_roundtrip_ok = sample_text_ok
  )
}

convert_city <- function(source_file) {
  source_name <- basename(source_file)
  city <- sub("^fst_(.*)[.]fst$", "\\1", source_name)

  if (!city %in% names(city_slug_map)) {
    stop(sprintf("No ASCII manifest filename configured for city: %s", city))
  }

  data <- read_fst(source_file)
  missing_columns <- setdiff(required_city_columns, names(data))
  if (length(missing_columns) > 0) {
    stop(sprintf(
      "%s is missing required columns: %s",
      source_name,
      paste(missing_columns, collapse = ", ")
    ))
  }

  data <- data[required_city_columns]
  if (!inherits(data[["date"]], "Date")) {
    data[["date"]] <- as.Date(data[["date"]])
  }

  target_file <- file.path(city_dir, unname(city_slug_map[[city]]))
  write_parquet(data, target_file, compression = "zstd")
  validation <- validate_city_roundtrip(data, target_file, required_city_columns)

  list(
    city = city,
    file = unname(city_slug_map[[city]]),
    source_file = file.path("fst_data", source_name),
    row_count = validation$row_count_converted,
    validation = validation
  )
}

convert_metadata_parquet <- function(source_name, target_name) {
  source_file <- file.path(source_root, source_name)
  data <- read_fst(source_file)
  target_file <- file.path(metadata_dir, target_name)
  write_parquet(data, target_file, compression = "zstd")
  roundtrip <- read_parquet(target_file)

  list(
    file = target_name,
    source_file = source_name,
    row_count_original = nrow(data),
    row_count_converted = nrow(roundtrip),
    columns = names(roundtrip),
    columns_match = identical(names(data), names(roundtrip)),
    row_count_match = identical(nrow(data), nrow(roundtrip))
  )
}

city_sources <- list.files(
  file.path(source_root, "fst_data"),
  pattern = "^fst_.*[.]fst$",
  full.names = TRUE
)
city_sources <- sort(city_sources)

city_results <- lapply(city_sources, convert_city)
names(city_results) <- vapply(city_results, function(result) result$city, character(1))

gush_descriptions <- convert_metadata_parquet("GushDescriptions.fst", "gush_descriptions.parquet")
unique_gush_streets <- convert_metadata_parquet("unique_gush_streets.fst", "unique_gush_streets.parquet")

apt_types_source <- read_fst(file.path(source_root, "apt_types.fst"))
apt_types <- sort(unique(as.character(apt_types_source[["apt_types"]])))
apt_types_path <- file.path(metadata_dir, "apt_types.json")
write_json_utf8(list(apt_types = apt_types), apt_types_path)
apt_types_roundtrip <- fromJSON(paste(readLines(apt_types_path, encoding = "UTF-8"), collapse = "\n"))

sp500_source <- file.path(source_root, "SP500_shekels.csv")
sp500_target <- file.path(metadata_dir, "sp500_shekels.csv")
invisible(file.copy(sp500_source, sp500_target, overwrite = TRUE))

manifest_cities <- lapply(city_results, function(result) {
  list(
    file = result$file,
    rows = result$row_count
  )
})

manifest <- list(
  app = "nadlan2",
  generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  source_root = source_root,
  required_city_columns = required_city_columns,
  city_count = length(city_results),
  total_city_rows = sum(vapply(city_results, function(result) result$row_count, numeric(1))),
  cities = manifest_cities,
  metadata = list(
    gush_descriptions = list(
      file = "metadata/gush_descriptions.parquet",
      rows = gush_descriptions$row_count_converted
    ),
    unique_gush_streets = list(
      file = "metadata/unique_gush_streets.parquet",
      rows = unique_gush_streets$row_count_converted
    ),
    apt_types = list(
      file = "metadata/apt_types.json",
      rows = length(apt_types)
    ),
    sp500_shekels = list(
      file = "metadata/sp500_shekels.csv",
      bytes = file.info(sp500_target)$size
    )
  )
)

validation_report <- list(
  generated_at = manifest$generated_at,
  all_city_row_counts_match = all(vapply(
    city_results,
    function(result) identical(
      result$validation$row_count_original,
      result$validation$row_count_converted
    ),
    logical(1)
  )),
  all_city_columns_match = all(vapply(
    city_results,
    function(result) isTRUE(result$validation$columns_match),
    logical(1)
  )),
  all_city_dates_parse = all(vapply(
    city_results,
    function(result) isTRUE(result$validation$date_parse_ok),
    logical(1)
  )),
  all_city_hebrew_roundtrip_ok = all(vapply(
    city_results,
    function(result) isTRUE(result$validation$hebrew_roundtrip_ok),
    logical(1)
  )),
  metadata = list(
    gush_descriptions = gush_descriptions,
    unique_gush_streets = unique_gush_streets,
    apt_types = list(
      file = "apt_types.json",
      row_count_original = nrow(apt_types_source),
      row_count_converted = length(apt_types_roundtrip$apt_types),
      row_count_match = identical(nrow(apt_types_source), length(apt_types_roundtrip$apt_types)),
      hebrew_roundtrip_ok = identical(apt_types, apt_types_roundtrip$apt_types)
    ),
    sp500_shekels = list(
      file = "sp500_shekels.csv",
      copied = file.exists(sp500_target),
      bytes = file.info(sp500_target)$size
    )
  ),
  cities = city_results
)

write_json_utf8(manifest, file.path(output_root, "manifest.json"))
write_json_utf8(validation_report, file.path(output_root, "validation_report.json"))

cat(sprintf(
  "Converted %d city files (%s rows) into %s\n",
  length(city_results),
  format(manifest$total_city_rows, big.mark = ",", scientific = FALSE),
  output_root
))
cat("Validation summary:\n")
cat(sprintf("- row counts match: %s\n", validation_report$all_city_row_counts_match))
cat(sprintf("- columns match: %s\n", validation_report$all_city_columns_match))
cat(sprintf("- dates parse: %s\n", validation_report$all_city_dates_parse))
cat(sprintf("- Hebrew roundtrip: %s\n", validation_report$all_city_hebrew_roundtrip_ok))
