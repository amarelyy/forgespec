/** What a distributor returns, normalised before spec parsing. */
export interface DistributorPart {
  mpn: string;
  manufacturer: string;
  name: string;
  category: string;
  description: string;
  package_type: string;
  datasheet_url: string;
  lifecycle_status: string;
  stock: number | null;
  price: number | null;
  /** Spec display strings as the distributor shows them, e.g. { "Supply Voltage": "3.0V ~ 3.6V" } */
  raw_specs: Record<string, string>;
}

export interface DistributorProvider {
  readonly name: string;
  search(query: string, limit: number): Promise<DistributorPart[]>;
}
