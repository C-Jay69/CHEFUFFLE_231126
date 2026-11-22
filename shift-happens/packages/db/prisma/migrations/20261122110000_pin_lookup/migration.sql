-- O(1) PIN lookup. The salted scrypt hash remains the verifier; this column is
-- an HMAC digest used only to find the candidate row.

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "pin_lookup" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "staff_restaurant_id_pin_lookup_key" ON "staff"("restaurant_id", "pin_lookup");
