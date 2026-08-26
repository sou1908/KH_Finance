import { useState } from 'react'
import { UNIT_GROUPS, isKnownUnit } from '../data/units'

const OTHER = '__other'

/**
 * Picking a unit from the shared list.
 *
 * A dropdown rather than free text, because the stock pool groups by unit: with
 * typing, "pcs" and "nos" for the same hinges become two separate lines and the
 * count of what you own is quietly wrong.
 *
 * It is not a cage, though. Anything already saved stays selectable even if it
 * is not on the list — an old row must never lose its unit just because the
 * list changed — and "Other" takes a value the list does not cover.
 */
export default function UnitSelect({ value = '', onChange, placeholder = 'Select a unit' }) {
  const current = String(value ?? '')
  const [typing, setTyping] = useState(() => current !== '' && !isKnownUnit(current))

  if (typing) {
    return (
      <div className="unit-custom">
        <input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. carton"
          autoFocus
          aria-label="Custom unit"
        />
        <button
          type="button"
          className="btn ghost tiny"
          onClick={() => {
            setTyping(false)
            onChange('')
          }}
        >
          Use the list
        </button>
      </div>
    )
  }

  return (
    <select
      value={current}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setTyping(true)
          onChange('')
          return
        }
        onChange(e.target.value)
      }}
    >
      <option value="">{placeholder}</option>

      {UNIT_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.units.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </optgroup>
      ))}

      <option value={OTHER}>Other…</option>
    </select>
  )
}
