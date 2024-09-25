-- AlterTable
ALTER TABLE "User" ALTER COLUMN "group_id" DROP NOT NULL,
ALTER COLUMN "seller_user_id" DROP NOT NULL,
ALTER COLUMN "buyer_user_id" DROP NOT NULL,
ALTER COLUMN "seller_btc_address" DROP NOT NULL,
ALTER COLUMN "buyer_btc_address" DROP NOT NULL,
ALTER COLUMN "escrow_btc_address" DROP NOT NULL,
ALTER COLUMN "escrow_private_key" DROP NOT NULL;
