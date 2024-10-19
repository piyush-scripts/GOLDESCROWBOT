/*
  Warnings:

  - The primary key for the `counter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `deals` on the `counter` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to alter the column `disputes` on the `counter` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "counter" DROP CONSTRAINT "counter_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "deals" SET DATA TYPE INTEGER,
ALTER COLUMN "disputes" SET DATA TYPE INTEGER,
ADD CONSTRAINT "counter_pkey" PRIMARY KEY ("id");
