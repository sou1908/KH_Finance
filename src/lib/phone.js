// Turning what someone types into links a phone can actually act on.
//
// People write numbers every possible way: "98200 11223", "+91 98200-11223",
// "098200 11223". A dialer copes with most of that; wa.me does not — it needs
// bare digits with a country code and nothing else.

// India, because that is where the sites are. Change this one line to move.
const DEFAULT_COUNTRY = '91'

/**
 * @returns {{display: string, tel: string, whatsapp: string} | null}
 *          null when there is nothing dialable in the input.
 */
export function phoneLinks(raw) {
  if (!raw) return null

  const trimmed = String(raw).trim()
  if (!trimmed) return null

  // An explicit + means the person gave a country code; trust it completely.
  const explicitCountry = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')

  if (digits.length < 6) return null

  if (!explicitCountry) {
    if (digits.length === 10) {
      digits = DEFAULT_COUNTRY + digits
    } else if (digits.length === 11 && digits.startsWith('0')) {
      // Trunk prefix — dropped before the country code goes on.
      digits = DEFAULT_COUNTRY + digits.slice(1)
    }
  }

  return {
    display: trimmed,
    tel: `tel:+${digits}`,
    whatsapp: `https://wa.me/${digits}`,
  }
}

/**
 * A project's number, falling back to the client's so nobody types the same
 * number onto every job for the same customer.
 */
export function projectContact(project, client) {
  const own = phoneLinks(project?.phone)
  if (own) return { ...own, source: 'project' }

  const fromClient = phoneLinks(client?.phone)
  if (fromClient) return { ...fromClient, source: 'client', clientName: client?.name }

  return null
}
