export interface Product {
  id: string;
  name: string;
  size: string;
  price: number; // in PKR
  description: string;
  notes?: string;
  category: 'fresh' | 'oriental' | 'floral' | 'woody';
  image: string;
  inStock: boolean | null;
  bottleSizeMl?: number;
  families?: ('fresh' | 'floral' | 'woody' | 'sweet' | 'oud')[];
  occasions?: ('office' | 'daily' | 'gift' | 'evening')[];
  useGuidance?: string;
  dataSource?: 'demo' | 'business';
}
