// Deprecated: this first-attempt script split local seed products and printed
// unsafe production SQL (new variants, NULL stock, no conflict handling).
//
// Use instead:
//   node scripts/normalize-glass-bangles-catalog.mjs
//   node scripts/apply-glass-bangles-split.mjs            # dry run
//   node scripts/apply-glass-bangles-split.mjs --apply    # write to Supabase
//
// The canonical migration is supabase/migrations/0023_split_glass_bangles_by_colour.sql.

console.log(
  [
    "This script is deprecated and does nothing.",
    "Run instead:",
    "  node scripts/normalize-glass-bangles-catalog.mjs",
    "  node scripts/apply-glass-bangles-split.mjs --apply",
  ].join("\n"),
);
