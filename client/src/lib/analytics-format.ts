export const metricNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);
export const metricRate = (value: number | null) => value === null ? 'N/A' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value) + '%';
