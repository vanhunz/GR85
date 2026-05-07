import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  // Count stats
  const productCount = await prisma.product.count();
  const imageCount = await prisma.productImage.count();
  
  console.log("\n✨ ENRICHMENT VERIFICATION ✨");
  console.log("├─ Total Products: " + productCount);
  console.log("├─ Total Images: " + imageCount);
  console.log("└─ Avg Images/Product: " + (imageCount / productCount).toFixed(2));
  
  // Show sample products with enriched data
  const samples = await prisma.product.findMany({
    where: {
      detail: {
        fullDescription: { not: null }
      }
    },
    include: { 
      detail: { select: { fullDescription: true } },
      images: { select: { id: true } },
      category: { select: { name: true } }
    },
    take: 3,
    orderBy: { id: "desc" }
  });

  console.log("\n📦 SAMPLE ENRICHED PRODUCTS:");
  for (const p of samples) {
    const desc = p.detail?.fullDescription || "";
    const snippet = desc.substring(0, 80);
    console.log(`├─ #${p.id} ${p.name}`);
    console.log(`│  ├─ Category: ${p.category.name}`);
    console.log(`│  ├─ Images: ${p.images.length}`);
    console.log(`│  └─ Desc: ${snippet}${desc.length > 80 ? "..." : ""}`);
  }
  
  console.log("\n✅ Enrichment verification complete!");
} catch (error) {
  console.error("❌ Error:", error.message);
} finally {
  await prisma.$disconnect();
}
