import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const stats = await prisma.$queryRaw`
  SELECT 
    COUNT(*) as total_products,
    (SELECT COUNT(*) FROM product_image) as total_images
  FROM product
`;

console.log("\n📊 DATABASE STATS:");
console.log("├─ Total Products:", stats[0].total_products);
console.log("└─ Total ProductImages:", stats[0].total_images);

// Sample enriched product
const sample = await prisma.product.findFirst({
  include: { detail: true, images: true },
  orderBy: { id: "desc" },
});

if (sample) {
  console.log("\n✨ SAMPLE ENRICHED PRODUCT:");
  console.log("├─ ID:", sample.id);
  console.log("├─ Name:", sample.name);
  console.log("├─ Images:", sample.images.length);
  if (sample.detail?.fullDescription) {
    const desc = sample.detail.fullDescription.slice(0, 150);
    console.log("├─ Description:", `${desc}...`);
  }
}

await prisma.$disconnect();
