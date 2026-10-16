import { StorePolicies } from '@/types/policy';

export const INITIAL_POLICIES: StorePolicies = {
  delivery: {
    standardDuration: '2 to 4 working days (Karachi: 1-2 days, other cities: 2-4 days)',
    charges: 'Flat PKR 200 standard courier delivery',
    cities: 'All cities and tehsils across Pakistan via TCS & Trax',
    freeDeliveryThreshold: 3000,
    additionalNotes: 'Orders placed before 3:00 PM are dispatched the same working day.',
  },
  payment: {
    codAvailable: true,
    advanceRequired: 'No advance required for orders under PKR 10,000. Cash on Delivery is fully supported.',
    onlineMethods: ['Cash on Delivery (COD)', 'Direct Bank Transfer / Raast', 'JazzCash / EasyPaisa', 'Visa / Mastercard via SafePay'],
    bankDetails: 'Bank Alfalah: PK00ALFH000123456789 (Title: Perfume Store Demo)',
  },
  returns: {
    windowDays: 7,
    conditions: 'Bottle seal must be intact. If parcel is damaged or defective upon arrival, replacement is free of charge.',
    exchangePolicy: 'Store credit or fragrance exchange available within 7 days of delivery receipt.',
  },
};
