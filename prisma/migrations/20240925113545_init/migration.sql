-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "group_id" BIGINT NOT NULL,
    "seller_user_id" BIGINT NOT NULL,
    "buyer_user_id" BIGINT NOT NULL,
    "seller_btc_address" TEXT NOT NULL,
    "buyer_btc_address" TEXT NOT NULL,
    "escrow_btc_address" TEXT NOT NULL,
    "escrow_private_key" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
