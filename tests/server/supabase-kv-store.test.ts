import { describe, expect, it } from "vitest";
import { createSupabaseKvStore } from "@/lib/store/supabase-kv-store";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("createSupabaseKvStore", () => {
  it("persists payments, tokens, analyses and synchronizes via system_settings mock", async () => {
    const memoryKv = new Map<string, any>();
    const mockClient = {
      from(table: string) {
        if (table === "products") {
          return {
            select() {
              return {
                eq() {
                  return {
                    order() {
                      return Promise.resolve({
                        data: [
                          {
                            id: "prod_mock_db_1",
                            name: "Mock Shirt",
                            category: "tops",
                            subcategory: "Atasan",
                            image_path: "https://example.com/shirt.png",
                            is_active: true,
                          },
                        ],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        }
        expect(table).toBe("system_settings");
        return {
          select() {
            return {
              eq(col: string, val: string) {
                return {
                  async maybeSingle() {
                    return { data: { value: memoryKv.get(val) }, error: null };
                  },
                };
              },
            };
          },
          async upsert(row: { key: string; value: any }) {
            memoryKv.set(row.key, row.value);
            return { error: null };
          },
        };
      },
      storage: {
        from(bucket: string) {
          return {
            async upload() {
              return { data: {}, error: null };
            },
            async download() {
              return { data: new Blob([new Uint8Array([1, 2, 3])]), error: null };
            },
            async remove() {
              return { data: {}, error: null };
            },
          };
        },
      },
    } as unknown as SupabaseClient;

    const store = createSupabaseKvStore("https://example.supabase.co", "dummy-key", mockClient);
    expect(store.kind).toBe("supabase");

    const payment = await store.insertPayment({
      id: "pay_test_123",
      provider: "mock",
      providerReference: "REF-123",
      sessionHash: "sess_hash_abc",
      amount: 14900,
      currency: "IDR",
      status: "pending",
      paymentUrl: null,
      qrString: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      paidAt: null,
    });
    expect(payment.id).toBe("pay_test_123");

    // Verify it saved to memoryKv
    expect(memoryKv.has("flicks_demo_store")).toBe(true);

    const found = await store.paymentByReference("REF-123");
    expect(found?.id).toBe("pay_test_123");

    const settled = await store.settlePayment("pay_test_123", "tok_test_123");
    expect(settled).toBe(true);

    const tok = await store.token("tok_test_123");
    expect(tok?.status).toBe("available");

    const analysisRes = await store.startAnalysis(
      {
        id: "ana_test_123",
        sessionHash: "sess_hash_abc",
        idempotencyKey: "idem_123",
        reportSecretHash: "sec_123",
        facePhotoId: "pho_face_1",
        bodyPhotoId: "pho_body_1",
        gender: "female",
        heightCm: 165,
        weightKg: 55,
      },
      3
    );

    expect(analysisRes.kind).toBe("created");
    if (analysisRes.kind === "created") {
      expect(analysisRes.analysis.status).toBe("queued");
    }

    // Create a SECOND store instance simulating another serverless lambda instance
    const store2 = createSupabaseKvStore("https://example.supabase.co", "dummy-key", mockClient);
    const tokFromStore2 = await store2.token("tok_test_123");
    expect(tokFromStore2?.status).toBe("reserved"); // was reserved by startAnalysis

    const products = await store.activeProducts();
    expect(products.length).toBeGreaterThan(0);
  });
});
