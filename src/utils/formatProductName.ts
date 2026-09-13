export function formatProductName(product: { name: string; nameRu: string | null }): string {
  return product.nameRu ? `${product.name} (${product.nameRu})` : product.name;
}
