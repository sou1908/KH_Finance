/**
 * Units used in interior fit-out work.
 *
 * Typed freely, the same thing arrives as "pcs", "Pcs", "pieces" and "nos", and
 * the stock pool — which groups by head, description and unit — then treats one
 * item as four. A shared list keeps that from happening.
 *
 * The label explains the abbreviation; only the value is ever stored, so
 * changing a label later cannot orphan existing rows.
 */

export const UNIT_GROUPS = [
  {
    label: 'Count',
    units: [
      { value: 'nos', label: 'nos — numbers' },
      { value: 'pcs', label: 'pcs — pieces' },
      { value: 'item', label: 'item' },
      { value: 'set', label: 'set' },
      { value: 'pair', label: 'pair' },
      { value: 'sheet', label: 'sheet — ply, laminate, board' },
      { value: 'panel', label: 'panel' },
      { value: 'shutter', label: 'shutter — cabinet or wardrobe door' },
      { value: 'door', label: 'door' },
    ],
  },
  {
    label: 'Area',
    units: [
      { value: 'sqft', label: 'sqft — square foot' },
      { value: 'sqm', label: 'sqm — square metre' },
    ],
  },
  {
    label: 'Length',
    units: [
      { value: 'rft', label: 'rft — running foot' },
      { value: 'rmt', label: 'rmt — running metre' },
      { value: 'ft', label: 'ft — foot' },
      { value: 'm', label: 'm — metre' },
    ],
  },
  {
    label: 'Volume',
    units: [
      { value: 'cft', label: 'cft — cubic foot' },
      { value: 'cum', label: 'cum — cubic metre' },
      { value: 'litre', label: 'litre' },
    ],
  },
  {
    label: 'Weight',
    units: [
      { value: 'kg', label: 'kg — kilogram' },
      { value: 'bag', label: 'bag — cement, putty' },
      { value: 'ton', label: 'ton' },
    ],
  },
  {
    label: 'Packaging',
    units: [
      { value: 'box', label: 'box' },
      { value: 'packet', label: 'packet' },
      { value: 'bundle', label: 'bundle' },
      { value: 'roll', label: 'roll — wallpaper, tape' },
      { value: 'coil', label: 'coil — wire' },
      { value: 'tin', label: 'tin — paint, polish' },
    ],
  },
  {
    label: 'Labour & services',
    units: [
      { value: 'day', label: 'day — man-day' },
      { value: 'hour', label: 'hour' },
      { value: 'shift', label: 'shift' },
      { value: 'job', label: 'job — whole piece of work' },
      { value: 'lumpsum', label: 'lumpsum' },
    ],
  },
  {
    label: 'Transport',
    units: [
      { value: 'trip', label: 'trip' },
      { value: 'km', label: 'km' },
    ],
  },
]

export const ALL_UNITS = UNIT_GROUPS.flatMap((g) => g.units.map((u) => u.value))

export const isKnownUnit = (value) => ALL_UNITS.includes(String(value ?? '').trim())
