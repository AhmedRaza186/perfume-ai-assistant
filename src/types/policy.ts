export interface StorePolicies {
  delivery: {
    standardDuration: string;
    charges: string;
    cities: string;
    freeDeliveryThreshold: number;
    additionalNotes?: string;
    rules?: { cities: string[]; charge: number; freeAbove?: number }[];
  };
  payment: {
    codAvailable: boolean;
    advanceRequired: string;
    onlineMethods: string[];
    bankDetails?: string;
  };
  returns: {
    windowDays: number;
    conditions: string;
    exchangePolicy: string;
  };
}
