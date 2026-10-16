export type EnquiryStatus = 'Open' | 'Resolved' | 'Needs Human Follow-up';

export interface Enquiry {
  id: string;
  customerName: string;
  channel: 'Chat' | 'Voice Note';
  querySnippet: string;
  timestamp: string;
  status: EnquiryStatus;
  notes?: string;
  productOfInterest?: string;
}
