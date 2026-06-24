import {
  deleteBookingsByClientNames,
  deleteInventoryItemsByNamePatterns,
} from './lib/verifyDbCleanup.mjs'

const TEST_BOOKING_NAMES = [
  'Inventory Test Client',
  'Inventory Flow Test',
  'Inventory OK Test',
]

const TEST_INVENTORY_PATTERNS = [
  'Verify Plastic Chairs%',
  'Round Tables UI Test',
  'ZZZ_TEST_%',
]

const bookingsRemoved = deleteBookingsByClientNames(TEST_BOOKING_NAMES)
const itemsRemoved = deleteInventoryItemsByNamePatterns(TEST_INVENTORY_PATTERNS)

console.log(JSON.stringify({ bookingsRemoved, itemsRemoved }, null, 2))
