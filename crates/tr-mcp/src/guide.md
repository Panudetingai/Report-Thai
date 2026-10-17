# ThaiReport template guide

ThaiReport renders Thai-first PDF reports from a JSON **template** + JSON **data**.
Thai shaping, word breaking and fonts (Sarabun) are handled by the engine.

## Workflow (recommended)

1. `list_templates` → reuse or adapt an existing template (`get_template` returns it with sample data).
2. Write/modify the template JSON.
3. `validate_template` with the real data → fix every error and warning (missing fields print as blanks).
4. `preview_template` → look at the PNG; adjust positions/sizes.
5. `render_report` → PDF file. Optionally `save_template` to reuse it later by name.

## Units and page

All positions/sizes are **mm**; font size is **pt**. Element `x`/`y` are relative to the band's top-left
inside the page margins. A4 portrait = 210 × 297 mm, so with margins `[15,15,15,15]` the content width is 180 mm.

```json
{ "schemaVersion": "1.0",
  "page": { "size": "A4", "margin": [15, 15, 15, 15], "orientation": "portrait" },
  "fonts": [{ "family": "Sarabun", "embed": true }],
  "bands": [ ... ] }
```
`size`: `A4` | `A5` | `Letter` | `Custom` (+ `"custom_mm": [w, h]`). `margin` = [top, right, bottom, left].

## Bands (printed in this order)

| type | printed |
|---|---|
| `pageHeader` | top of every page |
| `title` | once, first page (below pageHeader) |
| `columnHeader` | every page, below title on page 1 |
| `groupHeader` | start of each group (needs `groupBy`) |
| `detail` | once per row of `dataSource` (default `"items"`) |
| `section` | content blocks in the body, in the order written — any number (see *Documents* below) |
| `groupFooter` | end of each group |
| `summary` | once after all rows |
| `pageFooter` | bottom of every page |

Band fields: `type`, `height` (mm, 1–500), `elements`, optional `gap_before` (mm), `dataSource` (detail).
Pages break automatically; a group header is never left alone at the bottom of a page.

## Documents (letters, reports, forms — no data rows)

Use one `section` band per block of content (heading, paragraph, list item). Sections print once each, top to bottom,
interleaved with `detail` in the order written, and move to a new page when they don't fit.
**Do not fake this with `detail` bands and dummy data** — a detail band without rows prints nothing.

```json
{ "type": "section", "mode": "content", "height": 22, "gap_before": 4, "elements": [
  { "type": "text", "x": 0, "y": 0, "w": 180, "h": 7, "bold": true, "text": "1. ความเป็นมา", "overflow": "shrink" },
  { "type": "text", "x": 8, "y": 8, "w": 172, "h": 14, "size": 11, "text": "{{ background }}", "overflow": "grow" } ] }
```
`"mode": "list"` + `"dataSource": "x"` makes a section repeat once per row of `x` (like a second detail band).
Text with `overflow: "grow"` makes the band taller to fit long paragraphs. For a first-line indent, start the text with spaces.

## Elements

Every element has `type`, `x`, `y`, `w`, `h`.

- `text`: `text`, `font` (`Sarabun` | `Sarabun-Light` | `NotoSansThai`), `size` (pt, 5–72, default 12), `bold`,
  `align` (`left`|`center`|`right`), `color` `#RRGGBB`, `leader` (e.g. `"."` dot leader to box end, align left only),
  **`overflow`**: `wrap` | `shrink` | `clip` | `grow` | `error` (default `error` = render fails if text doesn't fit —
  use `wrap` or `shrink` for data-driven text). `\n` makes a new line.
- `line`: horizontal when `h` = 0; `width` (pt), `dash` e.g. `[1, 1.5]`.
- `rectangle` / `ellipse`: `fill`, `stroke` (`#RRGGBB`), `width`.
- `image`: `src` = data URI (`data:image/png;base64,…`), or a `{{ field }}` holding one.
- `checkbox`: `checked` = `"true"`/`"false"` or `"{{ item.paid }}"` (empty/false/0 = unticked).
- `table` (must be the **only** element of its band, usually a `detail` band; flows across pages, header repeats):
  `columns: [{ "width": mm, "header": "…", "field": "{{ item.x }}", "align": "right" }]` — column widths must sum to `w`.
  Optional `data_source` (default `items`), `size`, `font`, `header_fill`, `zebra_fill`, `border_color`.

## Expressions in text: `{{ … }}`

- `{{ customer.name }}`, `{{ items[0].price }}` — any path in data.
- `{{ item.amount }}` — field of the current row (detail band / table column).
- `{{ page }}` / `{{ pages }}` — page number / total pages.
- Formatting (any band):
  - `{{ number(item.amount) }}` → `1,234.50` (thousands separator, 2 decimals, half-up); `{{ number(x, 0) }}` → `1,235`
  - `{{ bahttext(total) }}` → `หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์`
  - `{{ thaidate(doc.date) }}` → `17 ตุลาคม 2569` (input `YYYY-MM-DD`); `{{ thaidate(doc.date, "short") }}` → `17 ต.ค. 2569`
  - `{{ thaidigits(x) }}` → Thai numerals; functions nest: `{{ thaidigits(number(total)) }}`
- Aggregates (only in `groupHeader`, `groupFooter`, `summary`), exact decimal arithmetic:
  `{{ sum(item.amount) }}` (2 decimals, grouped), `{{ sum(item.qty, 0) }}`, `{{ avg(…) }}`, `{{ min(…) }}`, `{{ max(…) }}`,
  `{{ count() }}`, `{{ count(item.no) }}` (non-empty). In a group band they cover that group only.
  Nest inside formatting: `{{ bahttext(sum(item.amount)) }}`.
- `{{ group.value }}` / `{{ group.count }}` — current group's key / row count.

Numbers in data may be JSON numbers or strings like `"1,200.50"`. Missing fields print as empty (see `validate_template`).
Pass `template`, `data` and `sample_data` as JSON objects, not as strings containing JSON.

## Groups

```json
{ "type": "groupHeader", "groupBy": "item.region", "height": 8, "elements": [ … "ภาค {{ group.value }}" ] },
{ "type": "groupHeader", "groupBy": "item.category", "height": 7, "elements": [ … ] },
{ "type": "detail", "dataSource": "items", "height": 6, "elements": [ … ] },
{ "type": "groupFooter", "height": 7, "elements": [ … "รวมหมวด {{ sum(item.amount) }}" ] },
{ "type": "groupFooter", "height": 7, "elements": [ … "รวมภาค {{ sum(item.amount) }}" ] }
```
Several group headers = nested groups, outer first. Footers pair from the innermost outward in the order written,
or set `"groupBy"` on a footer to pair it explicitly. **Rows must already be sorted by the group fields**
(consecutive equal values form one group). A grouped detail band cannot contain a table — use text elements in columns.

## Minimal example (invoice list)

```json
{ "schemaVersion": "1.0",
  "page": { "size": "A4", "margin": [15, 15, 15, 15] },
  "bands": [
    { "type": "title", "height": 16, "elements": [
      { "type": "text", "x": 0, "y": 0, "w": 180, "h": 10, "size": 18, "bold": true, "align": "center", "text": "ใบแจ้งหนี้", "overflow": "shrink" },
      { "type": "text", "x": 0, "y": 10, "w": 180, "h": 6, "size": 10, "align": "right", "text": "วันที่ {{ thaidate(doc.date) }}", "overflow": "wrap" } ] },
    { "type": "detail", "dataSource": "items", "height": 8, "elements": [
      { "type": "table", "x": 0, "y": 0, "w": 180, "h": 8, "size": 10, "columns": [
        { "width": 20, "header": "ลำดับ", "field": "{{ item.no }}", "align": "center" },
        { "width": 120, "header": "รายการ", "field": "{{ item.name }}" },
        { "width": 40, "header": "จำนวนเงิน", "field": "{{ number(item.amount) }}", "align": "right" } ] } ] },
    { "type": "summary", "height": 16, "gap_before": 3, "elements": [
      { "type": "text", "x": 100, "y": 0, "w": 80, "h": 7, "bold": true, "align": "right", "text": "รวม {{ number(sum(item.amount)) }} บาท", "overflow": "shrink" },
      { "type": "text", "x": 0, "y": 8, "w": 180, "h": 7, "size": 10, "align": "right", "text": "({{ bahttext(sum(item.amount)) }})", "overflow": "wrap" } ] },
    { "type": "pageFooter", "height": 8, "elements": [
      { "type": "text", "x": 140, "y": 2, "w": 40, "h": 5, "size": 9, "align": "right", "text": "หน้า {{ page }}/{{ pages }}", "overflow": "clip" } ] } ] }
```
data: `{ "doc": { "date": "2026-10-17" }, "items": [ { "no": 1, "name": "ค่าบริการ", "amount": 1500 } ] }`
