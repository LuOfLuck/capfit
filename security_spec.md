# Security Specification & Invariants (CAPFIT Multi-Tenant SaaS)

## 1. Data Invariants
1. **Tenant Integrity**: Every product, order, and AI log must be strictly bound to an existing, valid `storeId`. Cross-tenant writes or updates without storeId verification are prohibited.
2. **Quota & System Field Immutability**: Store owners cannot tamper with system billing fields directly without authorization.
3. **Temporal Invariant**: Created dates and IDs are immutable once committed.
4. **Order Status Lifecycle**: Order status transitions cannot skip terminal states (e.g. once cancelled/delivered).
5. **String Boundary Invariants**: Names, IDs, and descriptions must strictly respect max-length limits to prevent Denial of Wallet attacks.

## 2. The Dirty Dozen Payloads (Rejection Targets)
1. **Payload 1 (Ghost Field Injection)**: Creating a product with `isSuperAdmin: true`. Must be rejected.
2. **Payload 2 (Cross-Tenant Store Poisoning)**: Creating an order for store A while claiming store B credentials.
3. **Payload 3 (Oversized ID Denial of Wallet)**: Injecting a 2KB junk character string as `productId`.
4. **Payload 4 (Negative Stock Attack)**: Updating a product with `stock: -50`.
5. **Payload 5 (Negative Price Exploit)**: Updating a product with `precio: -100`.
6. **Payload 6 (Quota Hack)**: Direct client update to set `aiGenerationsUsed: 0` without admin token.
7. **Payload 7 (Blanket List Scraping)**: Querying arbitrary tenant orders without tenant ownership scope.
8. **Payload 8 (Immortal Field Mutation)**: Modifying `createdAt` or `id` on an existing product document.
9. **Payload 9 (Terminal State Reversal)**: Modifying an order marked as `entregado` back to `pendiente`.
10. **Payload 10 (Type Poisoning)**: Setting `precio` to a boolean or text string `\"gratis\"`.
11. **Payload 11 (Empty / Null Tenant Key)**: Creating a product where `storeId` is empty or missing.
12. **Payload 12 (Invalid JSON Payload Injection)**: Sending arbitrary unstructured maps into structured fields.
