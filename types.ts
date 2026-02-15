
// Define and export core data structures for the application to be used as a shared module.
export interface SORItem {
  id: string;
  name: string;
  unit: string;
  rate: number;
  scopeOfWork: string;
  source: string;
  timestamp: number;
}

export interface TenderItem {
  id: string;
  name: string;
  quantity: number;
  requestedScope: string;
  estimatedRate?: number;
  matchedRate?: SORItem;
  status: 'pending' | 'matched' | 'review' | 'no-match';
}
