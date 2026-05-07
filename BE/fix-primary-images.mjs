#!/usr/bin/env node
/**
 * FIX PRIMARY IMAGES - Set new enriched images as primary
 * 
 * Script này sẽ:
 * 1. Tìm những ảnh mới (created lần gần đây nhất)
 * 2. Set ảnh đầu tiên mỗi product là isPrimary=true
 * 3. Unset ảnh cũ là isPrimary=false
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixPrimaryImages() {
  try {
    console.log("\n🔧 FIXING PRIMARY IMAGES FOR ENRICHED PRODUCTS\n");

    // Lấy 50 product mới nhất
    const products = await prisma.product.findMany({
      include: { images: { orderBy: { id: "desc" } } },
      orderBy: { id: "desc" },
      take: 50,
    });

    let fixedCount = 0;

    for (const product of products) {
      if (product.images.length === 0) continue;

      // Ảnh đầu tiên (mới nhất - từ enrichment) thành primary
      const primaryImage = product.images[0];
      const otherImages = product.images.slice(1);

      // Update primary
      if (!primaryImage.isPrimary) {
        await prisma.productImage.update({
          where: { id: primaryImage.id },
          data: { isPrimary: true },
        });
        console.log(
          `✅ Product #${product.id}: Set primary image ${primaryImage.id}`
        );
        fixedCount++;
      }

      // Update others to non-primary
      if (otherImages.length > 0) {
        await prisma.productImage.updateMany({
          where: { id: { in: otherImages.map((img) => img.id) } },
          data: { isPrimary: false },
        });
      }
    }

    console.log(`\n✨ Fixed ${fixedCount} products with new primary images!`);

    // Verify
    console.log("\n📋 VERIFICATION:");
    const sample = await prisma.product.findFirst({
      where: { id: { in: [324, 323, 322, 321] } },
      include: {
        images: { where: { isPrimary: true }, select: { id: true, imageUrl: true } },
      },
    });

    if (sample) {
      console.log(`Primary image for #${sample.id}:`);
      console.log(`└─ ${sample.images[0]?.imageUrl}`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixPrimaryImages();
