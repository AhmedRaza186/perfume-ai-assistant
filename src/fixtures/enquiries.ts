import { Enquiry } from '@/types/enquiry';

export const INITIAL_ENQUIRIES: Enquiry[] = [
  {
    id: 'enq-101',
    customerName: 'Usman Tariq',
    channel: 'Chat',
    querySnippet: 'Does Velvet Oud smell sweet or strictly woody? Looking for an office fragrance.',
    timestamp: 'Today at 3:15 PM',
    status: 'Resolved',
    notes: 'Informed customer about the tonka bean sweetness balance.',
    productOfInterest: 'Velvet Oud',
  },
  {
    id: 'enq-102',
    customerName: 'Ayesha Malik',
    channel: 'Voice Note',
    querySnippet: 'Voice message asking about delivery time to Faisalabad and Cash on Delivery charges.',
    timestamp: 'Today at 4:40 PM',
    status: 'Open',
    notes: 'Voice note demo query.',
    productOfInterest: 'Citrus Breeze',
  },
  {
    id: 'enq-103',
    customerName: 'Hamza Bilal',
    channel: 'Chat',
    querySnippet: 'Need human support regarding a gift parcel packing for a wedding tomorrow.',
    timestamp: 'Yesterday at 7:20 PM',
    status: 'Needs Human Follow-up',
    notes: 'Custom gift wrap request forwarded to warehouse dispatch team.',
    productOfInterest: 'Amber Royale',
  },
];
